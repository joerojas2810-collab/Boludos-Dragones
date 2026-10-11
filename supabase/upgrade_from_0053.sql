-- Boludos & Dragones: database upgrade from 0053 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

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
