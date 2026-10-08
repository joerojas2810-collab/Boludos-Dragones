-- Ranks F..SSR replace the 5 rarities (docs/DUNGEONS_FORJA.md).
-- Legacy mapping: comun->f, pococomun->d, raro->c, epico->a, legendario->s.
-- Two pity counters per banner: pity (ss or better at 100) and pity_ssr (ssr at 200).

-- 1. Drop old rarity CHECKs (names vary), remap data, add new CHECKs.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.characters'::regclass, 'public.weapons'::regclass, 'public.fragments'::regclass)
       and pg_get_constraintdef(c.oid) like '%rarity%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- equipment references the generated `key` columns: rebuild it around the update.
-- one piece per slot: weapon ('arma') plus the 5 gear slots. Added BEFORE the copy so a
-- re-run keeps every slot (copying without it collapsed all pieces into 'arma').
alter table public.equipment add column if not exists slot text not null default 'arma'
  check (slot in ('arma', 'casco', 'peto', 'piernas', 'zapatos', 'collar'));
create temporary table _equip as select * from public.equipment;
delete from public.equipment;
alter table public.equipment drop constraint if exists equipment_pkey;
alter table public.equipment add primary key (player_id, character_key, slot);

create or replace function pg_temp.rank(p text) returns text language sql immutable as $f$
  select case p when 'comun' then 'f' when 'pococomun' then 'd' when 'raro' then 'c'
               when 'epico' then 'a' when 'legendario' then 's' else p end
$f$;

update public.characters set rarity = pg_temp.rank(rarity);
update public.weapons set rarity = pg_temp.rank(rarity);
update public.fragments set rarity = pg_temp.rank(rarity);

insert into public.equipment (player_id, character_key, weapon_key, slot)
select player_id,
       regexp_replace(character_key, '-([a-z]+)$', '-' || pg_temp.rank((regexp_match(character_key, '-([a-z]+)$'))[1])),
       regexp_replace(weapon_key, '-([a-z]+)$', '-' || pg_temp.rank((regexp_match(weapon_key, '-([a-z]+)$'))[1])),
       slot
  from _equip;
drop table _equip;

-- open market offers carry keys too
update public.market_offers set
  give_key = regexp_replace(give_key, '-([a-z]+)$', '-' || pg_temp.rank((regexp_match(give_key, '-([a-z]+)$'))[1])),
  want_key = case when want_key is null then null
    else regexp_replace(want_key, '-([a-z]+)$', '-' || pg_temp.rank((regexp_match(want_key, '-([a-z]+)$'))[1])) end;

