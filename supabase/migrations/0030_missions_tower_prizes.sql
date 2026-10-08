-- 0030: Run v2 final server pass.
--  * mission_claim pays the new SCOPE_TIERS (missions.ts): coins, cores, N parts and pieces.
--    Parts / pieces are rolled by the TS server (it needs the gear RNG) from the rank
--    best_cleared_rank() returns, and passed in; SQL validates counts, keys, rank and every piece
--    with grant_piece. Tiers keep paying once (claimed counter, row lock).
--  * Tower: floor prizes (tower_floor_paid, paid by tower_record, each floor once per week and
--    mode), the daily king (tower_daily: #1 of each ranking at 21:00 ART = 00:00 UTC, settled
--    lazily by the first request after it) and tower_settle ordered by rounds.
--  * bank_run only closes a run and pays coins: p_clear / p_loot / p_parts must be empty.
-- Keep the numbers in sync with SCOPE_TIERS (missions.ts) and TOWER_FLOOR_PRIZES /
-- TOWER_DAILY_PRIZE / TOWER_PRIZES (tower.ts).

-- ------------------------------------------------------------------ helpers
-- Highest dungeon rank fully cleared at ascension 0 ('f' when none).
create or replace function public.best_cleared_rank(p_player uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select t.r from unnest(array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']) with ordinality as t(r, i)
     where public.progress_cleared(p_player, t.r, 0) >= public.level_count(t.r)
     order by t.i desc limit 1), 'f')
$$;

-- Adds n cores of an element picked from a seed text. Internal.
create or replace function public.grant_core(p_player uuid, p_seed text, p_n int) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_els constant text[] := array['agua', 'fuego', 'viento', 'tierra', 'rayo'];
  k int;
begin
  for k in 1 .. p_n loop
    insert into public.part_stock (player_id, key, qty)
    values (p_player, 'core-' || v_els[1 + (abs(hashtext(p_seed || ':' || k::text)) % 5)], 1)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + 1, 9999);
  end loop;
end $$;

-- ------------------------------------------------------------------ missions
drop function if exists public.mission_claim(uuid, text, int);
create or replace function public.mission_claim(
  p_player uuid, p_scope text, p_reached int,
  p_parts jsonb default '{}'::jsonb, p_pieces jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_period date;
  v_row public.mission_state;
  v_coins int[];
  v_cores int[];
  v_parts int[];
  v_pieces int[];
  v_pay int := 0;
  v_core int := 0;
  v_np int := 0;
  v_nx int := 0;
  v_best int := public.rank_idx(public.best_cleared_rank(p_player));
  v_refund int := 0;
  v_got int := 0;
  v_key text;
  v_qty text;
  v_item jsonb;
  k int;
begin
  if p_scope not in ('daily', 'weekly', 'event') or p_reached is null or p_reached not between 1 and 3
     or p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;
  -- SCOPE_TIERS (missions.ts), one entry per tier (30 / 60 / 90 activity points).
  v_coins := case p_scope when 'daily' then array[0, 0, 250]
                          when 'weekly' then array[100, 100, 500]
                          else array[50, 100, 400] end;
  v_cores := case p_scope when 'daily' then array[0, 1, 0]
                          when 'weekly' then array[0, 0, 1]
                          else array[0, 0, 1] end;
  v_parts := case p_scope when 'daily' then array[2, 0, 0]
                          when 'weekly' then array[3, 0, 0]
                          else array[0, 0, 0] end;
  v_pieces := case p_scope when 'weekly' then array[0, 1, 0] else array[0, 0, 0] end;
  v_period := case when p_scope = 'daily' then public.game_day() else public.game_week() end;
  perform 1 from public.player_state where player_id = p_player for update;
  select * into v_row from public.mission_state
   where player_id = p_player and scope = p_scope and period = v_period for update;
  if not found or v_row.claimed >= p_reached then
    raise exception 'nothing_to_claim';
  end if;
  for k in v_row.claimed + 1 .. p_reached loop
    v_pay := v_pay + v_coins[k];
    v_core := v_core + v_cores[k];
    v_np := v_np + v_parts[k];
    v_nx := v_nx + v_pieces[k];
  end loop;

  -- Parts: exactly the promised amount, hand-weapon / gear parts at most at the best rank.
  if jsonb_array_length(p_pieces) <> v_nx or (select count(*) from jsonb_object_keys(p_parts)) > 20 then
    raise exception 'invalid_items';
  end if;
  for v_key, v_qty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
    if v_key !~ '^p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)$'
       or v_qty !~ '^[0-9]{1,2}$'
       or public.rank_idx(substring(v_key from '[^-]+$')) > v_best then
      raise exception 'invalid_items';
    end if;
    v_got := v_got + v_qty::int;
    insert into public.part_stock (player_id, key, qty) values (p_player, v_key, v_qty::int)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + excluded.qty, 9999);
  end loop;
  if v_got <> v_np then
    raise exception 'invalid_items';
  end if;
  for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
    if public.rank_idx(v_item ->> 'rarity') is null or public.rank_idx(v_item ->> 'rarity') > v_best then
      raise exception 'invalid_items';
    end if;
    if public.grant_piece(
         p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
         case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
         v_item -> 'lines', true) = 'refund' then
      v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
    end if;
  end loop;

  update public.mission_state set claimed = p_reached
   where player_id = p_player and scope = p_scope and period = v_period;
  update public.player_state set coins = coins + v_pay + v_refund, version = version + 1
   where player_id = p_player;
  perform public.grant_core(p_player, v_period::text || p_scope || p_player::text, v_core);
  return jsonb_build_object('coins', v_pay + v_refund, 'cores', v_core, 'parts', v_np,
                            'pieces', v_nx, 'claimed', p_reached);
