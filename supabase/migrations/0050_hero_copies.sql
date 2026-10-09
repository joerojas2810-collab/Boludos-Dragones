-- 0050: hero copies. A repeated hero pull is no longer +1 star: it is stored as a spare copy that
-- keeps the trait it rolled (characters.copies). Stars come from spending copies / same-rank heroes
-- (Forja), ranks from fusing them. The TS code (heroFusion.ts) decides, the database applies.
-- 1) characters.copies (max 50, profile.ts MAX_COPIES).
-- 2) get_profile returns the copies inside the hero's data.
-- 3) apply_pull stores a duplicate hero as a copy (status 'copy'; refund at 50 copies).
-- 4) apply_hero_change: one atomic write-set for star-up, rank-up and trait swap (fuse_heroes goes).
-- 5) The market moves a hero's spare copy (with its trait) instead of a star.
alter table public.characters add column if not exists copies text[] not null default '{}';
alter table public.characters drop constraint if exists characters_copies_check;
alter table public.characters add constraint characters_copies_check check (cardinality(copies) <= 50);

-- 2) get_profile
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_profile'
  loop
    v_def := pg_get_functiondef(r.oid);
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
    v_new := replace(v_def,
      'select stars into v_stars from public.characters where player_id = p_player and key = p_give;',
      'select cardinality(copies) into v_stars from public.characters where player_id = p_player and key = p_give;');
    if v_new = v_def then raise exception '0050: market_create pattern not found'; end if;
    execute v_new;
  end loop;
end $$;
