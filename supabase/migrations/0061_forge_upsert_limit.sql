-- 0061: forge writes may touch many pieces/heroes at once.
-- A rank-up or fusion upserts the resulting row plus EVERY material row that only lost copies, and the API
-- allows up to 9 materials, but apply_piece_change / apply_hero_change accepted at most 3 upserted rows, so
-- spending copies from several different pieces failed with "Datos inválidos." (invalid_args).
-- Same bodies as 0053 / 0054; only the upsert bound changes (1..12 = result + base + 9 materials + slack).
-- Re-runnable. Lockdown (0018) is re-applied last by the setup/upgrade generators.
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
     or p_upsert is null or jsonb_typeof(p_upsert) <> 'array' or jsonb_array_length(p_upsert) not between 1 and 12
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
     or p_upsert is null or jsonb_typeof(p_upsert) <> 'array' or jsonb_array_length(p_upsert) not between 1 and 12
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