end $$;

-- ------------------------------------------------------------------ tower tables
create table if not exists public.tower_floor_paid (
  week date not null,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  player_id uuid not null references public.players (id) on delete cascade,
  floor int not null check (floor between 1 and 500),
  primary key (week, mode, player_id, floor)
);
create table if not exists public.tower_daily (
  day date not null, -- ART date on which the 21:00 window ended
  mode text not null check (mode in ('nivelado', 'coleccion')),
  player_id uuid not null references public.players (id) on delete cascade,
  floor int not null,
  settled_at timestamptz not null default now(),
  primary key (day, mode)
);
alter table public.tower_floor_paid enable row level security;
alter table public.tower_daily enable row level security;
revoke all on public.tower_floor_paid, public.tower_daily from anon, authenticated;
drop policy if exists deny_all on public.tower_floor_paid;
create policy deny_all on public.tower_floor_paid as restrictive for all
  to anon, authenticated using (false) with check (false);
drop policy if exists deny_all on public.tower_daily;
create policy deny_all on public.tower_daily as restrictive for all
  to anon, authenticated using (false) with check (false);

-- towerFloorReward: floor 5 of each 10-cycle 100 coins + 1 core, floor 10 250 + 1, else 5.
create or replace function public.tower_floor_coins(p_floor int) returns int
language sql immutable set search_path = ''
as $$ select case ((p_floor - 1) % 10) + 1 when 10 then 250 when 5 then 100 else 5 end $$;
create or replace function public.tower_floor_cores(p_floor int) returns int
language sql immutable set search_path = ''
as $$ select case when ((p_floor - 1) % 10) + 1 in (5, 10) then 1 else 0 end $$;

-- Daily king: the window that ended at the last 00:00 UTC (21:00 ART). The #1 of each mode's
-- weekly ranking at that moment gets 250 coins + 1 core + the title (the tower_daily row).
-- Called first by tower_record and tower_state, so the ranking is still the one of the window.
-- ponytail: only the latest window is settled; days nobody opened the game are not paid.
create or replace function public.tower_settle_daily() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date - 1;
  v_week date := date_trunc('week', ((now() at time zone 'utc')::date - 1)::timestamp)::date;
  v_mode text;
  v_win record;
  v_n int := 0;
