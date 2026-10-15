-- 0058: class mastery (highest hero level reached per class) and equipped skill loadouts,
-- plus their exposure through get_profile. Mastery is maintained by a trigger on
-- characters.level, so the client can never raise it; loadouts are validated again here
-- (skill ids, class, unlock tier) as defence in depth behind the server's loadoutError.
-- Re-runnable. New tables are deny-all (only the server's service_role reads/writes them).
create table if not exists public.class_mastery (
  player_id uuid not null references public.players(id) on delete cascade,
  class text not null check (class in ('caballero', 'mago', 'picaro', 'clerigo', 'berserker')),
  level int not null default 0 check (level between 0 and 1000),
  primary key (player_id, class)
);
create table if not exists public.skill_loadouts (
  player_id uuid not null references public.players(id) on delete cascade,
  scope text not null check (scope in ('hero', 'level')), -- hero: key = characters.key; level (nivelado): key = class
  key text not null check (char_length(key) between 1 and 60),
  skills text[] not null check (cardinality(skills) = 2 and skills[1] <> skills[2]),
  updated_at timestamptz not null default now(),
  primary key (player_id, scope, key)
);
alter table public.class_mastery enable row level security;
alter table public.skill_loadouts enable row level security;
revoke all on public.class_mastery, public.skill_loadouts from public, anon, authenticated;
drop policy if exists deny_all on public.class_mastery;
create policy deny_all on public.class_mastery as restrictive for all using (false) with check (false);
drop policy if exists deny_all on public.skill_loadouts;
create policy deny_all on public.skill_loadouts as restrictive for all using (false) with check (false);

-- Catalogue mirror of src/lib/game/skills.ts (SKILLS: class + unlock tier). A pglite test keeps both in sync.
create or replace function public.skill_class(p_skill text) returns text
language sql immutable set search_path = '' as $$
  select case split_part(p_skill, '_', 1)
    when 'knight' then 'caballero' when 'mage' then 'mago' when 'rogue' then 'picaro'
    when 'cleric' then 'clerigo' when 'berserker' then 'berserker' end
  where p_skill = any(array[
    'knight_advance','knight_breaker','knight_bastion','knight_sweep',
    'mage_inscribe','mage_detonate','mage_barrier','mage_seal',
    'rogue_feint','rogue_finish','rogue_step','rogue_sabotage',
    'cleric_judgment','cleric_consecrate','cleric_restore','cleric_cleanse',
    'berserker_charge','berserker_release','berserker_recover','berserker_shatter'])
$$;
create or replace function public.skill_unlock(p_skill text) returns int
language sql immutable set search_path = '' as $$
  select case when public.skill_class(p_skill) is null then null
    when p_skill = any(array['knight_bastion','mage_barrier','rogue_step','cleric_restore','berserker_recover']) then 5
    when p_skill = any(array['knight_sweep','mage_seal','rogue_sabotage','cleric_cleanse','berserker_shatter']) then 12
    else 0 end
$$;

-- Mastery follows the hero's level, whichever path changed it (xp, dungeon bank, fusion upsert).
create or replace function public.touch_class_mastery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.class_mastery (player_id, class, level)
  values (new.player_id, new.class, least(1000, greatest(0, new.level)))
  on conflict (player_id, class) do update set level = greatest(public.class_mastery.level, excluded.level);
  return new;
end $$;
drop trigger if exists characters_mastery on public.characters;
create trigger characters_mastery after insert or update of level on public.characters
  for each row execute function public.touch_class_mastery();
insert into public.class_mastery (player_id, class, level)
select player_id, class, least(1000, max(level)) from public.characters group by player_id, class
on conflict (player_id, class) do update set level = greatest(public.class_mastery.level, excluded.level);

-- Saves one selection. hero: p_key = characters.key (must be owned; unlock tiers follow the stored
-- mastery). level: p_key = class (nivelado, all four skills available).
create or replace function public.set_loadout(p_player uuid, p_scope text, p_key text, p_skills jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_class text;
  v_mastery int;
  v_a text;
  v_b text;
begin
  if p_scope not in ('hero', 'level') or p_key is null or char_length(p_key) not between 1 and 60
     or p_skills is null or jsonb_typeof(p_skills) <> 'array' or jsonb_array_length(p_skills) <> 2
     or jsonb_typeof(p_skills -> 0) <> 'string' or jsonb_typeof(p_skills -> 1) <> 'string' then
    raise exception 'invalid_args';
  end if;
  v_a := p_skills ->> 0;
  v_b := p_skills ->> 1;
  if v_a = v_b or public.skill_class(v_a) is null or public.skill_class(v_b) is null then
    raise exception 'invalid_skill';
  end if;
  if p_scope = 'hero' then
    perform 1 from public.characters where player_id = p_player and key = p_key;
    if not found then raise exception 'character_not_found'; end if;
    v_class := split_part(p_key, '-', 2);
    select coalesce(max(level), 0) into v_mastery from public.class_mastery where player_id = p_player and class = v_class;
  else
    v_class := p_key;
    v_mastery := null;
  end if;
  if public.skill_class(v_a) is distinct from v_class or public.skill_class(v_b) is distinct from v_class then
    raise exception 'invalid_skill';
  end if;
  if v_mastery is not null and (public.skill_unlock(v_a) > v_mastery or public.skill_unlock(v_b) > v_mastery) then
    raise exception 'skill_locked';
  end if;
  insert into public.skill_loadouts (player_id, scope, key, skills)
  values (p_player, p_scope, p_key, array[v_a, v_b])
  on conflict (player_id, scope, key) do update set skills = excluded.skills, updated_at = now();
  return jsonb_build_object('scope', p_scope, 'key', p_key, 'skills', jsonb_build_array(v_a, v_b));
end $$;

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
    'escamas', v_s.escamas,
    'dados', v_s.dados,
    'dadosDay', case when v_s.dado_day = public.game_day()
                     then jsonb_build_object('day', to_char(v_s.dado_day, 'YYYY-MM-DD'), 'n', v_s.dado_n)
                     else null end,
    -- Shared step clears and independently completed routes, serialized as profile maps.
    'dungeonProgress', jsonb_build_object(
      'steps', coalesce((select jsonb_object_agg(difficulty || ':' || ascension, to_jsonb(true))
                           from public.step_clears where player_id = p_player), '{}'::jsonb),
      'routes', coalesce((select jsonb_object_agg(route || ':' || difficulty || ':' || ascension, levels)
                            from public.route_progress where player_id = p_player), '{}'::jsonb)),
    'levelsDay', case when v_s.levels_day = public.game_day()
                      then jsonb_build_object('day', to_char(v_s.levels_day, 'YYYY-MM-DD'), 'n', v_s.levels_n)
                      else null end,
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars,
        'data', c.data || jsonb_build_object('level', c.level, 'xp', c.xp, 'legacy', c.legacy, 'copies', c.copies)
                       || case when c.skill is null then '{}'::jsonb else jsonb_build_object('skill', c.skill) end
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars,
        'data', w.data || jsonb_build_object('legacy', w.legacy, 'plus', w.plus, 'plusStreak', w.plus_streak, 'copies', w.copies)
                       || case when w.roll is null then '{}'::jsonb else jsonb_build_object('roll', w.roll) end
                       || case when w.lines is null then '{}'::jsonb else jsonb_build_object('lines', w.lines) end
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
    ), '{}'::jsonb),
    'classMastery', coalesce((
      select jsonb_object_agg(m.class, m.level) from public.class_mastery m where m.player_id = p_player
    ), '{}'::jsonb),
    'loadouts', coalesce((
      select jsonb_object_agg(l.key, to_jsonb(l.skills))
      from public.skill_loadouts l where l.player_id = p_player and l.scope = 'hero'
    ), '{}'::jsonb),
    'levelLoadouts', coalesce((
      select jsonb_object_agg(l.key, to_jsonb(l.skills))
      from public.skill_loadouts l where l.player_id = p_player and l.scope = 'level'
    ), '{}'::jsonb)
  );
end $$;
