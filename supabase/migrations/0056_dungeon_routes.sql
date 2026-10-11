-- 0056: themed routes share a single, route-independent difficulty ladder.
-- Legacy progress is intentionally reset; 6a-1 has no compatibility mapping for the old run graph.

create table if not exists public.step_clears (
  player_id uuid not null references public.players(id) on delete cascade,
  difficulty text not null check (difficulty in ('f', 'e', 'd', 'c', 'b', 'a', 's')),
  ascension int not null check (ascension between 0 and 5),
  cleared_at timestamptz not null default now(),
  primary key (player_id, difficulty, ascension)
);
alter table public.step_clears enable row level security;
revoke all on public.step_clears from anon, authenticated;
drop policy if exists deny_all on public.step_clears;
create policy deny_all on public.step_clears as restrictive for all
  using (false) with check (false);

create table if not exists public.route_progress (
  player_id uuid not null references public.players(id) on delete cascade,
  route text not null check (route in ('lord_of_flies', 'ash_king', 'eternal_watcher', 'hollow_colossus',
    'thunder_king', 'mother_hydra', 'withered_queen', 'faceless_one', 'great_devourer')),
  difficulty text not null check (difficulty in ('f', 'e', 'd', 'c', 'b', 'a', 's')),
  ascension int not null check (ascension between 0 and 5),
  levels int not null default 0 check (levels between 0 and 4),
  primary key (player_id, route, difficulty, ascension)
);
alter table public.route_progress enable row level security;
revoke all on public.route_progress from anon, authenticated;
drop policy if exists deny_all on public.route_progress;
create policy deny_all on public.route_progress as restrictive for all
  using (false) with check (false);

drop function if exists public.start_level(uuid, text, bigint, jsonb, text, int, int);
drop function if exists public.bank_level(uuid, uuid, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text);
drop function if exists public.level_lock_reason(uuid, text, int, int);
drop function if exists public.progress_cleared(uuid, text, int);
drop function if exists public.level_count(text);
drop function if exists public.level_base_coins(text);
drop function if exists public.level_chest(text);
drop function if exists public.level_escamas(text, int, numeric);
drop function if exists public.level_escamas(text, int, boolean, numeric);
drop table if exists public.dungeon_progress;

create or replace function public.level_count() returns int
language sql immutable set search_path = '' as $$ select 4 $$;

-- Use new helper names: legacy migrations are replayed before 0056 when setup.sql is rerun.
create or replace function public.difficulty_level_count(p_difficulty text) returns int
language sql immutable set search_path = '' as $$
  select case when p_difficulty in ('f','e','d','c','b','a','s') then 4 end
$$;

create or replace function public.difficulty_level_coins(p_difficulty text) returns int
language sql immutable set search_path = '' as $$
  select case p_difficulty when 'f' then 60 when 'e' then 75 when 'd' then 95 when 'c' then 120
    when 'b' then 150 when 'a' then 180 when 's' then 210 end
$$;
create or replace function public.difficulty_level_chest(p_difficulty text) returns int
language sql immutable set search_path = '' as $$
  select case p_difficulty when 'f' then 1000 when 'e' then 1600 when 'd' then 2500 when 'c' then 1200
    when 'b' then 1500 when 'a' then 2000 when 's' then 2500 end
$$;
create or replace function public.difficulty_level_escamas(p_difficulty text, p_asc int, p_repeat boolean, p_mult numeric) returns int
language sql immutable set search_path = '' as $$
  select case when p_difficulty = 's' then
    case when p_repeat then floor(2 * (1 + 0.1 * p_asc) * 0.6 * p_mult)::int
         else round(2 * (1 + 0.1 * p_asc))::int end
    else 0 end
$$;

create or replace function public.step_unlocked(p_player uuid, p_difficulty text, p_asc int) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rank int := array_position(array['f','e','d','c','b','a','s'], p_difficulty);
  v_previous text;
begin
  if v_rank is null or p_asc is null or p_asc < 0 or p_asc > 5 then return false; end if;
  if p_difficulty = 'f' and p_asc = 0 then return true; end if;
  if p_asc > 0 then
    return exists (select 1 from public.step_clears
                    where player_id = p_player and difficulty = p_difficulty and ascension = p_asc - 1);
  end if;
  v_previous := (array['f','e','d','c','b','a','s'])[v_rank - 1];
  return exists (select 1 from public.step_clears
                  where player_id = p_player and difficulty = v_previous and ascension = 0);
end $$;

create or replace function public.route_cleared(p_player uuid, p_route text, p_difficulty text, p_asc int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select levels from public.route_progress
    where player_id = p_player and route = p_route and difficulty = p_difficulty and ascension = p_asc), 0)
$$;

-- Keep the public ranking RPC, but calculate its answer from the shared difficulty ladder.
create or replace function public.best_cleared_rank(p_player uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select difficulty from public.step_clears
    where player_id = p_player and ascension = 0
    order by array_position(array['f','e','d','c','b','a','s'], difficulty) desc limit 1), 'f')
$$;

create or replace function public.level_lock_reason(
  p_player uuid, p_route text, p_difficulty text, p_level int, p_asc int
) returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_done int;
begin
  if p_route is null or p_route not in ('lord_of_flies', 'ash_king', 'eternal_watcher', 'hollow_colossus',
      'thunder_king', 'mother_hydra', 'withered_queen', 'faceless_one', 'great_devourer')
     or p_difficulty is null or p_difficulty not in ('f','e','d','c','b','a','s')
     or p_level is null or p_level < 0 or p_level >= public.level_count()
     or p_asc is null or p_asc < 0 or p_asc > 5 then
    return 'level_locked';
  end if;
  if not public.step_unlocked(p_player, p_difficulty, p_asc) then return 'step_locked'; end if;
  v_done := public.route_cleared(p_player, p_route, p_difficulty, p_asc);
  if p_level > v_done then return 'level_locked'; end if;
  return null;
