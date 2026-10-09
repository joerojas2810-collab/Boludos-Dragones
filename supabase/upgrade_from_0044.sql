-- Boludos & Dragones: database upgrade from 0044 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

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