begin
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    perform pg_advisory_xact_lock(hashtext('tower_daily:' || v_day::text || v_mode));
    if exists (select 1 from public.tower_daily where day = v_day and mode = v_mode) then
      continue;
    end if;
    select player_id, max_floor into v_win from public.tower_scores
     where week = v_week and mode = v_mode and max_floor >= 1
     order by max_floor desc, rounds asc, updated_at asc, player_id
     limit 1;
    if not found then
      continue;
    end if;
    insert into public.tower_daily (day, mode, player_id, floor) values (v_day, v_mode, v_win.player_id, v_win.max_floor);
    update public.player_state set coins = coins + 250, version = version + 1
     where player_id = v_win.player_id;
    perform public.grant_core(v_win.player_id, 'king' || v_day::text || v_mode, 1);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Records a VERIFIED climb (the server replayed it) and pays the floors not paid yet this week.
create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int, p_rounds int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_floor int;
  v_rounds int;
  v_coins int;
  v_cores int;
  v_paid int;
  v_week date := public.game_week();
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500
     or p_rounds is null or p_rounds < 0 or p_rounds > 1000000 then
    raise exception 'invalid_args';
  end if;
  perform public.tower_settle_daily();
  insert into public.tower_scores (week, mode, player_id, max_floor, rounds)
  values (v_week, p_mode, p_player, p_floor, p_rounds)
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
                          then now() else public.tower_scores.updated_at end
  returning max_floor, rounds into v_floor, v_rounds;

  with ins as (
    insert into public.tower_floor_paid (week, mode, player_id, floor)
    select v_week, p_mode, p_player, g from generate_series(1, p_floor) as g
    on conflict do nothing
    returning floor
  )
  select coalesce(sum(public.tower_floor_coins(floor)), 0), coalesce(sum(public.tower_floor_cores(floor)), 0),
         count(*)
    into v_coins, v_cores, v_paid from ins;
  if v_paid > 0 then
    update public.player_state set coins = coins + v_coins, version = version + 1
     where player_id = p_player;
    perform public.grant_core(p_player, v_week::text || p_mode || p_player::text || p_floor::text, v_cores);
  end if;
  return jsonb_build_object('week', v_week, 'max_floor', v_floor, 'rounds', v_rounds,
                            'prize', jsonb_build_object('floors', v_paid, 'coins', v_coins, 'cores', v_cores));
end $$;

-- Weekly prizes (TOWER_PRIZES, unchanged); ties now break by fewer rounds.
create or replace function public.tower_settle(p_week date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  r record;
  v_place int;
  v_coins int[] := array[300, 200, 100];
  v_cores int[] := array[2, 1, 1];
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
       where week = p_week and mode = v_mode and max_floor >= 8
       order by max_floor desc, rounds asc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      perform public.grant_core(r.player_id, p_week::text || r.player_id::text, v_cores[v_place]);
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- tower_state (0029) + the current daily kings and my paid floors.
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
                    'name', t.name, 'floor', t.max_floor, 'rounds', t.rounds) order by t.place), '[]'::jsonb)
      into v_top
      from (
        select row_number() over (order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id) as place,
               s.player_id, p.name, s.max_floor, s.rounds
          from public.tower_scores s join public.players p on p.id = s.player_id
         where s.week = v_week and s.mode = v_mode
         order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id
         limit 10
      ) t;
    select * into v_my from public.tower_scores
     where week = v_week and mode = v_mode and player_id = p_player;
    if found then
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'rounds', v_my.rounds,
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
    -- The latest daily king of this mode (holds the title until the next window).
    select d.day, d.floor, p.name, d.player_id into v_k
      from public.tower_daily d join public.players p on p.id = d.player_id
     where d.mode = v_mode order by d.day desc limit 1;
    v_king := v_king || jsonb_build_object(v_mode,
      case when v_k.day is null then null else jsonb_build_object(
        'day', v_k.day, 'name', v_k.name, 'floor', v_k.floor, 'me', v_k.player_id = p_player) end);
  end loop;
  return jsonb_build_object('week', v_week, 'modes', v_modes, 'last', v_last, 'king', v_king);
