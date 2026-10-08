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