alter table public.characters
  add constraint characters_rarity_check check (rarity in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'));
alter table public.weapons
  add constraint weapons_rarity_check check (rarity in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'));
alter table public.fragments
  add constraint fragments_rarity_check check (rarity in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'));

-- 2. SSR pity counter.
alter table public.gacha_state
  add column if not exists pity_ssr int not null default 0 check (pity_ssr between 0 and 200);
insert into public.game_constants (key, value) values ('pity_ssr_threshold', 200)
on conflict (key) do update set value = excluded.value;

-- Dungeon clears: most lives left in a clear of each rank (unlocks the next one).
create table if not exists public.dungeon_clears (
  player_id uuid not null references public.players (id) on delete cascade,
  rank text not null check (rank in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr')),
  best_lives int not null check (best_lives between 1 and 5),
  primary key (player_id, rank)
);
alter table public.dungeon_clears enable row level security;

-- Forge parts and cores: key = p-<type>-<rank> or core-<element>.
create table if not exists public.part_stock (
  player_id uuid not null references public.players (id) on delete cascade,
  key text not null check (key ~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'),
  qty int not null check (qty between 0 and 9999),
  primary key (player_id, key)
);
alter table public.part_stock enable row level security;
revoke all on public.part_stock from anon, authenticated;
revoke all on public.dungeon_clears from anon, authenticated;

-- 3. Functions that list ranks or pity.
create or replace function public.market_key_ok(p_kind text, p_key text) returns boolean
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'character' then p_key ~ '^c-(caballero|mago|picaro|clerigo)-(agua|fuego|viento|tierra|rayo)-(f|e|d|c|b|a|s|ss|ssr)$'
    when 'weapon' then p_key ~ '^w-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(agua|fuego|viento|tierra|rayo)-(f|e|d|c|b|a|s|ss|ssr)$'
    else false end
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
    'parts', coalesce((
      select jsonb_object_agg(k.key, k.qty)
      from public.part_stock k where k.player_id = p_player and k.qty > 0
    ), '{}'::jsonb),
    'dungeons', coalesce((
      select jsonb_object_agg(d.rank, d.best_lives)
      from public.dungeon_clears d where d.player_id = p_player
    ), '{}'::jsonb),
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars, 'data', c.data
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars, 'data', w.data
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

drop function if exists public.apply_pull(uuid, int, text, text, int, int, bigint, boolean, jsonb);

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
  v_old_pity int;
  v_run_pity int;
  v_old_pity_ssr int;
  v_run_pity_ssr int;
  v_thr_ssr int := public.game_const('pity_ssr_threshold');
  v_thr int := public.game_const('pity_threshold');
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

  -- Serialize everything for this player.
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  -- Idempotency first: a replay must not fail on the (now bumped) version.
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

  select pity, pity_ssr into v_old_pity, v_old_pity_ssr from public.gacha_state
   where player_id = p_player and banner = p_banner for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_run_pity := v_old_pity;
  v_run_pity_ssr := v_old_pity_ssr;

  for v_item in
    select t.e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by t.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_el := v_item ->> 'element';
    v_rar := v_item ->> 'rarity';
    v_data := coalesce(v_item -> 'data', '{}'::jsonb);
    if jsonb_typeof(v_data) <> 'object'
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;

    -- Pity (same semantics as rollRarity): at 100 the pull MUST be ss or better,
    -- at 200 (since the last ssr) it MUST be ssr.
    if v_run_pity_ssr >= v_thr_ssr and v_rar <> 'ssr' then
      raise exception 'invalid_pity';
    end if;
    if v_run_pity >= v_thr and v_rar not in ('ss', 'ssr') then
      raise exception 'invalid_pity';
    end if;
    v_run_pity := case when v_rar in ('ss', 'ssr') then 0 else v_run_pity + 1 end;
    v_run_pity_ssr := case when v_rar = 'ssr' then 0 else v_run_pity_ssr + 1 end;

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
        -- Same class + rarity already owned (other element): fragment instead of a star.
        if exists (
          select 1 from public.characters
           where player_id = p_player and class = v_cls and rarity = v_rar
        ) then
          v_frag := 1;
          v_fkey := v_cls || ':' || v_rar;
          insert into public.fragments (player_id, class, rarity, qty)
          values (p_player, v_cls, v_rar, 1)
          on conflict (player_id, class, rarity) do update set qty = public.fragments.qty + 1;
        end if;
        insert into public.characters (player_id, class, element, rarity, data)
        values (p_player, v_cls, v_el, v_rar, v_data);
      end if;
    else
      v_typ := v_item ->> 'type';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'w-' || v_typ || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.weapons set stars = v_stars
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar, v_data);
      end if;
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', v_status, 'id', v_key, 'stars', v_stars, 'refund', v_refund,
      'fragmentGain', v_frag, 'fragmentKey', v_fkey));
  end loop;

  if v_run_pity is distinct from p_pity or v_run_pity_ssr is distinct from p_pity_ssr then
    raise exception 'invalid_pity';
  end if;

  update public.gacha_state set pity = v_run_pity, pity_ssr = v_run_pity_ssr
   where player_id = p_player and banner = p_banner;
  update public.player_state
     set coins = coins - v_expected + v_refund_total, version = version + 1
   where player_id = p_player
   returning coins, version into v_coins, v_version;

  v_out := jsonb_build_object(
    'replayed', false, 'coins', v_coins, 'version', v_version, 'pity', v_run_pity, 'pitySsr', v_run_pity_ssr,
    'refundTotal', v_refund_total, 'results', v_results);
  insert into public.pulls (player_id, idempotency_key, banner, cost, daily, seed, items, result)
  values (p_player, p_idem, p_banner, v_expected, v_daily, p_seed, p_items, v_out);
  return v_out;
end $$;

-- Equip: the slot comes from the piece type (hand weapons -> 'arma', gear -> its own slot).
create or replace function public.equip_weapon(
  p_player uuid, p_character_id text, p_weapon_id text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_type text;
  v_slot text;
begin
  select type into v_type from public.weapons where player_id = p_player and key = p_weapon_id;
  if v_type is null
     or not exists (select 1 from public.characters where player_id = p_player and key = p_character_id) then
    raise exception 'not_owned';
  end if;
  v_slot := case when v_type in ('casco', 'peto', 'piernas', 'zapatos', 'collar') then v_type else 'arma' end;
  delete from public.equipment
   where player_id = p_player
     and ((character_key = p_character_id and slot = v_slot) or weapon_key = p_weapon_id);
  insert into public.equipment (player_id, character_key, weapon_key, slot)
  values (p_player, p_character_id, p_weapon_id, v_slot);
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.unequip_weapon(uuid, text);
create or replace function public.unequip_weapon(
  p_player uuid, p_character_id text, p_slot text default 'arma'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.equipment
   where player_id = p_player and character_key = p_character_id and slot = p_slot;
  return jsonb_build_object('ok', true);
end $$;

-- Bank a run: coins + the loot pieces secured by bosses (p_loot).
drop function if exists public.bank_run(uuid, uuid, int, int, jsonb, text, text);
drop function if exists public.bank_run(uuid, uuid, int, int, jsonb, text, text, jsonb);
drop function if exists public.bank_run(uuid, uuid, int, int, jsonb, text, text, jsonb, jsonb);
create or replace function public.bank_run(
  p_player uuid, p_run_id uuid, p_coins int, p_max_floor int,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null,
  p_loot jsonb default '[]'::jsonb,
  p_clear jsonb default null,
  p_parts jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.runs;
  v_floor int;
  v_cap bigint;
  v_coins int;
  v_capped boolean;
  v_verdict text := coalesce(p_verdict, 'accepted');
  v_new_coins int;
  v_best int;
  v_item jsonb;
  v_typ text;
  v_el text;
  v_rar text;
  v_stars int;
  v_refund int := 0;
  v_pkey text;
  v_pqty text;
begin
  if p_coins is null or p_coins < 0 or p_max_floor is null or p_max_floor < 0
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut') then
    raise exception 'invalid_args';
  end if;
  select * into v_run from public.runs
   where id = p_run_id and player_id = p_player for update;
  if not found then
    raise exception 'run_not_found';
  end if;
  if v_run.status = 'closed' then
    raise exception 'duplicate_run';
  end if;
  if v_run.status <> 'open' then
    raise exception 'run_expired';
  end if;

  v_floor := least(p_max_floor, public.game_const('run_max_floor'));
  v_cap := v_floor::bigint * public.game_const('run_coins_per_floor_base')
         + public.game_const('run_coins_per_floor_slope')::bigint * v_floor * (v_floor + 1) / 2;
  v_capped := p_max_floor > v_floor or p_coins > v_cap;
  v_coins := least(p_coins::bigint, v_cap)::int;
  if v_verdict = 'rejected' then
    v_coins := 0;
    v_floor := 0;
  elsif v_capped and v_verdict = 'accepted' then
    v_verdict := 'capped';
  end if;

  update public.runs
     set status = 'closed', finished_at = now(), max_floor = v_floor, coins_earned = v_coins
   where id = p_run_id;
  insert into public.run_submissions (run_id, player_id, log, verdict, reason)
  values (p_run_id, p_player, p_log, v_verdict, left(p_reason, 300));

  -- Loot secured by bosses (the server replayed the run): new piece, +1 star on a
  -- duplicate, or a coin refund when the duplicate is already at max stars.
  if p_loot is null or jsonb_typeof(p_loot) <> 'array' or jsonb_array_length(p_loot) > 80 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_item in select e from jsonb_array_elements(p_loot) as t(e) loop
      v_typ := v_item ->> 'type';
      v_el := v_item ->> 'element';
      v_rar := v_item ->> 'rarity';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
         or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
         or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
        raise exception 'invalid_items';
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= public.game_const('max_stars') then
          v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          update public.weapons set stars = v_stars + 1
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar,
                jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
      end if;
    end loop;
  end if;

  -- Forge parts secured by bosses (as replayed): add to the stock.
  if p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or (select count(*) from jsonb_object_keys(p_parts)) > 300 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_items';
      end if;
      insert into public.part_stock (player_id, key, qty)
      values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;
  end if;

  -- Dungeon clear (the server replayed the victory): keep the best lives left.
  if p_clear is not null and v_verdict <> 'rejected' then
    insert into public.dungeon_clears (player_id, rank, best_lives)
    values (p_player, p_clear ->> 'rank', (p_clear ->> 'lives')::int)
    on conflict (player_id, rank) do update
      set best_lives = greatest(public.dungeon_clears.best_lives, excluded.best_lives);
  end if;

  update public.player_state
     set coins = coins + v_coins + v_refund, version = version + 1
   where player_id = p_player
   returning coins into v_new_coins;
  if not found then
    raise exception 'player_not_found';
  end if;
  update public.players set best_floor = greatest(best_floor, v_floor)
   where id = p_player
   returning best_floor into v_best;
  insert into public.weekly_scores (week, player_id, max_floor)
  values (public.game_week(), p_player, v_floor)
  on conflict (week, player_id) do update
    set max_floor = greatest(public.weekly_scores.max_floor, excluded.max_floor);

  if v_capped or v_verdict in ('rejected', 'cut') then
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'run_' || v_verdict, jsonb_build_object(
      'run_id', p_run_id, 'claimed_coins', p_coins, 'claimed_floor', p_max_floor,
      'credited_coins', v_coins, 'credited_floor', v_floor));
  end if;

  return jsonb_build_object(
    'coinsAdded', v_coins + v_refund, 'coins', v_new_coins, 'bestFloor', v_best, 'capped', v_capped);
end $$;