end $$;

-- ------------------------------------------------------------------ bank_run
-- 0024 minus loot / parts / clear bonus: dungeon levels pay through bank_level now, so the
-- old run closer accepts only coins (the tower pays 0). The three extra parameters stay so the
-- signature does not change; any non-empty value is refused.
create or replace function public.bank_run(
  p_player uuid, p_run_id uuid, p_coins int, p_max_floor int,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null,
  p_loot jsonb default '[]'::jsonb,
  p_clear jsonb default null,
  p_parts jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.runs;
  v_floor int;
  v_cap bigint;
  v_coins int;
  v_capped boolean;
  v_verdict text := coalesce(p_verdict, 'accepted');
  v_new_coins int;
  v_best int;
begin
  if p_coins is null or p_coins < 0 or p_max_floor is null or p_max_floor < 0
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut')
     or p_clear is not null
     or p_loot is distinct from '[]'::jsonb
     or p_parts is distinct from '{}'::jsonb then
    raise exception 'invalid_args';
  end if;
  select * into v_run from public.runs
   where id = p_run_id and player_id = p_player for update;
  if not found then
    raise exception 'run_not_found';
  end if;
  if v_run.status = 'closed' then
    raise exception 'duplicate_run';
  end if;
  if v_run.status <> 'open' then
    raise exception 'run_expired';
  end if;

  v_floor := least(p_max_floor, public.game_const('run_max_floor'));
  v_cap := v_floor::bigint * public.game_const('run_coins_per_floor_base')
         + public.game_const('run_coins_per_floor_slope')::bigint * v_floor * (v_floor + 1) / 2;
  v_capped := p_max_floor > v_floor or p_coins > v_cap;
  v_coins := least(p_coins::bigint, v_cap)::int;
  if v_verdict = 'rejected' then
    v_coins := 0;
    v_floor := 0;
  elsif v_capped and v_verdict = 'accepted' then
    v_verdict := 'capped';
  end if;

  update public.runs
     set status = 'closed', finished_at = now(), max_floor = v_floor, coins_earned = v_coins
   where id = p_run_id;
  insert into public.run_submissions (run_id, player_id, log, verdict, reason)
  values (p_run_id, p_player, p_log, v_verdict, left(p_reason, 300));

  update public.player_state
     set coins = coins + v_coins, version = version + 1
   where player_id = p_player
   returning coins into v_new_coins;
  if not found then
    raise exception 'player_not_found';
  end if;
  update public.players set best_floor = greatest(best_floor, v_floor)
   where id = p_player
   returning best_floor into v_best;
  insert into public.weekly_scores (week, player_id, max_floor)
  values (public.game_week(), p_player, v_floor)
  on conflict (week, player_id) do update
    set max_floor = greatest(public.weekly_scores.max_floor, excluded.max_floor);

  if v_capped or v_verdict in ('rejected', 'cut') then
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'run_' || v_verdict, jsonb_build_object(
      'run_id', p_run_id, 'claimed_coins', p_coins, 'claimed_floor', p_max_floor,
      'credited_coins', v_coins, 'credited_floor', v_floor));
  end if;

  return jsonb_build_object(
    'coinsAdded', v_coins, 'coins', v_new_coins, 'bestFloor', v_best, 'capped', v_capped);
end $$;

revoke all on function public.tower_settle_daily(), public.tower_floor_coins(int), public.tower_floor_cores(int),
  public.best_cleared_rank(uuid), public.grant_core(uuid, text, int) from public, anon, authenticated;
grant execute on function public.tower_settle_daily(), public.best_cleared_rank(uuid) to service_role;
