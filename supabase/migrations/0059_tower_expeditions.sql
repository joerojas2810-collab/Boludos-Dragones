-- 0059: tower expeditions (docs/torre). The weekly tower becomes a server-authoritative run of
-- sectors of 10 nodes. The server stores the canonical state (tower_runs), folds the client's actions
-- itself (TypeScript reducer, src/lib/game/expedition.ts) and commits progress, per-node payouts,
-- ranking score and codex in ONE transaction (tower_run_commit). Everything is service_role only.
--  * Weeks are Buenos Aires Mondays (game_week_of); a run freezes week + deadline when it starts and
--    never lands in another week: after the deadline it ends as 'season'.
--  * Score = nodes fully resolved (tower_scores.max_floor), tie-break fewer won-fight turns
--    (tower_scores.rounds), then the SERVER time the milestone was reached (updated_at), then player id.
--  * Payouts: tower_node_paid, one row per (player, mode, week, node); only nodes 1..30 pay
--    (5 normal / 150 elite / 300 boss) and Collection mode gets 25 % EXP on those same first wins.
--    Mirror of expedition.ts TOWER_PAY / nodePay and tower.ts TOWER_XP.
--  * Weekly top 3 (unchanged amounts) now needs node 10 (the first boss) cleared.

-- ------------------------------------------------------------------ week authority
create or replace function public.game_week_of(p_ts timestamptz) returns date
language sql stable set search_path = ''
as $$ select date_trunc('week', p_ts at time zone public.game_tz())::date $$;

-- First instant of the week AFTER p_week (a Monday date): the deadline of its ranking.
create or replace function public.game_week_end(p_week date) returns timestamptz
language sql stable set search_path = ''
as $$ select ((p_week + 7)::timestamp at time zone public.game_tz()) $$;

-- ------------------------------------------------------------------ tables
create table if not exists public.tower_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  week date not null,                 -- ART Monday frozen at start (== state.weekKey)
  deadline timestamptz not null,      -- first instant of the next week
  seed bigint not null check (seed between 0 and 4294967295),
  engine_version int not null,
  catalog_version int not null,
  revision int not null default 0 check (revision >= 0),
  status text not null check (status in ('active', 'suspended', 'ended')),
  state jsonb not null check (pg_column_size(state) < 1000000),
  nodes int not null default 0 check (nodes between 0 and 500),
  turns int not null default 0 check (turns between 0 and 1000000),
  actions int not null default 0 check (actions >= 0),  -- validated actions so far (budget)
  hero_id text,                       -- owned hero that gets the EXP (collection mode)
  hero_class text,
  hero_element text,
  end_reason text check (end_reason is null or end_reason in ('death', 'draw', 'retired', 'season', 'limit', 'engine')),
  last_batch jsonb,                   -- {first, last, count} of the last committed batch (retry idempotency)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists tower_runs_one_open on public.tower_runs (player_id, mode)
  where status in ('active', 'suspended');
create index if not exists tower_runs_history on public.tower_runs (player_id, created_at desc);

create table if not exists public.tower_node_paid (
  player_id uuid not null references public.players (id) on delete cascade,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  week date not null,
  node int not null check (node between 1 and 500),
  kind text not null check (kind in ('normal', 'elite', 'boss')),
  coins int not null default 0,
  xp int not null default 0,
  run_id uuid references public.tower_runs (id) on delete set null,
  paid_at timestamptz not null default now(),
  primary key (player_id, mode, week, node)
);

