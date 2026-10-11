-- 0054: hero factor profiles. This is a progress reset for heroes: old character
-- rows and open character offers are discarded; profile v6 creates fresh heroes.
-- Piece rows and all non-hero progress remain intact.
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and kind = 'character';
delete from public.characters;
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
  select p_trait = any(array['terco','temerario','orgulloso','sanguinario','paciente','estoico','gloton','tenaz','veloz','fanfarron','lucido','curioso','cauteloso','furioso','sediento','gafe','filoAzar','ultimoAliento','espinas','apostador'])
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
