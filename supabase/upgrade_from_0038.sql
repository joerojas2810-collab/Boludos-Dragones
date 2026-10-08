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
