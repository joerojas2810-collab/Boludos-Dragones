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

-- 4) Trade value follows the new top rank: S is worth 250 / 5% = 5000 (burn and the market derive from it).
create or replace function public.trade_value(p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case substring(p_key from '[^-]+$')
    when 'f' then 830 when 'e' then 1140 when 'd' then 1560 when 'c' then 2080
    when 'b' then 2780 when 'a' then 4170 when 's' then 5000 else 0 end
$$;
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and not public.trade_fair(give_key, want_key, coins);

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