create table if not exists public.tower_codex (
  player_id uuid primary key references public.players (id) on delete cascade,
  relics text[] not null default '{}',
  events text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.tower_runs enable row level security;
alter table public.tower_node_paid enable row level security;
alter table public.tower_codex enable row level security;
revoke all on public.tower_runs, public.tower_node_paid, public.tower_codex from anon, authenticated;
drop policy if exists deny_all on public.tower_runs;
create policy deny_all on public.tower_runs as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_all on public.tower_node_paid;
create policy deny_all on public.tower_node_paid as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_all on public.tower_codex;
create policy deny_all on public.tower_codex as restrictive for all to anon, authenticated using (false) with check (false);

-- Rankings of the current week were floors of the old tower: archive them, the new score is nodes.
do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0059_tower_expeditions') then
    insert into public.tower_scores_archive (week, mode, player_id, max_floor, updated_at, rounds)
    select week, mode, player_id, max_floor, updated_at, rounds
      from public.tower_scores where week >= public.game_week();
    delete from public.tower_scores where week >= public.game_week();
    insert into public.migration_flags (key) values ('0059_tower_expeditions');
  end if;
end $$;

-- ------------------------------------------------------------------ payouts
-- expedition.ts TOWER_PAY / TOWER_PAID_SECTORS (3 sectors x 10 nodes).
create or replace function public.tower_node_coins(p_node int, p_kind text) returns int
language sql immutable set search_path = ''
as $$ select case when p_node < 1 or p_node > 30 then 0
  else case p_kind when 'boss' then 300 when 'elite' then 150 when 'normal' then 5 else 0 end end $$;

-- tower.ts TOWER_XP: a quarter of FIGHT_XP (normal 100 / elite 250 / final 500), rounded.
create or replace function public.tower_node_xp(p_node int, p_kind text) returns int
language sql immutable set search_path = ''
as $$ select case when p_node < 1 or p_node > 30 then 0
  else case p_kind when 'boss' then 125 when 'elite' then 63 when 'normal' then 25 else 0 end end $$;

-- ------------------------------------------------------------------ ranking
-- Records the validated score of a run (best nodes of the week, then fewer turns). updated_at is the
-- SERVER time the milestone was reached. Only called by tower_run_commit. Same signature and parameter
-- names as 0055 (p_floor = nodes, p_rounds = turns) so that re-running the whole setup stays valid; it no
-- longer pays anything: node payouts live in tower_node_paid.
create or replace function public.tower_record(
  p_player uuid, p_mode text, p_floor int, p_rounds int, p_class text, p_element text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_nodes int;
  v_turns int;
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
  returning max_floor, rounds into v_nodes, v_turns;
  return jsonb_build_object('week', v_week, 'nodes', v_nodes, 'turns', v_turns);
end $$;

-- ------------------------------------------------------------------ runs
create or replace function public.tower_run_view(r public.tower_runs) returns jsonb
language sql stable set search_path = ''
as $$ select jsonb_build_object(
  'id', r.id, 'mode', r.mode, 'week', r.week, 'deadline', r.deadline, 'seed', r.seed,
  'engineVersion', r.engine_version, 'catalogVersion', r.catalog_version,
  'revision', r.revision, 'status', r.status, 'state', r.state, 'nodes', r.nodes, 'turns', r.turns,
  'actions', r.actions, 'lastBatch', r.last_batch, 'endReason', r.end_reason,
  'ageMs', (extract(epoch from (now() - r.created_at)) * 1000)::bigint) $$;

-- Ends an open run for a technical reason (season | engine | limit). Idempotent: an ended run is returned as is.
create or replace function public.tower_run_end(p_player uuid, p_run uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_run public.tower_runs;
begin
  if p_reason is null or p_reason not in ('season', 'engine', 'limit') then
    raise exception 'invalid_args';
  end if;
  select * into v_run from public.tower_runs where id = p_run and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status <> 'ended' then
    update public.tower_runs
       set status = 'ended', end_reason = p_reason, ended_at = now(), updated_at = now(),
           revision = v_run.revision + 1,
           state = v_run.state || jsonb_build_object(
             'phase', 'ended', 'battle', null, 'revision', v_run.revision + 1,
             'end', jsonb_build_object('reason', p_reason, 'node', v_run.nodes))
     where id = p_run
     returning * into v_run;
  end if;
  return public.tower_run_view(v_run);
end $$;

-- The open run of a mode (null if none). A run past its week deadline is closed as 'season' here.
create or replace function public.tower_run_current(p_player uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.tower_runs;
  v_closed jsonb := null;
begin
  if p_mode is null or p_mode not in ('nivelado', 'coleccion') then raise exception 'invalid_args'; end if;
  select * into v_run from public.tower_runs
   where player_id = p_player and mode = p_mode and status in ('active', 'suspended') for update;
  if found and now() >= v_run.deadline then
    v_closed := public.tower_run_end(p_player, v_run.id, 'season');
    v_run := null;
  end if;
  return jsonb_build_object('week', public.game_week(), 'run',
    case when v_run.id is null then null else public.tower_run_view(v_run) end, 'closed', v_closed);
end $$;

-- Creates the run (or returns the open one). The caller (server) builds the state from its own profile;
-- p_week must still be the current week or the call fails with week_changed and is retried.
create or replace function public.tower_run_create(
  p_player uuid, p_mode text, p_week date, p_seed bigint, p_engine int, p_catalog int,
  p_state jsonb, p_hero_id text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.tower_runs;
  v_cur jsonb;
begin
  if p_mode is null or p_mode not in ('nivelado', 'coleccion') or p_state is null
     or p_seed is null or p_seed < 0 or p_seed > 4294967295
     or p_state ->> 'mode' <> p_mode or p_state ->> 'weekKey' <> p_week::text
     or coalesce((p_state ->> 'revision')::int, -1) <> 0 then
    raise exception 'invalid_args';
  end if;
  if p_week <> public.game_week() then raise exception 'week_changed'; end if;
  v_cur := public.tower_run_current(p_player, p_mode);
  if jsonb_typeof(v_cur -> 'run') = 'object' then
    return jsonb_build_object('created', false, 'run', v_cur -> 'run');
  end if;
  begin
    insert into public.tower_runs (player_id, mode, week, deadline, seed, engine_version, catalog_version,
                                   status, state, hero_id, hero_class, hero_element)
    values (p_player, p_mode, p_week, public.game_week_end(p_week), p_seed, p_engine, p_catalog,
            'active', p_state, p_hero_id, p_state #>> '{hero,classId}', p_state #>> '{hero,element}')
    returning * into v_run;
  exception when unique_violation then
    select * into v_run from public.tower_runs
     where player_id = p_player and mode = p_mode and status in ('active', 'suspended');
    return jsonb_build_object('created', false, 'run', public.tower_run_view(v_run));
  end;
  return jsonb_build_object('created', true, 'run', public.tower_run_view(v_run));
end $$;

-- One atomic step: the new canonical state, the payouts of the nodes it won, the ranking score and
-- the codex. p_revision = the revision the server loaded (optimistic lock: 'conflict' = reload and refold).
-- p_paid = [{node, kind}] won fights newly in the ledger; the per-node unique row makes it idempotent.
create or replace function public.tower_run_commit(
  p_run uuid, p_player uuid, p_revision int, p_state jsonb, p_paid jsonb, p_added int, p_batch jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.tower_runs;
  v_phase text := p_state ->> 'phase';
  v_status text;
  v_reason text;
  v_nodes int := (p_state ->> 'nodes')::int;
  v_turns int := (p_state ->> 'turns')::int;
  v_rev int := (p_state ->> 'revision')::int;
  v_coins int := 0;
  v_xp int := 0;
  v_n int := 0;
  v_c int;
  v_x int;
  r record;
begin
  select * into v_run from public.tower_runs where id = p_run and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'ended' then raise exception 'run_ended'; end if;
  if v_run.revision <> p_revision then raise exception 'conflict'; end if;
  -- Past the week deadline nothing new is validated: the run ends as 'season' keeping what was confirmed.
  if now() >= v_run.deadline then
    return jsonb_build_object('season', true, 'run', public.tower_run_end(p_player, p_run, 'season'));
  end if;
  if p_state is null or v_phase is null or v_nodes is null or v_turns is null or v_rev is null
     or v_rev <= v_run.revision or v_nodes < v_run.nodes or v_nodes > 500 or v_turns < 0 or v_turns > 1000000
     or p_state ->> 'mode' <> v_run.mode or (p_state ->> 'seed')::bigint <> v_run.seed
     or p_state ->> 'weekKey' <> v_run.week::text
     or p_added is null or p_added < 0 or p_added > 1000 then
    raise exception 'invalid_args';
  end if;
  v_status := case v_phase when 'ended' then 'ended' when 'suspended' then 'suspended' else 'active' end;
  v_reason := case when v_status = 'ended' then p_state #>> '{end,reason}' else null end;
  if v_status = 'ended' and v_reason is null then raise exception 'invalid_args'; end if;

  for r in
    select (e ->> 'node')::int as node, e ->> 'kind' as kind
      from jsonb_array_elements(coalesce(p_paid, '[]'::jsonb)) e
  loop
    continue when r.node is null or r.node < 1 or r.node > 30 or r.kind is null or r.kind not in ('normal', 'elite', 'boss');
    v_c := public.tower_node_coins(r.node, r.kind);
    v_x := case when v_run.mode = 'coleccion' and v_run.hero_id is not null
                then public.tower_node_xp(r.node, r.kind) else 0 end;
    insert into public.tower_node_paid (player_id, mode, week, node, kind, coins, xp, run_id)
    values (p_player, v_run.mode, v_run.week, r.node, r.kind, v_c, v_x, p_run)
    on conflict do nothing;
    if found then
      v_coins := v_coins + v_c;
      v_xp := v_xp + v_x;
      v_n := v_n + 1;
    end if;
  end loop;
  if v_coins > 0 then
    update public.player_state set coins = coins + v_coins, version = version + 1 where player_id = p_player;
  end if;
  if v_xp > 0 then
    perform public.grant_hero_xp(p_player, v_run.hero_id, v_xp);
  end if;

  if v_nodes > 0 then
    perform public.tower_record(p_player, v_run.mode, v_nodes, v_turns,
                                p_state #>> '{hero,classId}', p_state #>> '{hero,element}');
  end if;

  insert into public.tower_codex (player_id, relics, events)
  values (p_player,
          array(select jsonb_array_elements_text(coalesce(p_state #> '{seen,relics}', '[]'::jsonb))),
          array(select jsonb_array_elements_text(coalesce(p_state #> '{seen,events}', '[]'::jsonb))))
  on conflict (player_id) do update
    set relics = array(select distinct x from unnest(public.tower_codex.relics || excluded.relics) x),
        events = array(select distinct x from unnest(public.tower_codex.events || excluded.events) x),
        updated_at = now();

  update public.tower_runs
     set state = p_state, revision = v_rev, status = v_status, nodes = v_nodes, turns = v_turns,
         actions = actions + p_added, end_reason = v_reason, last_batch = p_batch, updated_at = now(),
         ended_at = case when v_status = 'ended' then now() else null end
   where id = p_run;
  return jsonb_build_object('season', false, 'revision', v_rev, 'status', v_status,
    'prize', jsonb_build_object('nodes', v_n, 'coins', v_coins, 'xp', v_xp));
end $$;

-- Codex + history of a player: discovered relics/events, personal record, last ended runs.
create or replace function public.tower_codex_get(p_player uuid, p_mode text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_c public.tower_codex;
  v_best jsonb;
  v_hist jsonb;
begin
  if p_mode is not null and p_mode not in ('nivelado', 'coleccion') then raise exception 'invalid_args'; end if;
  select * into v_c from public.tower_codex where player_id = p_player;
  select jsonb_build_object('nodes', nodes, 'turns', turns) into v_best
    from public.tower_runs
   where player_id = p_player and nodes > 0 and (p_mode is null or mode = p_mode)
   order by nodes desc, turns asc, created_at asc limit 1;
  select coalesce(jsonb_agg(h order by (h ->> 'at') desc), '[]'::jsonb) into v_hist from (
    select jsonb_build_object('id', id, 'weekKey', week::text, 'mode', mode, 'nodes', nodes, 'turns', turns,
             'combats', coalesce((state ->> 'combats')::int, 0), 'heroName', state #>> '{hero,name}',
             'classId', hero_class, 'element', hero_element,
             'relics', coalesce(state -> 'relics', '[]'::jsonb), 'reason', end_reason,
             'killer', coalesce(state #> '{end,killer}', '[]'::jsonb), 'at', ended_at) as h
      from public.tower_runs
     where player_id = p_player and status = 'ended' and (p_mode is null or mode = p_mode)
     order by ended_at desc limit 20) t;
  return jsonb_build_object(
    'relics', to_jsonb(coalesce(v_c.relics, '{}'::text[])),
    'events', to_jsonb(coalesce(v_c.events, '{}'::text[])),
    'best', v_best, 'history', v_hist);
end $$;

-- ------------------------------------------------------------------ weekly prizes
-- Top 3 per finished week and mode; unchanged amounts, but now it needs the first boss (node 10).
create or replace function public.tower_settle(p_week date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  r record;
  v_place int;
  v_coins int[] := array[300, 200, 100];
  v_win jsonb;
  v_n int := 0;
begin
  if p_week is null or p_week >= public.game_week() then
    return jsonb_build_object('settled', 0);
  end if;
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    perform pg_advisory_xact_lock(hashtext('tower_settle:' || p_week::text || v_mode));
    if exists (select 1 from public.tower_settled where week = p_week and mode = v_mode) then
      continue;
    end if;
    v_win := '[]'::jsonb;
    v_place := 0;
    for r in
      select player_id, max_floor from public.tower_scores
       where week = p_week and mode = v_mode and max_floor >= 10
       order by max_floor desc, rounds asc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      perform public.grant_dado_capped(r.player_id, 1);
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor,
                                           'nodes', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- Everything the tower screen needs in one call. `floor`/`rounds` are kept as aliases of nodes/turns.
create or replace function public.tower_state(p_player uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := public.game_week();
  v_mode text;
  v_modes jsonb := '{}'::jsonb;
  v_last jsonb := '{}'::jsonb;
  v_king jsonb := '{}'::jsonb;
  v_active jsonb := '{}'::jsonb;
  v_top jsonb;
  v_mine jsonb;
  v_my public.tower_scores;
  v_run public.tower_runs;
  v_k record;
begin
  perform public.tower_settle(v_week - 7);
  perform public.tower_settle(v_week - 14);
  perform public.tower_settle_daily();
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    select coalesce(jsonb_agg(jsonb_build_object('place', t.place, 'player', t.player_id,
                    'name', t.name, 'floor', t.max_floor, 'nodes', t.max_floor, 'rounds', t.rounds,
                    'turns', t.rounds, 'at', t.updated_at, 'eligible', t.max_floor >= 10,
                    'class', t.hero_class, 'element', t.hero_element) order by t.place), '[]'::jsonb)
      into v_top
      from (
        select row_number() over (order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id) as place,
               s.player_id, p.name, s.max_floor, s.rounds, s.updated_at, s.hero_class, s.hero_element
          from public.tower_scores s join public.players p on p.id = s.player_id
         where s.week = v_week and s.mode = v_mode
         order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id
         limit 10
      ) t;
    select * into v_my from public.tower_scores
     where week = v_week and mode = v_mode and player_id = p_player;
    select * into v_run from public.tower_runs
     where player_id = p_player and mode = v_mode and status in ('active', 'suspended');
    if found then
      v_active := v_active || jsonb_build_object(v_mode, jsonb_build_object(
        'nodes', v_run.nodes, 'turns', v_run.turns, 'revision', v_run.revision, 'status', v_run.status,
        'week', v_run.week, 'deadline', v_run.deadline, 'stale', now() >= v_run.deadline));
    else
      v_active := v_active || jsonb_build_object(v_mode, null);
    end if;
    if v_my.player_id is not null then
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'nodes', v_my.max_floor,
        'rounds', v_my.rounds, 'turns', v_my.rounds, 'at', v_my.updated_at,
        'eligible', v_my.max_floor >= 10,
        'class', v_my.hero_class, 'element', v_my.hero_element,
        'paidFloors', (select count(*) from public.tower_node_paid
                        where week = v_week and mode = v_mode and player_id = p_player),
        'pending', coalesce(v_run.nodes > v_my.max_floor, false),
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
  return jsonb_build_object('week', v_week, 'weekKey', v_week::text, 'deadline', public.game_week_end(v_week),
    'modes', v_modes, 'last', v_last, 'king', v_king, 'activeByMode', v_active);
end $$;

revoke all on function public.game_week_of(timestamptz), public.game_week_end(date),
  public.tower_node_coins(int, text), public.tower_node_xp(int, text),
  public.tower_record(uuid, text, int, int, text, text), public.tower_run_view(public.tower_runs),
  public.tower_run_end(uuid, uuid, text), public.tower_run_current(uuid, text),
  public.tower_run_create(uuid, text, date, bigint, int, int, jsonb, text),
  public.tower_run_commit(uuid, uuid, int, jsonb, jsonb, int, jsonb),
  public.tower_codex_get(uuid, text) from public, anon, authenticated;
grant execute on function public.game_week_of(timestamptz), public.game_week_end(date),
  public.tower_node_coins(int, text), public.tower_node_xp(int, text),
  public.tower_record(uuid, text, int, int, text, text), public.tower_run_view(public.tower_runs),
  public.tower_run_end(uuid, uuid, text), public.tower_run_current(uuid, text),
  public.tower_run_create(uuid, text, date, bigint, int, int, jsonb, text),
  public.tower_run_commit(uuid, uuid, int, jsonb, jsonb, int, jsonb),
  public.tower_codex_get(uuid, text) to service_role;
