-- Boludos & Dragones: database upgrade from 0057 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0057_dungeon_economy.sql =====
-- 0057: shared first-clear payouts and dungeon-material daily caps.
-- Re-runnable; public RPC argument names remain unchanged.
create table if not exists public.dungeon_reward_days (
  player_id uuid not null references public.players(id) on delete cascade,
  day date not null,
  escamas int not null default 0 check (escamas between 0 and 12),
  dados int not null default 0 check (dados between 0 and 1),
  primary key (player_id, day)
);
alter table public.dungeon_reward_days enable row level security;
revoke all on public.dungeon_reward_days from public, anon, authenticated;
drop policy if exists deny_all on public.dungeon_reward_days;
create policy deny_all on public.dungeon_reward_days as restrictive for all
  using (false) with check (false);

create or replace function public.difficulty_level_coins(p_difficulty text) returns int
language sql immutable set search_path = '' as $$
  select case p_difficulty when 'f' then 60 when 'e' then 75 when 'd' then 95 when 'c' then 120
    when 'b' then 150 when 'a' then 180 when 's' then 210 end
$$;

create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_route text, p_difficulty text, p_level int, p_asc int,
  p_status text, p_xp int, p_dados int, p_pieces jsonb, p_repeat boolean,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_max_xp constant int := 1500; -- a 5-fight level with a final boss gives 1125
  v_run public.runs;
  v_state public.player_state;
  v_verdict text := coalesce(p_verdict, 'accepted');
  v_why text;
  v_done int;
  v_repeat boolean := false;
  v_route_repeat boolean := false;
  v_daily_escamas int := 0;
  v_daily_dados int := 0;
  v_rows int := 0;
  v_n int;
  v_base numeric;
  v_coins int := 0;
  v_chest int := 0;
  v_refund int := 0;
  v_xp int;
  v_capped boolean := false;
  v_item jsonb;
  v_status text;
  v_escamas int := 0;
  v_dado int := 0;
  v_dn int;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_difficulty is null or public.rank_idx(p_difficulty) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count()
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_dados is null or p_dados not in (0, 1)
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'route' is distinct from p_route
     or v_run.hero ->> 'difficulty' is distinct from p_difficulty
     or (v_run.hero ->> 'level')::int is distinct from p_level
     or (v_run.hero ->> 'asc')::int is distinct from p_asc
     or v_run.hero ->> 'heroId' is distinct from p_hero_id then
    raise exception 'invalid_args'; -- the attempt that was started is not the one being paid
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;

  if v_verdict = 'rejected' then
    update public.runs set status = 'closed', finished_at = now() where id = p_run_id;
    insert into public.run_submissions (run_id, player_id, log, verdict, reason)
    values (p_run_id, p_player, p_log, 'rejected', left(p_reason, 300));
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_rejected', jsonb_build_object('run_id', p_run_id, 'reason', left(p_reason, 300)));
    return jsonb_build_object('cleared', false, 'repeat', false, 'coins', 0, 'chest', 0, 'xp', 0,
                              'levelsGained', 0, 'newLevel', 0, 'dungeonDone', false, 'verdict', 'rejected');
  end if;

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or p_dados > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 30 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_route, p_difficulty, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.route_cleared(p_player, p_route, p_difficulty, p_asc);
    v_route_repeat := p_level < v_done;
    select exists (select 1 from public.route_progress
      where player_id = p_player and difficulty = p_difficulty and ascension = p_asc and levels > p_level)
      into v_repeat;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.difficulty_level_coins(p_difficulty) * (1 + 0.04 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_route_repeat then
      v_dungeon_done := p_level + 1 >= public.level_count();
      insert into public.route_progress (player_id, route, difficulty, ascension, levels)
      values (p_player, p_route, p_difficulty, p_asc, p_level + 1)
      on conflict (player_id, route, difficulty, ascension) do update
        set levels = greatest(public.route_progress.levels, excluded.levels);
      if p_level + 1 = public.level_count() then
        insert into public.step_clears (player_id, difficulty, ascension)
        values (p_player, p_difficulty, p_asc) on conflict do nothing;
        get diagnostics v_rows = row_count;
        if v_rows = 1 then
          v_chest := round(public.difficulty_level_chest(p_difficulty)
            * case when p_asc = 0 then 1 else 0.5 end)::int;
        end if;
      end if;
    end if;

    -- One S+5 full clear's daily dungeon payout: 12 Escamas and one Dado, shared by routes.
    insert into public.dungeon_reward_days (player_id, day, escamas, dados)
      values (p_player, public.game_day(), 0, 0) on conflict do nothing;
    select escamas, dados into v_daily_escamas, v_daily_dados
      from public.dungeon_reward_days where player_id = p_player and day = public.game_day() for update;
    v_escamas := least(public.difficulty_level_escamas(p_difficulty, p_asc, v_repeat,
      case when v_repeat then public.level_decay(v_n) else 1 end), greatest(0, 12 - v_daily_escamas));
    -- Dado cargado: only the last level of S; the server rolls it, SQL enforces both caps.
    if p_dados > 0 then
      if p_difficulty <> 's' or p_level + 1 < public.level_count() then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_daily_dados < 1 and v_dn < 2 then v_dado := 1; end if;
    end if;

    if v_escamas > 0 or v_dado > 0 then
      update public.dungeon_reward_days set escamas = escamas + v_escamas, dados = dados + v_dado
       where player_id = p_player and day = public.game_day();
    end if;
    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level never drops above its dungeon difficulty
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_difficulty) then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      -- a duplicate already at max stars is ignored: no coin refund (drops are plentiful)
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or p_dados > 0 then
    raise exception 'invalid_args';
  end if;

  -- EXP: always (a lost level keeps what the replay earned).
  if v_xp > 0 then
    v_hero := public.grant_hero_xp(p_player, p_hero_id, v_xp);
  end if;

  update public.runs
     set status = 'closed', finished_at = now(), max_floor = case when p_status = 'cleared' then p_level + 1 else 0 end,
         coins_earned = v_coins + v_chest
   where id = p_run_id;
  insert into public.run_submissions (run_id, player_id, log, verdict, reason)
  values (p_run_id, p_player, p_log, v_verdict, left(p_reason, 300));

  update public.player_state
     set coins = coins + v_coins + v_chest + v_refund, version = version + 1,
         escamas = least(99999, escamas + v_escamas), dados = least(99999, dados + v_dado),
         dado_day = case when v_dado > 0 then public.game_day() else dado_day end,
         dado_n = case when v_dado > 0 then v_dn + 1 else dado_n end,
         levels_day = case when p_status = 'cleared' then public.game_day() else levels_day end,
         levels_n = case when p_status = 'cleared' then v_n else levels_n end
   where player_id = p_player
   returning coins, version into v_new_coins, v_version;

  if v_capped or v_verdict = 'cut' then
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_' || case when v_capped then 'capped' else 'cut' end,
            jsonb_build_object('run_id', p_run_id, 'claimed_xp', p_xp, 'credited_xp', v_xp, 'reason', left(p_reason, 300)));
  end if;

  return jsonb_build_object(
    'cleared', p_status = 'cleared', 'repeat', v_repeat, 'coins', v_coins, 'chest', v_chest,
    'refund', v_refund, 'xp', (v_hero ->> 'xp')::int, 'levelsGained', (v_hero ->> 'gained')::int,
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done, 'escamas', v_escamas, 'dados', v_dado,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;
revoke all on function public.bank_level(uuid, uuid, text, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.bank_level(uuid, uuid, text, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text) to service_role;

-- ===== 0058_class_mastery_loadouts.sql =====
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
