-- Boludos & Dragones: database upgrade from 0038 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0038_hero_fusion.sql =====
-- 0038: burn rate 8% -> 4% (50% for legacy rows stays) and hero fusion (fuse_heroes).
-- Fusion: the base hero plus its materials (same rank, ratio from heroFusion.ts) become the base
-- one rank higher (new key, gear moves along) or +1 star to the owned hero of that rank. The
-- server computes coins, level, xp and the new hero data; this function checks ownership,
-- ranks, coins, the base's 3 stars and the optimistic version, and does the rows atomically.
create or replace function public.burn_item(p_player uuid, p_version int, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_legacy boolean;
  v_coins int;
begin
  if p_key is null or p_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select legacy into v_legacy from public.weapons where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if exists (select 1 from public.equipment where player_id = p_player and weapon_key = p_key) then
    raise exception 'equipped';
  end if;
  v_coins := public.trade_value(p_key) * case when v_legacy then 50 else 4 end / 100;
  delete from public.weapons where player_id = p_player and key = p_key;
  update public.player_state set coins = coins + v_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', p_key, 'gained', v_coins, 'coins', v_state.coins, 'version', v_state.version);
end $$;

create or replace function public.burn_hero(p_player uuid, p_version int, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_legacy boolean;
  v_coins int;
begin
  if p_key is null or p_key !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select legacy into v_legacy from public.characters where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if (select count(*) from public.characters where player_id = p_player) <= 1 then
    raise exception 'only_hero';
  end if;
  v_coins := public.trade_value(p_key) * case when v_legacy then 50 else 4 end / 100;
  -- Its gear stays in the collection: the equipment rows go with the hero (FK cascade).
  delete from public.characters where player_id = p_player and key = p_key;
  update public.player_state set coins = coins + v_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', p_key, 'gained', v_coins, 'coins', v_state.coins, 'version', v_state.version);
end $$;


create or replace function public.burn_many(p_player uuid, p_version int, p_kind text, p_keys text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_key text;
  v_legacy boolean;
  v_total int := 0;
  v_count int := 0;
begin
  if p_kind not in ('hero', 'piece') or p_keys is null or coalesce(array_length(p_keys, 1), 0) not between 1 and 100 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  foreach v_key in array p_keys loop
    if p_kind = 'piece' then
      if v_key is null or v_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
      select legacy into v_legacy from public.weapons where player_id = p_player and key = v_key for update;
      if not found then continue; end if;
      if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_key) then continue; end if;
      v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 4 end / 100;
      delete from public.weapons where player_id = p_player and key = v_key;
    else
      if v_key is null or v_key !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
      select legacy into v_legacy from public.characters where player_id = p_player and key = v_key for update;
      if not found then continue; end if;
      if (select count(*) from public.characters where player_id = p_player) <= 1 then continue; end if;
      v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 4 end / 100;
      delete from public.characters where player_id = p_player and key = v_key;
    end if;
    v_count := v_count + 1;
  end loop;
  update public.player_state set coins = coins + v_total, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', v_count, 'gained', v_total, 'coins', v_state.coins, 'version', v_state.version);
end $$;

create or replace function public.fuse_heroes(
  p_player uuid, p_version int, p_base text, p_materials text[], p_coins int,
  p_data jsonb, p_level int, p_xp int, p_stars int default 0
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_b public.characters;
  v_ranks text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_i int;
  v_next text;
  v_new text;
  v_m text;
  v_mc public.characters;
  v_exist public.characters;
begin
  if p_base is null or p_base !~ '^c-[a-z]+-[a-z]+-[a-z]+$'
     or p_materials is null or coalesce(array_length(p_materials, 1), 0) not between 2 and 9
     or p_coins is null or p_coins not between 0 and 100000
     or p_data is null or jsonb_typeof(p_data) <> 'object'
     or p_level is null or p_level not between 1 and 999 or p_xp is null or p_xp < 0
     or p_stars is null or p_stars not between 0 and 5 then
    raise exception 'invalid_args';
  end if;
  if (select count(distinct x) from unnest(p_materials) as x) <> array_length(p_materials, 1)
     or p_base = any (p_materials) then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;

  select * into v_b from public.characters where player_id = p_player and key = p_base for update;
  if not found then raise exception 'not_owned'; end if;
  if v_b.stars < 3 then raise exception 'invalid_args'; end if; -- heroFusion.ts FUSION_STARS
  v_i := array_position(v_ranks, v_b.rarity);
  if v_i is null or v_i >= 9 then raise exception 'invalid_args'; end if;
  v_next := v_ranks[v_i + 1];
  foreach v_m in array p_materials loop
    if v_m is null or v_m !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
    select * into v_mc from public.characters where player_id = p_player and key = v_m for update;
    if not found then raise exception 'not_owned'; end if;
    if v_mc.rarity <> v_b.rarity then raise exception 'rank_mismatch'; end if;
  end loop;

  v_new := 'c-' || v_b.class || '-' || v_b.element || '-' || v_next;
  select * into v_exist from public.characters where player_id = p_player and key = v_new for update;
  if found then
    if v_exist.stars >= 5 then raise exception 'max_stars'; end if;
    update public.characters set stars = stars + 1 where player_id = p_player and key = v_new;
  else
    insert into public.characters (player_id, class, element, rarity, stars, data, level, xp, skill, legacy)
    values (p_player, v_b.class, v_b.element, v_next, p_stars,
            p_data - 'level' - 'xp' - 'legacy' - 'skill', p_level, p_xp, v_b.skill, false);
    -- the gear follows the base hero (its row still exists, so no cascade yet)
    update public.equipment set character_key = v_new
     where player_id = p_player and character_key = p_base;
  end if;
  -- materials and the old base go; whatever they still wear is unequipped by the FK cascade
  delete from public.characters
   where player_id = p_player and key = any (p_materials || p_base);
  update public.player_state set coins = coins - p_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('key', v_new, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ===== 0039_no_fragments.sql =====
-- 0039: hero fragments are gone. Pulls no longer give them and spend_fragments is dropped.
-- Fragments players still hold are paid once as coins (40 each, a third of a star's 125-coin
-- duplicate refund) and the rows removed. The (now empty) fragments table stays so old setups
-- and get_profile keep working.
do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0039_fragments_to_coins') then
    update public.player_state s
       set coins = s.coins + f.total * 40
      from (select player_id, sum(qty)::int as total from public.fragments group by player_id) f
     where s.player_id = f.player_id;
    delete from public.fragments;
    insert into public.migration_flags (key) values ('0039_fragments_to_coins');
  end if;
end $$;

drop function if exists public.spend_fragments(uuid, text);

create or replace function public.apply_pull(
  p_player uuid, p_version int, p_idem text, p_banner text, p_cost int,
  p_pity int, p_pity_ssr int, p_seed bigint, p_daily boolean, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_prev public.pulls;
  v_n int;
  v_unit int;
  v_expected int;
  v_old_pity_ssr int;
  v_run_pity_ssr int;
  v_thr_ssr int := public.game_const('pity_ssr_threshold');
  v_max_stars int := public.game_const('max_stars');
  v_item jsonb;
  v_data jsonb;
  v_cls text;
  v_typ text;
  v_el text;
  v_rar text;
  v_key text;
  v_stars int;
  v_status text;
  v_refund int;
  v_refund_total int := 0;
  v_frag int;
  v_fkey text;
  v_results jsonb := '[]'::jsonb;
  v_coins int;
  v_version int;
  v_out jsonb;
  v_daily boolean := coalesce(p_daily, false);
begin
  if p_banner is null or p_banner not in ('character', 'weapon')
     or p_idem is null or char_length(p_idem) not between 8 and 80
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  select * into v_prev from public.pulls
   where player_id = p_player and idempotency_key = p_idem;
  if found then
    return v_prev.result || jsonb_build_object('replayed', true);
  end if;

  if p_version is distinct from v_state.version then
    raise exception 'conflict' using errcode = '40001';
  end if;

  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > public.game_const('multi_pull') then
    raise exception 'invalid_items';
  end if;

  v_unit := case p_banner
    when 'character' then public.game_const('pull_cost_character')
    else public.game_const('pull_cost_weapon') end;
  if v_daily then
    if v_n <> 1 then
      raise exception 'invalid_items';
    end if;
    v_expected := 0;
  elsif v_n = public.game_const('multi_pull') then
    v_expected := round(v_unit * v_n * (100 - public.game_const('multi_discount_pct')) / 100.0)::int;
  else
    v_expected := v_unit * v_n;
  end if;
  if p_cost is distinct from v_expected then
    raise exception 'invalid_cost';
  end if;
  if v_state.coins < v_expected then
    raise exception 'insufficient_coins';
  end if;

  if v_daily then
    begin
      insert into public.daily_claims (player_id, day) values (p_player, public.game_day());
    exception when unique_violation then
      raise exception 'already_claimed';
    end;
  end if;

  select pity_ssr into v_old_pity_ssr from public.gacha_state
   where player_id = p_player and banner = p_banner for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_run_pity_ssr := v_old_pity_ssr;

  for v_item in
    select t.e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by t.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_el := v_item ->> 'element';
    v_rar := v_item ->> 'rarity';
    v_data := coalesce(v_item -> 'data', '{}'::jsonb) - 'level' - 'xp' - 'legacy' - 'skill';
    if jsonb_typeof(v_data) <> 'object'
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;

    -- Pity (same semantics as rollRarity): since the last SSR, the 250th pull MUST be ssr.
    if v_run_pity_ssr >= v_thr_ssr and v_rar <> 'ssr' then
      raise exception 'invalid_pity';
    end if;
    v_run_pity_ssr := case when v_rar = 'ssr' then 0 else least(v_run_pity_ssr + 1, v_thr_ssr) end;

    v_refund := 0;
    v_frag := 0;
    v_fkey := null;

    if p_banner = 'character' then
      v_cls := v_item ->> 'class';
      if not coalesce(v_cls = any (array['caballero', 'mago', 'picaro', 'clerigo']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'c-' || v_cls || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.characters
       where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.characters set stars = v_stars
           where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        insert into public.characters (player_id, class, element, rarity, data)
        values (p_player, v_cls, v_el, v_rar, v_data);
      end if;
    else
      v_typ := v_item ->> 'type';
      v_key := 'w-' || v_typ || '-' || v_el || '-' || v_rar;
      v_status := public.grant_piece(
        p_player, v_typ, v_el, v_rar, v_data ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      if v_status = 'refund' then
        v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', v_status, 'id', v_key, 'stars', v_stars, 'refund', v_refund,
      'fragmentGain', v_frag, 'fragmentKey', v_fkey));
  end loop;

  if v_run_pity_ssr is distinct from p_pity_ssr then
    raise exception 'invalid_pity';
  end if;

  update public.gacha_state set pity_ssr = v_run_pity_ssr
   where player_id = p_player and banner = p_banner;
  update public.player_state
     set coins = coins - v_expected + v_refund_total, version = version + 1
   where player_id = p_player
   returning coins, version into v_coins, v_version;

  v_out := jsonb_build_object(
    'replayed', false, 'coins', v_coins, 'version', v_version, 'pitySsr', v_run_pity_ssr,
    'refundTotal', v_refund_total, 'results', v_results);
  insert into public.pulls (player_id, idempotency_key, banner, cost, daily, seed, items, result)
  values (p_player, p_idem, p_banner, v_expected, v_daily, p_seed, p_items, v_out);
  return v_out;
end $$;

-- ===== 0040_no_lanza.sql =====
-- 0040: the "lanza" weapon is gone (2 weapons per class). Every lanza becomes an espada with the
-- same rank, stars, element and roll. If the player already owns that espada, the two merge into
-- one with +1 star (max 5). Parts p-lanza-* are added to p-espada-*. Heroes keep their weapon
-- unless their class can no longer use it (e.g. Clerigo with baston): it goes back to the bag.
-- Adds no functions, so the 0018 lockdown needs no change. Runs once (flag).
do $$
begin
  if exists (select 1 from public.migration_flags where key = '0040_no_lanza') then
    return;
  end if;

  create temporary table _equip on commit drop as select * from public.equipment;
  delete from public.equipment;

  -- merge duplicates, then rename the rest
  update public.weapons e
     set stars = least(5, greatest(e.stars, l.stars) + 1)
    from public.weapons l
   where l.type = 'lanza' and e.type = 'espada' and e.player_id = l.player_id
     and e.element = l.element and e.rarity = l.rarity;
  delete from public.weapons l
   where l.type = 'lanza'
     and exists (select 1 from public.weapons e
                  where e.type = 'espada' and e.player_id = l.player_id
                    and e.element = l.element and e.rarity = l.rarity);
  update public.weapons set type = 'espada' where type = 'lanza';

  -- equipment: new key, drop what the class cannot use, one holder per weapon
  insert into public.equipment (player_id, character_key, weapon_key, slot)
  select distinct on (q.player_id, q.wkey) q.player_id, q.character_key, q.wkey, q.slot
    from (
      select e.player_id, e.character_key, e.slot,
             regexp_replace(e.weapon_key, '^w-lanza-', 'w-espada-') as wkey
        from _equip e
    ) q
    join public.characters c on c.player_id = q.player_id and c.key = q.character_key
    join public.weapons w on w.player_id = q.player_id and w.key = q.wkey
   where q.slot <> 'arma'
      or (c.class = 'caballero' and w.type in ('espada', 'hacha'))
      or (c.class = 'mago' and w.type in ('baston', 'varita'))
      or (c.class = 'picaro' and w.type in ('daga', 'arco'))
      or (c.class = 'clerigo' and w.type in ('maza', 'libro'))
   order by q.player_id, q.wkey, q.character_key;

  -- forge parts
  insert into public.part_stock (player_id, key, qty)
  select player_id, regexp_replace(key, '^p-lanza-', 'p-espada-'), qty
    from public.part_stock where key like 'p-lanza-%'
  on conflict (player_id, key) do update set qty = least(9999, public.part_stock.qty + excluded.qty);
  delete from public.part_stock where key like 'p-lanza-%';

  -- market: cancel open offers that would collide after the rename, then rename every key
  update public.market_offers o set status = 'cancelled', closed_at = now()
   where o.status = 'open' and (
     regexp_replace(o.give_key, '^w-lanza-', 'w-espada-') = regexp_replace(coalesce(o.want_key, ''), '^w-lanza-', 'w-espada-')
     or (o.give_key like 'w-lanza-%' and exists (
           select 1 from public.market_offers p
            where p.status = 'open' and p.seller_id = o.seller_id and p.kind = o.kind
              and p.give_key = regexp_replace(o.give_key, '^w-lanza-', 'w-espada-'))));
  update public.market_offers set
    give_key = regexp_replace(give_key, '^w-lanza-', 'w-espada-'),
    want_key = regexp_replace(want_key, '^w-lanza-', 'w-espada-')
   where give_key like 'w-lanza-%' or want_key like 'w-lanza-%';

  insert into public.migration_flags (key) values ('0040_no_lanza');
end $$;

-- ===== 0041_forge_v9.sql =====
-- 0041: Forja v9.0 (docs/FORJA_V9.md). Two actions, two materials.
--  * Escamas and Dado cargado live on player_state (bound to the account, never tradable).
--  * weapons.plus / plus_streak: the Mejorar level (+0..+10) and the consecutive failures.
--  * ONE-TIME (flag 0041_forge_v9): the old part_stock becomes value without loss. Parts of rank S/SS/SSR
--    -> Escamas (1/2/4 each); parts of F..A -> coins (F 5, E 8, D 12, C 20, B 35, A 60 each); every
--    core -> 1 Dado cargado. Keep in sync with PART_TO_ESCAMAS / PART_TO_COINS in profile.ts.
--    part_stock stays (empty, nothing writes to it) so old setups keep working.
--  * apply_forge and grant_core are gone. New: apply_ascend, apply_upgrade, level_escamas.
--  * bank_level: p_parts -> p_dados; it computes the Escamas itself (S/SS/SSR levels 2/3/4, +10% per
--    ascension, repeat decay) and caps the last-level Dado at 2 per game day.
--  * mission_claim, coop_pay, tower_*: cores -> Dados (weekly mission 1, Viernes event 1, coop win 1
--    (+1 MVP), tower top 3 one each). Tower floor prizes are coins only now.
-- New signatures are born executable by anon/authenticated: 0018 (always last) closes them again.

alter table public.player_state add column if not exists escamas int not null default 0 check (escamas >= 0);
alter table public.player_state add column if not exists dados int not null default 0 check (dados >= 0);
alter table public.player_state add column if not exists dado_day date;
alter table public.player_state add column if not exists dado_n int not null default 0 check (dado_n >= 0);
alter table public.weapons add column if not exists plus int not null default 0 check (plus between 0 and 10);
alter table public.weapons add column if not exists plus_streak int not null default 0 check (plus_streak >= 0);

do $$
begin
  if exists (select 1 from public.migration_flags where key = '0041_forge_v9') then
    return;
  end if;
  update public.player_state ps
     set escamas = least(99999, ps.escamas + c.esc),
         dados = least(99999, ps.dados + c.dad),
         coins = ps.coins + c.coin,
         version = ps.version + 1
    from (
      select k.player_id,
             sum(case when k.key like 'core-%' then 0
                      when substring(k.key from '[^-]+$') = 's' then k.qty
                      when substring(k.key from '[^-]+$') = 'ss' then k.qty * 2
                      when substring(k.key from '[^-]+$') = 'ssr' then k.qty * 4 else 0 end)::int as esc,
             sum(case when k.key like 'core-%' then k.qty else 0 end)::int as dad,
             sum(case when k.key like 'core-%' then 0
                      else k.qty * case substring(k.key from '[^-]+$')
                        when 'f' then 5 when 'e' then 8 when 'd' then 12 when 'c' then 20
                        when 'b' then 35 when 'a' then 60 else 0 end end)::int as coin
        from public.part_stock k where k.qty > 0 group by k.player_id
    ) c
   where ps.player_id = c.player_id;
  delete from public.part_stock;
  insert into public.migration_flags (key) values ('0041_forge_v9');
end $$;

drop function if exists public.apply_forge(uuid, int, int, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.grant_core(uuid, text, int);
drop function if exists public.tower_floor_cores(int);

-- Escamas of a cleared level (levelEscamas in levelLoot.ts): S 2, SS 3, SSR 4, +10% per ascension level,
-- times the daily repeat decay (p_mult, 1 for a new level).
create or replace function public.level_escamas(p_rank text, p_asc int, p_mult numeric) returns int
language sql immutable set search_path = ''
as $$
  select round((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc) * p_mult)::int
$$;

create or replace function public.get_profile(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_p public.players;
  v_s public.player_state;
begin
  select * into v_p from public.players where id = p_player;
  if not found then
    raise exception 'player_not_found';
  end if;
  select * into v_s from public.player_state where player_id = p_player;
  return jsonb_build_object(
    'name', v_p.name,
    'isAdmin', v_p.is_admin,
    'bestFloor', v_p.best_floor,
    'stateVersion', v_s.version,
    'coins', v_s.coins,
    'pity', coalesce((
      select jsonb_object_agg(g.banner, g.pity)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'escamas', v_s.escamas,
    'dados', v_s.dados,
    'dadosDay', case when v_s.dado_day = public.game_day()
                     then jsonb_build_object('day', to_char(v_s.dado_day, 'YYYY-MM-DD'), 'n', v_s.dado_n)
                     else null end,
    -- {rank: [levels cleared at ascension 0, 1, ...]}
    'dungeons', coalesce((
      select jsonb_object_agg(t.rank, t.arr)
      from (
        select m.rank,
               (select jsonb_agg(coalesce(x.cleared, 0) order by a.n)
                  from generate_series(0, m.top) as a(n)
                  left join public.dungeon_progress x
                    on x.player_id = p_player and x.rank = m.rank and x.ascension = a.n) as arr
          from (select d.rank, max(d.ascension) as top
                  from public.dungeon_progress d
                 where d.player_id = p_player group by d.rank) m
      ) t
    ), '{}'::jsonb),
    'levelsDay', case when v_s.levels_day = public.game_day()
                      then jsonb_build_object('day', to_char(v_s.levels_day, 'YYYY-MM-DD'), 'n', v_s.levels_n)
                      else null end,
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars,
        'data', c.data || jsonb_build_object('level', c.level, 'xp', c.xp, 'legacy', c.legacy)
                       || case when c.skill is null then '{}'::jsonb else jsonb_build_object('skill', c.skill) end
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars,
        'data', w.data || jsonb_build_object('legacy', w.legacy, 'plus', w.plus, 'plusStreak', w.plus_streak)
                       || case when w.roll is null then '{}'::jsonb else jsonb_build_object('roll', w.roll) end
                       || case when w.lines is null then '{}'::jsonb else jsonb_build_object('lines', w.lines) end
      ) order by w.created_at, w.key)
      from public.weapons w where w.player_id = p_player
    ), '[]'::jsonb),
    'equipped', coalesce((
      select jsonb_object_agg(case when e.slot = 'arma' then e.character_key else e.character_key || '|' || e.slot end, e.weapon_key)
      from public.equipment e where e.player_id = p_player
    ), '{}'::jsonb),
    'fragments', coalesce((
      select jsonb_object_agg(f.class || ':' || f.rarity, f.qty)
      from public.fragments f where f.player_id = p_player and f.qty > 0
    ), '{}'::jsonb)
  );
end $$;

drop function if exists public.bank_level(uuid, uuid, text, text, int, int, text, int, jsonb, jsonb, boolean, jsonb, text, text);
create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
  p_status text, p_xp int, p_dados int, p_pieces jsonb, p_repeat boolean,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_max_xp constant int := 1500; -- a 5-fight level with a final boss gives 1125
  v_run public.runs;
  v_state public.player_state;
  v_verdict text := coalesce(p_verdict, 'accepted');
  v_why text;
  v_done int;
  v_repeat boolean := false;
  v_n int;
  v_base numeric;
  v_coins int := 0;
  v_chest int := 0;
  v_refund int := 0;
  v_xp int;
  v_capped boolean := false;
  v_item jsonb;
  v_status text;
  v_escamas int := 0;
  v_dado int := 0;
  v_dn int;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_dados is null or p_dados not in (0, 1)
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'rank' is distinct from p_rank
     or (v_run.hero ->> 'level')::int is distinct from p_level
     or (v_run.hero ->> 'asc')::int is distinct from p_asc
     or v_run.hero ->> 'heroId' is distinct from p_hero_id then
    raise exception 'invalid_args'; -- the attempt that was started is not the one being paid
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;

  if v_verdict = 'rejected' then
    update public.runs set status = 'closed', finished_at = now() where id = p_run_id;
    insert into public.run_submissions (run_id, player_id, log, verdict, reason)
    values (p_run_id, p_player, p_log, 'rejected', left(p_reason, 300));
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_rejected', jsonb_build_object('run_id', p_run_id, 'reason', left(p_reason, 300)));
    return jsonb_build_object('cleared', false, 'repeat', false, 'coins', 0, 'chest', 0, 'xp', 0,
                              'levelsGained', 0, 'newLevel', 0, 'dungeonDone', false, 'verdict', 'rejected');
  end if;

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or p_dados > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 30 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.progress_cleared(p_player, p_rank, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_rank) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count(p_rank) then
      v_chest := round(public.level_chest(p_rank) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.dungeon_progress (player_id, rank, ascension, cleared)
      values (p_player, p_rank, p_asc, p_level + 1)
      on conflict (player_id, rank, ascension) do update
        set cleared = greatest(public.dungeon_progress.cleared, excluded.cleared);
    end if;

    -- Escamas (S+ only) follow the coin rules: +10% per ascension, repeats decay with the day's count.
    v_escamas := public.level_escamas(p_rank, p_asc, case when v_repeat then public.level_decay(v_n) else 1 end);
    -- Dado cargado: only the last level of a dungeon S+; the server rolled it, SQL caps it at 2 per day.
    if p_dados > 0 then
      if public.rank_idx(p_rank) < public.rank_idx('s') or p_level + 1 < public.level_count(p_rank) then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_dn < 2 then v_dado := 1; end if;
    end if;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_rank) + 1 then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      -- a duplicate already at max stars is ignored: no coin refund (drops are plentiful)
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or p_dados > 0 then
    raise exception 'invalid_args';
  end if;

  -- EXP: always (a lost level keeps what the replay earned).
  if v_xp > 0 then
    v_hero := public.grant_hero_xp(p_player, p_hero_id, v_xp);
  end if;

  update public.runs
     set status = 'closed', finished_at = now(), max_floor = case when p_status = 'cleared' then p_level + 1 else 0 end,
         coins_earned = v_coins + v_chest
   where id = p_run_id;
  insert into public.run_submissions (run_id, player_id, log, verdict, reason)
  values (p_run_id, p_player, p_log, v_verdict, left(p_reason, 300));

  update public.player_state
     set coins = coins + v_coins + v_chest + v_refund, version = version + 1,
         escamas = least(99999, escamas + v_escamas), dados = least(99999, dados + v_dado),
         dado_day = case when v_dado > 0 then public.game_day() else dado_day end,
         dado_n = case when v_dado > 0 then v_dn + 1 else dado_n end,
         levels_day = case when p_status = 'cleared' then public.game_day() else levels_day end,
         levels_n = case when p_status = 'cleared' then v_n else levels_n end
   where player_id = p_player
   returning coins, version into v_new_coins, v_version;

  if v_capped or v_verdict = 'cut' then
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_' || case when v_capped then 'capped' else 'cut' end,
            jsonb_build_object('run_id', p_run_id, 'claimed_xp', p_xp, 'credited_xp', v_xp, 'reason', left(p_reason, 300)));
  end if;

  return jsonb_build_object(
    'cleared', p_status = 'cleared', 'repeat', v_repeat, 'coins', v_coins, 'chest', v_chest,
    'refund', v_refund, 'xp', (v_hero ->> 'xp')::int, 'levelsGained', (v_hero ->> 'gained')::int,
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done, 'escamas', v_escamas, 'dados', v_dado,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;

drop function if exists public.mission_claim(uuid, text, int, jsonb, jsonb);
create or replace function public.mission_claim(
  p_player uuid, p_scope text, p_reached int,
  p_pieces jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_period date;
  v_row public.mission_state;
  v_coins int[];
  v_dados int[];
  v_pieces int[];
  v_pay int := 0;
  v_dado int := 0;
  v_nx int := 0;
  v_best int := public.rank_idx(public.best_cleared_rank(p_player));
  v_refund int := 0;
  v_item jsonb;
  k int;
begin
  if p_scope not in ('daily', 'weekly', 'event') or p_reached is null or p_reached not between 1 and 3
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;
  -- SCOPE_TIERS (missions.ts), one entry per tier (30 / 60 / 90 activity points).
  v_coins := case p_scope when 'daily' then array[20, 30, 250]
                          when 'weekly' then array[120, 100, 500]
                          else array[50, 100, 400] end;
  v_dados := case p_scope when 'daily' then array[0, 0, 0]
                          when 'weekly' then array[0, 0, 1]
                          else array[0, 0, 1] end;
  v_pieces := case p_scope when 'weekly' then array[0, 1, 0] else array[0, 0, 0] end;
  v_period := case when p_scope = 'daily' then public.game_day() else public.game_week() end;
  perform 1 from public.player_state where player_id = p_player for update;
  select * into v_row from public.mission_state
   where player_id = p_player and scope = p_scope and period = v_period for update;
  if not found or v_row.claimed >= p_reached then
    raise exception 'nothing_to_claim';
  end if;
  for k in v_row.claimed + 1 .. p_reached loop
    v_pay := v_pay + v_coins[k];
    v_dado := v_dado + v_dados[k];
    v_nx := v_nx + v_pieces[k];
  end loop;

  -- Pieces: exactly the promised amount, at most at the best rank.
  if jsonb_array_length(p_pieces) <> v_nx then
    raise exception 'invalid_items';
  end if;
  for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
    if public.rank_idx(v_item ->> 'rarity') is null or public.rank_idx(v_item ->> 'rarity') > v_best then
      raise exception 'invalid_items';
    end if;
    if public.grant_piece(
         p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
         case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
         v_item -> 'lines', true) = 'refund' then
      v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
    end if;
  end loop;

  update public.mission_state set claimed = p_reached
   where player_id = p_player and scope = p_scope and period = v_period;
  update public.player_state set coins = coins + v_pay + v_refund, dados = least(99999, dados + v_dado), version = version + 1
   where player_id = p_player;
  return jsonb_build_object('coins', v_pay + v_refund, 'dados', v_dado,
                            'pieces', v_nx, 'claimed', p_reached);
end $$;

create or replace function public.coop_pay(p_room uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phase text;
  v_row jsonb;
  v_player uuid;
  v_coins int;
  v_chips int;
  v_dados int;
  v_acct boolean;
  v_paid int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 7 then
    raise exception 'invalid_args';
  end if;
  select phase into v_phase from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_phase not in ('night_summary', 'closed') then raise exception 'wrong_phase'; end if;
  for v_row in select e from jsonb_array_elements(p_rows) as t(e) loop
    v_player := (v_row ->> 'player')::uuid;
    v_coins := coalesce((v_row ->> 'coins')::int, 0);
    v_chips := coalesce((v_row ->> 'chips')::int, 0);
    v_dados := coalesce((v_row ->> 'dados')::int, 0);
    if v_coins < 0 or v_coins > 1000 or v_chips < 0 or v_chips > 500 or v_dados < 0 or v_dados > 3 then
      raise exception 'invalid_args';
    end if;
    perform 1 from public.room_coop
     where room_id = p_room and player_id = v_player and not paid for update;
    if not found then continue; end if;
    -- Account prizes (coins, dice) are limited to 3 rooms per 24 h per player; chips are not.
    v_acct := (select count(*) from public.room_coop
                where player_id = v_player and acct and paid_at > now() - interval '24 hours') < 3;
    update public.room_coop set paid = true, paid_at = now(), acct = v_acct
     where room_id = p_room and player_id = v_player;
    if not v_acct then
      v_coins := 0;
      v_dados := 0;
    end if;
    if v_coins > 0 or v_dados > 0 then
      update public.player_state set coins = coins + v_coins, dados = least(99999, dados + v_dados), version = version + 1
       where player_id = v_player;
    end if;
    if v_chips > 0 then
      update public.room_players set chips = chips + v_chips
       where room_id = p_room and player_id = v_player and left_at is null;
      if found then
        insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
        values (p_room, v_player, v_chips, 'coop_prize', 'coop');
      end if;
    end if;
    v_paid := v_paid + 1;
  end loop;
  return jsonb_build_object('paid', v_paid);
end $$;

-- Tower floor prizes are coins only: floor 5 of each 10-cycle 150, floor 10 300, else 5.
create or replace function public.tower_floor_coins(p_floor int) returns int
language sql immutable set search_path = ''
as $$ select case ((p_floor - 1) % 10) + 1 when 10 then 300 when 5 then 150 else 5 end $$;

create or replace function public.tower_settle_daily() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date - 1;
  v_week date := date_trunc('week', ((now() at time zone 'utc')::date - 1)::timestamp)::date;
  v_mode text;
  v_win record;
  v_n int := 0;
begin
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    perform pg_advisory_xact_lock(hashtext('tower_daily:' || v_day::text || v_mode));
    if exists (select 1 from public.tower_daily where day = v_day and mode = v_mode) then
      continue;
    end if;
    select player_id, max_floor into v_win from public.tower_scores
     where week = v_week and mode = v_mode and max_floor >= 1
     order by max_floor desc, rounds asc, updated_at asc, player_id
     limit 1;
    if not found then
      continue;
    end if;
    insert into public.tower_daily (day, mode, player_id, floor) values (v_day, v_mode, v_win.player_id, v_win.max_floor);
    update public.player_state set coins = coins + 350, version = version + 1
     where player_id = v_win.player_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int, p_rounds int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_floor int;
  v_rounds int;
  v_coins int;
  v_paid int;
  v_week date := public.game_week();
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500
     or p_rounds is null or p_rounds < 0 or p_rounds > 1000000 then
    raise exception 'invalid_args';
  end if;
  perform public.tower_settle_daily();
  insert into public.tower_scores (week, mode, player_id, max_floor, rounds)
  values (v_week, p_mode, p_player, p_floor, p_rounds)
  on conflict (week, mode, player_id) do update
    set max_floor = case when excluded.max_floor > public.tower_scores.max_floor
                           or (excluded.max_floor = public.tower_scores.max_floor
                               and excluded.rounds < public.tower_scores.rounds)
                         then excluded.max_floor else public.tower_scores.max_floor end,
        rounds = case when excluded.max_floor > public.tower_scores.max_floor
                        or (excluded.max_floor = public.tower_scores.max_floor
                            and excluded.rounds < public.tower_scores.rounds)
                      then excluded.rounds else public.tower_scores.rounds end,
        updated_at = case when excluded.max_floor > public.tower_scores.max_floor
                            or (excluded.max_floor = public.tower_scores.max_floor
                                and excluded.rounds < public.tower_scores.rounds)
                          then now() else public.tower_scores.updated_at end
  returning max_floor, rounds into v_floor, v_rounds;

  with ins as (
    insert into public.tower_floor_paid (week, mode, player_id, floor)
    select v_week, p_mode, p_player, g from generate_series(1, p_floor) as g
    on conflict do nothing
    returning floor
  )
  select coalesce(sum(public.tower_floor_coins(floor)), 0), count(*)
    into v_coins, v_paid from ins;
  if v_paid > 0 then
    update public.player_state set coins = coins + v_coins, version = version + 1
     where player_id = p_player;
  end if;
  return jsonb_build_object('week', v_week, 'max_floor', v_floor, 'rounds', v_rounds,
                            'prize', jsonb_build_object('floors', v_paid, 'coins', v_coins, 'dados', 0));
end $$;

-- Weekly prizes: 300 / 200 / 100 coins and 1 Dado cargado each (TOWER_PRIZES).
create or replace function public.tower_settle(p_week date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  r record;
  v_place int;
  v_coins int[] := array[300, 200, 100];
  v_win jsonb;
  v_n int := 0;
begin
  if p_week is null or p_week >= public.game_week() then
    return jsonb_build_object('settled', 0);
  end if;
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    perform pg_advisory_xact_lock(hashtext('tower_settle:' || p_week::text || v_mode));
    if exists (select 1 from public.tower_settled where week = p_week and mode = v_mode) then
      continue;
    end if;
    v_win := '[]'::jsonb;
    v_place := 0;
    for r in
      select player_id, max_floor from public.tower_scores
       where week = p_week and mode = v_mode and max_floor >= 8
       order by max_floor desc, rounds asc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      update public.player_state set dados = least(99999, dados + 1) where player_id = r.player_id;
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- ------------------------------------------------------------------ Ascender
-- Same rule and table as hero fusion (HERO_FUSION / ASCEND): the base piece + (total - 1) materials of the
-- SAME rank (any type or element, not worn) + coins -> the base one rank up (0 stars, +0, a new roll).
-- The server rolls the new piece (p_new); SQL checks ownership, ranks, counts, coins and the roll.
create or replace function public.apply_ascend(
  p_player uuid, p_version int, p_base text, p_materials jsonb, p_new jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ranks constant text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_total constant int[] := array[6, 6, 5, 5, 4, 4, 3, 3];
  v_cost constant int[] := array[20, 40, 80, 160, 320, 640, 1280, 2560];
  v_state public.player_state;
  v_b public.weapons;
  v_i int;
  v_next text;
  v_m text;
  v_mw public.weapons;
  v_n int;
  v_new text;
  v_eq jsonb;
  v_status text;
begin
  if p_base is null or p_base !~ '^w-[a-z]+-[a-z]+-[a-z]+$'
     or p_materials is null or jsonb_typeof(p_materials) <> 'array'
     or jsonb_array_length(p_materials) not between 2 and 5
     or p_new is null or jsonb_typeof(p_new) <> 'object' then
    raise exception 'invalid_args';
  end if;
  v_n := jsonb_array_length(p_materials);
  if (select count(distinct x) from jsonb_array_elements_text(p_materials) as t(x)) <> v_n
     or p_materials ? p_base then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;

  select * into v_b from public.weapons where player_id = p_player and key = p_base for update;
  if not found then raise exception 'not_owned'; end if;
  v_i := array_position(v_ranks, v_b.rarity);
  if v_i is null or v_i >= 9 then raise exception 'invalid_args'; end if;
  v_next := v_ranks[v_i + 1];
  if v_n + 1 <> v_total[v_i] then raise exception 'invalid_args'; end if;
  if v_state.coins < v_cost[v_i] then raise exception 'insufficient_coins'; end if;
  if p_new ->> 'type' is distinct from v_b.type or p_new ->> 'element' is distinct from v_b.element
     or p_new ->> 'rarity' is distinct from v_next then
    raise exception 'invalid_items';
  end if;

  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    if v_m is null or v_m !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
    select * into v_mw from public.weapons where player_id = p_player and key = v_m for update;
    if not found then raise exception 'not_owned'; end if;
    if v_mw.rarity <> v_b.rarity then raise exception 'rank_mismatch'; end if;
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_m) then
      raise exception 'equipped';
    end if;
  end loop;

  -- The worn base keeps its place under the new key (the FK would cascade the rows away).
  select coalesce(jsonb_agg(jsonb_build_object('c', e.character_key, 's', e.slot)), '[]'::jsonb) into v_eq
    from public.equipment e where e.player_id = p_player and e.weapon_key = p_base;
  delete from public.equipment where player_id = p_player and weapon_key = p_base;
  delete from public.weapons where player_id = p_player and key = p_base;
  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    delete from public.weapons where player_id = p_player and key = v_m;
  end loop;

  v_status := public.grant_piece(
    p_player, v_b.type, v_b.element, v_next, left(coalesce(p_new ->> 'name', v_b.data ->> 'name', 'Pieza'), 60),
    case when (p_new ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (p_new ->> 'roll')::numeric end,
    p_new -> 'lines', false);
  v_new := 'w-' || v_b.type || '-' || v_b.element || '-' || v_next;
  if jsonb_array_length(v_eq) > 0 then
    if v_status <> 'new' then raise exception 'equipped'; end if; -- the target piece already existed
    insert into public.equipment (player_id, character_key, weapon_key, slot)
    select p_player, x ->> 'c', v_new, x ->> 's' from jsonb_array_elements(v_eq) as t(x);
  end if;

  update public.player_state set coins = coins - v_cost[v_i], version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('key', v_new, 'status', v_status, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ------------------------------------------------------------------ Mejorar
-- The server rolled p_success (UPGRADE_TABLE + streak + dado in upgrade.ts); SQL checks the piece
-- (S+, 5 stars, plus < 10) and takes the Escamas (cost = the level you go to) and the die.
create or replace function public.apply_upgrade(
  p_player uuid, p_version int, p_key text, p_use_dado boolean, p_success boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_w public.weapons;
  v_cost int;
begin
  if p_key is null or p_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' or p_use_dado is null or p_success is null then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select * into v_w from public.weapons where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if public.rank_idx(v_w.rarity) < public.rank_idx('s') or v_w.stars < 5 or v_w.plus >= 10 then
    raise exception 'invalid_args';
  end if;
  v_cost := v_w.plus + 1;
  if v_state.escamas < v_cost then raise exception 'insufficient_escamas'; end if;
  if p_use_dado and v_state.dados < 1 then raise exception 'insufficient_dados'; end if;
  update public.weapons
     set plus = case when p_success then plus + 1 else plus end,
         plus_streak = case when p_success then 0 else plus_streak + 1 end
   where player_id = p_player and key = p_key returning plus, plus_streak into v_w.plus, v_w.plus_streak;
  update public.player_state
     set escamas = escamas - v_cost, dados = dados - case when p_use_dado then 1 else 0 end, version = version + 1
   where player_id = p_player returning escamas, dados, version into v_state.escamas, v_state.dados, v_state.version;
  return jsonb_build_object('success', p_success, 'plus', v_w.plus, 'plusStreak', v_w.plus_streak,
                            'escamas', v_state.escamas, 'dados', v_state.dados, 'version', v_state.version);
end $$;

-- ===== 0042_forge_v9_fixes.sql =====
-- 0042: fixes to Forja v9 (0041 already ran; this is incremental and re-runnable).
--  * level_escamas: a repeat clear takes the coin repeat factor (0.6) times the daily decay and FLOORS, so repeats and
--    sweeps of a decayed day reach 0 Escamas (a first clear still rounds). bank_level uses the new 4-argument form.
--  * Dado cargado: every source except the weekly mission and the Viernes event counts in dado_n (cap 2 per game day):
--    grant_dado_capped is used by coop_pay and tower_settle; bank_level keeps its own check. A capped Dado is simply not paid.
--  * apply_ascend: materials with plus > 0 are refused (material_upgraded); a 'refund' from grant_piece (target at max
--    stars) aborts the whole transaction instead of consuming the pieces.
--  * grant_piece: the removed weapon 'lanza' is no longer accepted.
-- New signatures are born executable by anon/authenticated: 0018 (always last) closes them again.

drop function if exists public.level_escamas(text, int, numeric);
create or replace function public.level_escamas(p_rank text, p_asc int, p_repeat boolean, p_mult numeric) returns int
language sql immutable set search_path = ''
as $$
  select case when p_repeat
    then floor((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc) * 0.6 * p_mult)::int
    else round((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc))::int
  end
$$;

-- Pays up to p_n dice, never past 2 per game day (shared with bank_level via dado_day / dado_n). Returns what was paid.
create or replace function public.grant_dado_capped(p_player uuid, p_n int) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_have int;
  v_give int;
begin
  select case when dado_day = public.game_day() then dado_n else 0 end into v_have
    from public.player_state where player_id = p_player for update;
  if not found then return 0; end if;
  v_give := least(coalesce(p_n, 0), greatest(0, 2 - v_have));
  if v_give > 0 then
    update public.player_state
       set dados = least(99999, dados + v_give), dado_day = public.game_day(), dado_n = v_have + v_give
     where player_id = p_player;
  end if;
  return v_give;
end $$;

create or replace function public.grant_piece(
  p_player uuid, p_type text, p_element text, p_rank text, p_name text,
  p_roll numeric, p_lines jsonb, p_refund_on_max boolean
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_stars int;
  v_oroll numeric;
  v_olines jsonb;
  v_lines jsonb := case when p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
                        then null else p_lines end;
begin
  if not coalesce(p_type = any (array['espada', 'hacha', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
     or not coalesce(p_element = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
     or not coalesce(p_rank = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
    raise exception 'invalid_items';
  end if;
  perform public.piece_check(p_type, p_rank, p_roll, v_lines);
  select stars, roll, lines into v_stars, v_oroll, v_olines from public.weapons
   where player_id = p_player and type = p_type and element = p_element and rarity = p_rank
   for update;
  if found then
    if v_stars >= public.game_const('max_stars') then
      if p_refund_on_max then return 'refund'; end if;
      raise exception 'max_stars';
    end if;
    if public.piece_quality(p_roll, v_lines) > public.piece_quality(v_oroll, v_olines) then
      update public.weapons set stars = v_stars + 1, roll = p_roll, lines = v_lines
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    else
      update public.weapons set stars = v_stars + 1
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    end if;
    return 'star';
  end if;
  insert into public.weapons (player_id, type, element, rarity, roll, lines, data)
  values (p_player, p_type, p_element, p_rank, p_roll, v_lines,
          jsonb_build_object('name', left(coalesce(p_name, 'Pieza'), 60)));
  return 'new';
end $$;

create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
  p_status text, p_xp int, p_dados int, p_pieces jsonb, p_repeat boolean,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_max_xp constant int := 1500; -- a 5-fight level with a final boss gives 1125
  v_run public.runs;
  v_state public.player_state;
  v_verdict text := coalesce(p_verdict, 'accepted');
  v_why text;
  v_done int;
  v_repeat boolean := false;
  v_n int;
  v_base numeric;
  v_coins int := 0;
  v_chest int := 0;
  v_refund int := 0;
  v_xp int;
  v_capped boolean := false;
  v_item jsonb;
  v_status text;
  v_escamas int := 0;
  v_dado int := 0;
  v_dn int;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_dados is null or p_dados not in (0, 1)
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'rank' is distinct from p_rank
     or (v_run.hero ->> 'level')::int is distinct from p_level
     or (v_run.hero ->> 'asc')::int is distinct from p_asc
     or v_run.hero ->> 'heroId' is distinct from p_hero_id then
    raise exception 'invalid_args'; -- the attempt that was started is not the one being paid
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;

  if v_verdict = 'rejected' then
    update public.runs set status = 'closed', finished_at = now() where id = p_run_id;
    insert into public.run_submissions (run_id, player_id, log, verdict, reason)
    values (p_run_id, p_player, p_log, 'rejected', left(p_reason, 300));
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_rejected', jsonb_build_object('run_id', p_run_id, 'reason', left(p_reason, 300)));
    return jsonb_build_object('cleared', false, 'repeat', false, 'coins', 0, 'chest', 0, 'xp', 0,
                              'levelsGained', 0, 'newLevel', 0, 'dungeonDone', false, 'verdict', 'rejected');
  end if;

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or p_dados > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 30 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.progress_cleared(p_player, p_rank, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_rank) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count(p_rank) then
      v_chest := round(public.level_chest(p_rank) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.dungeon_progress (player_id, rank, ascension, cleared)
      values (p_player, p_rank, p_asc, p_level + 1)
      on conflict (player_id, rank, ascension) do update
        set cleared = greatest(public.dungeon_progress.cleared, excluded.cleared);
    end if;

    -- Escamas (S+ only) follow the coin rules: +10% per ascension, repeats decay with the day's count.
    v_escamas := public.level_escamas(p_rank, p_asc, v_repeat, case when v_repeat then public.level_decay(v_n) else 1 end);
    -- Dado cargado: only the last level of a dungeon S+; the server rolled it, SQL caps it at 2 per day.
    if p_dados > 0 then
      if public.rank_idx(p_rank) < public.rank_idx('s') or p_level + 1 < public.level_count(p_rank) then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_dn < 2 then v_dado := 1; end if;
    end if;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_rank) + 1 then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      -- a duplicate already at max stars is ignored: no coin refund (drops are plentiful)
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or p_dados > 0 then
    raise exception 'invalid_args';
  end if;

  -- EXP: always (a lost level keeps what the replay earned).
  if v_xp > 0 then
    v_hero := public.grant_hero_xp(p_player, p_hero_id, v_xp);
  end if;

  update public.runs
     set status = 'closed', finished_at = now(), max_floor = case when p_status = 'cleared' then p_level + 1 else 0 end,
         coins_earned = v_coins + v_chest
   where id = p_run_id;
  insert into public.run_submissions (run_id, player_id, log, verdict, reason)
  values (p_run_id, p_player, p_log, v_verdict, left(p_reason, 300));

  update public.player_state
     set coins = coins + v_coins + v_chest + v_refund, version = version + 1,
         escamas = least(99999, escamas + v_escamas), dados = least(99999, dados + v_dado),
         dado_day = case when v_dado > 0 then public.game_day() else dado_day end,
         dado_n = case when v_dado > 0 then v_dn + 1 else dado_n end,
         levels_day = case when p_status = 'cleared' then public.game_day() else levels_day end,
         levels_n = case when p_status = 'cleared' then v_n else levels_n end
   where player_id = p_player
   returning coins, version into v_new_coins, v_version;

  if v_capped or v_verdict = 'cut' then
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_' || case when v_capped then 'capped' else 'cut' end,
            jsonb_build_object('run_id', p_run_id, 'claimed_xp', p_xp, 'credited_xp', v_xp, 'reason', left(p_reason, 300)));
  end if;

  return jsonb_build_object(
    'cleared', p_status = 'cleared', 'repeat', v_repeat, 'coins', v_coins, 'chest', v_chest,
    'refund', v_refund, 'xp', (v_hero ->> 'xp')::int, 'levelsGained', (v_hero ->> 'gained')::int,
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done, 'escamas', v_escamas, 'dados', v_dado,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;

create or replace function public.coop_pay(p_room uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phase text;
  v_row jsonb;
  v_player uuid;
  v_coins int;
  v_chips int;
  v_dados int;
  v_acct boolean;
  v_paid int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 7 then
    raise exception 'invalid_args';
  end if;
  select phase into v_phase from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_phase not in ('night_summary', 'closed') then raise exception 'wrong_phase'; end if;
  for v_row in select e from jsonb_array_elements(p_rows) as t(e) loop
    v_player := (v_row ->> 'player')::uuid;
    v_coins := coalesce((v_row ->> 'coins')::int, 0);
    v_chips := coalesce((v_row ->> 'chips')::int, 0);
    v_dados := coalesce((v_row ->> 'dados')::int, 0);
    if v_coins < 0 or v_coins > 1000 or v_chips < 0 or v_chips > 500 or v_dados < 0 or v_dados > 3 then
      raise exception 'invalid_args';
    end if;
    perform 1 from public.room_coop
     where room_id = p_room and player_id = v_player and not paid for update;
    if not found then continue; end if;
    -- Account prizes (coins, dice) are limited to 3 rooms per 24 h per player; chips are not.
    v_acct := (select count(*) from public.room_coop
                where player_id = v_player and acct and paid_at > now() - interval '24 hours') < 3;
    update public.room_coop set paid = true, paid_at = now(), acct = v_acct
     where room_id = p_room and player_id = v_player;
    if not v_acct then
      v_coins := 0;
      v_dados := 0;
    end if;
    if v_coins > 0 then
      update public.player_state set coins = coins + v_coins, version = version + 1
       where player_id = v_player;
    end if;
    -- Dice share the daily cap of 2 with the level drops; over the cap they are simply not paid.
    if v_dados > 0 then
      perform public.grant_dado_capped(v_player, v_dados);
    end if;
    if v_chips > 0 then
      update public.room_players set chips = chips + v_chips
       where room_id = p_room and player_id = v_player and left_at is null;
      if found then
        insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
        values (p_room, v_player, v_chips, 'coop_prize', 'coop');
      end if;
    end if;
    v_paid := v_paid + 1;
  end loop;
  return jsonb_build_object('paid', v_paid);
end $$;

create or replace function public.tower_settle(p_week date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  r record;
  v_place int;
  v_coins int[] := array[300, 200, 100];
  v_win jsonb;
  v_n int := 0;
begin
  if p_week is null or p_week >= public.game_week() then
    return jsonb_build_object('settled', 0);
  end if;
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    perform pg_advisory_xact_lock(hashtext('tower_settle:' || p_week::text || v_mode));
    if exists (select 1 from public.tower_settled where week = p_week and mode = v_mode) then
      continue;
    end if;
    v_win := '[]'::jsonb;
    v_place := 0;
    for r in
      select player_id, max_floor from public.tower_scores
       where week = p_week and mode = v_mode and max_floor >= 8
       order by max_floor desc, rounds asc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      perform public.grant_dado_capped(r.player_id, 1);
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

create or replace function public.apply_ascend(
  p_player uuid, p_version int, p_base text, p_materials jsonb, p_new jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ranks constant text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_total constant int[] := array[6, 6, 5, 5, 4, 4, 3, 3];
  v_cost constant int[] := array[20, 40, 80, 160, 320, 640, 1280, 2560];
  v_state public.player_state;
  v_b public.weapons;
  v_i int;
  v_next text;
  v_m text;
  v_mw public.weapons;
  v_n int;
  v_new text;
  v_eq jsonb;
  v_status text;
begin
  if p_base is null or p_base !~ '^w-[a-z]+-[a-z]+-[a-z]+$'
     or p_materials is null or jsonb_typeof(p_materials) <> 'array'
     or jsonb_array_length(p_materials) not between 2 and 5
     or p_new is null or jsonb_typeof(p_new) <> 'object' then
    raise exception 'invalid_args';
  end if;
  v_n := jsonb_array_length(p_materials);
  if (select count(distinct x) from jsonb_array_elements_text(p_materials) as t(x)) <> v_n
     or p_materials ? p_base then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;

  select * into v_b from public.weapons where player_id = p_player and key = p_base for update;
  if not found then raise exception 'not_owned'; end if;
  v_i := array_position(v_ranks, v_b.rarity);
  if v_i is null or v_i >= 9 then raise exception 'invalid_args'; end if;
  v_next := v_ranks[v_i + 1];
  if v_n + 1 <> v_total[v_i] then raise exception 'invalid_args'; end if;
  if v_state.coins < v_cost[v_i] then raise exception 'insufficient_coins'; end if;
  if p_new ->> 'type' is distinct from v_b.type or p_new ->> 'element' is distinct from v_b.element
     or p_new ->> 'rarity' is distinct from v_next then
    raise exception 'invalid_items';
  end if;

  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    if v_m is null or v_m !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
    select * into v_mw from public.weapons where player_id = p_player and key = v_m for update;
    if not found then raise exception 'not_owned'; end if;
    if v_mw.rarity <> v_b.rarity then raise exception 'rank_mismatch'; end if;
    if v_mw.plus > 0 then raise exception 'material_upgraded'; end if;
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_m) then
      raise exception 'equipped';
    end if;
  end loop;

  -- The worn base keeps its place under the new key (the FK would cascade the rows away).
  select coalesce(jsonb_agg(jsonb_build_object('c', e.character_key, 's', e.slot)), '[]'::jsonb) into v_eq
    from public.equipment e where e.player_id = p_player and e.weapon_key = p_base;
  delete from public.equipment where player_id = p_player and weapon_key = p_base;
  delete from public.weapons where player_id = p_player and key = p_base;
  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    delete from public.weapons where player_id = p_player and key = v_m;
  end loop;

  v_status := public.grant_piece(
    p_player, v_b.type, v_b.element, v_next, left(coalesce(p_new ->> 'name', v_b.data ->> 'name', 'Pieza'), 60),
    case when (p_new ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (p_new ->> 'roll')::numeric end,
    p_new -> 'lines', false);
  if v_status not in ('new', 'star') then raise exception 'max_stars'; end if; -- 'refund': roll everything back
  v_new := 'w-' || v_b.type || '-' || v_b.element || '-' || v_next;
  if jsonb_array_length(v_eq) > 0 then
    if v_status <> 'new' then raise exception 'equipped'; end if; -- the target piece already existed
    insert into public.equipment (player_id, character_key, weapon_key, slot)
    select p_player, x ->> 'c', v_new, x ->> 's' from jsonb_array_elements(v_eq) as t(x);
  end if;

  update public.player_state set coins = coins - v_cost[v_i], version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('key', v_new, 'status', v_status, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ===== 0043_room_duels.sql =====
-- 0043: 1v1 duels in rooms. TS decides (game/room.ts duel phases, game/duelRoom.ts); SQL stores the
-- server-only duel state (matches, bets, secret picks, replay logs) and applies, in ONE call, the
-- chip deltas and the phase move that go with it. service_role only (0018 closes the function).
-- Idempotent: safe to re-run.

alter table public.room_state drop constraint if exists room_state_phase_check;
alter table public.room_state add constraint room_state_phase_check check (phase in (
  'lobby', 'round_setup', 'floor_intro', 'doors', 'betting', 'fighting',
  'reveal', 'round_end', 'coop_boss', 'duel_setup', 'duel_betting', 'duel_fight',
  'duel_reveal', 'night_summary', 'closed'));

alter table public.chip_ledger drop constraint if exists chip_ledger_reason_check;
alter table public.chip_ledger add constraint chip_ledger_reason_check
  check (reason in ('initial', 'bet_stake', 'bet_win', 'bet_refund', 'interfere',
                    'interfere_comp', 'interfere_refund', 'night_start', 'vote_event',
                    'coop_prize', 'duel_stake', 'duel_payout'));

create table if not exists public.room_duel (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version int not null default 0 check (version >= 0),
  state jsonb not null check (pg_column_size(state) < 400000),
  updated_at timestamptz not null default now()
);
alter table public.room_duel enable row level security;
revoke all on public.room_duel from anon, authenticated;

-- (Re-runnable; drops the signature of the first draft, before p_missions existed.)
drop function if exists public.duel_save(uuid, int, jsonb, jsonb, text, int, timestamptz, boolean);

-- duel_save: optimistic write (p_expected_version must match; 0 = first write).
--   p_deltas  [{player, delta, reason}]: chip moves; chips never go below 0.
--   p_missions [{player, key}] with key in (duel_win, bet_win): mission progress (best effort).
--   p_phase   optional phase move, guarded by p_expected_seq (the seq the caller saw).
create or replace function public.duel_save(
  p_room uuid,
  p_expected_version int,
  p_state jsonb,
  p_deltas jsonb default '[]'::jsonb,
  p_missions jsonb default '[]'::jsonb,
  p_phase text default null,
  p_expected_seq int default null,
  p_deadline timestamptz default null,
  p_reset_ready boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_st public.room_state;
  v_ver int;
  d jsonb;
  v_chips int;
  v_delta int;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_deltas) <> 'array'
     or jsonb_typeof(p_missions) <> 'array' then
    raise exception 'invalid_args';
  end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;

  select version into v_ver from public.room_duel where room_id = p_room for update;
  if not found then
    if p_expected_version <> 0 then raise exception 'conflict'; end if;
    insert into public.room_duel (room_id, version, state) values (p_room, 1, p_state);
    v_ver := 1;
  else
    if v_ver <> p_expected_version then raise exception 'conflict'; end if;
    v_ver := v_ver + 1;
    update public.room_duel set version = v_ver, state = p_state, updated_at = now()
     where room_id = p_room;
  end if;

  for d in select * from jsonb_array_elements(p_deltas) loop
    v_delta := (d ->> 'delta')::int;
    if v_delta is null or abs(v_delta) > 100000
       or (d ->> 'reason') not in ('duel_stake', 'duel_payout') then
      raise exception 'invalid_args';
    end if;
    if v_delta = 0 then continue; end if;
    select chips into v_chips from public.room_players
     where room_id = p_room and player_id = (d ->> 'player')::uuid for update;
    if not found then raise exception 'not_member'; end if;
    if v_chips + v_delta < 0 then raise exception 'insufficient_chips'; end if;
    update public.room_players set chips = chips + v_delta
     where room_id = p_room and player_id = (d ->> 'player')::uuid;
    insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
    values (p_room, (d ->> 'player')::uuid, v_delta, d ->> 'reason', 'duel');
  end loop;

  for d in select * from jsonb_array_elements(p_missions) loop
    if (d ->> 'key') not in ('duel_win', 'bet_win') then raise exception 'invalid_args'; end if;
    begin
      perform public.mission_bump((d ->> 'player')::uuid, d ->> 'key', 1);
    exception when others then null; -- progress never blocks a duel
    end;
  end loop;

  if p_phase is not null then
    if v_st.phase = 'closed' then raise exception 'room_closed'; end if;
    if p_expected_seq is distinct from v_st.phase_seq then raise exception 'stale'; end if;
    update public.room_state
       set phase = p_phase, phase_seq = phase_seq + 1, deadline = p_deadline, updated_at = now()
     where room_id = p_room;
    if p_reset_ready then
      update public.room_players set ready = false where room_id = p_room;
    end if;
  end if;
  return jsonb_build_object('version', v_ver);
end $$;

-- ===== 0044_level_coins.sql =====
-- 0044: level coins x2.4..7.5 (steady state ~2 ten-pulls a day). Mirror of LEVEL_COINS in
-- src/lib/game/levelPay.ts. Idempotent.
create or replace function public.level_base_coins(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select case p_rank when 'f' then 60 when 'e' then 75 when 'd' then 95 when 'c' then 120
    when 'b' then 150 when 'a' then 180 when 's' then 210 when 'ss' then 240 when 'ssr' then 270 end
$$;

-- ===== 0045_skill_from_start.sql =====
-- 0045: the class skill (Ataque 2) is available from the start; no rank or star lock.
-- It cannot change while the player is in an open room (room fights read it live).
create or replace function public.choose_hero_skill(p_player uuid, p_character_id text, p_skill text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
begin
  if p_skill is null or p_character_id is null then raise exception 'invalid_args'; end if;
  select * into v_c from public.characters where player_id = p_player and key = p_character_id for update;
  if not found then raise exception 'character_not_found'; end if;
  if not (p_skill = any (case v_c.class
       when 'caballero' then array['barrido', 'contraataque']
       when 'mago' then array['tormenta', 'drenarMana']
       when 'picaro' then array['golpeDoble', 'ejecutar']
       else array['santuario', 'castigo'] end)) then
    raise exception 'invalid_skill';
  end if;
  if exists (
    select 1 from public.room_players rp join public.rooms r on r.id = rp.room_id
    where rp.player_id = p_player and rp.left_at is null and r.status = 'open'
  ) then
    raise exception 'skill_in_room';
  end if;
  update public.characters set skill = p_skill where player_id = p_player and key = p_character_id;
  return jsonb_build_object('ok', true, 'skill', p_skill);
end $$;

-- ===== 0046_gear_resist_line.sql =====
-- 0046: the gear line "dodge" (esquive) becomes "resist" (resistencia a estados).
-- Existing pieces keep their rolls; only the line name changes.
update public.weapons set lines = replace(lines::text, '"dodge"', '"resist"')::jsonb
 where lines::text like '%"dodge"%';
update public.weapons set data = replace(data::text, '"dodge"', '"resist"')::jsonb
 where data::text like '%"dodge"%';

create or replace function public.piece_check(
  p_type text, p_rank text, p_roll numeric, p_lines jsonb
) returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_pool text[];
  v_l jsonb;
  v_seen text[] := '{}';
  v_stat text;
  v_roll text;
begin
  if p_roll is null or p_roll < 0.85 or p_roll > 1.15 then
    raise exception 'invalid_items';
  end if;
  v_pool := case p_type
    when 'casco' then array['accuracy', 'crit', 'critDmg', 'def', 'resist']
    when 'peto' then array['hp', 'regen', 'resist', 'lifesteal', 'speed']
    when 'piernas' then array['crit', 'critDmg', 'accuracy', 'speed', 'lifesteal']
    when 'zapatos' then array['resist', 'hp', 'atk', 'regen', 'crit']
    when 'collar' then array['critDmg', 'accuracy', 'atk', 'speed', 'lifesteal']
    else null end;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return;
  end if;
  if v_pool is null or jsonb_array_length(p_lines) > public.extra_lines(p_rank) then
    raise exception 'invalid_items'; -- hand weapons have no lines; gear has at most extra_lines(rank)
  end if;
  for v_l in select e from jsonb_array_elements(p_lines) as t(e) loop
    v_stat := v_l ->> 'stat';
    v_roll := v_l ->> 'roll';
    if jsonb_typeof(v_l) <> 'object'
       or coalesce(not (v_stat = any (v_pool)), true)
       or coalesce(v_stat = any (v_seen), false)
       or coalesce(v_roll !~ '^[0-9]+(\.[0-9]+)?$', true) then
      raise exception 'invalid_items';
    end if;
    if v_roll::numeric < 0.85 or v_roll::numeric > 1.15 then
      raise exception 'invalid_items';
    end if;
    v_seen := v_seen || v_stat;
  end loop;
end $$;

-- ===== 0047_berserker.sql =====
-- 0047: Berserker class and its hand weapons (mandoble, martillo).
-- Tables: widen the class and weapon type checks.
do $$
declare r record;
begin
  for r in
    select con.conrelid::regclass as tbl, con.conname
      from pg_constraint con
     where con.conrelid = 'public.characters'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%caballero%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table public.characters
  add constraint characters_class_check
  check (class in ('caballero', 'mago', 'picaro', 'clerigo', 'berserker'));

alter table public.weapons drop constraint if exists weapons_type_check;
alter table public.weapons
  add constraint weapons_type_check check (type in ('espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'mandoble', 'martillo', 'casco', 'peto', 'piernas', 'zapatos', 'collar'));

-- Functions: the class / weapon-type lists are literals inside their bodies. Rewrite the
-- live definitions in place instead of copying every function (grants are kept).
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'array[''caballero'', ''mago'', ''picaro'', ''clerigo'']',
                            'array[''caballero'', ''mago'', ''picaro'', ''clerigo'', ''berserker'']');
    v_new := replace(v_new, '''varita'', ''libro'',', '''varita'', ''libro'', ''mandoble'', ''martillo'',');
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;

-- ===== 0048_mage_detonar.sql =====
-- 0048: the Mage's Drenar maná becomes Detonar. Saved picks fall back to the new option.
update public.characters set skill = 'detonar' where skill = 'drenarMana';

create or replace function public.choose_hero_skill(p_player uuid, p_character_id text, p_skill text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
begin
  if p_skill is null or p_character_id is null then raise exception 'invalid_args'; end if;
  select * into v_c from public.characters where player_id = p_player and key = p_character_id for update;
  if not found then raise exception 'character_not_found'; end if;
  if not (p_skill = any (case v_c.class
       when 'caballero' then array['barrido', 'contraataque']
       when 'mago' then array['tormenta', 'detonar']
       when 'picaro' then array['golpeDoble', 'ejecutar']
       when 'berserker' then array['desgarro', 'aniquilacion']
       else array['santuario', 'castigo'] end)) then
    raise exception 'invalid_skill';
  end if;
  if exists (
    select 1 from public.room_players rp join public.rooms r on r.id = rp.room_id
    where rp.player_id = p_player and rp.left_at is null and r.status = 'open'
  ) then
    raise exception 'skill_in_room';
  end if;
  update public.characters set skill = p_skill where player_id = p_player and key = p_character_id;
  return jsonb_build_object('ok', true, 'skill', p_skill);
end $$;

-- ===== 0049_seven_ranks.sql =====
-- 0049: item ranks are F..S (SS and SSR remain only as dungeon tiers) and the gacha has no pity.
-- 1) Pity: apply_pull no longer demands an SSR at the threshold and keeps pity_ssr at 0.
-- 2) Gear lines: C 1, A 2, S 3 plus the S capstone line (dmgTaken / dmgDealt) = at most 4.
-- 3) piece_check accepts the capstone stat of each slot.
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'apply_pull'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'if v_run_pity_ssr >= v_thr_ssr and v_rar <> ''ssr'' then', 'if false then');
    v_new := replace(v_new, 'v_run_pity_ssr := case when v_rar = ''ssr'' then 0 else least(v_run_pity_ssr + 1, v_thr_ssr) end;', 'v_run_pity_ssr := 0;');
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;

create or replace function public.extra_lines(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select (public.rank_idx(p_rank) >= 3)::int + (public.rank_idx(p_rank) >= 5)::int
       + 2 * (public.rank_idx(p_rank) >= 6)::int
$$;

create or replace function public.piece_check(
  p_type text, p_rank text, p_roll numeric, p_lines jsonb
) returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_pool text[];
  v_l jsonb;
  v_seen text[] := '{}';
  v_stat text;
  v_roll text;
begin
  if p_roll is null or p_roll < 0.85 or p_roll > 1.15 then
    raise exception 'invalid_items';
  end if;
  v_pool := case p_type
    when 'casco' then array['accuracy', 'crit', 'critDmg', 'def', 'resist', 'dmgTaken']
    when 'peto' then array['hp', 'regen', 'resist', 'lifesteal', 'speed', 'dmgTaken']
    when 'piernas' then array['crit', 'critDmg', 'accuracy', 'speed', 'lifesteal', 'dmgDealt']
    when 'zapatos' then array['resist', 'hp', 'atk', 'regen', 'crit', 'dmgDealt']
    when 'collar' then array['critDmg', 'accuracy', 'atk', 'speed', 'lifesteal', 'dmgDealt']
    else null end;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return;
  end if;
  if v_pool is null or jsonb_array_length(p_lines) > public.extra_lines(p_rank) then
    raise exception 'invalid_items'; -- hand weapons have no lines; gear has at most extra_lines(rank)
  end if;
  for v_l in select e from jsonb_array_elements(p_lines) as t(e) loop
    v_stat := v_l ->> 'stat';
    v_roll := v_l ->> 'roll';
    if jsonb_typeof(v_l) <> 'object'
       or coalesce(not (v_stat = any (v_pool)), true)
       or coalesce(v_stat = any (v_seen), false)
       or coalesce(v_roll !~ '^[0-9]+(\.[0-9]+)?$', true) then
      raise exception 'invalid_items';
    end if;
    if v_roll::numeric < 0.85 or v_roll::numeric > 1.15 then
      raise exception 'invalid_items';
    end if;
    -- the capstone stats only exist on S pieces
    if v_stat in ('dmgTaken', 'dmgDealt') and public.rank_idx(p_rank) < 6 then
      raise exception 'invalid_items';
    end if;
    v_seen := v_seen || v_stat;
  end loop;
end $$;

-- 4) Trade value follows the new top rank: S is worth 250 / 3% = 8330 (burn and the market derive from it).
create or replace function public.trade_value(p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case substring(p_key from '[^-]+$')
    when 'f' then 830 when 'e' then 1140 when 'd' then 1560 when 'c' then 2080
    when 'b' then 2780 when 'a' then 4170 when 's' then 8330 else 0 end
$$;
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and not public.trade_fair(give_key, want_key, coins);

-- ===== 0050_hero_copies.sql =====
-- 0050: hero copies. A repeated hero pull is no longer +1 star: it is stored as a spare copy that
-- keeps the trait it rolled (characters.copies). Stars come from spending copies / same-rank heroes
-- (Forja), ranks from fusing them. The TS code (heroFusion.ts) decides, the database applies.
-- 1) characters.copies (max 50, profile.ts MAX_COPIES).
-- 2) get_profile returns the copies inside the hero's data.
-- 3) apply_pull stores a duplicate hero as a copy (status 'copy'; refund at 50 copies).
-- 4) apply_hero_change: one atomic write-set for star-up, rank-up and trait swap (fuse_heroes goes).
-- 5) The market moves a hero's spare copy (with its trait) instead of a star.
-- 7) Open hero offers made before this (they offered stars) are cancelled: only copies are tradeable now.
-- 6) Heroes are no longer burned: burn_hero goes and burn_many only takes pieces.
alter table public.characters add column if not exists copies text[] not null default '{}';
alter table public.characters drop constraint if exists characters_copies_check;
do $$
begin
  if (select a.atttypid = 'jsonb'::regtype from pg_attribute a
      where a.attrelid = 'public.characters'::regclass and a.attname = 'copies' and not a.attisdropped) then
    alter table public.characters add constraint characters_copies_check
      check (jsonb_typeof(copies) = 'array' and jsonb_array_length(copies) <= 50);
  else
    alter table public.characters add constraint characters_copies_check check (cardinality(copies) <= 50);
  end if;
end $$;

-- 2) get_profile
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_profile'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when v_def like '%to_jsonb(c.copies)%' or v_def like '%''copies'', c.copies%'; -- legacy or H1 profile already patched
    v_new := replace(v_def,
      'c.data || jsonb_build_object(''level'', c.level, ''xp'', c.xp, ''legacy'', c.legacy)',
      'c.data || jsonb_build_object(''level'', c.level, ''xp'', c.xp, ''legacy'', c.legacy, ''copies'', to_jsonb(c.copies))');
    if v_new = v_def then raise exception '0050: get_profile pattern not found'; end if;
    execute v_new;
  end loop;
end $$;

-- 3) apply_pull
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'apply_pull'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when v_def like '%v_status := ''copy''%'; -- already patched (re-run)
    v_new := replace(v_def, E'  v_stars int;\n', E'  v_stars int;\n  v_ncopies int;\n  v_trait text;\n');
    v_new := replace(v_new,
E'      select stars into v_stars from public.characters
       where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := ''refund'';
          v_refund := round(v_unit * public.game_const(''duplicate_refund_pct'') / 100.0)::int;
        else
          v_status := ''star'';
          v_stars := v_stars + 1;
          update public.characters set stars = v_stars
           where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar;
        end if;',
E'      select stars, cardinality(copies) into v_stars, v_ncopies from public.characters
       where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar
       for update;
      v_trait := v_data -> ''traits'' ->> 0;
      if found then
        if v_ncopies >= 50 or v_trait is null then
          v_status := ''refund'';
          v_refund := round(v_unit * public.game_const(''duplicate_refund_pct'') / 100.0)::int;
        else
          v_status := ''copy'';
          update public.characters set copies = copies || v_trait
           where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar;
        end if;');
    if v_new = v_def or v_new not like '%v_status := ''copy''%' or v_new not like '%v_ncopies int;%' then
      raise exception '0050: apply_pull pattern not found';
    end if;
    execute v_new;
  end loop;
end $$;

-- 4) apply_hero_change(p_upsert: hero rows to write in full, p_delete: hero keys that go,
--    p_equip: [{weapon, to}] moves a worn piece to hero `to` (null = unequip)).
--    Order: upserts, gear, deletes (what a deleted hero still wears is unequipped by the FK cascade).
drop function if exists public.fuse_heroes(uuid, int, text, text[], int, jsonb, int, int, int);
create or replace function public.apply_hero_change(
  p_player uuid, p_version int, p_coins int, p_upsert jsonb, p_delete text[], p_equip jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_h jsonb;
  v_e jsonb;
  v_k text;
  v_copies text[];
  v_up text[] := '{}';
  v_n int;
begin
  if p_coins is null or p_coins not between 0 and 100000
     or p_upsert is null or jsonb_typeof(p_upsert) <> 'array' or jsonb_array_length(p_upsert) not between 1 and 3
     or p_delete is null or coalesce(array_length(p_delete, 1), 0) > 12
     or p_equip is null or jsonb_typeof(p_equip) <> 'array' or jsonb_array_length(p_equip) > 12 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;

  for v_h in select e from jsonb_array_elements(p_upsert) as t(e) loop
    if jsonb_typeof(v_h) <> 'object'
       or coalesce(v_h ->> 'rarity' <> all (array['f', 'e', 'd', 'c', 'b', 'a', 's']), true)
       or coalesce((v_h ->> 'stars') !~ '^[0-5]$', true)
       or coalesce((v_h ->> 'level') !~ '^[0-9]{1,3}$', true) or (v_h ->> 'level')::int < 1
       or coalesce((v_h ->> 'xp') !~ '^[0-9]{1,9}$', true)
       or jsonb_typeof(v_h -> 'data') <> 'object'
       or jsonb_typeof(v_h -> 'copies') <> 'array' or jsonb_array_length(v_h -> 'copies') > 50 then
      raise exception 'invalid_args';
    end if;
    v_copies := array(select jsonb_array_elements_text(v_h -> 'copies'));
    insert into public.characters (player_id, class, element, rarity, stars, data, level, xp, skill, legacy, copies)
    values (p_player, v_h ->> 'class', v_h ->> 'element', v_h ->> 'rarity', (v_h ->> 'stars')::int,
            (v_h -> 'data') - 'level' - 'xp' - 'legacy' - 'skill' - 'copies',
            (v_h ->> 'level')::int, (v_h ->> 'xp')::int, v_h ->> 'skill',
            coalesce((v_h ->> 'legacy')::boolean, false), v_copies)
    on conflict (player_id, class, element, rarity) do update
      set stars = excluded.stars, data = excluded.data, level = excluded.level, xp = excluded.xp,
          skill = excluded.skill, legacy = excluded.legacy, copies = excluded.copies;
    v_up := v_up || ('c-' || (v_h ->> 'class') || '-' || (v_h ->> 'element') || '-' || (v_h ->> 'rarity'));
  end loop;

  for v_e in select e from jsonb_array_elements(p_equip) as t(e) loop
    if jsonb_typeof(v_e) <> 'object' or coalesce((v_e ->> 'weapon') !~ '^w-[a-z]+-[a-z]+-[a-z]+$', true)
       or ((v_e ->> 'to') is not null and (v_e ->> 'to') !~ '^c-[a-z]+-[a-z]+-[a-z]+$') then
      raise exception 'invalid_args';
    end if;
    if (v_e ->> 'to') is null then
      delete from public.equipment where player_id = p_player and weapon_key = v_e ->> 'weapon';
    else
      update public.equipment set character_key = v_e ->> 'to'
       where player_id = p_player and weapon_key = v_e ->> 'weapon';
    end if;
  end loop;

  foreach v_k in array p_delete loop
    if v_k is null or v_k !~ '^c-[a-z]+-[a-z]+-[a-z]+$' or v_k = any (v_up) then raise exception 'invalid_args'; end if;
    delete from public.characters where player_id = p_player and key = v_k;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'not_owned'; end if;
  end loop;

  update public.player_state set coins = coins - p_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('coins', v_state.coins, 'version', v_state.version);
end $$;

-- 5) Market: a hero's tradeable unit is a spare copy, it travels with the trait it rolled.
create or replace function public.market_move(
  p_from uuid, p_to uuid, p_kind text, p_key text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_stars int;
  v_to_stars int;
  v_copies text[];
  v_to_copies text[];
begin
  if p_kind = 'character' then
    select copies into v_copies from public.characters
     where player_id = p_from and key = p_key for update;
    if not found or cardinality(v_copies) < 1 then raise exception 'not_owned'; end if;
    select copies into v_to_copies from public.characters
     where player_id = p_to and key = p_key for update;
    if found then
      if cardinality(v_to_copies) >= 50 then raise exception 'max_stars'; end if;
      update public.characters set copies = copies || v_copies[cardinality(v_copies)]
       where player_id = p_to and key = p_key;
    else
      insert into public.characters (player_id, class, element, rarity, data)
      select p_to, class, element, rarity,
             (data - 'traits') || jsonb_build_object('traits', jsonb_build_array(v_copies[cardinality(v_copies)]))
        from public.characters where player_id = p_from and key = p_key;
    end if;
    update public.characters set copies = copies[1:cardinality(copies) - 1]
     where player_id = p_from and key = p_key;
  else
    select stars into v_stars from public.weapons
     where player_id = p_from and key = p_key for update;
    if not found or v_stars < 1 then raise exception 'not_owned'; end if;
    select stars into v_to_stars from public.weapons
     where player_id = p_to and key = p_key for update;
    if found then
      if v_to_stars >= 5 then raise exception 'max_stars'; end if;
      update public.weapons set stars = stars + 1 where player_id = p_to and key = p_key;
    else
      insert into public.weapons (player_id, type, element, rarity, data)
      select p_to, type, element, rarity, data from public.weapons
       where player_id = p_from and key = p_key;
    end if;
    update public.weapons set stars = stars - 1 where player_id = p_from and key = p_key;
  end if;
end $$;

do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'market_create'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when v_def like '%cardinality(copies) into v_stars%' or v_def like '%jsonb_array_length(copies) into v_stars%'; -- text[] or H1 JSONB schema
    v_new := replace(v_def,
      'select stars into v_stars from public.characters where player_id = p_player and key = p_give;',
      'select cardinality(copies) into v_stars from public.characters where player_id = p_player and key = p_give;');
    if v_new = v_def then raise exception '0050: market_create pattern not found'; end if;
    execute v_new;
  end loop;
end $$;

-- 6) Burning heroes is gone (they grow or trade); burn_many keeps working for pieces only.
drop function if exists public.burn_hero(uuid, int, text);
drop function if exists public.burn_many(uuid, int, text, text[]);
create or replace function public.burn_many(p_player uuid, p_version int, p_keys text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_key text;
  v_legacy boolean;
  v_total int := 0;
  v_count int := 0;
begin
  if p_keys is null or coalesce(array_length(p_keys, 1), 0) not between 1 and 100 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  foreach v_key in array p_keys loop
    if v_key is null or v_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
    select legacy into v_legacy from public.weapons where player_id = p_player and key = v_key for update;
    if not found then continue; end if;
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_key) then continue; end if;
    v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 4 end / 100;
    delete from public.weapons where player_id = p_player and key = v_key;
    v_count := v_count + 1;
  end loop;
  update public.player_state set coins = coins + v_total, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', v_count, 'gained', v_total, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- 7) Offers of heroes made when the tradeable unit was a star are stale now.
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and kind = 'character';

-- ===== 0051_ss_ssr_to_s.sql =====
-- 0051: SS and SSR stop being item ranks (heroes and pieces top out at S). Whatever players already
-- own in SS / SSR becomes S, so nothing disappears from their collection:
--  - a hero or piece with no S twin simply changes rank (equipment follows it);
--  - with an S twin (same class + element / type + element) a hero becomes a spare copy of the S one
--    (its trait is kept as the copy's trait; stars and level take the higher value) and a piece gives
--    the S piece +1 star (max 5); the gear worn by the merged one is dropped, the piece stays owned.
-- Open market offers of SS / SSR items are cancelled. Safe to re-run: nothing is left to convert.
do $$
declare
  r record;
  e record;
begin
  create temporary table _eq on commit drop as
    select * from public.equipment where character_key ~ '-(ss|ssr)$' or weapon_key ~ '-(ss|ssr)$';
  delete from public.equipment q using _eq
   where q.player_id = _eq.player_id and q.character_key = _eq.character_key and q.slot = _eq.slot;

  for r in select * from public.characters where rarity in ('ss', 'ssr') order by player_id, rarity loop
    if exists (select 1 from public.characters
                where player_id = r.player_id and class = r.class and element = r.element and rarity = 's') then
      update public.characters c
         set copies = case when cardinality(c.copies) < 50 and r.data -> 'traits' ->> 0 is not null
                           then c.copies || (r.data -> 'traits' ->> 0) else c.copies end,
             stars = greatest(c.stars, r.stars),
             level = greatest(c.level, r.level),
             xp = case when r.level > c.level then r.xp else c.xp end
       where c.player_id = r.player_id and c.class = r.class and c.element = r.element and c.rarity = 's';
      delete from public.characters
       where player_id = r.player_id and class = r.class and element = r.element and rarity = r.rarity;
    else
      update public.characters set rarity = 's'
       where player_id = r.player_id and class = r.class and element = r.element and rarity = r.rarity;
    end if;
  end loop;

  for r in select * from public.weapons where rarity in ('ss', 'ssr') order by player_id, rarity loop
    if exists (select 1 from public.weapons
                where player_id = r.player_id and type = r.type and element = r.element and rarity = 's') then
      update public.weapons w
         set stars = least(5, w.stars + 1), plus = greatest(w.plus, r.plus),
             plus_streak = greatest(w.plus_streak, r.plus_streak)
       where w.player_id = r.player_id and w.type = r.type and w.element = r.element and w.rarity = 's';
      delete from public.weapons
       where player_id = r.player_id and type = r.type and element = r.element and rarity = r.rarity;
    else
      update public.weapons set rarity = 's'
       where player_id = r.player_id and type = r.type and element = r.element and rarity = r.rarity;
    end if;
  end loop;

  -- The gear that was worn goes back on, where both sides still exist and the slot is free.
  for e in select * from _eq loop
    insert into public.equipment (player_id, character_key, weapon_key, slot)
    select e.player_id,
           regexp_replace(e.character_key, '-(ss|ssr)$', '-s'),
           regexp_replace(e.weapon_key, '-(ss|ssr)$', '-s'),
           e.slot
     where exists (select 1 from public.characters c
                    where c.player_id = e.player_id and c.key = regexp_replace(e.character_key, '-(ss|ssr)$', '-s'))
       and exists (select 1 from public.weapons w
                    where w.player_id = e.player_id and w.key = regexp_replace(e.weapon_key, '-(ss|ssr)$', '-s'))
    on conflict do nothing;
  end loop;

  update public.market_offers set status = 'cancelled', closed_at = now()
   where status = 'open' and (give_key ~ '-(ss|ssr)$' or want_key ~ '-(ss|ssr)$');
end $$;

-- ===== 0052_mission_streak_pay.sql =====
-- 0052: missions and the daily streak pay enough to matter (about a fifth of a day's income).
--  daily 150/250/700, weekly 500/800/1500, Friday event 300/500/1000 (missions.ts SCOPE_TIERS);
--  streak bonus 500 on day 3 and 1500 on day 7 (streak.ts STREAK_BONUS).
update public.game_constants set value = 500 where key = 'streak_bonus_3';
update public.game_constants set value = 1500 where key = 'streak_bonus_7';

do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'mission_claim'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when v_def like '%array[150, 250, 700]%'; -- already patched (re-run)
    v_new := replace(v_def, 'array[20, 30, 250]', 'array[150, 250, 700]');
    v_new := replace(v_new, 'array[120, 100, 500]', 'array[500, 800, 1500]');
    v_new := replace(v_new, 'array[50, 100, 400]', 'array[300, 500, 1000]');
    if v_new = v_def then raise exception '0052: mission_claim pattern not found'; end if;
    execute v_new;
  end loop;
end $$;

-- ===== 0053_piece_copies.sql =====
-- 0053: piece copies, the same model as heroes (0050). A repeated piece is no longer +1 star: it is a spare
-- copy that keeps its own roll and lines (weapons.copies). Stars come from spending copies / same-rank
-- pieces, ranks from ascending them (TS pieceGrowth.ts decides, apply_piece_change writes). Pieces are
-- no longer burned. The market moves a piece's spare copy with its roll.
-- 1) weapons.copies (max 50, profile.ts MAX_COPIES): [{roll, lines}].
-- 2) get_profile returns the copies inside the piece's data.
-- 3) grant_piece stores a duplicate as a copy (status 'copy'; 'refund' / error at 50 copies).
-- 4) apply_piece_change: one atomic write-set for star-up, ascend and roll swap (apply_ascend goes).
-- 5) market_move / market_create use a piece's copies.
-- 6) burn_item and burn_many go (hero burning went in 0050).
alter table public.weapons add column if not exists copies jsonb not null default '[]'::jsonb;
alter table public.weapons drop constraint if exists weapons_copies_check;
alter table public.weapons add constraint weapons_copies_check
  check (jsonb_typeof(copies) = 'array' and jsonb_array_length(copies) <= 50);

-- 2) get_profile
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_profile'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when v_def like '%''copies'', w.copies%'; -- already patched (re-run)
    v_new := replace(v_def,
      'w.data || jsonb_build_object(''legacy'', w.legacy, ''plus'', w.plus, ''plusStreak'', w.plus_streak)',
      'w.data || jsonb_build_object(''legacy'', w.legacy, ''plus'', w.plus, ''plusStreak'', w.plus_streak, ''copies'', w.copies)');
    if v_new = v_def then raise exception '0053: get_profile pattern not found'; end if;
    execute v_new;
  end loop;
end $$;

-- 3) grant_piece
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'grant_piece'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when v_def like '%return ''copy'';%'; -- already patched (re-run)
    v_new := replace(v_def, E'  v_stars int;\n', E'  v_stars int;\n  v_ncopies int;\n');
    v_new := replace(v_new,
      'select stars, roll, lines into v_stars, v_oroll, v_olines from public.weapons',
      'select stars, roll, lines, jsonb_array_length(copies) into v_stars, v_oroll, v_olines, v_ncopies from public.weapons');
    v_new := replace(v_new,
E'    if v_stars >= public.game_const(''max_stars'') then
      if p_refund_on_max then return ''refund''; end if;
      raise exception ''max_stars'';
    end if;
    if public.piece_quality(p_roll, v_lines) > public.piece_quality(v_oroll, v_olines) then
      update public.weapons set stars = v_stars + 1, roll = p_roll, lines = v_lines
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    else
      update public.weapons set stars = v_stars + 1
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    end if;
    return ''star'';',
E'    if v_ncopies >= 50 then
      if p_refund_on_max then return ''refund''; end if;
      raise exception ''max_copies'';
    end if;
    update public.weapons
       set copies = copies || jsonb_build_array(jsonb_build_object(''roll'', p_roll, ''lines'', v_lines))
     where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    return ''copy'';');
    if v_new = v_def or v_new not like '%return ''copy'';%' or v_new not like '%v_ncopies int;%' then
      raise exception '0053: grant_piece pattern not found';
    end if;
    execute v_new;
  end loop;
end $$;

-- 4) apply_piece_change(p_upsert: piece rows to write in full, p_delete: piece keys that go,
--    p_equip: [{weapon, to}] moves a worn piece to key `to` (null = unequip)).
--    Order: upserts, gear, deletes (what a deleted piece still has equipped is unequipped by the FK cascade).
drop function if exists public.apply_ascend(uuid, int, text, jsonb, jsonb);
create or replace function public.apply_piece_change(
  p_player uuid, p_version int, p_coins int, p_upsert jsonb, p_delete text[], p_equip jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_h jsonb;
  v_c jsonb;
  v_e jsonb;
  v_k text;
  v_up text[] := '{}';
  v_n int;
  v_roll numeric;
begin
  if p_coins is null or p_coins not between 0 and 100000
     or p_upsert is null or jsonb_typeof(p_upsert) <> 'array' or jsonb_array_length(p_upsert) not between 1 and 3
     or p_delete is null or coalesce(array_length(p_delete, 1), 0) > 12
     or p_equip is null or jsonb_typeof(p_equip) <> 'array' or jsonb_array_length(p_equip) > 12 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;

  for v_h in select e from jsonb_array_elements(p_upsert) as t(e) loop
    if jsonb_typeof(v_h) <> 'object'
       or coalesce(v_h ->> 'rarity' <> all (array['f', 'e', 'd', 'c', 'b', 'a', 's']), true)
       or coalesce((v_h ->> 'stars') !~ '^[0-5]$', true)
       or coalesce((v_h ->> 'plus') !~ '^([0-9]|10)$', true)
       or coalesce((v_h ->> 'plusStreak') !~ '^[0-9]{1,6}$', true)
       or jsonb_typeof(v_h -> 'copies') <> 'array' or jsonb_array_length(v_h -> 'copies') > 50 then
      raise exception 'invalid_args';
    end if;
    v_roll := case when (v_h ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_h ->> 'roll')::numeric end;
    perform public.piece_check(v_h ->> 'type', v_h ->> 'rarity', v_roll,
                               case when jsonb_typeof(v_h -> 'lines') = 'array' then v_h -> 'lines' end);
    for v_c in select e from jsonb_array_elements(v_h -> 'copies') as t(e) loop
      if jsonb_typeof(v_c) <> 'object' then raise exception 'invalid_args'; end if;
      perform public.piece_check(v_h ->> 'type', v_h ->> 'rarity',
        case when (v_c ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_c ->> 'roll')::numeric end,
        case when jsonb_typeof(v_c -> 'lines') = 'array' then v_c -> 'lines' end);
    end loop;
    insert into public.weapons (player_id, type, element, rarity, stars, data, roll, lines, legacy, plus, plus_streak, copies)
    values (p_player, v_h ->> 'type', v_h ->> 'element', v_h ->> 'rarity', (v_h ->> 'stars')::int,
            jsonb_build_object('name', left(coalesce(v_h ->> 'name', 'Pieza'), 60)), v_roll,
            case when jsonb_typeof(v_h -> 'lines') = 'array' and jsonb_array_length(v_h -> 'lines') > 0 then v_h -> 'lines' end,
            coalesce((v_h ->> 'legacy')::boolean, false), (v_h ->> 'plus')::int, (v_h ->> 'plusStreak')::int,
            v_h -> 'copies')
    on conflict (player_id, type, element, rarity) do update
      set stars = excluded.stars, data = excluded.data, roll = excluded.roll, lines = excluded.lines,
          legacy = excluded.legacy, plus = excluded.plus, plus_streak = excluded.plus_streak, copies = excluded.copies;
    v_up := v_up || ('w-' || (v_h ->> 'type') || '-' || (v_h ->> 'element') || '-' || (v_h ->> 'rarity'));
  end loop;

  for v_e in select e from jsonb_array_elements(p_equip) as t(e) loop
    if jsonb_typeof(v_e) <> 'object' or coalesce((v_e ->> 'weapon') !~ '^w-[a-z]+-[a-z]+-[a-z]+$', true)
       or ((v_e ->> 'to') is not null and (v_e ->> 'to') !~ '^w-[a-z]+-[a-z]+-[a-z]+$') then
      raise exception 'invalid_args';
    end if;
    if (v_e ->> 'to') is null then
      delete from public.equipment where player_id = p_player and weapon_key = v_e ->> 'weapon';
    else
      update public.equipment set weapon_key = v_e ->> 'to'
       where player_id = p_player and weapon_key = v_e ->> 'weapon';
    end if;
  end loop;

  foreach v_k in array p_delete loop
    if v_k is null or v_k !~ '^w-[a-z]+-[a-z]+-[a-z]+$' or v_k = any (v_up) then raise exception 'invalid_args'; end if;
    delete from public.weapons where player_id = p_player and key = v_k;
    get diagnostics v_n = row_count;
    if v_n = 0 then raise exception 'not_owned'; end if;
  end loop;

  update public.player_state set coins = coins - p_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('coins', v_state.coins, 'version', v_state.version);
end $$;

-- 5) Market: a piece's tradeable unit is a spare copy, it travels with its roll.
create or replace function public.market_move(
  p_from uuid, p_to uuid, p_kind text, p_key text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_copies text[];
  v_to_copies text[];
  v_pcopies jsonb;
  v_to_pcopies jsonb;
  v_last jsonb;
begin
  if p_kind = 'character' then
    select copies into v_copies from public.characters
     where player_id = p_from and key = p_key for update;
    if not found or cardinality(v_copies) < 1 then raise exception 'not_owned'; end if;
    select copies into v_to_copies from public.characters
     where player_id = p_to and key = p_key for update;
    if found then
      if cardinality(v_to_copies) >= 50 then raise exception 'max_stars'; end if;
      update public.characters set copies = copies || v_copies[cardinality(v_copies)]
       where player_id = p_to and key = p_key;
    else
      insert into public.characters (player_id, class, element, rarity, data)
      select p_to, class, element, rarity,
             (data - 'traits') || jsonb_build_object('traits', jsonb_build_array(v_copies[cardinality(v_copies)]))
        from public.characters where player_id = p_from and key = p_key;
    end if;
    update public.characters set copies = copies[1:cardinality(copies) - 1]
     where player_id = p_from and key = p_key;
  else
    select copies into v_pcopies from public.weapons
     where player_id = p_from and key = p_key for update;
    if not found or jsonb_array_length(v_pcopies) < 1 then raise exception 'not_owned'; end if;
    v_last := v_pcopies -> (jsonb_array_length(v_pcopies) - 1);
    select copies into v_to_pcopies from public.weapons
     where player_id = p_to and key = p_key for update;
    if found then
      if jsonb_array_length(v_to_pcopies) >= 50 then raise exception 'max_stars'; end if;
      update public.weapons set copies = copies || jsonb_build_array(v_last)
       where player_id = p_to and key = p_key;
    else
      insert into public.weapons (player_id, type, element, rarity, data, roll, lines)
      select p_to, type, element, rarity, data,
             case when (v_last ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_last ->> 'roll')::numeric end,
             case when jsonb_typeof(v_last -> 'lines') = 'array' and jsonb_array_length(v_last -> 'lines') > 0 then v_last -> 'lines' end
        from public.weapons where player_id = p_from and key = p_key;
    end if;
    update public.weapons
       set copies = (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                       from jsonb_array_elements(copies) with ordinality as t(e, o)
                      where o < jsonb_array_length(copies))
     where player_id = p_from and key = p_key;
  end if;
end $$;

do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'market_create'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when v_def like '%jsonb_array_length(copies) into v_stars%'; -- already patched (re-run)
    v_new := replace(v_def,
      'select stars into v_stars from public.weapons where player_id = p_player and key = p_give;',
      'select jsonb_array_length(copies) into v_stars from public.weapons where player_id = p_player and key = p_give;');
    if v_new = v_def then raise exception '0053: market_create pattern not found'; end if;
    execute v_new;
  end loop;
end $$;

-- Open piece offers made when the tradeable unit was a star are stale now.
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and kind = 'weapon';

-- 6) No burning of pieces any more.
drop function if exists public.burn_item(uuid, int, text);
drop function if exists public.burn_many(uuid, int, text[]);

-- ===== 0054_hero_factors.sql =====
-- 0054: hero factor profiles. Run reset_progress.sql before this migration when
-- migrating legacy data: it removes old heroes and copies without factor profiles.
-- This migration keeps character rows but replaces the trait-only copies column.
alter table public.characters drop column copies;
alter table public.characters add column copies jsonb not null default '[]'::jsonb;
alter table public.characters add constraint characters_copies_check
  check (jsonb_typeof(copies) = 'array' and jsonb_array_length(copies) <= 50);

create or replace function public.hero_factors_valid(p_factors jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare v record; v_values jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_factors) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_factors)) <> 5 then return false; end if;
  for v in select key, value from jsonb_each_text(p_factors) loop
    if v.key not in ('hp','atk','def','crit','speed') or v.value !~ '^[0-9]+(\.[0-9]+)?$'
       or v.value::numeric < 0.85 or v.value::numeric > 1.15 then return false; end if;
    v_values := v_values || jsonb_build_object(v.key, v.value::numeric);
  end loop;
  return abs(((v_values ->> 'hp')::numeric + (v_values ->> 'atk')::numeric +
               (v_values ->> 'def')::numeric + (v_values ->> 'speed')::numeric) / 4 - 1) <= 0.10000001;
end $$;

create or replace function public.hero_trait_valid(p_trait text) returns boolean
language sql immutable set search_path = '' as $$
  select p_trait = any(array['terco','temerario','orgulloso','sanguinario','paciente','estoico','glotón','tenaz','veloz','fanfarron','lucido','curioso','cauteloso','furioso','sediento','gafe','filoAzar','ultimoAliento','espinas','apostador'])
$$;

create or replace function public.grant_starter(
  p_player uuid, p_class text, p_element text, p_data jsonb,
  p_type text, p_name text, p_roll numeric, p_lines jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.player_state where player_id=p_player and tutorial is null for update;
  if not found or exists (select 1 from public.characters where player_id=p_player) then return false; end if;
  if not coalesce(p_class=any(array['caballero','mago','picaro','clerigo']),false)
     or not coalesce(p_element=any(array['agua','fuego','viento','tierra','rayo']),false)
     or jsonb_typeof(p_data)<>'object' or not public.hero_factors_valid(p_data -> 'factors')
     or jsonb_typeof(p_data -> 'traits')<>'array' or jsonb_array_length(p_data -> 'traits')<>1
     or not public.hero_trait_valid(p_data -> 'traits' ->> 0) then raise exception 'invalid_items'; end if;
  insert into public.characters(player_id,class,element,rarity,data)
  values (p_player,p_class,p_element,'f',p_data - 'level' - 'xp' - 'legacy' - 'skill');
  perform public.grant_piece(p_player,p_type,p_element,'f',p_name,p_roll,p_lines,false);
  update public.player_state set tutorial=1,version=version+1 where player_id=p_player;
  return true;
end $$;

-- Copies are complete {trait, factors} profiles; the main factor profile lives
-- in characters.data.factors alongside the existing derived character data.
do $$
declare r record; v_def text; v_new text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'get_profile'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, '''copies'', to_jsonb(c.copies)', '''copies'', c.copies');
    if v_new <> v_def then execute v_new; end if;
  end loop;
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'apply_pull'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, E'  v_trait text;\n', E'  v_profile jsonb;\n');
    v_new := replace(v_new,
      'select stars, cardinality(copies) into v_stars, v_ncopies from public.characters',
      'select stars, jsonb_array_length(copies) into v_stars, v_ncopies from public.characters');
    v_new := replace(v_new, 'v_trait := v_data -> ''traits'' ->> 0;',
      'v_profile := jsonb_build_object(''trait'', v_data -> ''traits'' -> 0, ''factors'', v_data -> ''factors'');');
    v_new := replace(v_new, 'if v_ncopies >= 50 or v_trait is null then',
      'if v_ncopies >= 50 or v_profile -> ''trait'' = ''null''::jsonb or v_profile -> ''factors'' is null then');
    v_new := replace(v_new, 'or v_trait is null', 'or v_profile -> ''trait'' = ''null''::jsonb or v_profile -> ''factors'' is null');
    v_new := replace(v_new, 'set copies = copies || v_trait', 'set copies = copies || jsonb_build_array(v_profile)');
    v_new := replace(v_new, E'      v_cls := v_item ->> ''class'';',
      E'      if not public.hero_factors_valid(v_data -> ''factors'')\n         or jsonb_typeof(v_data -> ''traits'') <> ''array'' or jsonb_array_length(v_data -> ''traits'') <> 1\n         or not public.hero_trait_valid(v_data -> ''traits'' ->> 0) then raise exception ''invalid_items''; end if;\n      v_cls := v_item ->> ''class'';');
    v_new := replace(v_new, 'v_data := coalesce(v_item -> ''data'', ''{}''::jsonb) - ''level'' - ''xp'' - ''legacy'' - ''skill'';',
      'v_data := coalesce(v_item -> ''data'', ''{}''::jsonb) - ''level'' - ''xp'' - ''legacy'' - ''skill'';');
    if v_new = v_def or v_new not like '%jsonb_build_array(v_profile)%' then
      raise exception '0054: apply_pull pattern not found';
    end if;
    execute v_new;
  end loop;
end $$;

create or replace function public.apply_hero_change(
  p_player uuid, p_version int, p_coins int, p_upsert jsonb, p_delete text[], p_equip jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state; v_h jsonb; v_c jsonb; v_e jsonb; v_k text;
  v_up text[] := '{}'; v_n int; v_f jsonb;
begin
  if p_coins is null or p_coins not between 0 and 100000
     or p_upsert is null or jsonb_typeof(p_upsert) <> 'array' or jsonb_array_length(p_upsert) not between 1 and 3
     or p_delete is null or coalesce(array_length(p_delete, 1), 0) > 12
     or p_equip is null or jsonb_typeof(p_equip) <> 'array' or jsonb_array_length(p_equip) > 12 then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;
  for v_h in select e from jsonb_array_elements(p_upsert) as t(e) loop
    v_f := v_h -> 'data' -> 'factors';
    if jsonb_typeof(v_h) <> 'object'
       or coalesce(v_h ->> 'rarity' <> all (array['f','e','d','c','b','a','s']), true)
       or coalesce((v_h ->> 'stars') !~ '^[0-5]$', true)
       or coalesce((v_h ->> 'level') !~ '^[0-9]{1,3}$', true) or (v_h ->> 'level')::int < 1
       or coalesce((v_h ->> 'xp') !~ '^[0-9]{1,9}$', true)
       or jsonb_typeof(v_h -> 'data') <> 'object'
       or not public.hero_factors_valid(v_f)
       or jsonb_typeof(v_h -> 'data' -> 'traits') <> 'array'
       or jsonb_array_length(v_h -> 'data' -> 'traits') <> 1
       or not public.hero_trait_valid(v_h -> 'data' -> 'traits' ->> 0)
       or jsonb_typeof(v_h -> 'copies') <> 'array' or jsonb_array_length(v_h -> 'copies') > 50 then raise exception 'invalid_args'; end if;
    for v_c in select e from jsonb_array_elements(v_h -> 'copies') as t(e) loop
      if jsonb_typeof(v_c) <> 'object' or not public.hero_factors_valid(v_c -> 'factors')
         or not public.hero_trait_valid(v_c ->> 'trait') then raise exception 'invalid_args'; end if;
    end loop;
    insert into public.characters (player_id,class,element,rarity,stars,data,level,xp,skill,legacy,copies)
    values (p_player,v_h ->> 'class',v_h ->> 'element',v_h ->> 'rarity',(v_h ->> 'stars')::int,
      (v_h -> 'data') - 'level' - 'xp' - 'legacy' - 'skill' - 'copies',
      (v_h ->> 'level')::int,(v_h ->> 'xp')::int,v_h ->> 'skill',coalesce((v_h ->> 'legacy')::boolean,false),v_h -> 'copies')
    on conflict (player_id,class,element,rarity) do update set stars=excluded.stars,data=excluded.data,
      level=excluded.level,xp=excluded.xp,skill=excluded.skill,legacy=excluded.legacy,copies=excluded.copies;
    v_up := v_up || ('c-' || (v_h ->> 'class') || '-' || (v_h ->> 'element') || '-' || (v_h ->> 'rarity'));
  end loop;
  for v_e in select e from jsonb_array_elements(p_equip) as t(e) loop
    if jsonb_typeof(v_e) <> 'object' or coalesce((v_e ->> 'weapon') !~ '^w-[a-z]+-[a-z]+-[a-z]+$',true)
       or ((v_e ->> 'to') is not null and (v_e ->> 'to') !~ '^c-[a-z]+-[a-z]+-[a-z]+$') then raise exception 'invalid_args'; end if;
    if (v_e ->> 'to') is null then delete from public.equipment where player_id=p_player and weapon_key=v_e ->> 'weapon';
    else update public.equipment set character_key=v_e ->> 'to' where player_id=p_player and weapon_key=v_e ->> 'weapon'; end if;
  end loop;
  foreach v_k in array p_delete loop
    if v_k is null or v_k !~ '^c-[a-z]+-[a-z]+-[a-z]+$' or v_k = any(v_up) then raise exception 'invalid_args'; end if;
    delete from public.characters where player_id=p_player and key=v_k;
    get diagnostics v_n = row_count; if v_n = 0 then raise exception 'not_owned'; end if;
  end loop;
  update public.player_state set coins=coins-p_coins,version=version+1 where player_id=p_player returning coins,version into v_state.coins,v_state.version;
  return jsonb_build_object('coins',v_state.coins,'version',v_state.version);
end $$;

create or replace function public.market_move(p_from uuid,p_to uuid,p_kind text,p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_copies jsonb; v_to_copies jsonb; v_last jsonb; v_pcopies jsonb; v_to_pcopies jsonb;
begin
  if p_kind='character' then
    select copies into v_copies from public.characters where player_id=p_from and key=p_key for update;
    if not found or jsonb_array_length(v_copies)<1 then raise exception 'not_owned'; end if;
    v_last := v_copies -> (jsonb_array_length(v_copies)-1);
    select copies into v_to_copies from public.characters where player_id=p_to and key=p_key for update;
    if found then
      if jsonb_array_length(v_to_copies)>=50 then raise exception 'max_stars'; end if;
      update public.characters set copies=copies||jsonb_build_array(v_last) where player_id=p_to and key=p_key;
    else
      insert into public.characters(player_id,class,element,rarity,data)
      select p_to,class,element,rarity,
        (data - 'traits') || jsonb_build_object('traits',jsonb_build_array(v_last -> 'trait'),'factors',v_last -> 'factors')
        from public.characters where player_id=p_from and key=p_key;
    end if;
    update public.characters set copies=(select coalesce(jsonb_agg(e order by o),'[]'::jsonb)
      from jsonb_array_elements(copies) with ordinality t(e,o) where o<jsonb_array_length(copies))
      where player_id=p_from and key=p_key;
  else
    select copies into v_pcopies from public.weapons where player_id=p_from and key=p_key for update;
    if not found or jsonb_array_length(v_pcopies)<1 then raise exception 'not_owned'; end if;
    v_last:=v_pcopies -> (jsonb_array_length(v_pcopies)-1);
    select copies into v_to_pcopies from public.weapons where player_id=p_to and key=p_key for update;
    if found then
      if jsonb_array_length(v_to_pcopies)>=50 then raise exception 'max_stars'; end if;
      update public.weapons set copies=copies||jsonb_build_array(v_last) where player_id=p_to and key=p_key;
    else
      insert into public.weapons(player_id,type,element,rarity,data,roll,lines)
      select p_to,type,element,rarity,data,
        case when (v_last ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_last ->> 'roll')::numeric end,
        case when jsonb_typeof(v_last -> 'lines')='array' and jsonb_array_length(v_last -> 'lines')>0 then v_last -> 'lines' end
        from public.weapons where player_id=p_from and key=p_key;
    end if;
    update public.weapons set copies=(select coalesce(jsonb_agg(e order by o),'[]'::jsonb)
      from jsonb_array_elements(copies) with ordinality t(e,o) where o<jsonb_array_length(copies))
      where player_id=p_from and key=p_key;
  end if;
end $$;

do $$
declare r record; v_def text; v_new text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='market_create'
  loop
    v_def:=pg_get_functiondef(r.oid);
    v_new:=replace(v_def,'select cardinality(copies) into v_stars from public.characters where player_id = p_player and key = p_give;',
      'select jsonb_array_length(copies) into v_stars from public.characters where player_id = p_player and key = p_give;');
    if v_new<>v_def then execute v_new; end if;
  end loop;
end $$;

-- ===== 0055_tower_identity.sql =====
-- 0055: keep the hero identity attached to each tower record.
alter table public.tower_scores
  add column if not exists hero_class text,
  add column if not exists hero_element text;
alter table public.tower_scores drop constraint if exists tower_scores_hero_class_check;
alter table public.tower_scores add constraint tower_scores_hero_class_check
  check (hero_class is null or hero_class in ('caballero', 'mago', 'picaro', 'clerigo', 'berserker'));
alter table public.tower_scores drop constraint if exists tower_scores_hero_element_check;
alter table public.tower_scores add constraint tower_scores_hero_element_check
  check (hero_element is null or hero_element in ('agua', 'fuego', 'viento', 'tierra', 'rayo'));

create or replace function public.tower_record(
  p_player uuid, p_mode text, p_floor int, p_rounds int, p_class text, p_element text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_floor int;
  v_rounds int;
  v_coins int;
  v_paid int;
  v_week date := public.game_week();
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500
     or p_rounds is null or p_rounds < 0 or p_rounds > 1000000
     or p_class is null or p_class not in ('caballero', 'mago', 'picaro', 'clerigo', 'berserker')
     or p_element is null or p_element not in ('agua', 'fuego', 'viento', 'tierra', 'rayo') then
    raise exception 'invalid_args';
  end if;
  perform public.tower_settle_daily();
  insert into public.tower_scores (week, mode, player_id, max_floor, rounds, hero_class, hero_element)
  values (v_week, p_mode, p_player, p_floor, p_rounds, p_class, p_element)
  on conflict (week, mode, player_id) do update
    set max_floor = case when excluded.max_floor > public.tower_scores.max_floor
                           or (excluded.max_floor = public.tower_scores.max_floor
                               and excluded.rounds < public.tower_scores.rounds)
                         then excluded.max_floor else public.tower_scores.max_floor end,
        rounds = case when excluded.max_floor > public.tower_scores.max_floor
                        or (excluded.max_floor = public.tower_scores.max_floor
                            and excluded.rounds < public.tower_scores.rounds)
                      then excluded.rounds else public.tower_scores.rounds end,
        updated_at = case when excluded.max_floor > public.tower_scores.max_floor
                            or (excluded.max_floor = public.tower_scores.max_floor
                                and excluded.rounds < public.tower_scores.rounds)
                          then now() else public.tower_scores.updated_at end,
        hero_class = case when excluded.max_floor > public.tower_scores.max_floor
                            or (excluded.max_floor = public.tower_scores.max_floor
                                and excluded.rounds < public.tower_scores.rounds)
                          then excluded.hero_class else public.tower_scores.hero_class end,
        hero_element = case when excluded.max_floor > public.tower_scores.max_floor
                              or (excluded.max_floor = public.tower_scores.max_floor
                                  and excluded.rounds < public.tower_scores.rounds)
                            then excluded.hero_element else public.tower_scores.hero_element end
  returning max_floor, rounds into v_floor, v_rounds;

  with ins as (
    insert into public.tower_floor_paid (week, mode, player_id, floor)
    select v_week, p_mode, p_player, g from generate_series(1, p_floor) as g
    on conflict do nothing
    returning floor
  )
  select coalesce(sum(public.tower_floor_coins(floor)), 0), count(*)
    into v_coins, v_paid from ins;
  if v_paid > 0 then
    update public.player_state set coins = coins + v_coins, version = version + 1
     where player_id = p_player;
  end if;
  return jsonb_build_object('week', v_week, 'max_floor', v_floor, 'rounds', v_rounds,
                            'prize', jsonb_build_object('floors', v_paid, 'coins', v_coins, 'dados', 0));
end $$;

drop function if exists public.tower_record(uuid, text, int, int);

create or replace function public.tower_state(p_player uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := public.game_week();
  v_mode text;
  v_modes jsonb := '{}'::jsonb;
  v_last jsonb := '{}'::jsonb;
  v_king jsonb := '{}'::jsonb;
  v_top jsonb;
  v_mine jsonb;
  v_my public.tower_scores;
  v_k record;
begin
  perform public.tower_settle(v_week - 7);
  perform public.tower_settle(v_week - 14);
  perform public.tower_settle_daily();
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    select coalesce(jsonb_agg(jsonb_build_object('place', t.place, 'player', t.player_id,
                    'name', t.name, 'floor', t.max_floor, 'rounds', t.rounds,
                    'class', t.hero_class, 'element', t.hero_element) order by t.place), '[]'::jsonb)
      into v_top
      from (
        select row_number() over (order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id) as place,
               s.player_id, p.name, s.max_floor, s.rounds, s.hero_class, s.hero_element
          from public.tower_scores s join public.players p on p.id = s.player_id
         where s.week = v_week and s.mode = v_mode
         order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id
         limit 10
      ) t;
    select * into v_my from public.tower_scores
     where week = v_week and mode = v_mode and player_id = p_player;
    if found then
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'rounds', v_my.rounds,
        'class', v_my.hero_class, 'element', v_my.hero_element,
        'paidFloors', (select count(*) from public.tower_floor_paid
                        where week = v_week and mode = v_mode and player_id = p_player),
        'place', 1 + (
        select count(*) from public.tower_scores o
         where o.week = v_week and o.mode = v_mode
           and (o.max_floor > v_my.max_floor
                or (o.max_floor = v_my.max_floor and o.rounds < v_my.rounds)
                or (o.max_floor = v_my.max_floor and o.rounds = v_my.rounds and o.updated_at < v_my.updated_at)
                or (o.max_floor = v_my.max_floor and o.rounds = v_my.rounds
                    and o.updated_at = v_my.updated_at and o.player_id < v_my.player_id))));
    else
      v_mine := null;
    end if;
    v_modes := v_modes || jsonb_build_object(v_mode,
      jsonb_build_object('top', v_top, 'mine', v_mine));
    select coalesce(jsonb_agg(jsonb_build_object('place', (w ->> 'place')::int,
             'name', p.name, 'floor', (w ->> 'floor')::int) order by (w ->> 'place')::int), '[]'::jsonb)
      into v_top
      from public.tower_settled ts
      cross join lateral jsonb_array_elements(ts.winners) as w
      join public.players p on p.id = (w ->> 'player')::uuid
     where ts.week = v_week - 7 and ts.mode = v_mode;
    v_last := v_last || jsonb_build_object(v_mode, v_top);
    select d.day, d.floor, p.name, d.player_id into v_k
      from public.tower_daily d join public.players p on p.id = d.player_id
     where d.mode = v_mode order by d.day desc limit 1;
    v_king := v_king || jsonb_build_object(v_mode,
      case when v_k.day is null then null else jsonb_build_object(
        'day', v_k.day, 'name', v_k.name, 'floor', v_k.floor, 'me', v_k.player_id = p_player) end);
  end loop;
  return jsonb_build_object('week', v_week, 'modes', v_modes, 'last', v_last, 'king', v_king);
end $$;

revoke all on function public.tower_record(uuid, text, int, int, text, text) from public, anon, authenticated;
grant execute on function public.tower_record(uuid, text, int, int, text, text) to service_role;

-- ===== 0056_dungeon_routes.sql =====
-- 0056: themed routes share a single, route-independent difficulty ladder.
-- Legacy progress is intentionally reset; 6a-1 has no compatibility mapping for the old run graph.

create table if not exists public.step_clears (
  player_id uuid not null references public.players(id) on delete cascade,
  difficulty text not null check (difficulty in ('f', 'e', 'd', 'c', 'b', 'a', 's')),
  ascension int not null check (ascension between 0 and 5),
  cleared_at timestamptz not null default now(),
  primary key (player_id, difficulty, ascension)
);
alter table public.step_clears enable row level security;
revoke all on public.step_clears from anon, authenticated;
drop policy if exists deny_all on public.step_clears;
create policy deny_all on public.step_clears as restrictive for all
  using (false) with check (false);

create table if not exists public.route_progress (
  player_id uuid not null references public.players(id) on delete cascade,
  route text not null check (route in ('lord_of_flies', 'ash_king', 'eternal_watcher', 'hollow_colossus',
    'thunder_king', 'mother_hydra', 'withered_queen', 'faceless_one', 'great_devourer')),
  difficulty text not null check (difficulty in ('f', 'e', 'd', 'c', 'b', 'a', 's')),
  ascension int not null check (ascension between 0 and 5),
  levels int not null default 0 check (levels between 0 and 4),
  primary key (player_id, route, difficulty, ascension)
);
alter table public.route_progress enable row level security;
revoke all on public.route_progress from anon, authenticated;
drop policy if exists deny_all on public.route_progress;
create policy deny_all on public.route_progress as restrictive for all
  using (false) with check (false);

drop function if exists public.start_level(uuid, text, bigint, jsonb, text, int, int);
drop function if exists public.bank_level(uuid, uuid, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text);
drop function if exists public.level_lock_reason(uuid, text, int, int);
drop function if exists public.progress_cleared(uuid, text, int);
drop function if exists public.level_count(text);
drop table if exists public.dungeon_progress;

create or replace function public.level_count() returns int
language sql immutable set search_path = '' as $$ select 4 $$;

-- Kept for older non-dungeon reward routines; only F-S are valid now.
create or replace function public.level_count(p_difficulty text) returns int
language sql immutable set search_path = '' as $$
  select case when p_difficulty in ('f','e','d','c','b','a','s') then 4 end
$$;

drop function if exists public.level_base_coins(text);
create function public.level_base_coins(p_difficulty text) returns int
language sql immutable set search_path = '' as $$
  select case p_difficulty when 'f' then 60 when 'e' then 75 when 'd' then 95 when 'c' then 120
    when 'b' then 150 when 'a' then 180 when 's' then 210 end
$$;
drop function if exists public.level_chest(text);
create function public.level_chest(p_difficulty text) returns int
language sql immutable set search_path = '' as $$
  select case p_difficulty when 'f' then 1000 when 'e' then 1600 when 'd' then 2500 when 'c' then 1200
    when 'b' then 1500 when 'a' then 2000 when 's' then 2500 end
$$;
drop function if exists public.level_escamas(text, int, numeric);
drop function if exists public.level_escamas(text, int, boolean, numeric);
create or replace function public.level_escamas(p_difficulty text, p_asc int, p_repeat boolean, p_mult numeric) returns int
language sql immutable set search_path = '' as $$
  select case when p_difficulty = 's' then
    case when p_repeat then floor(2 * (1 + 0.1 * p_asc) * 0.6 * p_mult)::int
         else round(2 * (1 + 0.1 * p_asc))::int end
    else 0 end
$$;

create or replace function public.step_unlocked(p_player uuid, p_difficulty text, p_asc int) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rank int := array_position(array['f','e','d','c','b','a','s'], p_difficulty);
  v_previous text;
begin
  if v_rank is null or p_asc is null or p_asc < 0 or p_asc > 5 then return false; end if;
  if p_difficulty = 'f' and p_asc = 0 then return true; end if;
  if p_asc > 0 then
    return exists (select 1 from public.step_clears
                    where player_id = p_player and difficulty = p_difficulty and ascension = p_asc - 1);
  end if;
  v_previous := (array['f','e','d','c','b','a','s'])[v_rank - 1];
  return exists (select 1 from public.step_clears
                  where player_id = p_player and difficulty = v_previous and ascension = 0);
end $$;

create or replace function public.route_cleared(p_player uuid, p_route text, p_difficulty text, p_asc int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select levels from public.route_progress
    where player_id = p_player and route = p_route and difficulty = p_difficulty and ascension = p_asc), 0)
$$;

-- Retained as a compatibility helper for weekly reward routines; any completed route counts.
create or replace function public.progress_cleared(p_player uuid, p_difficulty text, p_asc int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(max(levels), 0) from public.route_progress
   where player_id = p_player and difficulty = p_difficulty and ascension = p_asc
$$;

create or replace function public.level_lock_reason(
  p_player uuid, p_route text, p_difficulty text, p_level int, p_asc int
) returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_done int;
begin
  if p_route is null or p_route not in ('lord_of_flies', 'ash_king', 'eternal_watcher', 'hollow_colossus',
      'thunder_king', 'mother_hydra', 'withered_queen', 'faceless_one', 'great_devourer')
     or p_difficulty is null or p_difficulty not in ('f','e','d','c','b','a','s')
     or p_level is null or p_level < 0 or p_level >= public.level_count()
     or p_asc is null or p_asc < 0 or p_asc > 5 then
    return 'level_locked';
  end if;
  if not public.step_unlocked(p_player, p_difficulty, p_asc) then return 'step_locked'; end if;
  v_done := public.route_cleared(p_player, p_route, p_difficulty, p_asc);
  if p_level > v_done then return 'level_locked'; end if;
  return null;
end $$;

create or replace function public.start_level(
  p_player uuid, p_character_id text, p_seed bigint, p_hero jsonb,
  p_route text, p_difficulty text, p_level int, p_asc int
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_why text;
begin
  if p_hero is null or jsonb_typeof(p_hero) <> 'object' or p_character_id is null then
    raise exception 'invalid_args';
  end if;
  if not exists (select 1 from public.characters where player_id = p_player and key = p_character_id) then
    raise exception 'character_not_found';
  end if;
  v_why := public.level_lock_reason(p_player, p_route, p_difficulty, p_level, p_asc);
  if v_why is not null then raise exception '%', v_why; end if;
  if coalesce((p_hero ->> 'sweep')::boolean, false) then
    if (select count(*) from public.runs where player_id = p_player and hero ->> 'kind' = 'level'
        and hero ->> 'sweep' = 'true' and started_at > now() - interval '1 hour') >= 600 then
      raise exception 'rate_limited';
    end if;
  elsif (select count(*) from public.runs where player_id = p_player and hero ->> 'kind' = 'level'
           and coalesce(hero ->> 'sweep', 'false') <> 'true' and started_at > now() - interval '1 hour') >= 200
     or (select count(*) from public.runs where player_id = p_player and hero ->> 'kind' = 'level'
           and coalesce(hero ->> 'sweep', 'false') <> 'true' and started_at > now() - interval '1 day') >= 1500 then
    raise exception 'rate_limited';
  end if;
  update public.runs set status = 'expired', finished_at = now()
   where player_id = p_player and status = 'open'
     and started_at < now() - interval '1 hour' * public.game_const('run_stale_hours');
  if exists (select 1 from public.runs where player_id = p_player and status = 'open') then
    raise exception 'run_open';
  end if;
  begin
    insert into public.runs (player_id, seed, hero)
    values (p_player, p_seed, p_hero || jsonb_build_object(
      'kind', 'level', 'route', p_route, 'difficulty', p_difficulty,
      'level', p_level, 'asc', p_asc, 'heroId', p_character_id)) returning id into v_id;
  exception when unique_violation then raise exception 'run_open';
  end;
  return jsonb_build_object('run_id', v_id);
end $$;

create or replace function public.get_profile(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_p public.players;
  v_s public.player_state;
begin
  select * into v_p from public.players where id = p_player;
  if not found then
    raise exception 'player_not_found';
  end if;
  select * into v_s from public.player_state where player_id = p_player;
  return jsonb_build_object(
    'name', v_p.name,
    'isAdmin', v_p.is_admin,
    'bestFloor', v_p.best_floor,
    'stateVersion', v_s.version,
    'coins', v_s.coins,
    'pity', coalesce((
      select jsonb_object_agg(g.banner, g.pity)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'escamas', v_s.escamas,
    'dados', v_s.dados,
    'dadosDay', case when v_s.dado_day = public.game_day()
                     then jsonb_build_object('day', to_char(v_s.dado_day, 'YYYY-MM-DD'), 'n', v_s.dado_n)
                     else null end,
    -- Shared step clears and independently completed routes, serialized as profile maps.
    'dungeonProgress', jsonb_build_object(
      'steps', coalesce((select jsonb_object_agg(difficulty || ':' || ascension, to_jsonb(true))
                           from public.step_clears where player_id = p_player), '{}'::jsonb),
      'routes', coalesce((select jsonb_object_agg(route || ':' || difficulty || ':' || ascension, levels)
                            from public.route_progress where player_id = p_player), '{}'::jsonb)),
    'levelsDay', case when v_s.levels_day = public.game_day()
                      then jsonb_build_object('day', to_char(v_s.levels_day, 'YYYY-MM-DD'), 'n', v_s.levels_n)
                      else null end,
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars,
        'data', c.data || jsonb_build_object('level', c.level, 'xp', c.xp, 'legacy', c.legacy, 'copies', c.copies)
                       || case when c.skill is null then '{}'::jsonb else jsonb_build_object('skill', c.skill) end
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars,
        'data', w.data || jsonb_build_object('legacy', w.legacy, 'plus', w.plus, 'plusStreak', w.plus_streak)
                       || case when w.roll is null then '{}'::jsonb else jsonb_build_object('roll', w.roll) end
                       || case when w.lines is null then '{}'::jsonb else jsonb_build_object('lines', w.lines) end
      ) order by w.created_at, w.key)
      from public.weapons w where w.player_id = p_player
    ), '[]'::jsonb),
    'equipped', coalesce((
      select jsonb_object_agg(case when e.slot = 'arma' then e.character_key else e.character_key || '|' || e.slot end, e.weapon_key)
      from public.equipment e where e.player_id = p_player
    ), '{}'::jsonb),
    'fragments', coalesce((
      select jsonb_object_agg(f.class || ':' || f.rarity, f.qty)
      from public.fragments f where f.player_id = p_player and f.qty > 0
    ), '{}'::jsonb)
  );
end $$;

create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_route text, p_difficulty text, p_level int, p_asc int,
  p_status text, p_xp int, p_dados int, p_pieces jsonb, p_repeat boolean,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_max_xp constant int := 1500; -- a 5-fight level with a final boss gives 1125
  v_run public.runs;
  v_state public.player_state;
  v_verdict text := coalesce(p_verdict, 'accepted');
  v_why text;
  v_done int;
  v_repeat boolean := false;
  v_n int;
  v_base numeric;
  v_coins int := 0;
  v_chest int := 0;
  v_refund int := 0;
  v_xp int;
  v_capped boolean := false;
  v_item jsonb;
  v_status text;
  v_escamas int := 0;
  v_dado int := 0;
  v_dn int;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_difficulty is null or public.rank_idx(p_difficulty) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count()
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_dados is null or p_dados not in (0, 1)
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'route' is distinct from p_route
     or v_run.hero ->> 'difficulty' is distinct from p_difficulty
     or (v_run.hero ->> 'level')::int is distinct from p_level
     or (v_run.hero ->> 'asc')::int is distinct from p_asc
     or v_run.hero ->> 'heroId' is distinct from p_hero_id then
    raise exception 'invalid_args'; -- the attempt that was started is not the one being paid
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;

  if v_verdict = 'rejected' then
    update public.runs set status = 'closed', finished_at = now() where id = p_run_id;
    insert into public.run_submissions (run_id, player_id, log, verdict, reason)
    values (p_run_id, p_player, p_log, 'rejected', left(p_reason, 300));
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_rejected', jsonb_build_object('run_id', p_run_id, 'reason', left(p_reason, 300)));
    return jsonb_build_object('cleared', false, 'repeat', false, 'coins', 0, 'chest', 0, 'xp', 0,
                              'levelsGained', 0, 'newLevel', 0, 'dungeonDone', false, 'verdict', 'rejected');
  end if;

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or p_dados > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 30 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_route, p_difficulty, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.route_cleared(p_player, p_route, p_difficulty, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_difficulty) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count() then
      v_chest := round(public.level_chest(p_difficulty) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.route_progress (player_id, route, difficulty, ascension, levels)
      values (p_player, p_route, p_difficulty, p_asc, p_level + 1)
      on conflict (player_id, route, difficulty, ascension) do update
        set levels = greatest(public.route_progress.levels, excluded.levels);
      if p_level + 1 = public.level_count() then
        insert into public.step_clears (player_id, difficulty, ascension)
        values (p_player, p_difficulty, p_asc) on conflict do nothing;
      end if;
    end if;

    -- Escamas (S+ only) follow the coin rules: +10% per ascension, repeats decay with the day's count.
    v_escamas := public.level_escamas(p_difficulty, p_asc, v_repeat, case when v_repeat then public.level_decay(v_n) else 1 end);
    -- Dado cargado: only the last level of a dungeon S+; the server rolled it, SQL caps it at 2 per day.
    if p_dados > 0 then
      if public.rank_idx(p_difficulty) < public.rank_idx('s') or p_level + 1 < public.level_count() then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_dn < 2 then v_dado := 1; end if;
    end if;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_difficulty) + 1 then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      -- a duplicate already at max stars is ignored: no coin refund (drops are plentiful)
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or p_dados > 0 then
    raise exception 'invalid_args';
  end if;

  -- EXP: always (a lost level keeps what the replay earned).
  if v_xp > 0 then
    v_hero := public.grant_hero_xp(p_player, p_hero_id, v_xp);
  end if;

  update public.runs
     set status = 'closed', finished_at = now(), max_floor = case when p_status = 'cleared' then p_level + 1 else 0 end,
         coins_earned = v_coins + v_chest
   where id = p_run_id;
  insert into public.run_submissions (run_id, player_id, log, verdict, reason)
  values (p_run_id, p_player, p_log, v_verdict, left(p_reason, 300));

  update public.player_state
     set coins = coins + v_coins + v_chest + v_refund, version = version + 1,
         escamas = least(99999, escamas + v_escamas), dados = least(99999, dados + v_dado),
         dado_day = case when v_dado > 0 then public.game_day() else dado_day end,
         dado_n = case when v_dado > 0 then v_dn + 1 else dado_n end,
         levels_day = case when p_status = 'cleared' then public.game_day() else levels_day end,
         levels_n = case when p_status = 'cleared' then v_n else levels_n end
   where player_id = p_player
   returning coins, version into v_new_coins, v_version;

  if v_capped or v_verdict = 'cut' then
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_' || case when v_capped then 'capped' else 'cut' end,
            jsonb_build_object('run_id', p_run_id, 'claimed_xp', p_xp, 'credited_xp', v_xp, 'reason', left(p_reason, 300)));
  end if;

  return jsonb_build_object(
    'cleared', p_status = 'cleared', 'repeat', v_repeat, 'coins', v_coins, 'chest', v_chest,
    'refund', v_refund, 'xp', (v_hero ->> 'xp')::int, 'levelsGained', (v_hero ->> 'gained')::int,
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done, 'escamas', v_escamas, 'dados', v_dado,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;

revoke all on function public.level_count() from public, anon, authenticated;
revoke all on function public.level_count(text) from public, anon, authenticated;
revoke all on function public.step_unlocked(uuid, text, int) from public, anon, authenticated;
revoke all on function public.route_cleared(uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.progress_cleared(uuid, text, int) from public, anon, authenticated;
revoke all on function public.level_lock_reason(uuid, text, text, int, int) from public, anon, authenticated;
revoke all on function public.start_level(uuid, text, bigint, jsonb, text, text, int, int) from public, anon, authenticated;
revoke all on function public.bank_level(uuid, uuid, text, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.level_count() to service_role;
grant execute on function public.level_count(text) to service_role;
grant execute on function public.step_unlocked(uuid, text, int) to service_role;
grant execute on function public.route_cleared(uuid, text, text, int) to service_role;
grant execute on function public.progress_cleared(uuid, text, int) to service_role;
grant execute on function public.level_lock_reason(uuid, text, text, int, int) to service_role;
grant execute on function public.start_level(uuid, text, bigint, jsonb, text, text, int, int) to service_role;
grant execute on function public.bank_level(uuid, uuid, text, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text) to service_role;

-- ===== 0018_lockdown_functions.sql =====
-- 0018_lockdown_functions: re-apply the function lockdown to EVERY function in public.
-- Why: a new signature (apply_pull with p_pity_ssr, bank_run with p_clear/p_parts,
-- unequip_weapon with p_slot) is a new function that got default PUBLIC execute, so
-- anon/authenticated could call it through /rest/v1/rpc. Only the server (service_role)
-- may run them; the two RLS helpers stay executable by authenticated.
-- Idempotent. Keep this as the LAST migration (re-run it after any new function).
do $$
declare f record;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
         select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', f.proname, f.args);
    execute format('grant execute on function public.%I(%s) to service_role', f.proname, f.args);
    if f.proname in ('is_room_member', 'is_room_topic_member') then
      execute format('grant execute on function public.%I(%s) to authenticated', f.proname, f.args);
    end if;
  end loop;
end $$;

-- Future functions created by the migration role must not be public either.
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

commit;