end $$;

create or replace function public.start_level(
  p_player uuid, p_character_id text, p_seed bigint, p_hero jsonb,
  p_route text, p_difficulty text, p_level int, p_asc int
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_why text;
begin
  if p_hero is null or jsonb_typeof(p_hero) <> 'object' or p_character_id is null then
    raise exception 'invalid_args';
  end if;
  if not exists (select 1 from public.characters where player_id = p_player and key = p_character_id) then
    raise exception 'character_not_found';
  end if;
  v_why := public.level_lock_reason(p_player, p_route, p_difficulty, p_level, p_asc);
  if v_why is not null then raise exception '%', v_why; end if;
  if coalesce((p_hero ->> 'sweep')::boolean, false) then
    if (select count(*) from public.runs where player_id = p_player and hero ->> 'kind' = 'level'
        and hero ->> 'sweep' = 'true' and started_at > now() - interval '1 hour') >= 600 then
      raise exception 'rate_limited';
    end if;
  elsif (select count(*) from public.runs where player_id = p_player and hero ->> 'kind' = 'level'
           and coalesce(hero ->> 'sweep', 'false') <> 'true' and started_at > now() - interval '1 hour') >= 200
     or (select count(*) from public.runs where player_id = p_player and hero ->> 'kind' = 'level'
           and coalesce(hero ->> 'sweep', 'false') <> 'true' and started_at > now() - interval '1 day') >= 1500 then
    raise exception 'rate_limited';
  end if;
  update public.runs set status = 'expired', finished_at = now()
   where player_id = p_player and status = 'open'
     and started_at < now() - interval '1 hour' * public.game_const('run_stale_hours');
  if exists (select 1 from public.runs where player_id = p_player and status = 'open') then
    raise exception 'run_open';
  end if;
  begin
    insert into public.runs (player_id, seed, hero)
    values (p_player, p_seed, p_hero || jsonb_build_object(
      'kind', 'level', 'route', p_route, 'difficulty', p_difficulty,
      'level', p_level, 'asc', p_asc, 'heroId', p_character_id)) returning id into v_id;
  exception when unique_violation then raise exception 'run_open';
  end;
  return jsonb_build_object('run_id', v_id);
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
    ), '{}'::jsonb)
  );
end $$;

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
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.difficulty_level_coins(p_difficulty) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count() then
      v_chest := round(public.difficulty_level_chest(p_difficulty) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.route_progress (player_id, route, difficulty, ascension, levels)
      values (p_player, p_route, p_difficulty, p_asc, p_level + 1)
      on conflict (player_id, route, difficulty, ascension) do update
        set levels = greatest(public.route_progress.levels, excluded.levels);
      if p_level + 1 = public.level_count() then
        insert into public.step_clears (player_id, difficulty, ascension)
        values (p_player, p_difficulty, p_asc) on conflict do nothing;
      end if;
    end if;

    -- Escamas (S+ only) follow the coin rules: +10% per ascension, repeats decay with the day's count.
    v_escamas := public.difficulty_level_escamas(p_difficulty, p_asc, v_repeat, case when v_repeat then public.level_decay(v_n) else 1 end);
    -- Dado cargado: only the last level of a dungeon S+; the server rolled it, SQL caps it at 2 per day.
    if p_dados > 0 then
      if public.rank_idx(p_difficulty) < public.rank_idx('s') or p_level + 1 < public.level_count() then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_dn < 2 then v_dado := 1; end if;
    end if;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_difficulty) + 1 then
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

revoke all on function public.level_count() from public, anon, authenticated;
revoke all on function public.difficulty_level_count(text) from public, anon, authenticated;
revoke all on function public.difficulty_level_coins(text) from public, anon, authenticated;
revoke all on function public.difficulty_level_chest(text) from public, anon, authenticated;
revoke all on function public.difficulty_level_escamas(text, int, boolean, numeric) from public, anon, authenticated;
revoke all on function public.step_unlocked(uuid, text, int) from public, anon, authenticated;
revoke all on function public.route_cleared(uuid, text, text, int) from public, anon, authenticated;
revoke all on function public.level_lock_reason(uuid, text, text, int, int) from public, anon, authenticated;
revoke all on function public.start_level(uuid, text, bigint, jsonb, text, text, int, int) from public, anon, authenticated;
revoke all on function public.bank_level(uuid, uuid, text, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.level_count() to service_role;
grant execute on function public.difficulty_level_count(text) to service_role;
grant execute on function public.difficulty_level_coins(text) to service_role;
grant execute on function public.difficulty_level_chest(text) to service_role;
grant execute on function public.difficulty_level_escamas(text, int, boolean, numeric) to service_role;
grant execute on function public.step_unlocked(uuid, text, int) to service_role;
grant execute on function public.route_cleared(uuid, text, text, int) to service_role;
grant execute on function public.level_lock_reason(uuid, text, text, int, int) to service_role;
grant execute on function public.start_level(uuid, text, bigint, jsonb, text, text, int, int) to service_role;
grant execute on function public.bank_level(uuid, uuid, text, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text) to service_role;
