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
