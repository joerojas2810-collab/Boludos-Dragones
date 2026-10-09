-- Boludos & Dragones: full database setup (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0001_schema.sql =====
-- 0001_schema: tables, constraints, indexes, constants and clock helpers.
-- Ids match src/lib/game (Spanish): class caballero|mago|picaro|clerigo,
-- element agua|fuego|viento|tierra|rayo, rarity comun|pococomun|raro|epico|legendario,
-- weapon type espada|hacha|lanza|arco|baston|daga.
-- Idempotent: safe to re-run (create ... if not exists).

-- ---------------------------------------------------------------- constants
create table if not exists public.game_constants (
  key text primary key,
  value int not null
);

insert into public.game_constants (key, value) values
  ('pull_cost_character', 150),
  ('pull_cost_weapon', 150),
  ('multi_pull', 10),
  ('multi_discount_pct', 10),
  ('duplicate_refund_pct', 50),
  ('fragments_per_star', 3),
  ('pity_threshold', 30),
  ('max_stars', 5),
  ('starting_coins', 300),
  ('run_coins_per_floor_base', 120),
  ('run_coins_per_floor_slope', 15),
  ('run_max_floor', 500),
  ('run_stale_hours', 6),
  ('run_state_max_bytes', 200000),
  ('max_room_players', 7),
  ('room_hours', 12),
  ('initial_chips', 100),
  ('min_bet', 10),
  ('interfere_cost', 30),
  ('join_fail_max', 10),
  ('join_fail_window_s', 600),
  ('ip_fail_max', 20),
  ('ip_window_s', 900),
  ('name_fail_step', 5),
  ('name_hard_lock', 20),
  ('name_wait_base_s', 60),
  ('name_wait_max_s', 3600)
on conflict (key) do nothing;

-- ------------------------------------------------------------------- clock
create or replace function public.game_tz() returns text
language sql immutable set search_path = ''
as $$ select 'America/Argentina/Buenos_Aires'::text $$;

create or replace function public.game_day() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone public.game_tz())::date $$;

-- Monday of the current week in the game time zone.
create or replace function public.game_week() returns date
language sql stable set search_path = ''
as $$ select date_trunc('week', now() at time zone public.game_tz())::date $$;

create or replace function public.game_const(p_key text) returns int
language plpgsql stable set search_path = ''
as $$
declare v int;
begin
  select value into v from public.game_constants where key = p_key;
  if v is null then
    raise exception 'missing_constant';
  end if;
  return v;
end $$;

-- ------------------------------------------------------------------ players
create table if not exists public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 16),
  name_key text not null unique check (char_length(name_key) between 2 and 16),
  best_floor int not null default 0 check (best_floor >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.player_state (
  player_id uuid primary key references public.players (id) on delete cascade,
  coins int not null default 0 check (coins >= 0),
  version int not null default 0
);

create table if not exists public.gacha_state (
  player_id uuid not null references public.players (id) on delete cascade,
  banner text not null check (banner in ('character', 'weapon')),
  pity int not null default 0 check (pity between 0 and 30),
  primary key (player_id, banner)
);

-- --------------------------------------------------------------- collection
create table if not exists public.characters (
  player_id uuid not null references public.players (id) on delete cascade,
  class text not null check (class in ('caballero', 'mago', 'picaro', 'clerigo')),
  element text not null check (element in ('agua', 'fuego', 'viento', 'tierra', 'rayo')),
  rarity text not null check (rarity in ('comun', 'pococomun', 'raro', 'epico', 'legendario')),
  key text generated always as ('c-' || class || '-' || element || '-' || rarity) stored,
  stars int not null default 0 check (stars between 0 and 5),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 4096),
  created_at timestamptz not null default now(),
  primary key (player_id, class, element, rarity),
  unique (player_id, key)
);

create table if not exists public.weapons (
  player_id uuid not null references public.players (id) on delete cascade,
  type text not null check (type in ('espada', 'hacha', 'lanza', 'arco', 'baston', 'daga')),
  element text not null check (element in ('agua', 'fuego', 'viento', 'tierra', 'rayo')),
  rarity text not null check (rarity in ('comun', 'pococomun', 'raro', 'epico', 'legendario')),
  key text generated always as ('w-' || type || '-' || element || '-' || rarity) stored,
  stars int not null default 0 check (stars between 0 and 5),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 4096),
  created_at timestamptz not null default now(),
  primary key (player_id, type, element, rarity),
  unique (player_id, key)
);

-- One weapon per hero, and a weapon can be on one hero only.
create table if not exists public.equipment (
  player_id uuid not null references public.players (id) on delete cascade,
  character_key text not null,
  weapon_key text not null,
  primary key (player_id, character_key),
  unique (player_id, weapon_key),
  foreign key (player_id, character_key) references public.characters (player_id, key) on delete cascade,
  foreign key (player_id, weapon_key) references public.weapons (player_id, key) on delete cascade
);

create table if not exists public.fragments (
  player_id uuid not null references public.players (id) on delete cascade,
  class text not null check (class in ('caballero', 'mago', 'picaro', 'clerigo')),
  rarity text not null check (rarity in ('comun', 'pococomun', 'raro', 'epico', 'legendario')),
  qty int not null default 0 check (qty >= 0),
  primary key (player_id, class, rarity)
);

-- ------------------------------------------------------------------- gacha
create table if not exists public.pulls (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  banner text not null check (banner in ('character', 'weapon')),
  cost int not null check (cost >= 0),
  daily boolean not null default false,
  seed bigint,
  items jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (player_id, idempotency_key)
);

create table if not exists public.daily_claims (
  player_id uuid not null references public.players (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (player_id, day)
);

create table if not exists public.weekly_seeds (
  week date primary key,
  seed bigint not null check (seed between 0 and 4294967295)
);

create table if not exists public.weekly_scores (
  week date not null,
  player_id uuid not null references public.players (id) on delete cascade,
  max_floor int not null default 0 check (max_floor >= 0),
  primary key (week, player_id)
);
create index if not exists weekly_scores_player_idx on public.weekly_scores (player_id);

-- -------------------------------------------------------------------- runs
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  seed bigint not null check (seed between 0 and 4294967295),
  hero jsonb not null check (pg_column_size(hero) < 8192),
  state jsonb,
  log_len int not null default 0 check (log_len >= 0),
  max_floor int not null default 0 check (max_floor >= 0),
  coins_earned int not null default 0 check (coins_earned >= 0),
  status text not null default 'open' check (status in ('open', 'closed', 'expired')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists one_open_run on public.runs (player_id) where status = 'open';

create table if not exists public.run_submissions (
  id bigint generated always as identity primary key,
  run_id uuid not null unique references public.runs (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  log jsonb check (log is null or pg_column_size(log) < 500000),
  verdict text not null check (verdict in ('accepted', 'capped', 'rejected', 'cut')),
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists run_submissions_player_idx on public.run_submissions (player_id);

-- ------------------------------------------------------------------- rooms
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z]{4}$'),
  host_id uuid not null references public.players (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  turn_seconds int not null default 30 check (turn_seconds between 10 and 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);
-- A code is reusable only once its room is closed; one open room per host.
create unique index if not exists rooms_open_code_uq on public.rooms (code) where status = 'open';
create unique index if not exists rooms_open_host_uq on public.rooms (host_id) where status = 'open';

create table if not exists public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  chips int not null default 0 check (chips >= 0),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, player_id)
);
create index if not exists room_players_player_idx on public.room_players (player_id);

create table if not exists public.room_battles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  battle_key text not null check (char_length(battle_key) between 1 and 80),
  fighter_id uuid not null references public.players (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'locked', 'settled')),
  outcome text check (outcome in ('win', 'lose')),
  created_at timestamptz not null default now(),
  unique (room_id, battle_key)
);
create index if not exists room_battles_fighter_idx on public.room_battles (fighter_id);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  battle_key text not null,
  bettor_id uuid not null,
  prediction text not null check (prediction in ('win', 'lose')),
  stake int not null check (stake >= 10),
  status text not null default 'open' check (status in ('open', 'settled', 'void')),
  payout int not null default 0 check (payout >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (room_id, battle_key, bettor_id),
  foreign key (room_id, battle_key) references public.room_battles (room_id, battle_key) on delete cascade,
  foreign key (room_id, bettor_id) references public.room_players (room_id, player_id) on delete cascade
);
create index if not exists bets_bettor_idx on public.bets (room_id, bettor_id);

create table if not exists public.interferences (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  battle_key text not null,
  from_player uuid not null,
  kind text not null check (kind in ('stronger_enemy', 'adverse_element')),
  cost int not null check (cost > 0),
  created_at timestamptz not null default now(),
  unique (room_id, battle_key),
  foreign key (room_id, battle_key) references public.room_battles (room_id, battle_key) on delete cascade,
  foreign key (room_id, from_player) references public.room_players (room_id, player_id) on delete cascade
);
create index if not exists interferences_from_idx on public.interferences (room_id, from_player);

create table if not exists public.chip_ledger (
  id bigint generated always as identity primary key,
  room_id uuid not null,
  player_id uuid not null,
  delta int not null,
  reason text not null check (reason in ('initial', 'bet_stake', 'bet_win', 'bet_refund', 'interfere')),
  ref text,
  created_at timestamptz not null default now(),
  foreign key (room_id, player_id) references public.room_players (room_id, player_id) on delete cascade
);
create index if not exists chip_ledger_room_player_idx on public.chip_ledger (room_id, player_id);

-- ------------------------------------------------- server-only bookkeeping
create table if not exists public.auth_attempts (
  key text primary key,            -- 'name:<name_key>' or 'ip:<ip>'
  fails int not null default 0 check (fails >= 0),
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  hard_locked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.rate_limit_hits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0 check (hits >= 0)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  event text not null check (char_length(event) between 1 and 80),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 16000)
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- ===== 0002_rls.sql =====
-- 0002_rls: default deny. RLS on EVERY table in public; clients get SELECT on
-- their own rows only (plus leaderboard-style public reads with minimal
-- columns). No client INSERT/UPDATE/DELETE anywhere: the server writes with
-- the service_role key (bypasses RLS) through the functions in 0003.

-- 1. Future objects created in public must not be exposed to API roles by default.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- 2. Every existing table: RLS on, no grants to anon/authenticated.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;

-- 3. Membership helper (security definer: avoids recursive policies).
-- Lives in the `private` schema, which the REST API does not expose, so it cannot be
-- called via /rest/v1/rpc (Security Advisor lint 0029). RLS policies can still call it.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room
      and player_id = (select auth.uid())
      and left_at is null
  )
$$;
revoke all on function private.is_room_member(uuid) from public, anon;
grant execute on function private.is_room_member(uuid) to authenticated;

-- 4. SELECT grants (column-limited for players so name_key / is_admin stay private).
grant select (id, name, best_floor) on public.players to authenticated;
grant select on
  public.player_state, public.gacha_state, public.characters, public.weapons,
  public.equipment, public.fragments, public.pulls, public.daily_claims,
  public.weekly_seeds, public.weekly_scores, public.runs,
  public.rooms, public.room_players, public.room_battles, public.bets,
  public.interferences, public.chip_ledger
to authenticated;
-- No grants and no policies (deny all) for: game_constants, run_submissions,
-- auth_attempts, rate_limit_hits, audit_log.

-- 5. Policies (SELECT only).
drop policy if exists players_read on public.players;
create policy players_read on public.players
  for select to authenticated using (true);

drop policy if exists player_state_own on public.player_state;
create policy player_state_own on public.player_state
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists gacha_state_own on public.gacha_state;
create policy gacha_state_own on public.gacha_state
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists characters_own on public.characters;
create policy characters_own on public.characters
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists weapons_own on public.weapons;
create policy weapons_own on public.weapons
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists equipment_own on public.equipment;
create policy equipment_own on public.equipment
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists fragments_own on public.fragments;
create policy fragments_own on public.fragments
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists pulls_own on public.pulls;
create policy pulls_own on public.pulls
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists daily_claims_own on public.daily_claims;
create policy daily_claims_own on public.daily_claims
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists weekly_seeds_read on public.weekly_seeds;
create policy weekly_seeds_read on public.weekly_seeds
  for select to authenticated using (true);

drop policy if exists weekly_scores_read on public.weekly_scores;
create policy weekly_scores_read on public.weekly_scores
  for select to authenticated using (true);

drop policy if exists runs_own on public.runs;
create policy runs_own on public.runs
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists rooms_member on public.rooms;
create policy rooms_member on public.rooms
  for select to authenticated using (private.is_room_member(id));

drop policy if exists room_players_member on public.room_players;
create policy room_players_member on public.room_players
  for select to authenticated using (private.is_room_member(room_id));

drop policy if exists room_battles_member on public.room_battles;
create policy room_battles_member on public.room_battles
  for select to authenticated using (private.is_room_member(room_id));

drop policy if exists bets_member on public.bets;
create policy bets_member on public.bets
  for select to authenticated using (private.is_room_member(room_id));

drop policy if exists interferences_member on public.interferences;
create policy interferences_member on public.interferences
  for select to authenticated using (private.is_room_member(room_id));

drop policy if exists chip_ledger_member on public.chip_ledger;
create policy chip_ledger_member on public.chip_ledger
  for select to authenticated using (private.is_room_member(room_id));

-- 6. Leaderboard: minimal columns, evaluated with the caller's rights.
create or replace view public.leaderboard with (security_invoker = on) as
  select id, name, best_floor from public.players;
revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to authenticated;

-- ===== 0003_functions.sql =====
-- 0003_functions: server-authoritative functions. All are SECURITY DEFINER with
-- search_path = '' and are executable ONLY by service_role (see the lockdown
-- block at the end). Gameplay randomness is NOT implemented here: the Next.js
-- server rolls with the seeded TS engine and passes results; SQL validates
-- invariants (coins, caps, uniqueness, pity coherence) and persists atomically.
-- Errors are exceptions whose message is the code (see supabase/CONTRACT.md).

-- ======================================================== players / audit
create or replace function public.create_player(
  p_user uuid, p_name text, p_name_key text, p_is_admin boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or p_name is null or p_name_key is null
     or char_length(p_name) not between 2 and 16
     or char_length(p_name_key) not between 2 and 16 then
    raise exception 'invalid_name';
  end if;
  begin
    insert into public.players (id, name, name_key, is_admin)
    values (p_user, p_name, p_name_key, coalesce(p_is_admin, false));
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  insert into public.player_state (player_id, coins)
  values (p_user, public.game_const('starting_coins'));
  insert into public.gacha_state (player_id, banner)
  values (p_user, 'character'), (p_user, 'weapon');
  return jsonb_build_object('player_id', p_user);
end $$;

create or replace function public.log_audit(
  p_actor uuid, p_event text, p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor, event, detail)
  values (
    p_actor,
    left(coalesce(p_event, 'unknown'), 80),
    case
      when p_detail is not null and pg_column_size(p_detail) < 8000 then p_detail
      else jsonb_build_object('truncated', true)
    end
  );
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
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars, 'data', c.data
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars, 'data', w.data
      ) order by w.created_at, w.key)
      from public.weapons w where w.player_id = p_player
    ), '[]'::jsonb),
    'equipped', coalesce((
      select jsonb_object_agg(e.character_key, e.weapon_key)
      from public.equipment e where e.player_id = p_player
    ), '{}'::jsonb),
    'fragments', coalesce((
      select jsonb_object_agg(f.class || ':' || f.rarity, f.qty)
      from public.fragments f where f.player_id = p_player and f.qty > 0
    ), '{}'::jsonb)
  );
end $$;

create or replace function public.game_clock() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'now', now(), 'day', public.game_day(), 'week', public.game_week(), 'tz', public.game_tz()
  )
$$;

create or replace function public.get_weekly_seed(p_seed bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_seed bigint;
begin
  insert into public.weekly_seeds (week, seed)
  values (public.game_week(), p_seed)
  on conflict (week) do nothing;
  select seed into v_seed from public.weekly_seeds where week = public.game_week();
  return jsonb_build_object('week', public.game_week(), 'seed', v_seed);
end $$;

-- Housekeeping, call occasionally from a server job (not required).
create or replace function public.purge_stale() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_a int; v_r int;
begin
  delete from public.auth_attempts
   where not hard_locked and updated_at < now() - interval '1 day';
  get diagnostics v_a = row_count;
  delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  get diagnostics v_r = row_count;
  return jsonb_build_object('auth_attempts', v_a, 'rate_limit_hits', v_r);
end $$;

-- ================================================= login attempts / limits
-- Never raises for expected failures: the counter update must persist.
create or replace function public.auth_check(p_name_key text, p_ip text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_n public.auth_attempts;
  v_i public.auth_attempts;
  v_win int := public.game_const('ip_window_s');
begin
  select * into v_n from public.auth_attempts
   where key = 'name:' || left(coalesce(p_name_key, ''), 64);
  if found then
    if v_n.hard_locked then
      return jsonb_build_object('allowed', false, 'reason', 'locked', 'retry_after', 0);
    end if;
    if v_n.locked_until is not null and v_n.locked_until > now() then
      return jsonb_build_object(
        'allowed', false, 'reason', 'wait',
        'retry_after', ceil(extract(epoch from (v_n.locked_until - now())))::int
      );
    end if;
  end if;

  if coalesce(p_ip, '') <> '' then
    select * into v_i from public.auth_attempts where key = 'ip:' || left(p_ip, 64);
    if found
       and v_i.window_start > now() - interval '1 second' * v_win
       and v_i.fails >= public.game_const('ip_fail_max') then
      return jsonb_build_object(
        'allowed', false, 'reason', 'ip_limited',
        'retry_after', ceil(extract(epoch from (v_i.window_start + interval '1 second' * v_win - now())))::int
      );
    end if;
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'retry_after', 0);
end $$;

create or replace function public.auth_fail(p_name_key text, p_ip text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_nk text := 'name:' || left(coalesce(p_name_key, ''), 64);
  v_fails int;
  v_step int := public.game_const('name_fail_step');
  v_win int := public.game_const('ip_window_s');
  v_wait int;
begin
  -- Counts unknown names too, so "no such user" and "locked" look the same.
  insert into public.auth_attempts (key, fails, window_start, updated_at)
  values (v_nk, 1, now(), now())
  on conflict (key) do update
    set fails = public.auth_attempts.fails + 1, updated_at = now()
  returning fails into v_fails;

  if v_fails >= public.game_const('name_hard_lock') then
    update public.auth_attempts set hard_locked = true, locked_until = null where key = v_nk;
    insert into public.audit_log (event, detail)
    values ('login_hard_lock', jsonb_build_object('name_key', left(coalesce(p_name_key, ''), 64)));
  elsif v_fails % v_step = 0 then
    -- 5 fails: 60 s, 10: 120 s, 15: 240 s ... capped.
    v_wait := least(
      public.game_const('name_wait_max_s'),
      public.game_const('name_wait_base_s') * (1 << ((v_fails / v_step) - 1))
    );
    update public.auth_attempts
       set locked_until = now() + interval '1 second' * v_wait
     where key = v_nk;
    insert into public.audit_log (event, detail)
    values ('login_wait', jsonb_build_object(
      'name_key', left(coalesce(p_name_key, ''), 64), 'fails', v_fails, 'wait_s', v_wait));
  end if;

  if coalesce(p_ip, '') <> '' then
    insert into public.auth_attempts (key, fails, window_start, updated_at)
    values ('ip:' || left(p_ip, 64), 1, now(), now())
    on conflict (key) do update set
      fails = case
        when public.auth_attempts.window_start < now() - interval '1 second' * v_win then 1
        else public.auth_attempts.fails + 1 end,
      window_start = case
        when public.auth_attempts.window_start < now() - interval '1 second' * v_win then now()
        else public.auth_attempts.window_start end,
      updated_at = now();
  end if;

  return public.auth_check(p_name_key, p_ip);
end $$;

create or replace function public.auth_success(p_name_key text, p_ip text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.auth_attempts
   where key = 'name:' || left(coalesce(p_name_key, ''), 64) and not hard_locked;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reset_pin(p_admin uuid, p_name_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_target uuid;
begin
  if not coalesce((select is_admin from public.players where id = p_admin), false) then
    insert into public.audit_log (actor, event, detail)
    values (p_admin, 'admin_reset_denied', jsonb_build_object('name_key', left(coalesce(p_name_key, ''), 64)));
    raise exception 'forbidden';
  end if;
  select id into v_target from public.players where name_key = p_name_key;
  if v_target is null then
    raise exception 'player_not_found';
  end if;
  delete from public.auth_attempts where key = 'name:' || p_name_key;
  insert into public.audit_log (actor, event, detail)
  values (p_admin, 'admin_reset_pin', jsonb_build_object('target', v_target));
  return jsonb_build_object('player_id', v_target);
end $$;

create or replace function public.rate_limit_hit(
  p_key text, p_max int, p_window_seconds int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_hits int;
begin
  if p_key is null or char_length(p_key) > 120 or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid_args';
  end if;
  insert into public.rate_limit_hits (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case
      when public.rate_limit_hits.window_start < now() - interval '1 second' * p_window_seconds then 1
      else public.rate_limit_hits.hits + 1 end,
    window_start = case
      when public.rate_limit_hits.window_start < now() - interval '1 second' * p_window_seconds then now()
      else public.rate_limit_hits.window_start end
  returning hits into v_hits;
  return jsonb_build_object('allowed', v_hits <= p_max, 'hits', v_hits);
end $$;

-- ===================================================== gacha / collection
-- p_items (1..10), in pull order:
--   character: {"class","element","rarity","data":{...}}
--   weapon:    {"type","element","rarity","data":{...}}
-- SQL recomputes: duplicate -> +1 star, duplicate at max stars -> coin refund,
-- new character with an owned same class+rarity -> +1 fragment, pity coherence,
-- price, coins. `data` is only stored when the item is new.
-- ponytail: stat magnitudes inside data are not range-checked here; only the
-- server writes it. Add per-class ranges if that ever changes.
create or replace function public.apply_pull(
  p_player uuid, p_version int, p_idem text, p_banner text, p_cost int,
  p_pity int, p_seed bigint, p_daily boolean, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_prev public.pulls;
  v_n int;
  v_unit int;
  v_expected int;
  v_old_pity int;
  v_run_pity int;
  v_thr int := public.game_const('pity_threshold');
  v_max_stars int := public.game_const('max_stars');
  v_item jsonb;
  v_data jsonb;
  v_cls text;
  v_typ text;
  v_el text;
  v_rar text;
  v_key text;
  v_stars int;
  v_status text;
  v_refund int;
  v_refund_total int := 0;
  v_frag int;
  v_fkey text;
  v_results jsonb := '[]'::jsonb;
  v_coins int;
  v_version int;
  v_out jsonb;
  v_daily boolean := coalesce(p_daily, false);
begin
  if p_banner is null or p_banner not in ('character', 'weapon')
     or p_idem is null or char_length(p_idem) not between 8 and 80
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  -- Serialize everything for this player.
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  -- Idempotency first: a replay must not fail on the (now bumped) version.
  select * into v_prev from public.pulls
   where player_id = p_player and idempotency_key = p_idem;
  if found then
    return v_prev.result || jsonb_build_object('replayed', true);
  end if;

  if p_version is distinct from v_state.version then
    raise exception 'conflict' using errcode = '40001';
  end if;

  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > public.game_const('multi_pull') then
    raise exception 'invalid_items';
  end if;

  v_unit := case p_banner
    when 'character' then public.game_const('pull_cost_character')
    else public.game_const('pull_cost_weapon') end;
  if v_daily then
    if v_n <> 1 then
      raise exception 'invalid_items';
    end if;
    v_expected := 0;
  elsif v_n = public.game_const('multi_pull') then
    v_expected := round(v_unit * v_n * (100 - public.game_const('multi_discount_pct')) / 100.0)::int;
  else
    v_expected := v_unit * v_n;
  end if;
  if p_cost is distinct from v_expected then
    raise exception 'invalid_cost';
  end if;
  if v_state.coins < v_expected then
    raise exception 'insufficient_coins';
  end if;

  if v_daily then
    begin
      insert into public.daily_claims (player_id, day) values (p_player, public.game_day());
    exception when unique_violation then
      raise exception 'already_claimed';
    end;
  end if;

  select pity into v_old_pity from public.gacha_state
   where player_id = p_player and banner = p_banner for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_run_pity := v_old_pity;

  for v_item in
    select t.e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by t.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_el := v_item ->> 'element';
    v_rar := v_item ->> 'rarity';
    v_data := coalesce(v_item -> 'data', '{}'::jsonb);
    if jsonb_typeof(v_data) <> 'object'
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['comun', 'pococomun', 'raro', 'epico', 'legendario']), false) then
      raise exception 'invalid_items';
    end if;

    -- Pity (same semantics as rollRarity): at threshold the pull MUST be legendario.
    if v_run_pity >= v_thr and v_rar <> 'legendario' then
      raise exception 'invalid_pity';
    end if;
    v_run_pity := case when v_rar = 'legendario' then 0 else v_run_pity + 1 end;

    v_refund := 0;
    v_frag := 0;
    v_fkey := null;

    if p_banner = 'character' then
      v_cls := v_item ->> 'class';
      if not coalesce(v_cls = any (array['caballero', 'mago', 'picaro', 'clerigo']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'c-' || v_cls || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.characters
       where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.characters set stars = v_stars
           where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        -- Same class + rarity already owned (other element): fragment instead of a star.
        if exists (
          select 1 from public.characters
           where player_id = p_player and class = v_cls and rarity = v_rar
        ) then
          v_frag := 1;
          v_fkey := v_cls || ':' || v_rar;
          insert into public.fragments (player_id, class, rarity, qty)
          values (p_player, v_cls, v_rar, 1)
          on conflict (player_id, class, rarity) do update set qty = public.fragments.qty + 1;
        end if;
        insert into public.characters (player_id, class, element, rarity, data)
        values (p_player, v_cls, v_el, v_rar, v_data);
      end if;
    else
      v_typ := v_item ->> 'type';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'w-' || v_typ || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.weapons set stars = v_stars
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar, v_data);
      end if;
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', v_status, 'id', v_key, 'stars', v_stars, 'refund', v_refund,
      'fragmentGain', v_frag, 'fragmentKey', v_fkey));
  end loop;

  if v_run_pity is distinct from p_pity then
    raise exception 'invalid_pity';
  end if;

  update public.gacha_state set pity = v_run_pity
   where player_id = p_player and banner = p_banner;
  update public.player_state
     set coins = coins - v_expected + v_refund_total, version = version + 1
   where player_id = p_player
   returning coins, version into v_coins, v_version;

  v_out := jsonb_build_object(
    'replayed', false, 'coins', v_coins, 'version', v_version, 'pity', v_run_pity,
    'refundTotal', v_refund_total, 'results', v_results);
  insert into public.pulls (player_id, idempotency_key, banner, cost, daily, seed, items, result)
  values (p_player, p_idem, p_banner, v_expected, v_daily, p_seed, p_items, v_out);
  return v_out;
end $$;

create or replace function public.spend_fragments(p_player uuid, p_character_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
  v_have int;
  v_per int := public.game_const('fragments_per_star');
  v_stars int;
begin
  select * into v_c from public.characters
   where player_id = p_player and key = p_character_id for update;
  if not found then
    raise exception 'character_not_found';
  end if;
  if v_c.stars >= public.game_const('max_stars') then
    raise exception 'max_stars';
  end if;
  select qty into v_have from public.fragments
   where player_id = p_player and class = v_c.class and rarity = v_c.rarity for update;
  if not found or v_have < v_per then
    raise exception 'insufficient_fragments';
  end if;
  update public.fragments set qty = qty - v_per
   where player_id = p_player and class = v_c.class and rarity = v_c.rarity;
  update public.characters set stars = stars + 1
   where player_id = p_player and key = p_character_id
   returning stars into v_stars;
  return jsonb_build_object('stars', v_stars, 'fragments', v_have - v_per);
end $$;

create or replace function public.equip_weapon(
  p_player uuid, p_character_id text, p_weapon_id text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where player_id = p_player and key = p_character_id)
     or not exists (select 1 from public.weapons where player_id = p_player and key = p_weapon_id) then
    raise exception 'not_owned';
  end if;
  delete from public.equipment
   where player_id = p_player
     and (character_key = p_character_id or weapon_key = p_weapon_id);
  insert into public.equipment (player_id, character_key, weapon_key)
  values (p_player, p_character_id, p_weapon_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.unequip_weapon(p_player uuid, p_character_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.equipment where player_id = p_player and character_key = p_character_id;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================== runs
create or replace function public.start_run(
  p_player uuid, p_character_id text, p_seed bigint, p_hero jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  -- p_character_id is NULL for a random Común hero (no collection needed).
  if p_character_id is not null
     and not exists (select 1 from public.characters where player_id = p_player and key = p_character_id) then
    raise exception 'character_not_found';
  end if;
  if p_hero is null or jsonb_typeof(p_hero) <> 'object' then
    raise exception 'invalid_args';
  end if;
  update public.runs set status = 'expired', finished_at = now()
   where player_id = p_player and status = 'open'
     and started_at < now() - interval '1 hour' * public.game_const('run_stale_hours');
  if exists (select 1 from public.runs where player_id = p_player and status = 'open') then
    raise exception 'run_open';
  end if;
  begin
    insert into public.runs (player_id, seed, hero)
    values (p_player, p_seed, p_hero)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'run_open';
  end;
  return jsonb_build_object('run_id', v_id);
end $$;

create or replace function public.save_run_state(
  p_player uuid, p_run_id uuid, p_state jsonb, p_log_len int, p_max_floor int, p_coins int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_state is not null and pg_column_size(p_state) > public.game_const('run_state_max_bytes') then
    raise exception 'state_too_big';
  end if;
  if p_log_len < 0 or p_max_floor < 0 or p_coins < 0 then
    raise exception 'invalid_args';
  end if;
  update public.runs
     set state = p_state,
         log_len = p_log_len,
         max_floor = greatest(max_floor, least(p_max_floor, public.game_const('run_max_floor'))),
         coins_earned = p_coins
   where id = p_run_id and player_id = p_player and status = 'open';
  if not found then
    raise exception 'run_not_open';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- One bank per run: the run row is locked and flipped open -> closed.
create or replace function public.bank_run(
  p_player uuid, p_run_id uuid, p_coins int, p_max_floor int,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null
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
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut') then
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

-- ================================================================== rooms
create or replace function public.create_room(p_player uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_exp timestamptz;
begin
  if p_code is null or p_code !~ '^[A-Z]{4}$' then
    raise exception 'invalid_code';
  end if;
  if not exists (select 1 from public.players where id = p_player) then
    raise exception 'player_not_found';
  end if;
  -- Free the codes / host slots of rooms that already expired.
  update public.rooms set status = 'closed' where status = 'open' and expires_at <= now();
  if exists (select 1 from public.rooms where host_id = p_player and status = 'open') then
    raise exception 'room_limit';
  end if;
  begin
    insert into public.rooms (code, host_id, expires_at)
    values (p_code, p_player, now() + interval '1 hour' * public.game_const('room_hours'))
    returning id, expires_at into v_id, v_exp;
  exception when unique_violation then
    raise exception 'code_taken';
  end;
  insert into public.room_players (room_id, player_id, chips)
  values (v_id, p_player, public.game_const('initial_chips'));
  insert into public.chip_ledger (room_id, player_id, delta, reason)
  values (v_id, p_player, public.game_const('initial_chips'), 'initial');
  return jsonb_build_object('room_id', v_id, 'code', p_code, 'expiresAt', v_exp);
end $$;

-- Expected failures are returned (not raised) so the failure counter persists.
create or replace function public.join_room(p_player uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rl_key text := 'join:' || p_player::text;
  v_max int := public.game_const('join_fail_max');
  v_win int := public.game_const('join_fail_window_s');
  v_hits int;
  v_room public.rooms;
  v_count int;
  v_member public.room_players;
  v_exists boolean;
begin
  select hits into v_hits from public.rate_limit_hits
   where key = v_rl_key and window_start > now() - interval '1 second' * v_win;
  if found and v_hits >= v_max then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_room from public.rooms
   where code = upper(coalesce(p_code, '')) and status = 'open' and expires_at > now()
   for update;
  if not found then
    perform public.rate_limit_hit(v_rl_key, v_max, v_win);
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_member from public.room_players
   where room_id = v_room.id and player_id = p_player for update;
  v_exists := found;
  if not (v_exists and v_member.left_at is null) then
    select count(*) into v_count from public.room_players
     where room_id = v_room.id and left_at is null;
    if v_count >= public.game_const('max_room_players') then
      return jsonb_build_object('ok', false, 'error', 'room_full');
    end if;
  end if;
  if v_exists and v_member.left_at is not null then
    update public.room_players set left_at = null
     where room_id = v_room.id and player_id = p_player;
  elsif not v_exists then
    insert into public.room_players (room_id, player_id, chips)
    values (v_room.id, p_player, public.game_const('initial_chips'));
    insert into public.chip_ledger (room_id, player_id, delta, reason)
    values (v_room.id, p_player, public.game_const('initial_chips'), 'initial');
  end if;
  return jsonb_build_object(
    'ok', true, 'room_id', v_room.id, 'code', v_room.code, 'host_id', v_room.host_id);
end $$;

create or replace function public.leave_room(p_player uuid, p_room uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_new uuid;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  update public.room_players set left_at = now()
   where room_id = p_room and player_id = p_player and left_at is null;
  if not found then
    raise exception 'not_member';
  end if;
  if v_room.host_id = p_player and v_room.status = 'open' then
    select player_id into v_new from public.room_players
     where room_id = p_room and left_at is null
     order by joined_at, player_id limit 1;
    if v_new is null then
      update public.rooms set status = 'closed' where id = p_room;
    else
      begin
        update public.rooms set host_id = v_new where id = p_room;
      exception when unique_violation then
        -- new host already hosts another open room: close this one
        update public.rooms set status = 'closed' where id = p_room;
        v_new := null;
      end;
    end if;
    return jsonb_build_object('host_id', v_new);
  end if;
  return jsonb_build_object('host_id', v_room.host_id);
end $$;

create or replace function public.close_room(p_player uuid, p_room uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.host_id <> p_player then
    raise exception 'forbidden';
  end if;
  update public.rooms set status = 'closed' where id = p_room;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_turn_seconds(p_player uuid, p_room uuid, p_seconds int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.rooms;
begin
  if p_seconds is null or p_seconds not between 10 and 120 then
    raise exception 'invalid_args';
  end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.host_id <> p_player then
    raise exception 'forbidden';
  end if;
  update public.rooms set turn_seconds = p_seconds where id = p_room;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================ battles / bets / chips
create or replace function public.open_battle(p_room uuid, p_fighter uuid, p_battle_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_battle_key is null or char_length(p_battle_key) not between 1 and 80 then
    raise exception 'invalid_args';
  end if;
  if not exists (
    select 1 from public.room_players
     where room_id = p_room and player_id = p_fighter and left_at is null
  ) then
    raise exception 'not_member';
  end if;
  begin
    insert into public.room_battles (room_id, battle_key, fighter_id)
    values (p_room, p_battle_key, p_fighter)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'battle_exists';
  end;
  return jsonb_build_object('battle_id', v_id);
end $$;

create or replace function public.lock_battle(p_room uuid, p_battle_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_b public.room_battles;
begin
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status = 'settled' then
    raise exception 'battle_settled';
  end if;
  update public.room_battles set status = 'locked' where id = v_b.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.place_bet(
  p_room uuid, p_bettor uuid, p_battle_key text, p_prediction text, p_stake int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_chips int;
begin
  if p_prediction is null or p_prediction not in ('win', 'lose') or p_stake is null then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status <> 'open' then
    raise exception 'battle_locked';
  end if;
  if v_b.fighter_id = p_bettor then
    raise exception 'self_bet';
  end if;
  if p_stake < public.game_const('min_bet') then
    raise exception 'stake_too_low';
  end if;
  select chips into v_chips from public.room_players
   where room_id = p_room and player_id = p_bettor and left_at is null for update;
  if not found then
    raise exception 'not_member';
  end if;
  if v_chips < p_stake then
    raise exception 'insufficient_chips';
  end if;
  begin
    insert into public.bets (room_id, battle_key, bettor_id, prediction, stake)
    values (p_room, p_battle_key, p_bettor, p_prediction, p_stake);
  exception when unique_violation then
    raise exception 'duplicate_bet';
  end;
  update public.room_players set chips = chips - p_stake
   where room_id = p_room and player_id = p_bettor;
  insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
  values (p_room, p_bettor, -p_stake, 'bet_stake', p_battle_key);
  return jsonb_build_object('chips', v_chips - p_stake);
end $$;

create or replace function public.interfere(
  p_room uuid, p_from uuid, p_battle_key text, p_kind text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_chips int;
  v_cost int := public.game_const('interfere_cost');
begin
  if p_kind is null or p_kind not in ('stronger_enemy', 'adverse_element') then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status <> 'open' then
    raise exception 'battle_locked';
  end if;
  if v_b.fighter_id = p_from then
    raise exception 'self_interfere';
  end if;
  select chips into v_chips from public.room_players
   where room_id = p_room and player_id = p_from and left_at is null for update;
  if not found then
    raise exception 'not_member';
  end if;
  if v_chips < v_cost then
    raise exception 'insufficient_chips';
  end if;
  begin
    insert into public.interferences (room_id, battle_key, from_player, kind, cost)
    values (p_room, p_battle_key, p_from, p_kind, v_cost);
  exception when unique_violation then
    raise exception 'already_interfered';
  end;
  update public.room_players set chips = chips - v_cost
   where room_id = p_room and player_id = p_from;
  insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
  values (p_room, p_from, -v_cost, 'interfere', p_battle_key);
  return jsonb_build_object('cost', v_cost, 'chips', v_chips - v_cost);
end $$;

-- Shared pot: winners split the losers' stakes pro rata; an empty side voids
-- (refunds) the battle. Integer division dust stays out of circulation.
create or replace function public.settle_battle(
  p_room uuid, p_battle_key text, p_outcome text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_win bigint;
  v_lose bigint;
  v_void boolean;
  v_bet public.bets;
  v_pay int;
  v_count int := 0;
begin
  if p_outcome is null or p_outcome not in ('win', 'lose') then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status = 'settled' then
    raise exception 'battle_settled';
  end if;

  select coalesce(sum(stake) filter (where prediction = p_outcome), 0),
         coalesce(sum(stake) filter (where prediction <> p_outcome), 0)
    into v_win, v_lose
    from public.bets
   where room_id = p_room and battle_key = p_battle_key and status = 'open';
  v_void := (v_win = 0 or v_lose = 0);

  for v_bet in
    select * from public.bets
     where room_id = p_room and battle_key = p_battle_key and status = 'open'
     order by id for update
  loop
    if v_void then
      v_pay := v_bet.stake;
    elsif v_bet.prediction = p_outcome then
      v_pay := v_bet.stake + (v_bet.stake::bigint * v_lose / v_win)::int;
    else
      v_pay := 0;
    end if;
    update public.bets
       set status = case when v_void then 'void' else 'settled' end,
           payout = v_pay, settled_at = now()
     where id = v_bet.id;
    if v_pay > 0 then
      update public.room_players set chips = chips + v_pay
       where room_id = p_room and player_id = v_bet.bettor_id;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_bet.bettor_id, v_pay,
              case when v_void then 'bet_refund' else 'bet_win' end, p_battle_key);
    end if;
    v_count := v_count + 1;
  end loop;

  update public.room_battles set status = 'settled', outcome = p_outcome where id = v_b.id;
  return jsonb_build_object('settled', v_count, 'voided', v_void);
end $$;

-- ============================================================== lockdown
-- Every function in public: no execute for public/anon/authenticated; only
-- service_role. Exceptions: is_room_member / is_room_topic_member (used by RLS
-- and Realtime policies, so authenticated must be able to execute them).
do $$
declare f record;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (  -- skip functions owned by extensions
         select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', f.proname, f.args);
    execute format('grant execute on function public.%I(%s) to service_role', f.proname, f.args);
    if f.proname in ('is_room_member', 'is_room_topic_member') then
      execute format('grant execute on function public.%I(%s) to authenticated', f.proname, f.args);
    end if;
  end loop;
end $$;

-- ===== 0004_realtime.sql =====
-- 0004_realtime: private channels. Topic format: room:<rooms.id uuid>.
-- Only active members of that room can receive or send (broadcast/presence).
-- Policies are cached per connection: after kicking someone, force reconnect
-- or refresh their JWT. Also disable "Allow public access" in
-- Dashboard > Realtime > Settings so only private channels work.
-- Docs: https://supabase.com/docs/guides/realtime/authorization

-- CASE guards the uuid cast (a malformed topic must yield false, not an error).
create or replace function private.is_room_topic_member(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_topic ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_room_member(substr(p_topic, 6)::uuid)
    else false
  end
$$;
revoke all on function private.is_room_topic_member(text) from public, anon;
grant execute on function private.is_room_topic_member(text) to authenticated;

drop policy if exists "room members can receive" on realtime.messages;
create policy "room members can receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_room_topic_member((select realtime.topic()))
  );

drop policy if exists "room members can send" on realtime.messages;
create policy "room members can send" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_room_topic_member((select realtime.topic()))
  );

-- Postgres Changes (respects the SELECT policies of 0002) for the live room state.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['rooms', 'room_players', 'room_battles', 'bets', 'interferences'] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ===== 0005_rooms_flow.sql =====
-- 0005_rooms_flow: shared-night flow for rooms (docs/SALAS.md section 7).
-- Server-authoritative: TS decides gameplay (seeds, outcomes, which phase comes
-- next); SQL persists atomically, enforces idempotency (phase_seq), chip rules
-- and permissions. No gameplay randomness here. Idempotent: safe to re-run.
-- All functions: SECURITY DEFINER, search_path = '', service_role only.

-- ---------------------------------------------------------------- constants
insert into public.game_constants (key, value) values
  ('room_max_rounds', 5),
  ('room_floors_per_round', 10),
  ('room_round_offset', 3),
  ('interfere_comp', 15),
  ('room_setup_s', 30)
on conflict (key) do nothing;

-- ----------------------------------------------------------- existing tables
alter table public.room_players
  add column if not exists present boolean not null default true,
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists ready boolean not null default false,
  add column if not exists eliminated boolean not null default false,
  add column if not exists active_from_floor int not null default 0 check (active_from_floor >= 0),
  add column if not exists hero_key text check (hero_key is null or char_length(hero_key) between 1 and 100);

alter table public.room_battles
  add column if not exists interfered boolean not null default false,
  add column if not exists void_reason text;
alter table public.room_battles drop constraint if exists room_battles_outcome_check;
alter table public.room_battles add constraint room_battles_outcome_check
  check (outcome is null or outcome in ('win', 'lose', 'void'));
alter table public.room_battles drop constraint if exists room_battles_void_reason_check;
alter table public.room_battles add constraint room_battles_void_reason_check
  check (void_reason is null or void_reason in ('fled', 'no_fight', 'room_closed'));

alter table public.chip_ledger drop constraint if exists chip_ledger_reason_check;
alter table public.chip_ledger add constraint chip_ledger_reason_check
  check (reason in ('initial', 'bet_stake', 'bet_win', 'bet_refund', 'interfere',
                    'interfere_comp', 'interfere_refund', 'night_start'));

-- --------------------------------------------------------------- new tables
create table if not exists public.room_state (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  mode text not null default 'nivelado' check (mode in ('nivelado', 'completo')),
  phase text not null default 'lobby' check (phase in (
    'lobby', 'round_setup', 'floor_intro', 'doors', 'betting', 'fighting',
    'reveal', 'round_end', 'coop_boss', 'night_summary', 'closed')),
  phase_seq int not null default 0 check (phase_seq >= 0),
  round int not null default 0 check (round between 0 and 5),
  floor int not null default 0 check (floor between 0 and 10),
  round_seed bigint check (round_seed is null or round_seed between 0 and 4294967295),
  deadline timestamptz,
  round_started_at timestamptz,
  night_started_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.room_floor (
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null check (round between 1 and 5),
  floor int not null check (floor between 1 and 10),
  player_id uuid not null references public.players (id) on delete cascade,
  door_kind text check (door_kind in ('easy', 'hard', 'boss', 'chest', 'merchant', 'rest', 'event')),
  status text not null default 'picked' check (status in ('picked', 'fought', 'skipped', 'timeout')),
  fight_seed bigint check (fight_seed is null or fight_seed between 0 and 4294967295),
  actions jsonb check (actions is null or pg_column_size(actions) < 400000),
  outcome text check (outcome in ('won', 'lost', 'fled', 'timeout')),
  run_after jsonb check (run_after is null or pg_column_size(run_after) < 200000),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (room_id, round, floor, player_id)
);
create index if not exists room_floor_player_idx on public.room_floor (player_id);

-- ---------------------------------------------------------------------- RLS
alter table public.room_state enable row level security;
alter table public.room_floor enable row level security;
revoke all on public.room_state, public.room_floor from anon, authenticated;
-- Members read the shared state; room_floor only the non-secret columns
-- (no actions / run_after / fight_seed: those stay server-side).
grant select on public.room_state to authenticated;
grant select (room_id, round, floor, player_id, door_kind, status, outcome, submitted_at)
  on public.room_floor to authenticated;

drop policy if exists room_state_member on public.room_state;
create policy room_state_member on public.room_state
  for select to authenticated using (private.is_room_member(room_id));
drop policy if exists room_floor_member on public.room_floor;
create policy room_floor_member on public.room_floor
  for select to authenticated using (private.is_room_member(room_id));

-- Interference is secret until the battle is settled (reveal); the source can
-- always see their own. (0002 let every member read it.)
drop policy if exists interferences_member on public.interferences;
create policy interferences_member on public.interferences
  for select to authenticated using (
    from_player = (select auth.uid())
    or (
      private.is_room_member(room_id)
      and exists (
        select 1 from public.room_battles b
         where b.room_id = interferences.room_id
           and b.battle_key = interferences.battle_key
           and b.status = 'settled')
    )
  );
-- The ledger would also leak who interfered (reason 'interfere' on their row).
drop policy if exists chip_ledger_member on public.chip_ledger;
create policy chip_ledger_member on public.chip_ledger
  for select to authenticated using (
    private.is_room_member(room_id)
    and (player_id = (select auth.uid())
         or reason not in ('interfere', 'interfere_refund'))
  );

-- ------------------------------------------------------------------ realtime
-- No new private channel topics: emotes/turn events/presence keep using
-- room:<rooms.id> (0004 policies). Phase changes arrive via Postgres Changes.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['room_state', 'room_floor'] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ----------------------------------------------------------------- triggers
create or replace function public.trg_room_state_init() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.room_state (room_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists rooms_state_init on public.rooms;
create trigger rooms_state_init after insert on public.rooms
  for each row execute function public.trg_room_state_init();
insert into public.room_state (room_id) select id from public.rooms on conflict do nothing;

-- Late join: a (re)joining member spectates the floor in progress and plays
-- from the next one. Leaving marks them absent.
create or replace function public.trg_room_players_flow() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v public.room_state;
begin
  if tg_op = 'INSERT' or (old.left_at is not null and new.left_at is null) then
    select * into v from public.room_state where room_id = new.room_id;
    if found and v.phase in ('floor_intro', 'doors', 'betting', 'fighting', 'reveal') then
      new.active_from_floor := v.floor + 1;
    elsif tg_op = 'INSERT' then
      new.active_from_floor := 0;
    end if;
    new.present := true;
    new.last_seen_at := now();
  elsif new.left_at is not null and old.left_at is null then
    new.present := false;
    new.ready := false;
  end if;
  return new;
end $$;
drop trigger if exists room_players_flow on public.room_players;
create trigger room_players_flow before insert or update of left_at on public.room_players
  for each row execute function public.trg_room_players_flow();

-- ------------------------------------------------------------------- helpers
create or replace function public.room_battle_key(p_round int, p_floor int, p_fighter uuid) returns text
language sql immutable set search_path = ''
as $$ select 'r' || p_round::text || 'f' || p_floor::text || ':' || p_fighter::text $$;

create or replace function public.room_state_json(p_room uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'room_id', s.room_id, 'mode', s.mode, 'phase', s.phase, 'phase_seq', s.phase_seq,
    'round', s.round, 'floor', s.floor, 'round_seed', s.round_seed,
    'deadline', s.deadline, 'host_id', r.host_id, 'turn_seconds', r.turn_seconds)
  from public.room_state s join public.rooms r on r.id = s.room_id
  where s.room_id = p_room
$$;

-- ---------------------------------------------------------- settle_battle v2
-- Adds outcome 'void' (fled / no fight / room closed), the 15-chip compensation
-- to a target that wins despite interference, and optional interference refund.
-- Outcome is the FIGHTER's: win | lose | void.
drop function if exists public.settle_battle(uuid, text, text);
create or replace function public.settle_battle(
  p_room uuid, p_battle_key text, p_outcome text,
  p_void_reason text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_i public.interferences;
  v_win bigint;
  v_lose bigint;
  v_void boolean;
  v_bet public.bets;
  v_pay int;
  v_count int := 0;
  v_comp int := 0;
  v_refund int := 0;
begin
  if p_outcome is null or p_outcome not in ('win', 'lose', 'void') then
    raise exception 'invalid_args';
  end if;
  if p_outcome = 'void' and (p_void_reason is null or p_void_reason not in ('fled', 'no_fight', 'room_closed')) then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status = 'settled' then
    raise exception 'battle_settled';
  end if;

  if p_outcome = 'void' then
    v_win := 0; v_lose := 0;
  else
    select coalesce(sum(stake) filter (where prediction = p_outcome), 0),
           coalesce(sum(stake) filter (where prediction <> p_outcome), 0)
      into v_win, v_lose
      from public.bets
     where room_id = p_room and battle_key = p_battle_key and status = 'open';
  end if;
  v_void := (p_outcome = 'void' or v_win = 0 or v_lose = 0);

  for v_bet in
    select * from public.bets
     where room_id = p_room and battle_key = p_battle_key and status = 'open'
     order by id for update
  loop
    if v_void then
      v_pay := v_bet.stake;
    elsif v_bet.prediction = p_outcome then
      v_pay := v_bet.stake + (v_bet.stake::bigint * v_lose / v_win)::int;
    else
      v_pay := 0;
    end if;
    update public.bets
       set status = case when v_void then 'void' else 'settled' end,
           payout = v_pay, settled_at = now()
     where id = v_bet.id;
    if v_pay > 0 then
      update public.room_players set chips = chips + v_pay
       where room_id = p_room and player_id = v_bet.bettor_id;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_bet.bettor_id, v_pay,
              case when v_void then 'bet_refund' else 'bet_win' end, p_battle_key);
    end if;
    v_count := v_count + 1;
  end loop;

  select * into v_i from public.interferences
   where room_id = p_room and battle_key = p_battle_key;
  if found then
    if p_outcome = 'win' then
      v_comp := public.game_const('interfere_comp');
      update public.room_players set chips = chips + v_comp
       where room_id = p_room and player_id = v_b.fighter_id;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_b.fighter_id, v_comp, 'interfere_comp', p_battle_key);
    elsif p_outcome = 'void' and p_void_reason in ('no_fight', 'room_closed') then
      v_refund := v_i.cost;
      update public.room_players set chips = chips + v_refund
       where room_id = p_room and player_id = v_i.from_player;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_i.from_player, v_refund, 'interfere_refund', p_battle_key);
    end if;
  end if;

  update public.room_battles
     set status = 'settled', outcome = p_outcome,
         void_reason = case when p_outcome = 'void' then p_void_reason end
   where id = v_b.id;
  return jsonb_build_object('settled', v_count, 'voided', v_void,
    'comp', v_comp, 'interference_refund', v_refund);
end $$;

-- interfere: same as 0003 plus the public 'interfered' flag (the fighter sees
-- "someone has it in for you" without who or what).
create or replace function public.interfere(
  p_room uuid, p_from uuid, p_battle_key text, p_kind text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_chips int;
  v_cost int := public.game_const('interfere_cost');
begin
  if p_kind is null or p_kind not in ('stronger_enemy', 'adverse_element') then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status <> 'open' then
    raise exception 'battle_locked';
  end if;
  if v_b.fighter_id = p_from then
    raise exception 'self_interfere';
  end if;
  select chips into v_chips from public.room_players
   where room_id = p_room and player_id = p_from and left_at is null for update;
  if not found then
    raise exception 'not_member';
  end if;
  if v_chips < v_cost then
    raise exception 'insufficient_chips';
  end if;
  begin
    insert into public.interferences (room_id, battle_key, from_player, kind, cost)
    values (p_room, p_battle_key, p_from, p_kind, v_cost);
  exception when unique_violation then
    raise exception 'already_interfered';
  end;
  update public.room_players set chips = chips - v_cost
   where room_id = p_room and player_id = p_from;
  update public.room_battles set interfered = true where id = v_b.id;
  insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
  values (p_room, p_from, -v_cost, 'interfere', p_battle_key);
  return jsonb_build_object('cost', v_cost, 'chips', v_chips - v_cost);
end $$;

create or replace function public.place_interference(
  p_room uuid, p_from uuid, p_battle_key text, p_kind text
) returns jsonb
language sql security definer set search_path = ''
as $$ select public.interfere(p_room, p_from, p_battle_key, p_kind) $$;

-- Void or settle the battles of one fighter (or all when null).
--   room_closed -> void + refund bets and interference
--   fighter not yet fighting (open) -> void no_fight, refund everything
--   fighter mid-fight (locked) -> void fled (bets refunded, interference kept)
create or replace function public.room_void_battles(
  p_room uuid, p_fighter uuid, p_reason text
) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  b public.room_battles;
  n int := 0;
begin
  for b in
    select * from public.room_battles
     where room_id = p_room and status <> 'settled'
       and (p_fighter is null or fighter_id = p_fighter)
       and (p_reason = 'room_closed' or not exists (  -- already has a result: settle_floor settles it
         select 1 from public.room_floor f join public.room_state s on s.room_id = f.room_id
          where f.room_id = p_room and f.round = s.round and f.floor = s.floor
            and f.player_id = room_battles.fighter_id and f.outcome is not null))
     order by created_at, id for update
  loop
    if p_reason = 'room_closed' then
      perform public.settle_battle(p_room, b.battle_key, 'void', 'room_closed');
    elsif b.status = 'open' then
      perform public.settle_battle(p_room, b.battle_key, 'void', 'no_fight');
    else
      perform public.settle_battle(p_room, b.battle_key, 'void', 'fled');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ------------------------------------------------- leave / close / kick / host
-- leave_room and close_room keep their 0003 signature and results; they now
-- also void the battles they would otherwise strand.
create or replace function public.leave_room(p_player uuid, p_room uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_new uuid;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  update public.room_players set left_at = now()
   where room_id = p_room and player_id = p_player and left_at is null;
  if not found then
    raise exception 'not_member';
  end if;
  perform public.room_void_battles(p_room, p_player, 'left');
  if v_room.host_id = p_player and v_room.status = 'open' then
    select player_id into v_new from public.room_players
     where room_id = p_room and left_at is null
     order by joined_at, player_id limit 1;
    if v_new is null then
      update public.rooms set status = 'closed' where id = p_room;
      update public.room_state set phase = 'closed', phase_seq = phase_seq + 1,
             deadline = null, updated_at = now() where room_id = p_room and phase <> 'closed';
      perform public.room_void_battles(p_room, null, 'room_closed');
    else
      begin
        update public.rooms set host_id = v_new where id = p_room;
      exception when unique_violation then
        update public.rooms set status = 'closed' where id = p_room;
        update public.room_state set phase = 'closed', phase_seq = phase_seq + 1,
               deadline = null, updated_at = now() where room_id = p_room and phase <> 'closed';
        perform public.room_void_battles(p_room, null, 'room_closed');
        v_new := null;
      end;
    end if;
    return jsonb_build_object('host_id', v_new);
  end if;
  return jsonb_build_object('host_id', v_room.host_id);
end $$;

create or replace function public.close_room(p_player uuid, p_room uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.host_id <> p_player then
    raise exception 'forbidden';
  end if;
  update public.rooms set status = 'closed' where id = p_room;
  update public.room_state set phase = 'closed', phase_seq = phase_seq + 1,
         deadline = null, updated_at = now() where room_id = p_room and phase <> 'closed';
  perform public.room_void_battles(p_room, null, 'room_closed');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kick_player(p_host uuid, p_room uuid, p_target uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.status <> 'open' then
    raise exception 'room_closed';
  end if;
  if v_room.host_id <> p_host then
    raise exception 'forbidden';
  end if;
  if p_target = p_host then
    raise exception 'invalid_args';
  end if;
  update public.room_players set left_at = now()
   where room_id = p_room and player_id = p_target and left_at is null;
  if not found then
    raise exception 'not_member';
  end if;
  perform public.room_void_battles(p_room, p_target, 'left');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.transfer_host(p_host uuid, p_room uuid, p_to uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.status <> 'open' then
    raise exception 'room_closed';
  end if;
  if v_room.host_id <> p_host then
    raise exception 'forbidden';
  end if;
  if p_to = p_host or not exists (
    select 1 from public.room_players where room_id = p_room and player_id = p_to and left_at is null
  ) then
    raise exception 'not_member';
  end if;
  begin
    update public.rooms set host_id = p_to where id = p_room;
  exception when unique_violation then
    raise exception 'target_hosts_other_room';
  end;
  return jsonb_build_object('host_id', p_to);
end $$;

-- ------------------------------------------------------ presence / heartbeat
create or replace function public.mark_presence(p_player uuid, p_room uuid, p_present boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.room_players
     set present = coalesce(p_present, true), last_seen_at = now()
   where room_id = p_room and player_id = p_player and left_at is null;
  if not found then
    raise exception 'not_member';
  end if;
end $$;

-- Marks stale members absent (no heartbeat for p_stale_seconds) and, if the
-- host has been gone longer than p_host_grace_seconds, passes the room to the
-- oldest present member. Safe to call from any client request (idempotent).
create or replace function public.sweep_presence(
  p_room uuid, p_stale_seconds int default 10, p_host_grace_seconds int default 60,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_abs uuid[];
  v_host public.room_players;
  v_new uuid;
  v_moved boolean := false;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  with u as (
    update public.room_players set present = false
     where room_id = p_room and left_at is null and present
       and last_seen_at < p_now - interval '1 second' * p_stale_seconds
    returning player_id)
  select coalesce(array_agg(player_id), '{}') into v_abs from u;
  select * into v_host from public.room_players
   where room_id = p_room and player_id = v_room.host_id;
  if v_room.status = 'open' and found and not v_host.present
     and v_host.last_seen_at < p_now - interval '1 second' * p_host_grace_seconds then
    select player_id into v_new from public.room_players
     where room_id = p_room and left_at is null and present and player_id <> v_room.host_id
     order by joined_at, player_id limit 1;
    if v_new is not null then
      begin
        update public.rooms set host_id = v_new where id = p_room;
        v_moved := true;
      exception when unique_violation then
        v_moved := false;
      end;
    end if;
  end if;
  return jsonb_build_object('absent', to_jsonb(v_abs),
    'host_id', case when v_moved then v_new else v_room.host_id end,
    'host_transferred', v_moved);
end $$;

-- --------------------------------------------------------- lobby-level setup
create or replace function public.set_room_mode(p_player uuid, p_room uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_st public.room_state;
begin
  if p_mode is null or p_mode not in ('nivelado', 'completo') then
    raise exception 'invalid_args';
  end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'open' then raise exception 'room_closed'; end if;
  if v_room.host_id <> p_player then raise exception 'forbidden'; end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if v_st.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  update public.room_state set mode = p_mode, updated_at = now() where room_id = p_room;
  return jsonb_build_object('ok', true, 'mode', p_mode);
end $$;

create or replace function public.choose_hero(p_player uuid, p_room uuid, p_hero_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_st public.room_state;
begin
  if p_hero_key is null or char_length(p_hero_key) not between 1 and 100 then
    raise exception 'invalid_args';
  end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_st.phase not in ('lobby', 'round_setup', 'round_end') then raise exception 'wrong_phase'; end if;
  update public.room_players set hero_key = p_hero_key
   where room_id = p_room and player_id = p_player and left_at is null;
  if not found then raise exception 'not_member'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_ready(p_player uuid, p_room uuid, p_ready boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_st public.room_state;
begin
  if p_ready is null then raise exception 'invalid_args'; end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_st.phase not in ('round_setup', 'betting', 'round_end') then raise exception 'wrong_phase'; end if;
  update public.room_players set ready = p_ready
   where room_id = p_room and player_id = p_player and left_at is null;
  if not found then raise exception 'not_member'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ start_round
create or replace function public.start_round(
  p_player uuid, p_room uuid, p_seed bigint,
  p_now timestamptz default now(), p_setup_seconds int default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_st public.room_state;
  v_setup int := coalesce(p_setup_seconds, public.game_const('room_setup_s'));
begin
  if p_seed is null or p_seed < 0 or p_seed > 4294967295 or v_setup not between 5 and 600 then
    raise exception 'invalid_args';
  end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'open' then raise exception 'room_closed'; end if;
  if v_room.host_id <> p_player then raise exception 'forbidden'; end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if v_st.phase not in ('lobby', 'round_end') then raise exception 'wrong_phase'; end if;
  if v_st.round >= public.game_const('room_max_rounds') then raise exception 'max_rounds'; end if;
  if (select count(*) from public.room_players
       where room_id = p_room and left_at is null and present) < 2 then
    raise exception 'not_enough_players';
  end if;
  update public.room_state
     set round = round + 1, floor = 0, round_seed = p_seed, phase = 'round_setup',
         phase_seq = phase_seq + 1, deadline = p_now + interval '1 second' * v_setup,
         round_started_at = p_now,
         night_started_at = coalesce(night_started_at, p_now), updated_at = now()
   where room_id = p_room;
  update public.room_players set active_from_floor = 0, eliminated = false, ready = false
   where room_id = p_room;
  return public.room_state_json(p_room);
end $$;

-- ----------------------------------------------------------- settle_floor
-- Settles every unsettled battle of (round, floor) from the stored outcomes.
-- Idempotent: already settled battles are skipped.
--   won -> win; lost/timeout -> lose; fled -> void(fled, interference kept);
--   battle never locked -> void(no_fight, everything refunded);
--   locked without a submission -> timeout (lose), or fled if the fighter left.
create or replace function public.settle_floor(
  p_room uuid, p_floor int, p_round int default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_round int;
  b public.room_battles;
  f public.room_floor;
  v_left boolean;
  v_out text;
  v_reason text;
  v_res jsonb := '[]'::jsonb;
begin
  select coalesce(p_round, round) into v_round from public.room_state where room_id = p_room;
  if v_round is null then raise exception 'room_not_found'; end if;
  for b in
    select * from public.room_battles
     where room_id = p_room and status <> 'settled'
       and battle_key like 'r' || v_round::text || 'f' || p_floor::text || ':%'
     order by created_at, id for update
  loop
    select * into f from public.room_floor
     where room_id = p_room and round = v_round and floor = p_floor and player_id = b.fighter_id;
    v_reason := null;
    if b.status = 'open' then
      v_out := 'void'; v_reason := 'no_fight';
      if found then update public.room_floor set status = 'skipped'
         where room_id = p_room and round = v_round and floor = p_floor and player_id = b.fighter_id; end if;
    elsif found and f.outcome = 'won' then v_out := 'win';
    elsif found and f.outcome in ('lost', 'timeout') then v_out := 'lose';
    elsif found and f.outcome = 'fled' then v_out := 'void'; v_reason := 'fled';
    else
      select left_at is not null into v_left from public.room_players
       where room_id = p_room and player_id = b.fighter_id;
      if coalesce(v_left, false) then
        v_out := 'void'; v_reason := 'fled';
        update public.room_floor set outcome = 'fled'
         where room_id = p_room and round = v_round and floor = p_floor and player_id = b.fighter_id;
      else
        v_out := 'lose';
        insert into public.room_floor (room_id, round, floor, player_id, status, outcome, submitted_at)
        values (p_room, v_round, p_floor, b.fighter_id, 'timeout', 'timeout', now())
        on conflict (room_id, round, floor, player_id)
        do update set outcome = 'timeout', status = 'timeout', submitted_at = now();
      end if;
    end if;
    perform public.settle_battle(p_room, b.battle_key, v_out, v_reason);
    v_res := v_res || jsonb_build_object('battle_key', b.battle_key, 'fighter', b.fighter_id,
      'outcome', v_out, 'void_reason', v_reason);
  end loop;
  return jsonb_build_object('round', v_round, 'floor', p_floor, 'battles', v_res);
end $$;

-- --------------------------------------------------------------- choose_door
create or replace function public.choose_door(
  p_player uuid, p_room uuid, p_floor int, p_door_kind text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_st public.room_state;
  v_rp public.room_players;
  v_row public.room_floor;
begin
  if p_door_kind is null or p_door_kind not in ('easy', 'hard', 'boss', 'chest', 'merchant', 'rest', 'event') then
    raise exception 'invalid_args';
  end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_st.phase = 'closed' then raise exception 'room_closed'; end if;
  if v_st.phase <> 'doors' then raise exception 'wrong_phase'; end if;
  if v_st.floor <> p_floor then raise exception 'wrong_floor'; end if;
  select * into v_rp from public.room_players
   where room_id = p_room and player_id = p_player and left_at is null;
  if not found then raise exception 'not_member'; end if;
  if v_rp.eliminated or v_rp.active_from_floor > v_st.floor then raise exception 'not_active'; end if;
  select * into v_row from public.room_floor
   where room_id = p_room and round = v_st.round and floor = v_st.floor and player_id = p_player;
  if found then
    if v_row.door_kind = p_door_kind then
      return jsonb_build_object('door_kind', v_row.door_kind, 'replayed', true);
    end if;
    raise exception 'door_locked';
  end if;
  insert into public.room_floor (room_id, round, floor, player_id, door_kind, status)
  values (p_room, v_st.round, v_st.floor, p_player, p_door_kind, 'picked');
  return jsonb_build_object('door_kind', p_door_kind, 'replayed', false);
end $$;

-- --------------------------------------------------------- submit_floor_result
-- The server (not the client) decides p_outcome after replaying the actions.
-- p_eliminated: the server saw the run end (0 lives). Repeats return the stored result.
create or replace function public.submit_floor_result(
  p_player uuid, p_room uuid, p_floor int, p_outcome text,
  p_actions jsonb default '[]'::jsonb, p_run_after jsonb default null,
  p_eliminated boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_st public.room_state;
  v_b public.room_battles;
  v_row public.room_floor;
begin
  if p_outcome is null or p_outcome not in ('won', 'lost', 'fled', 'timeout') then
    raise exception 'invalid_args';
  end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_st.phase = 'closed' then raise exception 'room_closed'; end if;
  select * into v_row from public.room_floor
   where room_id = p_room and round = v_st.round and floor = p_floor and player_id = p_player;
  if found and v_row.outcome is not null then
    return jsonb_build_object('outcome', v_row.outcome, 'replayed', true);
  end if;
  if v_st.phase <> 'fighting' or v_st.floor <> p_floor then raise exception 'wrong_phase'; end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = public.room_battle_key(v_st.round, p_floor, p_player);
  if not found or v_b.status <> 'locked' or v_row.player_id is null then
    raise exception 'not_fighting';
  end if;
  update public.room_floor
     set status = 'fought', outcome = p_outcome, actions = p_actions,
         run_after = p_run_after, submitted_at = now()
   where room_id = p_room and round = v_st.round and floor = p_floor and player_id = p_player;
  if p_eliminated then
    update public.room_players set eliminated = true where room_id = p_room and player_id = p_player;
  end if;
  return jsonb_build_object('outcome', p_outcome, 'replayed', false);
end $$;

-- -------------------------------------------------------------- advance_phase
-- Compare-and-swap on phase_seq: the first caller wins, the others get the
-- current state back (advanced:false). TS computed the target; SQL checks the
-- transition graph, the deadline (unless p_early = everybody finished) and the
-- round/floor bookkeeping, and performs the side effects in one transaction:
--   doors -> betting   opens a battle per fighter in p_fighters
--                      [{"player":uuid,"door_kind":"easy|hard|boss","fight_seed":n}]
--   betting -> fighting locks the battles; those whose fighter is not in
--                      p_fighters (jsonb array of uuid) are voided (no_fight)
--   * -> reveal        settles the floor from stored outcomes (settle_floor)
create or replace function public.advance_phase(
  p_room uuid, p_expected_seq int, p_to_phase text, p_deadline timestamptz,
  p_now timestamptz default now(), p_early boolean default false,
  p_round int default null, p_floor int default null, p_seed bigint default null,
  p_fighters jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_st public.room_state;
  v_legal boolean;
  v_round int;
  v_floor int;
  v_f jsonb;
  v_keep uuid[];
  v_pl uuid;
  b public.room_battles;
begin
  select * into v_room from public.rooms where id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if v_room.status <> 'open' or v_st.phase = 'closed' then raise exception 'room_closed'; end if;
  if v_st.phase_seq <> p_expected_seq then
    return jsonb_build_object('advanced', false, 'reason', 'stale', 'state', public.room_state_json(p_room));
  end if;
  v_legal := (v_st.phase, p_to_phase) in (
    ('round_setup', 'floor_intro'), ('floor_intro', 'doors'),
    ('doors', 'betting'), ('doors', 'reveal'),
    ('betting', 'fighting'), ('betting', 'reveal'),
    ('fighting', 'reveal'),
    ('reveal', 'floor_intro'), ('reveal', 'round_end'),
    ('round_end', 'round_setup'), ('round_end', 'coop_boss'), ('round_end', 'night_summary'),
    ('coop_boss', 'night_summary'));
  if not v_legal then raise exception 'invalid_transition'; end if;
  if not p_early and v_st.deadline is not null and p_now < v_st.deadline then
    return jsonb_build_object('advanced', false, 'reason', 'not_due', 'state', public.room_state_json(p_room));
  end if;

  v_round := v_st.round;
  v_floor := v_st.floor;
  if p_to_phase = 'round_setup' then
    v_round := v_st.round + 1;
    if p_round is not null and p_round <> v_round then raise exception 'invalid_args'; end if;
    if v_round > public.game_const('room_max_rounds') then raise exception 'max_rounds'; end if;
    if p_seed is null or p_seed < 0 or p_seed > 4294967295 then raise exception 'invalid_args'; end if;
    v_floor := 0;
  elsif p_to_phase = 'floor_intro' then
    v_floor := case when v_st.phase = 'round_setup' then 1 else v_st.floor + 1 end;
    if p_floor is not null and p_floor <> v_floor then raise exception 'invalid_args'; end if;
    if v_floor > public.game_const('room_floors_per_round') then raise exception 'invalid_transition'; end if;
  end if;

  if p_to_phase = 'betting' then
    if p_fighters is null or jsonb_typeof(p_fighters) <> 'array' or jsonb_array_length(p_fighters) not between 1 and 7 then
      raise exception 'invalid_args';
    end if;
    for v_f in select * from jsonb_array_elements(p_fighters) loop
      v_pl := (v_f ->> 'player')::uuid;
      if (v_f ->> 'door_kind') is null or (v_f ->> 'door_kind') not in ('easy', 'hard', 'boss') then
        raise exception 'invalid_args';
      end if;
      if not exists (select 1 from public.room_players
                      where room_id = p_room and player_id = v_pl and left_at is null) then
        raise exception 'not_member';
      end if;
      insert into public.room_floor (room_id, round, floor, player_id, door_kind, status, fight_seed)
      values (p_room, v_round, v_floor, v_pl, v_f ->> 'door_kind', 'picked', (v_f ->> 'fight_seed')::bigint)
      on conflict (room_id, round, floor, player_id)
      do update set door_kind = excluded.door_kind, fight_seed = excluded.fight_seed, status = 'picked';
      insert into public.room_battles (room_id, battle_key, fighter_id)
      values (p_room, public.room_battle_key(v_round, v_floor, v_pl), v_pl)
      on conflict (room_id, battle_key) do nothing;
    end loop;
    update public.room_players set ready = false where room_id = p_room;
  elsif p_to_phase = 'fighting' then
    v_keep := case when p_fighters is null then null
      else array(select (e #>> '{}')::uuid from jsonb_array_elements(p_fighters) e) end;
    for b in
      select * from public.room_battles
       where room_id = p_room and status = 'open'
         and battle_key like 'r' || v_round::text || 'f' || v_floor::text || ':%'
       order by created_at, id for update
    loop
      if v_keep is not null and not (b.fighter_id = any (v_keep)) then
        perform public.settle_battle(p_room, b.battle_key, 'void', 'no_fight');
        update public.room_floor set status = 'skipped'
         where room_id = p_room and round = v_round and floor = v_floor and player_id = b.fighter_id;
      else
        update public.room_battles set status = 'locked' where id = b.id;
      end if;
    end loop;
  elsif p_to_phase = 'reveal' then
    perform public.settle_floor(p_room, v_floor, v_round);
  elsif p_to_phase = 'round_setup' then
    update public.room_players set active_from_floor = 0, eliminated = false, ready = false
     where room_id = p_room;
  elsif p_to_phase in ('floor_intro', 'round_end') then
    update public.room_players set ready = false where room_id = p_room;
  end if;

  update public.room_state
     set phase = p_to_phase, phase_seq = phase_seq + 1, deadline = p_deadline,
         round = v_round, floor = v_floor,
         round_seed = case when p_to_phase = 'round_setup' then p_seed else round_seed end,
         round_started_at = case when p_to_phase = 'round_setup' then p_now else round_started_at end,
         updated_at = now()
   where room_id = p_room;
  return jsonb_build_object('advanced', true, 'state', public.room_state_json(p_room));
end $$;

-- -------------------------------------------------------------- night_summary
-- Minimal columns for the end-of-night screen. Max floor counts the round
-- difficulty offset (floor + offset * (round - 1)), wins only.
create or replace function public.night_summary(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_st public.room_state;
  v_off int := public.game_const('room_round_offset');
  v_out jsonb;
begin
  select * into v_st from public.room_state where room_id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  with s as (
    select rp.player_id, pl.name, rp.chips,
      coalesce((select max(f.floor + v_off * (f.round - 1)) from public.room_floor f
                 where f.room_id = rp.room_id and f.player_id = rp.player_id and f.outcome = 'won'), 0) as max_floor,
      (select count(*)::int from public.room_floor f
        where f.room_id = rp.room_id and f.player_id = rp.player_id and f.outcome = 'won') as wins,
      (select count(*)::int from public.room_floor f
        where f.room_id = rp.room_id and f.player_id = rp.player_id and f.outcome in ('lost', 'timeout')) as losses,
      coalesce((select sum(bt.payout - bt.stake)::int from public.bets bt
                 where bt.room_id = rp.room_id and bt.bettor_id = rp.player_id and bt.status = 'settled'), 0) as bet_net,
      (select count(*)::int from public.interferences i
        where i.room_id = rp.room_id and i.from_player = rp.player_id) as interferences
    from public.room_players rp join public.players pl on pl.id = rp.player_id
    where rp.room_id = p_room)
  select jsonb_build_object(
    'phase', v_st.phase, 'round', v_st.round,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'player_id', player_id, 'name', name, 'chips', chips, 'max_floor', max_floor,
        'wins', wins, 'losses', losses, 'bet_net', bet_net, 'interferences', interferences)
        order by chips desc, max_floor desc, name) from s), '[]'::jsonb),
    'awards', jsonb_build_object(
      'gafe', (select player_id from s where losses > 0 order by losses desc, name limit 1),
      'apostador', (select player_id from s where bet_net > 0 order by bet_net desc, name limit 1),
      'saboteador', (select player_id from s where interferences > 0 order by interferences desc, name limit 1)))
  into v_out;
  return v_out;
end $$;

-- ------------------------------------------------------------------ lockdown
-- Re-apply the 0003 lockdown to the functions added here.
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

-- ===== 0006_hardening.sql =====
-- 0006_hardening: Security Advisor follow-ups.
-- 1) Remove the old PUBLIC copies of the RLS helpers (they are now in schema `private`,
--    which the REST API does not expose). Policies were recreated against private.* by
--    0002/0004/0005 earlier in this same script, so nothing depends on these anymore.
drop function if exists public.is_room_member(uuid);
drop function if exists public.is_room_topic_member(text);

-- 2) Tables only touched by the server (service_role bypasses RLS): make "no access for
--    anon/authenticated" explicit instead of "RLS on, zero policies" (lint 0008).
do $$
declare t text;
begin
  foreach t in array array['audit_log','auth_attempts','game_constants','rate_limit_hits','run_submissions']
  loop
    execute format('drop policy if exists deny_all on public.%I', t);
    execute format('create policy deny_all on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;

-- Not changed on purpose: "Leaked password protection" (Auth). Our passwords are never chosen
-- by users: they are HMAC(PEPPER, name:pin) derived on the server, so HaveIBeenPwned does not apply.

-- ===== 0007_votes_catchup.sql =====
-- 0007_votes_catchup: (1) floor votes (shared-risk events), (2) interfere discount for the
-- player last in chips. TS (game/vote.ts, game/room.ts) decides; SQL persists and keeps the
-- chip ledger balanced. Idempotent: safe to re-run. service_role only.

insert into public.game_constants (key, value) values
  ('catchup_discount', 10),
  ('catchup_min_gap', 50),
  ('catchup_min_players', 3)
on conflict (key) do nothing;

alter table public.chip_ledger drop constraint if exists chip_ledger_reason_check;
alter table public.chip_ledger add constraint chip_ledger_reason_check
  check (reason in ('initial', 'bet_stake', 'bet_win', 'bet_refund', 'interfere',
                    'interfere_comp', 'interfere_refund', 'night_start', 'vote_event'));

-- ------------------------------------------------------------------- votes
create table if not exists public.room_votes (
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null check (round between 1 and 5),
  floor int not null check (floor between 1 and 10),
  player_id uuid not null references public.players (id) on delete cascade,
  yes boolean not null,
  created_at timestamptz not null default now(),
  primary key (room_id, round, floor, player_id)
);
create table if not exists public.room_vote_results (
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null,
  floor int not null,
  opened boolean not null,
  delta int not null,
  yes int not null,
  no int not null,
  resolved_at timestamptz not null default now(),
  primary key (room_id, round, floor)
);
alter table public.room_votes enable row level security;
alter table public.room_vote_results enable row level security;
revoke all on public.room_votes, public.room_vote_results from anon, authenticated;
grant select on public.room_votes, public.room_vote_results to authenticated;
drop policy if exists room_votes_member on public.room_votes;
create policy room_votes_member on public.room_votes
  for select to authenticated using (private.is_room_member(room_id));
drop policy if exists room_vote_results_member on public.room_vote_results;
create policy room_vote_results_member on public.room_vote_results
  for select to authenticated using (private.is_room_member(room_id));

-- cast_vote: members only, while the floor is in `reveal`, before the deadline.
-- Changing your mind is allowed until the result is stored.
create or replace function public.cast_vote(
  p_player uuid, p_room uuid, p_floor int, p_yes boolean, p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_st public.room_state;
begin
  if p_yes is null then raise exception 'invalid_args'; end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_st.phase = 'closed' then raise exception 'room_closed'; end if;
  if v_st.phase <> 'reveal' then raise exception 'wrong_phase'; end if;
  if v_st.floor <> p_floor then raise exception 'wrong_floor'; end if;
  if v_st.deadline is not null and p_now > v_st.deadline then raise exception 'wrong_phase'; end if;
  if not exists (select 1 from public.room_players
                  where room_id = p_room and player_id = p_player and left_at is null) then
    raise exception 'not_member';
  end if;
  if exists (select 1 from public.room_vote_results
              where room_id = p_room and round = v_st.round and floor = p_floor) then
    raise exception 'wrong_phase';
  end if;
  insert into public.room_votes (room_id, round, floor, player_id, yes)
  values (p_room, v_st.round, p_floor, p_player, p_yes)
  on conflict (room_id, round, floor, player_id) do update set yes = excluded.yes;
  return jsonb_build_object('yes', p_yes);
end $$;

-- resolve_vote: TS tallied the votes and decided (opened, delta). Applies delta once to every
-- present member (negative deltas never take chips below 0). Repeats return the stored result.
create or replace function public.resolve_vote(
  p_room uuid, p_round int, p_floor int, p_opened boolean, p_delta int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_yes int;
  v_no int;
  v_row public.room_vote_results;
  r record;
  v_apply int;
begin
  if p_opened is null or p_delta is null or abs(p_delta) > 1000
     or (not p_opened and p_delta <> 0) then
    raise exception 'invalid_args';
  end if;
  perform 1 from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  select * into v_row from public.room_vote_results
   where room_id = p_room and round = p_round and floor = p_floor;
  if found then
    return jsonb_build_object('opened', v_row.opened, 'delta', v_row.delta,
      'yes', v_row.yes, 'no', v_row.no, 'replayed', true);
  end if;
  select count(*) filter (where yes)::int, count(*) filter (where not yes)::int
    into v_yes, v_no from public.room_votes
   where room_id = p_room and round = p_round and floor = p_floor;
  insert into public.room_vote_results (room_id, round, floor, opened, delta, yes, no)
  values (p_room, p_round, p_floor, p_opened, p_delta, v_yes, v_no);
  if p_opened and p_delta <> 0 then
    for r in select player_id, chips from public.room_players
              where room_id = p_room and left_at is null and present for update loop
      v_apply := greatest(p_delta, -r.chips);
      if v_apply <> 0 then
        update public.room_players set chips = chips + v_apply
         where room_id = p_room and player_id = r.player_id;
        insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
        values (p_room, r.player_id, v_apply, 'vote_event', 'r' || p_round || 'f' || p_floor);
      end if;
    end loop;
  end if;
  return jsonb_build_object('opened', p_opened, 'delta', p_delta,
    'yes', v_yes, 'no', v_no, 'replayed', false);
end $$;

-- --------------------------------------------------------- interfere (catch-up)
-- Same as 0005 but the price is interfere_cost - catchup_discount when the caller is the only
-- one last in chips, trails the leader by >= catchup_min_gap, and >= catchup_min_players are
-- in the room (mirror of interfereCostFor in game/room.ts).
create or replace function public.interfere(
  p_room uuid, p_from uuid, p_battle_key text, p_kind text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_chips int;
  v_cost int := public.game_const('interfere_cost');
  v_n int;
  v_max int;
  v_ties int;
begin
  if p_kind is null or p_kind not in ('stronger_enemy', 'adverse_element') then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status <> 'open' then
    raise exception 'battle_locked';
  end if;
  if v_b.fighter_id = p_from then
    raise exception 'self_interfere';
  end if;
  select chips into v_chips from public.room_players
   where room_id = p_room and player_id = p_from and left_at is null for update;
  if not found then
    raise exception 'not_member';
  end if;
  select count(*)::int, max(chips), count(*) filter (where chips <= v_chips)::int
    into v_n, v_max, v_ties
    from public.room_players where room_id = p_room and left_at is null;
  if v_n >= public.game_const('catchup_min_players')
     and v_ties = 1
     and v_max - v_chips >= public.game_const('catchup_min_gap') then
    v_cost := v_cost - public.game_const('catchup_discount');
  end if;
  if v_chips < v_cost then
    raise exception 'insufficient_chips';
  end if;
  begin
    insert into public.interferences (room_id, battle_key, from_player, kind, cost)
    values (p_room, p_battle_key, p_from, p_kind, v_cost);
  exception when unique_violation then
    raise exception 'already_interfered';
  end;
  update public.room_players set chips = chips - v_cost
   where room_id = p_room and player_id = p_from;
  update public.room_battles set interfered = true where id = v_b.id;
  insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
  values (p_room, p_from, -v_cost, 'interfere', p_battle_key);
  return jsonb_build_object('cost', v_cost, 'chips', v_chips - v_cost);
end $$;

-- ------------------------------------------------------------------ lockdown
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

-- ===== 0008_daily_streak.sql =====
-- Daily-claim streak. Streak lives on daily_claims rows; the bonus is paid by
-- settle_daily_streak (server only, idempotent per day). Keep the constants in
-- sync with STREAK_BONUS in src/lib/game/streak.ts.
alter table public.daily_claims add column if not exists streak int;
alter table public.daily_claims add column if not exists bonus int;

insert into public.game_constants (key, value) values
  ('streak_bonus_3', 50),
  ('streak_bonus_7', 100)
on conflict (key) do nothing;

-- Last claim: {day, streak} or null. The client decides if it is still alive.
create or replace function public.get_streak(p_player uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('day', c.day::text, 'streak', coalesce(c.streak, 1))
    from public.daily_claims c
   where c.player_id = p_player
   order by c.day desc limit 1
$$;

-- Call after today's daily pull. Sets today's streak and pays the bonus once.
create or replace function public.settle_daily_streak(p_player uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := public.game_day();
  v_row public.daily_claims;
  v_prev int;
  v_streak int;
  v_bonus int := 0;
begin
  perform 1 from public.player_state where player_id = p_player for update;
  select * into v_row from public.daily_claims
   where player_id = p_player and day = v_today;
  if not found then
    raise exception 'not_claimed';
  end if;
  if v_row.bonus is not null then
    return jsonb_build_object('streak', v_row.streak, 'bonus', 0);
  end if;
  select coalesce(streak, 1) into v_prev from public.daily_claims
   where player_id = p_player and day = v_today - 1;
  v_streak := coalesce(v_prev, 0) + 1;
  v_bonus := case ((v_streak - 1) % 7) + 1
    when 3 then public.game_const('streak_bonus_3')
    when 7 then public.game_const('streak_bonus_7')
    else 0 end;
  update public.daily_claims set streak = v_streak, bonus = v_bonus
   where player_id = p_player and day = v_today;
  if v_bonus > 0 then
    update public.player_state set coins = coins + v_bonus, version = version + 1
     where player_id = p_player;
  end if;
  return jsonb_build_object('streak', v_streak, 'bonus', v_bonus);
end $$;

revoke all on function public.get_streak(uuid), public.settle_daily_streak(uuid)
  from public, anon, authenticated;
grant execute on function public.get_streak(uuid), public.settle_daily_streak(uuid)
  to service_role;

-- ===== 0009_market.sql =====
-- 0009_market: barter market between friends for REPEATED pieces.
-- A "repeated" piece is one with stars >= 1 (duplicates become stars). Trading moves ONE
-- star: the giver keeps the piece (stars - 1, never deleted, so equipment is untouched),
-- the receiver gets +1 star or the piece at 0 stars. Total copies are conserved: nothing
-- is created. No coins. Server only (service_role); clients never touch these tables.
insert into public.game_constants (key, value) values
  ('market_max_open', 5),
  ('market_ttl_days', 7)
on conflict (key) do nothing;

create table if not exists public.market_offers (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('character', 'weapon')),
  give_key text not null check (char_length(give_key) between 5 and 60),
  want_key text check (want_key is null or char_length(want_key) between 5 and 60),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled', 'expired')),
  buyer_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  check (want_key is distinct from give_key)
);
-- One open offer per piece per seller.
create unique index if not exists market_one_open_per_piece
  on public.market_offers (seller_id, kind, give_key) where status = 'open';
create index if not exists market_open_idx
  on public.market_offers (created_at desc) where status = 'open';

alter table public.market_offers enable row level security;
revoke all on public.market_offers from anon, authenticated;
drop policy if exists deny_all on public.market_offers;
create policy deny_all on public.market_offers as restrictive for all
  to anon, authenticated using (false) with check (false);

-- Well-formed key of an existing piece type (ids mirror the CHECKs of characters/weapons).
create or replace function public.market_key_ok(p_kind text, p_key text) returns boolean
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'character' then p_key ~ '^c-(caballero|mago|picaro|clerigo)-(agua|fuego|viento|tierra|rayo)-(comun|pococomun|raro|epico|legendario)$'
    when 'weapon' then p_key ~ '^w-(espada|hacha|lanza|arco|baston|daga)-(agua|fuego|viento|tierra|rayo)-(comun|pococomun|raro|epico|legendario)$'
    else false end
$$;

-- Moves one star of a repeated piece from p_from to p_to. Raises not_owned / max_stars.
create or replace function public.market_move(
  p_from uuid, p_to uuid, p_kind text, p_key text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_stars int;
  v_to_stars int;
begin
  if p_kind = 'character' then
    select stars into v_stars from public.characters
     where player_id = p_from and key = p_key for update;
    if not found or v_stars < 1 then raise exception 'not_owned'; end if;
    select stars into v_to_stars from public.characters
     where player_id = p_to and key = p_key for update;
    if found then
      if v_to_stars >= 5 then raise exception 'max_stars'; end if;
      update public.characters set stars = stars + 1 where player_id = p_to and key = p_key;
    else
      insert into public.characters (player_id, class, element, rarity, data)
      select p_to, class, element, rarity, data from public.characters
       where player_id = p_from and key = p_key;
    end if;
    update public.characters set stars = stars - 1 where player_id = p_from and key = p_key;
  else
    select stars into v_stars from public.weapons
     where player_id = p_from and key = p_key for update;
    if not found or v_stars < 1 then raise exception 'not_owned'; end if;
    select stars into v_to_stars from public.weapons
     where player_id = p_to and key = p_key for update;
    if found then
      if v_to_stars >= 5 then raise exception 'max_stars'; end if;
      update public.weapons set stars = stars + 1 where player_id = p_to and key = p_key;
    else
      insert into public.weapons (player_id, type, element, rarity, data)
      select p_to, type, element, rarity, data from public.weapons
       where player_id = p_from and key = p_key;
    end if;
    update public.weapons set stars = stars - 1 where player_id = p_from and key = p_key;
  end if;
end $$;

create or replace function public.market_create(
  p_player uuid, p_kind text, p_give text, p_want text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_stars int;
begin
  if not public.market_key_ok(p_kind, p_give)
     or (p_want is not null and not public.market_key_ok(p_kind, p_want))
     or p_want is not distinct from p_give then
    raise exception 'invalid_args';
  end if;
  perform 1 from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if p_kind = 'character' then
    select stars into v_stars from public.characters where player_id = p_player and key = p_give;
  else
    select stars into v_stars from public.weapons where player_id = p_player and key = p_give;
  end if;
  if v_stars is null or v_stars < 1 then raise exception 'not_owned'; end if;
  update public.market_offers set status = 'expired', closed_at = now()
   where seller_id = p_player and status = 'open' and expires_at <= now();
  if (select count(*) from public.market_offers
       where seller_id = p_player and status = 'open') >= public.game_const('market_max_open') then
    raise exception 'too_many_offers';
  end if;
  begin
    insert into public.market_offers (seller_id, kind, give_key, want_key, expires_at)
    values (p_player, p_kind, p_give, p_want,
            now() + interval '1 day' * public.game_const('market_ttl_days'))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_offered';
  end;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.market_cancel(p_player uuid, p_offer uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_o public.market_offers;
begin
  select * into v_o from public.market_offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_o.seller_id <> p_player then raise exception 'forbidden'; end if;
  if v_o.status <> 'open' then raise exception 'offer_closed'; end if;
  update public.market_offers set status = 'cancelled', closed_at = now() where id = p_offer;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.market_accept(p_player uuid, p_offer uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_o public.market_offers;
begin
  select * into v_o from public.market_offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_o.status <> 'open' or v_o.expires_at <= now() then raise exception 'offer_closed'; end if;
  if v_o.seller_id = p_player then raise exception 'own_offer'; end if;
  -- Fixed lock order (by id) so two crossing trades cannot deadlock.
  perform 1 from public.player_state
   where player_id in (v_o.seller_id, p_player) order by player_id for update;
  if not exists (select 1 from public.players where id = p_player) then
    raise exception 'player_not_found';
  end if;
  perform public.market_move(v_o.seller_id, p_player, v_o.kind, v_o.give_key);
  if v_o.want_key is not null then
    perform public.market_move(p_player, v_o.seller_id, v_o.kind, v_o.want_key);
  end if;
  update public.market_offers
     set status = 'done', buyer_id = p_player, closed_at = now() where id = p_offer;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.market_list() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(s.x order by s.created desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id, 'sellerId', o.seller_id, 'seller', p.name, 'kind', o.kind,
      'give', o.give_key, 'want', o.want_key, 'expiresAt', o.expires_at) as x,
      o.created_at as created
    from public.market_offers o join public.players p on p.id = o.seller_id
    where o.status = 'open' and o.expires_at > now()
    order by o.created_at desc limit 100
  ) s
$$;

revoke all on function
  public.market_key_ok(text, text), public.market_move(uuid, uuid, text, text),
  public.market_create(uuid, text, text, text), public.market_cancel(uuid, uuid),
  public.market_accept(uuid, uuid), public.market_list()
  from public, anon, authenticated;
grant execute on function
  public.market_key_ok(text, text), public.market_move(uuid, uuid, text, text),
  public.market_create(uuid, text, text, text), public.market_cancel(uuid, uuid),
  public.market_accept(uuid, uuid), public.market_list()
  to service_role;

-- ===== 0010_pity_100.sql =====
-- Guaranteed Legendario now at 100 pulls without one (was 30).
update public.game_constants set value = 100 where key = 'pity_threshold';
alter table public.gacha_state drop constraint if exists gacha_state_pity_check;
alter table public.gacha_state
  add constraint gacha_state_pity_check check (pity between 0 and 100);

-- ===== 0011_weapon_types.sql =====
-- Item types: add maza, varita, libro and the 5 gear slots (casco, peto, piernas, zapatos, collar) (class compatibility lives in TS: CLASS_WEAPONS).
-- The key regexes and apply_pull are updated in 0012_ranks.sql.
alter table public.weapons drop constraint if exists weapons_type_check;
alter table public.weapons
  add constraint weapons_type_check check (type in ('espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar'));

-- ===== 0012_ranks.sql =====
-- Ranks F..SSR replace the 5 rarities (docs/DUNGEONS_FORJA.md).
-- Legacy mapping: comun->f, pococomun->d, raro->c, epico->a, legendario->s.
-- Two pity counters per banner: pity (ss or better at 100) and pity_ssr (ssr at 200).

-- 1. Drop old rarity CHECKs (names vary), remap data, add new CHECKs.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.characters'::regclass, 'public.weapons'::regclass, 'public.fragments'::regclass)
       and pg_get_constraintdef(c.oid) like '%rarity%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- equipment references the generated `key` columns: rebuild it around the update.
-- one piece per slot: weapon ('arma') plus the 5 gear slots. Added BEFORE the copy so a
-- re-run keeps every slot (copying without it collapsed all pieces into 'arma').
alter table public.equipment add column if not exists slot text not null default 'arma'
  check (slot in ('arma', 'casco', 'peto', 'piernas', 'zapatos', 'collar'));
create temporary table _equip as select * from public.equipment;
delete from public.equipment;
alter table public.equipment drop constraint if exists equipment_pkey;
alter table public.equipment add primary key (player_id, character_key, slot);

create or replace function pg_temp.rank(p text) returns text language sql immutable as $f$
  select case p when 'comun' then 'f' when 'pococomun' then 'd' when 'raro' then 'c'
               when 'epico' then 'a' when 'legendario' then 's' else p end
$f$;

update public.characters set rarity = pg_temp.rank(rarity);
update public.weapons set rarity = pg_temp.rank(rarity);
update public.fragments set rarity = pg_temp.rank(rarity);

insert into public.equipment (player_id, character_key, weapon_key, slot)
select player_id,
       regexp_replace(character_key, '-([a-z]+)$', '-' || pg_temp.rank((regexp_match(character_key, '-([a-z]+)$'))[1])),
       regexp_replace(weapon_key, '-([a-z]+)$', '-' || pg_temp.rank((regexp_match(weapon_key, '-([a-z]+)$'))[1])),
       slot
  from _equip;
drop table _equip;

-- open market offers carry keys too
update public.market_offers set
  give_key = regexp_replace(give_key, '-([a-z]+)$', '-' || pg_temp.rank((regexp_match(give_key, '-([a-z]+)$'))[1])),
  want_key = case when want_key is null then null
    else regexp_replace(want_key, '-([a-z]+)$', '-' || pg_temp.rank((regexp_match(want_key, '-([a-z]+)$'))[1])) end;

alter table public.characters
  add constraint characters_rarity_check check (rarity in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'));
alter table public.weapons
  add constraint weapons_rarity_check check (rarity in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'));
alter table public.fragments
  add constraint fragments_rarity_check check (rarity in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'));

-- 2. SSR pity counter.
alter table public.gacha_state
  add column if not exists pity_ssr int not null default 0 check (pity_ssr between 0 and 200);
insert into public.game_constants (key, value) values ('pity_ssr_threshold', 200)
on conflict (key) do update set value = excluded.value;

-- Dungeon clears: most lives left in a clear of each rank (unlocks the next one).
create table if not exists public.dungeon_clears (
  player_id uuid not null references public.players (id) on delete cascade,
  rank text not null check (rank in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr')),
  best_lives int not null check (best_lives between 1 and 5),
  primary key (player_id, rank)
);
alter table public.dungeon_clears enable row level security;

-- Forge parts and cores: key = p-<type>-<rank> or core-<element>.
create table if not exists public.part_stock (
  player_id uuid not null references public.players (id) on delete cascade,
  key text not null check (key ~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'),
  qty int not null check (qty between 0 and 9999),
  primary key (player_id, key)
);
alter table public.part_stock enable row level security;
revoke all on public.part_stock from anon, authenticated;
revoke all on public.dungeon_clears from anon, authenticated;

-- 3. Functions that list ranks or pity.
create or replace function public.market_key_ok(p_kind text, p_key text) returns boolean
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'character' then p_key ~ '^c-(caballero|mago|picaro|clerigo)-(agua|fuego|viento|tierra|rayo)-(f|e|d|c|b|a|s|ss|ssr)$'
    when 'weapon' then p_key ~ '^w-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(agua|fuego|viento|tierra|rayo)-(f|e|d|c|b|a|s|ss|ssr)$'
    else false end
$$;

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
    'parts', coalesce((
      select jsonb_object_agg(k.key, k.qty)
      from public.part_stock k where k.player_id = p_player and k.qty > 0
    ), '{}'::jsonb),
    'dungeons', coalesce((
      select jsonb_object_agg(d.rank, d.best_lives)
      from public.dungeon_clears d where d.player_id = p_player
    ), '{}'::jsonb),
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars, 'data', c.data
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars, 'data', w.data
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

drop function if exists public.apply_pull(uuid, int, text, text, int, int, bigint, boolean, jsonb);

create or replace function public.apply_pull(
  p_player uuid, p_version int, p_idem text, p_banner text, p_cost int,
  p_pity int, p_pity_ssr int, p_seed bigint, p_daily boolean, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_prev public.pulls;
  v_n int;
  v_unit int;
  v_expected int;
  v_old_pity int;
  v_run_pity int;
  v_old_pity_ssr int;
  v_run_pity_ssr int;
  v_thr_ssr int := public.game_const('pity_ssr_threshold');
  v_thr int := public.game_const('pity_threshold');
  v_max_stars int := public.game_const('max_stars');
  v_item jsonb;
  v_data jsonb;
  v_cls text;
  v_typ text;
  v_el text;
  v_rar text;
  v_key text;
  v_stars int;
  v_status text;
  v_refund int;
  v_refund_total int := 0;
  v_frag int;
  v_fkey text;
  v_results jsonb := '[]'::jsonb;
  v_coins int;
  v_version int;
  v_out jsonb;
  v_daily boolean := coalesce(p_daily, false);
begin
  if p_banner is null or p_banner not in ('character', 'weapon')
     or p_idem is null or char_length(p_idem) not between 8 and 80
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  -- Serialize everything for this player.
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  -- Idempotency first: a replay must not fail on the (now bumped) version.
  select * into v_prev from public.pulls
   where player_id = p_player and idempotency_key = p_idem;
  if found then
    return v_prev.result || jsonb_build_object('replayed', true);
  end if;

  if p_version is distinct from v_state.version then
    raise exception 'conflict' using errcode = '40001';
  end if;

  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > public.game_const('multi_pull') then
    raise exception 'invalid_items';
  end if;

  v_unit := case p_banner
    when 'character' then public.game_const('pull_cost_character')
    else public.game_const('pull_cost_weapon') end;
  if v_daily then
    if v_n <> 1 then
      raise exception 'invalid_items';
    end if;
    v_expected := 0;
  elsif v_n = public.game_const('multi_pull') then
    v_expected := round(v_unit * v_n * (100 - public.game_const('multi_discount_pct')) / 100.0)::int;
  else
    v_expected := v_unit * v_n;
  end if;
  if p_cost is distinct from v_expected then
    raise exception 'invalid_cost';
  end if;
  if v_state.coins < v_expected then
    raise exception 'insufficient_coins';
  end if;

  if v_daily then
    begin
      insert into public.daily_claims (player_id, day) values (p_player, public.game_day());
    exception when unique_violation then
      raise exception 'already_claimed';
    end;
  end if;

  select pity, pity_ssr into v_old_pity, v_old_pity_ssr from public.gacha_state
   where player_id = p_player and banner = p_banner for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_run_pity := v_old_pity;
  v_run_pity_ssr := v_old_pity_ssr;

  for v_item in
    select t.e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by t.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_el := v_item ->> 'element';
    v_rar := v_item ->> 'rarity';
    v_data := coalesce(v_item -> 'data', '{}'::jsonb);
    if jsonb_typeof(v_data) <> 'object'
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;

    -- Pity (same semantics as rollRarity): at 100 the pull MUST be ss or better,
    -- at 200 (since the last ssr) it MUST be ssr.
    if v_run_pity_ssr >= v_thr_ssr and v_rar <> 'ssr' then
      raise exception 'invalid_pity';
    end if;
    if v_run_pity >= v_thr and v_rar not in ('ss', 'ssr') then
      raise exception 'invalid_pity';
    end if;
    v_run_pity := case when v_rar in ('ss', 'ssr') then 0 else v_run_pity + 1 end;
    v_run_pity_ssr := case when v_rar = 'ssr' then 0 else v_run_pity_ssr + 1 end;

    v_refund := 0;
    v_frag := 0;
    v_fkey := null;

    if p_banner = 'character' then
      v_cls := v_item ->> 'class';
      if not coalesce(v_cls = any (array['caballero', 'mago', 'picaro', 'clerigo']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'c-' || v_cls || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.characters
       where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.characters set stars = v_stars
           where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        -- Same class + rarity already owned (other element): fragment instead of a star.
        if exists (
          select 1 from public.characters
           where player_id = p_player and class = v_cls and rarity = v_rar
        ) then
          v_frag := 1;
          v_fkey := v_cls || ':' || v_rar;
          insert into public.fragments (player_id, class, rarity, qty)
          values (p_player, v_cls, v_rar, 1)
          on conflict (player_id, class, rarity) do update set qty = public.fragments.qty + 1;
        end if;
        insert into public.characters (player_id, class, element, rarity, data)
        values (p_player, v_cls, v_el, v_rar, v_data);
      end if;
    else
      v_typ := v_item ->> 'type';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'w-' || v_typ || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.weapons set stars = v_stars
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar, v_data);
      end if;
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', v_status, 'id', v_key, 'stars', v_stars, 'refund', v_refund,
      'fragmentGain', v_frag, 'fragmentKey', v_fkey));
  end loop;

  if v_run_pity is distinct from p_pity or v_run_pity_ssr is distinct from p_pity_ssr then
    raise exception 'invalid_pity';
  end if;

  update public.gacha_state set pity = v_run_pity, pity_ssr = v_run_pity_ssr
   where player_id = p_player and banner = p_banner;
  update public.player_state
     set coins = coins - v_expected + v_refund_total, version = version + 1
   where player_id = p_player
   returning coins, version into v_coins, v_version;

  v_out := jsonb_build_object(
    'replayed', false, 'coins', v_coins, 'version', v_version, 'pity', v_run_pity, 'pitySsr', v_run_pity_ssr,
    'refundTotal', v_refund_total, 'results', v_results);
  insert into public.pulls (player_id, idempotency_key, banner, cost, daily, seed, items, result)
  values (p_player, p_idem, p_banner, v_expected, v_daily, p_seed, p_items, v_out);
  return v_out;
end $$;

-- Equip: the slot comes from the piece type (hand weapons -> 'arma', gear -> its own slot).
create or replace function public.equip_weapon(
  p_player uuid, p_character_id text, p_weapon_id text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_type text;
  v_slot text;
begin
  select type into v_type from public.weapons where player_id = p_player and key = p_weapon_id;
  if v_type is null
     or not exists (select 1 from public.characters where player_id = p_player and key = p_character_id) then
    raise exception 'not_owned';
  end if;
  v_slot := case when v_type in ('casco', 'peto', 'piernas', 'zapatos', 'collar') then v_type else 'arma' end;
  delete from public.equipment
   where player_id = p_player
     and ((character_key = p_character_id and slot = v_slot) or weapon_key = p_weapon_id);
  insert into public.equipment (player_id, character_key, weapon_key, slot)
  values (p_player, p_character_id, p_weapon_id, v_slot);
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.unequip_weapon(uuid, text);
create or replace function public.unequip_weapon(
  p_player uuid, p_character_id text, p_slot text default 'arma'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.equipment
   where player_id = p_player and character_key = p_character_id and slot = p_slot;
  return jsonb_build_object('ok', true);
end $$;

-- Bank a run: coins + the loot pieces secured by bosses (p_loot).
drop function if exists public.bank_run(uuid, uuid, int, int, jsonb, text, text);
drop function if exists public.bank_run(uuid, uuid, int, int, jsonb, text, text, jsonb);
drop function if exists public.bank_run(uuid, uuid, int, int, jsonb, text, text, jsonb, jsonb);
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
  v_item jsonb;
  v_typ text;
  v_el text;
  v_rar text;
  v_stars int;
  v_refund int := 0;
  v_pkey text;
  v_pqty text;
begin
  if p_coins is null or p_coins < 0 or p_max_floor is null or p_max_floor < 0
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut') then
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

  -- Loot secured by bosses (the server replayed the run): new piece, +1 star on a
  -- duplicate, or a coin refund when the duplicate is already at max stars.
  if p_loot is null or jsonb_typeof(p_loot) <> 'array' or jsonb_array_length(p_loot) > 80 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_item in select e from jsonb_array_elements(p_loot) as t(e) loop
      v_typ := v_item ->> 'type';
      v_el := v_item ->> 'element';
      v_rar := v_item ->> 'rarity';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
         or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
         or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
        raise exception 'invalid_items';
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= public.game_const('max_stars') then
          v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          update public.weapons set stars = v_stars + 1
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar,
                jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
      end if;
    end loop;
  end if;

  -- Forge parts secured by bosses (as replayed): add to the stock.
  if p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or (select count(*) from jsonb_object_keys(p_parts)) > 300 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_items';
      end if;
      insert into public.part_stock (player_id, key, qty)
      values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;
  end if;

  -- Dungeon clear (the server replayed the victory): keep the best lives left.
  if p_clear is not null and v_verdict <> 'rejected' then
    insert into public.dungeon_clears (player_id, rank, best_lives)
    values (p_player, p_clear ->> 'rank', (p_clear ->> 'lives')::int)
    on conflict (player_id, rank) do update
      set best_lives = greatest(public.dungeon_clears.best_lives, excluded.best_lives);
  end if;

  update public.player_state
     set coins = coins + v_coins + v_refund, version = version + 1
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
    'coinsAdded', v_coins + v_refund, 'coins', v_new_coins, 'bestFloor', v_best, 'capped', v_capped);
end $$;

-- ===== 0013_forge_trade.sql =====
-- 0013: forge persistence + value-equivalent trades.
-- (1) apply_forge: the server runs the TS forge (src/lib/game/forge.ts) and this
--     function persists its diff atomically (optimistic version, like apply_pull).
-- (2) market offers carry coins and must be EQUIVALENT in value (+-25%).

-- ---------------------------------------------------------------- forge
create or replace function public.apply_forge(
  p_player uuid, p_version int, p_coins int,
  p_spend jsonb, p_gain jsonb, p_grant jsonb, p_remove jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_k text;
  v_n text;
  v_item jsonb;
  v_id text;
  v_typ text; v_el text; v_rar text; v_stars int;
  v_re constant text := '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$';
begin
  if p_coins is null or p_coins < 0 or p_coins > 200000
     or jsonb_typeof(p_spend) <> 'object' or jsonb_typeof(p_gain) <> 'object'
     or jsonb_typeof(p_grant) <> 'array' or jsonb_typeof(p_remove) <> 'array'
     or jsonb_array_length(p_grant) > 4 or jsonb_array_length(p_remove) > 8 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then
    raise exception 'conflict' using errcode = '40001';
  end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;

  for v_k, v_n in select e.key, e.value from jsonb_each_text(p_spend) as e loop
    if v_k !~ v_re or v_n !~ '^[0-9]{1,3}$' then raise exception 'invalid_items'; end if;
    update public.part_stock set qty = qty - v_n::int
     where player_id = p_player and key = v_k and qty >= v_n::int;
    if not found then raise exception 'insufficient_parts'; end if;
  end loop;
  for v_k, v_n in select e.key, e.value from jsonb_each_text(p_gain) as e loop
    if v_k !~ v_re or v_n !~ '^[0-9]{1,3}$' then raise exception 'invalid_items'; end if;
    insert into public.part_stock (player_id, key, qty) values (p_player, v_k, v_n::int)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + excluded.qty, 9999);
  end loop;

  for v_id in select e from jsonb_array_elements_text(p_remove) as t(e) loop
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_id) then
      raise exception 'equipped';
    end if;
    delete from public.weapons where player_id = p_player and key = v_id;
    if not found then raise exception 'not_owned'; end if;
  end loop;

  for v_item in select e from jsonb_array_elements(p_grant) as t(e) loop
    v_typ := v_item ->> 'type'; v_el := v_item ->> 'element'; v_rar := v_item ->> 'rarity';
    if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;
    select stars into v_stars from public.weapons
     where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar for update;
    if found then
      if v_stars >= public.game_const('max_stars') then raise exception 'max_stars'; end if;
      update public.weapons set stars = stars + 1
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
    else
      insert into public.weapons (player_id, type, element, rarity, data)
      values (p_player, v_typ, v_el, v_rar,
              jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
    end if;
  end loop;

  update public.player_state
     set coins = coins - p_coins, version = version + 1
   where player_id = p_player
   returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('coins', v_state.coins, 'version', v_state.version);
end $$;

-- ----------------------------------------------------------------- trades
alter table public.market_offers
  add column if not exists coins int not null default 0 check (coins between -100000 and 100000);

-- Value of a piece = coins it costs to pull a copy of that rank (150 / odds).
-- Keep in sync with TRADE_VALUE in src/lib/game/market.ts.
create or replace function public.trade_value(p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case substring(p_key from '[^-]+$')
    when 'f' then 500 when 'e' then 700 when 'd' then 950 when 'c' then 1250
    when 'b' then 1650 when 'a' then 2500 when 's' then 5000 when 'ss' then 10000
    when 'ssr' then 30000 else 0 end
$$;

-- Equivalent trade: value(want) + coins within +-25% of value(give).
-- coins > 0: the acceptor pays the seller; coins < 0: the seller pays the acceptor.
create or replace function public.trade_fair(p_give text, p_want text, p_coins int) returns boolean
language sql immutable set search_path = ''
as $$
  select abs(public.trade_value(p_give)
             - (coalesce(public.trade_value(p_want), 0) + p_coins))
         <= public.trade_value(p_give) * 0.25
$$;

drop function if exists public.market_create(uuid, text, text, text);
create or replace function public.market_create(
  p_player uuid, p_kind text, p_give text, p_want text default null, p_coins int default 0
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_stars int;
begin
  if not public.market_key_ok(p_kind, p_give)
     or (p_want is not null and not public.market_key_ok(p_kind, p_want))
     or p_want is not distinct from p_give
     or p_coins is null or p_coins < -100000 or p_coins > 100000 then
    raise exception 'invalid_args';
  end if;
  if not public.trade_fair(p_give, p_want, p_coins) then
    raise exception 'unfair_trade';
  end if;
  perform 1 from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if p_kind = 'character' then
    select stars into v_stars from public.characters where player_id = p_player and key = p_give;
  else
    select stars into v_stars from public.weapons where player_id = p_player and key = p_give;
  end if;
  if v_stars is null or v_stars < 1 then raise exception 'not_owned'; end if;
  update public.market_offers set status = 'expired', closed_at = now()
   where seller_id = p_player and status = 'open' and expires_at <= now();
  if (select count(*) from public.market_offers
       where seller_id = p_player and status = 'open') >= public.game_const('market_max_open') then
    raise exception 'too_many_offers';
  end if;
  begin
    insert into public.market_offers (seller_id, kind, give_key, want_key, coins, expires_at)
    values (p_player, p_kind, p_give, p_want, p_coins,
            now() + interval '1 day' * public.game_const('market_ttl_days'))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_offered';
  end;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.market_accept(p_player uuid, p_offer uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_o public.market_offers;
  v_payer uuid;
  v_payee uuid;
  v_amount int;
begin
  select * into v_o from public.market_offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_o.status <> 'open' or v_o.expires_at <= now() then raise exception 'offer_closed'; end if;
  if v_o.seller_id = p_player then raise exception 'own_offer'; end if;
  -- Fixed lock order (by id) so two crossing trades cannot deadlock.
  perform 1 from public.player_state
   where player_id in (v_o.seller_id, p_player) order by player_id for update;
  if not exists (select 1 from public.players where id = p_player) then
    raise exception 'player_not_found';
  end if;
  if not public.trade_fair(v_o.give_key, v_o.want_key, v_o.coins) then
    raise exception 'unfair_trade';
  end if;
  if v_o.coins <> 0 then
    v_amount := abs(v_o.coins);
    v_payer := case when v_o.coins > 0 then p_player else v_o.seller_id end;
    v_payee := case when v_o.coins > 0 then v_o.seller_id else p_player end;
    if (select coins from public.player_state where player_id = v_payer) < v_amount then
      raise exception 'insufficient_coins';
    end if;
  end if;
  perform public.market_move(v_o.seller_id, p_player, v_o.kind, v_o.give_key);
  if v_o.want_key is not null then
    perform public.market_move(p_player, v_o.seller_id, v_o.kind, v_o.want_key);
  end if;
  if v_o.coins <> 0 then
    update public.player_state set coins = coins - v_amount, version = version + 1
     where player_id = v_payer;
    update public.player_state set coins = coins + v_amount, version = version + 1
     where player_id = v_payee;
  end if;
  update public.market_offers
     set status = 'done', buyer_id = p_player, closed_at = now() where id = p_offer;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.market_list() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(s.x order by s.created desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id, 'sellerId', o.seller_id, 'seller', p.name, 'kind', o.kind,
      'give', o.give_key, 'want', o.want_key, 'coins', o.coins,
      'expiresAt', o.expires_at) as x,
      o.created_at as created
    from public.market_offers o join public.players p on p.id = o.seller_id
    where o.status = 'open' and o.expires_at > now()
    order by o.created_at desc limit 100
  ) s
$$;

revoke all on function
  public.apply_forge(uuid, int, int, jsonb, jsonb, jsonb, jsonb),
  public.trade_value(text), public.trade_fair(text, text, int),
  public.market_create(uuid, text, text, text, int), public.market_accept(uuid, uuid),
  public.market_list()
  from public, anon, authenticated;
grant execute on function
  public.apply_forge(uuid, int, int, jsonb, jsonb, jsonb, jsonb),
  public.trade_value(text), public.trade_fair(text, text, int),
  public.market_create(uuid, text, text, text, int), public.market_accept(uuid, uuid),
  public.market_list()
  to service_role;

-- Old open offers (gifts / lopsided swaps) cannot be valid under the new rule.
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and not public.trade_fair(give_key, want_key, coins);

-- ===== 0014_room_rank.sql =====
-- 0014: rooms play a dungeon RANK (enemy difficulty only; the round keeps its own
-- 10-floor layout with bosses at 5 and 10). The host picks it in the lobby; the
-- API checks that every present player has it unlocked (dungeon clears).
alter table public.room_state
  add column if not exists rank text not null default 'f'
  check (rank in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'));

create or replace function public.set_room_rank(p_player uuid, p_room uuid, p_rank text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_st public.room_state;
begin
  if p_rank is null or p_rank not in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr') then
    raise exception 'invalid_args';
  end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'open' then raise exception 'room_closed'; end if;
  if v_room.host_id <> p_player then raise exception 'forbidden'; end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if v_st.phase <> 'lobby' then raise exception 'wrong_phase'; end if;
  update public.room_state set rank = p_rank, updated_at = now() where room_id = p_room;
  return jsonb_build_object('ok', true, 'rank', p_rank);
end $$;

create or replace function public.room_state_json(p_room uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'room_id', s.room_id, 'mode', s.mode, 'rank', s.rank, 'phase', s.phase, 'phase_seq', s.phase_seq,
    'round', s.round, 'floor', s.floor, 'round_seed', s.round_seed,
    'deadline', s.deadline, 'host_id', r.host_id, 'turn_seconds', r.turn_seconds)
  from public.room_state s join public.rooms r on r.id = s.room_id
  where s.room_id = p_room
$$;

revoke all on function public.set_room_rank(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_room_rank(uuid, uuid, text) to service_role;

-- ===== 0015_forge_bulk.sql =====
-- 0015: forge shortcuts (bulk operations) send more pieces per call: raise the limits.
create or replace function public.apply_forge(
  p_player uuid, p_version int, p_coins int,
  p_spend jsonb, p_gain jsonb, p_grant jsonb, p_remove jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_k text;
  v_n text;
  v_item jsonb;
  v_id text;
  v_typ text; v_el text; v_rar text; v_stars int;
  v_re constant text := '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$';
begin
  if p_coins is null or p_coins < 0 or p_coins > 200000
     or jsonb_typeof(p_spend) <> 'object' or jsonb_typeof(p_gain) <> 'object'
     or jsonb_typeof(p_grant) <> 'array' or jsonb_typeof(p_remove) <> 'array'
     or jsonb_array_length(p_grant) > 10 or jsonb_array_length(p_remove) > 80 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then
    raise exception 'conflict' using errcode = '40001';
  end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;

  for v_k, v_n in select e.key, e.value from jsonb_each_text(p_spend) as e loop
    if v_k !~ v_re or v_n !~ '^[0-9]{1,3}$' then raise exception 'invalid_items'; end if;
    update public.part_stock set qty = qty - v_n::int
     where player_id = p_player and key = v_k and qty >= v_n::int;
    if not found then raise exception 'insufficient_parts'; end if;
  end loop;
  for v_k, v_n in select e.key, e.value from jsonb_each_text(p_gain) as e loop
    if v_k !~ v_re or v_n !~ '^[0-9]{1,3}$' then raise exception 'invalid_items'; end if;
    insert into public.part_stock (player_id, key, qty) values (p_player, v_k, v_n::int)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + excluded.qty, 9999);
  end loop;

  for v_id in select e from jsonb_array_elements_text(p_remove) as t(e) loop
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_id) then
      raise exception 'equipped';
    end if;
    delete from public.weapons where player_id = p_player and key = v_id;
    if not found then raise exception 'not_owned'; end if;
  end loop;

  for v_item in select e from jsonb_array_elements(p_grant) as t(e) loop
    v_typ := v_item ->> 'type'; v_el := v_item ->> 'element'; v_rar := v_item ->> 'rarity';
    if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;
    select stars into v_stars from public.weapons
     where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar for update;
    if found then
      if v_stars >= public.game_const('max_stars') then raise exception 'max_stars'; end if;
      update public.weapons set stars = stars + 1
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
    else
      insert into public.weapons (player_id, type, element, rarity, data)
      values (p_player, v_typ, v_el, v_rar,
              jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
    end if;
  end loop;

  update public.player_state
     set coins = coins - p_coins, version = version + 1
   where player_id = p_player
   returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('coins', v_state.coins, 'version', v_state.version);
end $$;

-- ===== 0016_room_aid.sql =====
-- 0016: aid between players (rooms). Chips can HELP a fighter instead of hindering:
-- 'heal' (+40% hp before the fight) and 'ward' (+15% atk/def during it). It shares the
-- interference slot (one intervention per fight). Aid costs a flat 20 chips; if the
-- helped fighter wins, the helper gets 10 back (no compensation for the target).
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.interferences'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%stronger_enemy%'
  loop
    execute format('alter table public.interferences drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.interferences
  add constraint interferences_kind_check
  check (kind in ('stronger_enemy', 'adverse_element', 'heal', 'ward'));

insert into public.game_constants (key, value) values ('aid_cost', 20), ('aid_refund', 10)
on conflict (key) do update set value = excluded.value;

create or replace function public.interfere(
  p_room uuid, p_from uuid, p_battle_key text, p_kind text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_chips int;
  v_cost int := public.game_const('interfere_cost');
  v_n int;
  v_max int;
  v_ties int;
begin
  if p_kind is null or p_kind not in ('stronger_enemy', 'adverse_element', 'heal', 'ward') then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status <> 'open' then
    raise exception 'battle_locked';
  end if;
  if v_b.fighter_id = p_from then
    raise exception 'self_interfere';
  end if;
  select chips into v_chips from public.room_players
   where room_id = p_room and player_id = p_from and left_at is null for update;
  if not found then
    raise exception 'not_member';
  end if;
  select count(*)::int, max(chips), count(*) filter (where chips <= v_chips)::int
    into v_n, v_max, v_ties
    from public.room_players where room_id = p_room and left_at is null;
  if p_kind in ('heal', 'ward') then
    v_cost := public.game_const('aid_cost'); -- flat: no catch-up discount
  elsif v_n >= public.game_const('catchup_min_players')
     and v_ties = 1
     and v_max - v_chips >= public.game_const('catchup_min_gap') then
    v_cost := v_cost - public.game_const('catchup_discount');
  end if;
  if v_chips < v_cost then
    raise exception 'insufficient_chips';
  end if;
  begin
    insert into public.interferences (room_id, battle_key, from_player, kind, cost)
    values (p_room, p_battle_key, p_from, p_kind, v_cost);
  exception when unique_violation then
    raise exception 'already_interfered';
  end;
  update public.room_players set chips = chips - v_cost
   where room_id = p_room and player_id = p_from;
  update public.room_battles set interfered = true where id = v_b.id;
  insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
  values (p_room, p_from, -v_cost, 'interfere', p_battle_key);
  return jsonb_build_object('cost', v_cost, 'chips', v_chips - v_cost);
end $$;

-- settle_battle: aid refunds the helper on a win (and keeps the old rules for hostile kinds).
create or replace function public.settle_battle(
  p_room uuid, p_battle_key text, p_outcome text,
  p_void_reason text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_i public.interferences;
  v_win bigint;
  v_lose bigint;
  v_void boolean;
  v_bet public.bets;
  v_pay int;
  v_count int := 0;
  v_comp int := 0;
  v_refund int := 0;
begin
  if p_outcome is null or p_outcome not in ('win', 'lose', 'void') then
    raise exception 'invalid_args';
  end if;
  if p_outcome = 'void' and (p_void_reason is null or p_void_reason not in ('fled', 'no_fight', 'room_closed')) then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status = 'settled' then
    raise exception 'battle_settled';
  end if;

  if p_outcome = 'void' then
    v_win := 0; v_lose := 0;
  else
    select coalesce(sum(stake) filter (where prediction = p_outcome), 0),
           coalesce(sum(stake) filter (where prediction <> p_outcome), 0)
      into v_win, v_lose
      from public.bets
     where room_id = p_room and battle_key = p_battle_key and status = 'open';
  end if;
  v_void := (p_outcome = 'void' or v_win = 0 or v_lose = 0);

  for v_bet in
    select * from public.bets
     where room_id = p_room and battle_key = p_battle_key and status = 'open'
     order by id for update
  loop
    if v_void then
      v_pay := v_bet.stake;
    elsif v_bet.prediction = p_outcome then
      v_pay := v_bet.stake + (v_bet.stake::bigint * v_lose / v_win)::int;
    else
      v_pay := 0;
    end if;
    update public.bets
       set status = case when v_void then 'void' else 'settled' end,
           payout = v_pay, settled_at = now()
     where id = v_bet.id;
    if v_pay > 0 then
      update public.room_players set chips = chips + v_pay
       where room_id = p_room and player_id = v_bet.bettor_id;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_bet.bettor_id, v_pay,
              case when v_void then 'bet_refund' else 'bet_win' end, p_battle_key);
    end if;
    v_count := v_count + 1;
  end loop;

  select * into v_i from public.interferences
   where room_id = p_room and battle_key = p_battle_key;
  if found then
    if v_i.kind in ('heal', 'ward') and p_outcome = 'win' then
      -- aid: no compensation for the target; the helper gets a part back
      v_refund := public.game_const('aid_refund');
      update public.room_players set chips = chips + v_refund
       where room_id = p_room and player_id = v_i.from_player;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_i.from_player, v_refund, 'interfere_refund', p_battle_key);
    elsif p_outcome = 'win' then
      v_comp := public.game_const('interfere_comp');
      update public.room_players set chips = chips + v_comp
       where room_id = p_room and player_id = v_b.fighter_id;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_b.fighter_id, v_comp, 'interfere_comp', p_battle_key);
    elsif p_outcome = 'void' and p_void_reason in ('no_fight', 'room_closed') then
      v_refund := v_i.cost;
      update public.room_players set chips = chips + v_refund
       where room_id = p_room and player_id = v_i.from_player;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_i.from_player, v_refund, 'interfere_refund', p_battle_key);
    end if;
  end if;

  update public.room_battles
     set status = 'settled', outcome = p_outcome,
         void_reason = case when p_outcome = 'void' then p_void_reason end
   where id = v_b.id;
  return jsonb_build_object('settled', v_count, 'voided', v_void,
    'comp', v_comp, 'interference_refund', v_refund);
end $$;

-- Awards: the "saboteador" count only includes hostile interference.
create or replace function public.night_summary(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_st public.room_state;
  v_off int := public.game_const('room_round_offset');
  v_out jsonb;
begin
  select * into v_st from public.room_state where room_id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  with s as (
    select rp.player_id, pl.name, rp.chips,
      coalesce((select max(f.floor + v_off * (f.round - 1)) from public.room_floor f
                 where f.room_id = rp.room_id and f.player_id = rp.player_id and f.outcome = 'won'), 0) as max_floor,
      (select count(*)::int from public.room_floor f
        where f.room_id = rp.room_id and f.player_id = rp.player_id and f.outcome = 'won') as wins,
      (select count(*)::int from public.room_floor f
        where f.room_id = rp.room_id and f.player_id = rp.player_id and f.outcome in ('lost', 'timeout')) as losses,
      coalesce((select sum(bt.payout - bt.stake)::int from public.bets bt
                 where bt.room_id = rp.room_id and bt.bettor_id = rp.player_id and bt.status = 'settled'), 0) as bet_net,
      (select count(*)::int from public.interferences i
        where i.room_id = rp.room_id and i.from_player = rp.player_id
          and i.kind in ('stronger_enemy', 'adverse_element')) as interferences
    from public.room_players rp join public.players pl on pl.id = rp.player_id
    where rp.room_id = p_room)
  select jsonb_build_object(
    'phase', v_st.phase, 'round', v_st.round,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'player_id', player_id, 'name', name, 'chips', chips, 'max_floor', max_floor,
        'wins', wins, 'losses', losses, 'bet_net', bet_net, 'interferences', interferences)
        order by chips desc, max_floor desc, name) from s), '[]'::jsonb),
    'awards', jsonb_build_object(
      'gafe', (select player_id from s where losses > 0 order by losses desc, name limit 1),
      'apostador', (select player_id from s where bet_net > 0 order by bet_net desc, name limit 1),
      'saboteador', (select player_id from s where interferences > 0 order by interferences desc, name limit 1)))
  into v_out;
  return v_out;
end $$;

-- ===== 0017_economy.sql =====
-- 0017: economy rebalance.
--  * gacha pulls cost 250 (was 150) so a guaranteed SSR takes ~4 weeks of play, not ~2;
--    new accounts start with 500 coins (still 2 pulls);
--  * trade values follow the new pull price (250 / odds of each rank);
--  * a verified dungeon clear may pay its victory bonus above the per-floor coin cap.
insert into public.game_constants (key, value) values
  ('pull_cost_character', 250), ('pull_cost_weapon', 250), ('starting_coins', 500)
on conflict (key) do update set value = excluded.value;

create or replace function public.trade_value(p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case substring(p_key from '[^-]+$')
    when 'f' then 830 when 'e' then 1140 when 'd' then 1560 when 'c' then 2080
    when 'b' then 2780 when 'a' then 4170 when 's' then 8330 when 'ss' then 16670
    when 'ssr' then 50000 else 0 end
$$;

-- Open offers that were fair at the old values may not be fair now: cancel them.
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and not public.trade_fair(give_key, want_key, coins);

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
  v_item jsonb;
  v_typ text;
  v_el text;
  v_rar text;
  v_stars int;
  v_refund int := 0;
  v_pkey text;
  v_pqty text;
begin
  if p_coins is null or p_coins < 0 or p_max_floor is null or p_max_floor < 0
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut') then
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
  -- A verified dungeon clear pays its victory bonus on top (max 17180, see VICTORY_COINS).
  if p_clear is not null then
    v_cap := v_cap + 20000;
  end if;
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

  -- Loot secured by bosses (the server replayed the run): new piece, +1 star on a
  -- duplicate, or a coin refund when the duplicate is already at max stars.
  if p_loot is null or jsonb_typeof(p_loot) <> 'array' or jsonb_array_length(p_loot) > 80 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_item in select e from jsonb_array_elements(p_loot) as t(e) loop
      v_typ := v_item ->> 'type';
      v_el := v_item ->> 'element';
      v_rar := v_item ->> 'rarity';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
         or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
         or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
        raise exception 'invalid_items';
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= public.game_const('max_stars') then
          v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          update public.weapons set stars = v_stars + 1
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar,
                jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
      end if;
    end loop;
  end if;

  -- Forge parts secured by bosses (as replayed): add to the stock.
  if p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or (select count(*) from jsonb_object_keys(p_parts)) > 300 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_items';
      end if;
      insert into public.part_stock (player_id, key, qty)
      values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;
  end if;

  -- Dungeon clear (the server replayed the victory): keep the best lives left.
  if p_clear is not null and v_verdict <> 'rejected' then
    insert into public.dungeon_clears (player_id, rank, best_lives)
    values (p_player, p_clear ->> 'rank', (p_clear ->> 'lives')::int)
    on conflict (player_id, rank) do update
      set best_lives = greatest(public.dungeon_clears.best_lives, excluded.best_lives);
  end if;

  update public.player_state
     set coins = coins + v_coins + v_refund, version = version + 1
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
    'coinsAdded', v_coins + v_refund, 'coins', v_new_coins, 'bestFloor', v_best, 'capped', v_capped);
end $$;

-- ===== 0019_ascension.sql =====
-- 0019: dungeon ascension. dungeon_clears.best_asc = highest ascension level (0-5) cleared
-- in that dungeon; clearing level N unlocks N+1. get_profile exposes it as 'ascensions' and
-- bank_run reads p_clear.asc. Same signatures as before (create or replace keeps the lockdown
-- from 0018, so no new grants are needed).
alter table public.dungeon_clears
  add column if not exists best_asc int not null default 0 check (best_asc between 0 and 5);

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
    'parts', coalesce((
      select jsonb_object_agg(k.key, k.qty)
      from public.part_stock k where k.player_id = p_player and k.qty > 0
    ), '{}'::jsonb),
    'ascensions', coalesce((
      select jsonb_object_agg(d.rank, d.best_asc)
      from public.dungeon_clears d where d.player_id = p_player and d.best_asc > 0
    ), '{}'::jsonb),
    'dungeons', coalesce((
      select jsonb_object_agg(d.rank, d.best_lives)
      from public.dungeon_clears d where d.player_id = p_player
    ), '{}'::jsonb),
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars, 'data', c.data
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars, 'data', w.data
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
  v_item jsonb;
  v_typ text;
  v_el text;
  v_rar text;
  v_stars int;
  v_refund int := 0;
  v_pkey text;
  v_pqty text;
begin
  if p_coins is null or p_coins < 0 or p_max_floor is null or p_max_floor < 0
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut') then
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
  -- A verified dungeon clear pays its victory bonus on top (max 17180, see VICTORY_COINS).
  if p_clear is not null then
    v_cap := v_cap + 20000;
  end if;
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

  -- Loot secured by bosses (the server replayed the run): new piece, +1 star on a
  -- duplicate, or a coin refund when the duplicate is already at max stars.
  if p_loot is null or jsonb_typeof(p_loot) <> 'array' or jsonb_array_length(p_loot) > 80 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_item in select e from jsonb_array_elements(p_loot) as t(e) loop
      v_typ := v_item ->> 'type';
      v_el := v_item ->> 'element';
      v_rar := v_item ->> 'rarity';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
         or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
         or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
        raise exception 'invalid_items';
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= public.game_const('max_stars') then
          v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          update public.weapons set stars = v_stars + 1
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar,
                jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
      end if;
    end loop;
  end if;

  -- Forge parts secured by bosses (as replayed): add to the stock.
  if p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or (select count(*) from jsonb_object_keys(p_parts)) > 300 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_items';
      end if;
      insert into public.part_stock (player_id, key, qty)
      values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;
  end if;

  -- Dungeon clear (the server replayed the victory): keep the best lives left.
  if p_clear is not null and v_verdict <> 'rejected' then
    insert into public.dungeon_clears (player_id, rank, best_lives, best_asc)
    values (p_player, p_clear ->> 'rank', (p_clear ->> 'lives')::int,
            least(greatest(coalesce((p_clear ->> 'asc')::int, 0), 0), 5))
    on conflict (player_id, rank) do update
      set best_lives = greatest(public.dungeon_clears.best_lives, excluded.best_lives),
          best_asc = greatest(public.dungeon_clears.best_asc, excluded.best_asc);
  end if;

  update public.player_state
     set coins = coins + v_coins + v_refund, version = version + 1
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
    'coinsAdded', v_coins + v_refund, 'coins', v_new_coins, 'bestFloor', v_best, 'capped', v_capped);
end $$;

-- ===== 0020_room_coop.sql =====
-- 0020: coop final boss of a room. One row per player: the best damage the SERVER
-- replayed from the player's action log (the client never reports damage). Only the
-- server (service role) reads/writes it, so the log stays private; no functions here.
create table if not exists public.room_coop (
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  damage int not null default 0 check (damage >= 0),
  finished boolean not null default false,
  actions jsonb check (actions is null or pg_column_size(actions) < 100000),
  updated_at timestamptz not null default now(),
  primary key (room_id, player_id)
);
alter table public.room_coop enable row level security;
revoke all on public.room_coop from anon, authenticated;

-- ===== 0021_coop_reward.sql =====
-- 0021: coop boss prizes. room_coop.paid makes the payment idempotent per player;
-- coop_pay credits coins (account), cores (forge stock) and chips (room) once, only
-- after the boss phase is over. The server (TS) decides the amounts from the replayed
-- damage; this function only validates bounds and applies them.
alter table public.room_coop add column if not exists paid boolean not null default false;
alter table public.room_coop add column if not exists paid_at timestamptz;
alter table public.room_coop add column if not exists acct boolean not null default false; -- coins/cores were credited

alter table public.chip_ledger drop constraint if exists chip_ledger_reason_check;
alter table public.chip_ledger add constraint chip_ledger_reason_check
  check (reason in ('initial', 'bet_stake', 'bet_win', 'bet_refund', 'interfere',
                    'interfere_comp', 'interfere_refund', 'night_start', 'vote_event',
                    'coop_prize'));

create or replace function public.coop_pay(p_room uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phase text;
  v_row jsonb;
  v_player uuid;
  v_coins int;
  v_chips int;
  v_core text;
  v_acct boolean;
  v_paid int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 7 then
    raise exception 'invalid_args';
  end if;
  select phase into v_phase from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_phase not in ('night_summary', 'closed') then raise exception 'wrong_phase'; end if;
  for v_row in select e from jsonb_array_elements(p_rows) as t(e) loop
    v_player := (v_row ->> 'player')::uuid;
    v_coins := coalesce((v_row ->> 'coins')::int, 0);
    v_chips := coalesce((v_row ->> 'chips')::int, 0);
    if v_coins < 0 or v_coins > 1000 or v_chips < 0 or v_chips > 500
       or jsonb_typeof(coalesce(v_row -> 'cores', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(v_row -> 'cores', '[]'::jsonb)) > 3 then
      raise exception 'invalid_args';
    end if;
    perform 1 from public.room_coop
     where room_id = p_room and player_id = v_player and not paid for update;
    if not found then continue; end if;
    -- Account prizes (coins, cores) are limited to 3 rooms per 24 h per player; chips are not.
    v_acct := (select count(*) from public.room_coop
                where player_id = v_player and acct and paid_at > now() - interval '24 hours') < 3;
    update public.room_coop set paid = true, paid_at = now(), acct = v_acct
     where room_id = p_room and player_id = v_player;
    if not v_acct then
      v_coins := 0;
      v_row := jsonb_set(v_row, '{cores}', '[]'::jsonb);
    end if;
    if v_coins > 0 then
      update public.player_state set coins = coins + v_coins, version = version + 1
       where player_id = v_player;
    end if;
    for v_core in select e from jsonb_array_elements_text(coalesce(v_row -> 'cores', '[]'::jsonb)) as t(e) loop
      if v_core not in ('agua', 'fuego', 'viento', 'tierra', 'rayo') then
        raise exception 'invalid_items';
      end if;
      insert into public.part_stock (player_id, key, qty) values (v_player, 'core-' || v_core, 1)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + 1, 9999);
    end loop;
    if v_chips > 0 then
      update public.room_players set chips = chips + v_chips
       where room_id = p_room and player_id = v_player and left_at is null;
      if found then
        insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
        values (p_room, v_player, v_chips, 'coop_prize', 'coop');
      end if;
    end if;
    v_paid := v_paid + 1;
  end loop;
  return jsonb_build_object('paid', v_paid);
end $$;

revoke all on function public.coop_pay(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.coop_pay(uuid, jsonb) to service_role;

-- ===== 0022_tower.sql =====
-- 0022: weekly tower. Everybody climbs the SAME endless run (the week's seed) in two
-- separate modes: 'nivelado' (equal heroes) and 'coleccion' (your full-power hero).
-- One row per (week, mode, player) with the best floor; unlimited attempts. The week is
-- settled lazily (first request after it ends): top 3 per mode with at least 8 floors
-- get coins and cores, once. Server-only tables and functions (service_role).
create table if not exists public.tower_scores (
  week date not null,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  player_id uuid not null references public.players (id) on delete cascade,
  max_floor int not null check (max_floor between 0 and 500),
  updated_at timestamptz not null default now(),
  primary key (week, mode, player_id)
);
create table if not exists public.tower_settled (
  week date not null,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  winners jsonb not null default '[]'::jsonb,
  settled_at timestamptz not null default now(),
  primary key (week, mode)
);
alter table public.tower_scores enable row level security;
alter table public.tower_settled enable row level security;
revoke all on public.tower_scores, public.tower_settled from anon, authenticated;

create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_floor int;
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500 then
    raise exception 'invalid_args';
  end if;
  insert into public.tower_scores (week, mode, player_id, max_floor)
  values (public.game_week(), p_mode, p_player, p_floor)
  on conflict (week, mode, player_id) do update
    set max_floor = greatest(public.tower_scores.max_floor, excluded.max_floor),
        updated_at = case when excluded.max_floor > public.tower_scores.max_floor
                          then now() else public.tower_scores.updated_at end
  returning max_floor into v_floor;
  return jsonb_build_object('week', public.game_week(), 'max_floor', v_floor);
end $$;

-- Pays a finished week once per mode. Prizes (keep in sync with TOWER_PRIZES in tower.ts):
-- 1st 300 coins + 2 cores, 2nd 200 + 1, 3rd 100 + 1; needs >= 8 floors.
create or replace function public.tower_settle(p_week date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  r record;
  v_place int;
  v_coins int[] := array[300, 200, 100];
  v_cores int[] := array[2, 1, 1];
  v_els text[] := array['agua', 'fuego', 'viento', 'tierra', 'rayo'];
  v_win jsonb;
  v_n int := 0;
  k int;
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
       order by max_floor desc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      for k in 1 .. v_cores[v_place] loop
        insert into public.part_stock (player_id, key, qty)
        values (r.player_id,
                'core-' || v_els[1 + (abs(hashtext(p_week::text || r.player_id::text || k::text)) % 5)], 1)
        on conflict (player_id, key) do update
          set qty = least(public.part_stock.qty + 1, 9999);
      end loop;
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- Everything the tower screen needs in one call (also settles the last 2 finished weeks,
-- idempotently, so no scheduler is needed): the week, the top 10 and my place per mode,
-- and last week's podium per mode.
create or replace function public.tower_state(p_player uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := public.game_week();
  v_mode text;
  v_modes jsonb := '{}'::jsonb;
  v_last jsonb := '{}'::jsonb;
  v_top jsonb;
  v_mine jsonb;
  v_my public.tower_scores;
begin
  perform public.tower_settle(v_week - 7);
  perform public.tower_settle(v_week - 14);
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    select coalesce(jsonb_agg(jsonb_build_object('place', t.place, 'player', t.player_id,
                    'name', t.name, 'floor', t.max_floor) order by t.place), '[]'::jsonb)
      into v_top
      from (
        select row_number() over (order by s.max_floor desc, s.updated_at asc, s.player_id) as place,
               s.player_id, p.name, s.max_floor
          from public.tower_scores s join public.players p on p.id = s.player_id
         where s.week = v_week and s.mode = v_mode
         order by s.max_floor desc, s.updated_at asc, s.player_id
         limit 10
      ) t;
    select * into v_my from public.tower_scores
     where week = v_week and mode = v_mode and player_id = p_player;
    if found then
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'place', 1 + (
        select count(*) from public.tower_scores o
         where o.week = v_week and o.mode = v_mode
           and (o.max_floor > v_my.max_floor
                or (o.max_floor = v_my.max_floor and o.updated_at < v_my.updated_at)
                or (o.max_floor = v_my.max_floor and o.updated_at = v_my.updated_at
                    and o.player_id < v_my.player_id))));
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
  end loop;
  return jsonb_build_object('week', v_week, 'modes', v_modes, 'last', v_last);
end $$;

revoke all on function public.tower_record(uuid, text, int) from public, anon, authenticated;
revoke all on function public.tower_settle(date) from public, anon, authenticated;
grant execute on function public.tower_record(uuid, text, int) to service_role;
grant execute on function public.tower_settle(date) to service_role;
revoke all on function public.tower_state(uuid) from public, anon, authenticated;
grant execute on function public.tower_state(uuid) to service_role;

-- ===== 0023_missions.sql =====
-- 0023: missions (daily / weekly / Friday room event). Which missions are active is decided
-- in TypeScript (src/lib/game/missions.ts, deterministic from the day / week key); the
-- database only keeps progress counters per key, the claimed tiers and the reroll, and pays
-- tiers from its own constants. Keep the tier tables below in sync with SCOPE_TIERS.
-- Room events (bet won, aid given, coop damage, round played) are counted by triggers so no
-- existing room function changes. Server-only (service_role).
create table if not exists public.mission_state (
  player_id uuid not null references public.players (id) on delete cascade,
  scope text not null check (scope in ('daily', 'weekly', 'event')),
  period date not null, -- game_day() for daily, game_week() otherwise
  progress jsonb not null default '{}'::jsonb check (pg_column_size(progress) < 4000),
  claimed int not null default 0 check (claimed between 0 and 3),
  rerolled int check (rerolled is null or rerolled between 0 and 2),
  primary key (player_id, scope, period)
);
alter table public.mission_state enable row level security;
revoke all on public.mission_state from anon, authenticated;

-- Adds n to one counter in the daily, weekly and (Fri/Sat) event rows. Internal.
create or replace function public.mission_bump(p_player uuid, p_key text, p_n int) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_scope text;
  v_period date;
begin
  if p_key is null or p_key !~ '^[a-z_]{1,24}(:[a-z]{1,12})?$' or p_n is null or p_n < 1 or p_n > 500 then
    raise exception 'invalid_args';
  end if;
  foreach v_scope in array array['daily', 'weekly', 'event'] loop
    if v_scope = 'event' and extract(dow from public.game_day()) not in (5, 6) then
      continue;
    end if;
    v_period := case when v_scope = 'daily' then public.game_day() else public.game_week() end;
    insert into public.mission_state (player_id, scope, period, progress)
    values (p_player, v_scope, v_period, jsonb_build_object(p_key, p_n))
    on conflict (player_id, scope, period) do update
      set progress = public.mission_state.progress || jsonb_build_object(p_key,
        least(100000, coalesce((public.mission_state.progress ->> p_key)::int, 0) + p_n));
  end loop;
end $$;

-- Server-side batch: {"fight_win": 3, "element_win:fuego": 3}. Never fails the caller's flow.
create or replace function public.mission_add(p_player uuid, p_events jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'object' then
    raise exception 'invalid_args';
  end if;
  for r in select key, value from jsonb_each_text(p_events) loop
    if r.value ~ '^[0-9]{1,3}$' and r.value::int > 0 then
      perform public.mission_bump(p_player, r.key, r.value::int);
    end if;
  end loop;
end $$;

create or replace function public.mission_get(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_scope text;
  v_period date;
  v_row public.mission_state;
  v_out jsonb := jsonb_build_object('day', public.game_day()::text, 'week', public.game_week()::text);
begin
  foreach v_scope in array array['daily', 'weekly', 'event'] loop
    v_period := case when v_scope = 'daily' then public.game_day() else public.game_week() end;
    select * into v_row from public.mission_state
     where player_id = p_player and scope = v_scope and period = v_period;
    v_out := v_out || jsonb_build_object(v_scope, jsonb_build_object(
      'progress', coalesce(v_row.progress, '{}'::jsonb),
      'claimed', coalesce(v_row.claimed, 0),
      'rerolled', v_row.rerolled));
  end loop;
  return v_out;
end $$;

-- Pays the tiers between what was claimed and p_reached (the server computed it from the
-- progress). Idempotent: a second call with the same p_reached pays nothing and raises.
create or replace function public.mission_claim(p_player uuid, p_scope text, p_reached int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_period date;
  v_row public.mission_state;
  v_coins int[];
  v_cores int[];
  v_els text[] := array['agua', 'fuego', 'viento', 'tierra', 'rayo'];
  v_pay int := 0;
  v_core int := 0;
  k int;
begin
  if p_scope not in ('daily', 'weekly', 'event') or p_reached is null or p_reached not between 1 and 3 then
    raise exception 'invalid_args';
  end if;
  v_coins := case p_scope when 'daily' then array[100, 150, 250]
                          when 'weekly' then array[250, 400, 600]
                          else array[100, 200, 700] end;
  v_cores := case p_scope when 'daily' then array[0, 0, 0] else array[0, 0, 1] end;
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
  end loop;
  update public.mission_state set claimed = p_reached
   where player_id = p_player and scope = p_scope and period = v_period;
  update public.player_state set coins = coins + v_pay, version = version + 1
   where player_id = p_player;
  for k in 1 .. v_core loop
    insert into public.part_stock (player_id, key, qty)
    values (p_player,
            'core-' || v_els[1 + (abs(hashtext(v_period::text || p_scope || p_player::text || k::text)) % 5)], 1)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + 1, 9999);
  end loop;
  return jsonb_build_object('coins', v_pay, 'cores', v_core, 'claimed', p_reached);
end $$;

-- One free reroll per period for daily / weekly (the server checked the slot is not done).
create or replace function public.mission_reroll(p_player uuid, p_scope text, p_slot int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_period date;
  v_n int;
begin
  if p_scope not in ('daily', 'weekly') or p_slot is null or p_slot not between 0 and 2 then
    raise exception 'invalid_args';
  end if;
  v_period := case when p_scope = 'daily' then public.game_day() else public.game_week() end;
  insert into public.mission_state (player_id, scope, period) values (p_player, p_scope, v_period)
  on conflict do nothing;
  update public.mission_state set rerolled = p_slot
   where player_id = p_player and scope = p_scope and period = v_period and rerolled is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'already_rerolled';
  end if;
  return jsonb_build_object('rerolled', p_slot);
end $$;

-- ---- room triggers ----
create or replace function public.mission_trg_bet() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'open' and new.status = 'settled' and new.payout > new.stake then
    perform public.mission_bump(new.bettor_id, 'bet_win', 1);
  end if;
  return new;
end $$;
drop trigger if exists mission_bet on public.bets;
create trigger mission_bet after update on public.bets
  for each row execute function public.mission_trg_bet();

create or replace function public.mission_trg_aid() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind in ('heal', 'ward') then
    perform public.mission_bump(new.from_player, 'aid', 1);
  end if;
  return new;
end $$;
drop trigger if exists mission_aid on public.interferences;
create trigger mission_aid after insert on public.interferences
  for each row execute function public.mission_trg_aid();

create or replace function public.mission_trg_coop() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.damage > 0 and (tg_op = 'INSERT' or old.damage = 0) then
    perform public.mission_bump(new.player_id, 'coop_damage', 1);
  end if;
  return new;
end $$;
drop trigger if exists mission_coop on public.room_coop;
create trigger mission_coop after insert or update on public.room_coop
  for each row execute function public.mission_trg_coop();

-- A round counts once the player reached its 3rd floor.
create or replace function public.mission_trg_round() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.floor = 3 then
    perform public.mission_bump(new.player_id, 'room_round', 1);
  end if;
  return new;
end $$;
drop trigger if exists mission_round on public.room_floor;
create trigger mission_round after insert on public.room_floor
  for each row execute function public.mission_trg_round();

revoke all on function public.mission_bump(uuid, text, int), public.mission_add(uuid, jsonb),
  public.mission_get(uuid), public.mission_claim(uuid, text, int),
  public.mission_reroll(uuid, text, int), public.mission_trg_bet(), public.mission_trg_aid(),
  public.mission_trg_coop(), public.mission_trg_round() from public, anon, authenticated;
grant execute on function public.mission_add(uuid, jsonb), public.mission_get(uuid),
  public.mission_claim(uuid, text, int), public.mission_reroll(uuid, text, int) to service_role;

-- ===== 0024_economy_v2.sql =====
-- 0024: economy v2. (1) bank_run pays a one-off bonus chest on the first clear of a dungeon
-- rank (x4 victory coins) and on each new ascension level (x2 x (level+1)), mirroring
-- firstClearCoins in dungeons.ts. (2) One-time reset of every player's dungeon progress
-- (dungeon_clears: unlocks, best lives and ascensions) so everyone re-earns the new rewards.
-- Characters, weapons, coins, parts and pity are NOT touched. The reset is guarded by a flag
-- so re-running setup.sql never resets again. Same bank_run signature as 0019 (the 0018
-- lockdown grants stay in place).
create table if not exists public.migration_flags (
  key text primary key,
  applied_at timestamptz not null default now()
);
alter table public.migration_flags enable row level security;
revoke all on public.migration_flags from anon, authenticated;

do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0024_reset_dungeons') then
    delete from public.dungeon_clears;
    insert into public.migration_flags (key) values ('0024_reset_dungeons');
  end if;
end $$;

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
  v_item jsonb;
  v_typ text;
  v_el text;
  v_rar text;
  v_stars int;
  v_refund int := 0;
  v_pkey text;
  v_pqty text;
  v_bonus int := 0;
  v_prev_asc int;
  v_asc int;
  v_win int;
begin
  if p_coins is null or p_coins < 0 or p_max_floor is null or p_max_floor < 0
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut') then
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
  -- A verified dungeon clear pays its victory bonus on top (max 17180, see VICTORY_COINS).
  if p_clear is not null then
    v_cap := v_cap + 20000;
  end if;
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

  -- Loot secured by bosses (the server replayed the run): new piece, +1 star on a
  -- duplicate, or a coin refund when the duplicate is already at max stars.
  if p_loot is null or jsonb_typeof(p_loot) <> 'array' or jsonb_array_length(p_loot) > 80 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_item in select e from jsonb_array_elements(p_loot) as t(e) loop
      v_typ := v_item ->> 'type';
      v_el := v_item ->> 'element';
      v_rar := v_item ->> 'rarity';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
         or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
         or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
        raise exception 'invalid_items';
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= public.game_const('max_stars') then
          v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          update public.weapons set stars = v_stars + 1
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar,
                jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
      end if;
    end loop;
  end if;

  -- Forge parts secured by bosses (as replayed): add to the stock.
  if p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or (select count(*) from jsonb_object_keys(p_parts)) > 300 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_items';
      end if;
      insert into public.part_stock (player_id, key, qty)
      values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;
  end if;

  -- Dungeon clear (the server replayed the victory): keep the best lives left.
  if p_clear is not null and v_verdict <> 'rejected' then
    -- One-off bonus chest: first clear of a rank (x4 victory coins) and each new ascension
    -- level (x2 x (level+1)). Keep in sync with firstClearCoins / VICTORY_COINS (dungeons.ts).
    v_asc := least(greatest(coalesce((p_clear ->> 'asc')::int, 0), 0), 5);
    v_win := case p_clear ->> 'rank'
      when 'f' then 30 when 'e' then 45 when 'd' then 65 when 'c' then 100
      when 'b' then 150 when 'a' then 230 when 's' then 350 when 'ss' then 600
      when 'ssr' then 1000 else 0 end;
    select best_asc into v_prev_asc from public.dungeon_clears
     where player_id = p_player and rank = p_clear ->> 'rank';
    if not found then
      v_bonus := v_win * 4;
      v_prev_asc := 0;
    end if;
    if v_asc > v_prev_asc then
      v_bonus := v_bonus + v_win * 2 * (v_asc + 1);
    end if;
    insert into public.dungeon_clears (player_id, rank, best_lives, best_asc)
    values (p_player, p_clear ->> 'rank', (p_clear ->> 'lives')::int,
            least(greatest(coalesce((p_clear ->> 'asc')::int, 0), 0), 5))
    on conflict (player_id, rank) do update
      set best_lives = greatest(public.dungeon_clears.best_lives, excluded.best_lives),
          best_asc = greatest(public.dungeon_clears.best_asc, excluded.best_asc);
  end if;

  update public.player_state
     set coins = coins + v_coins + v_refund + v_bonus, version = version + 1
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
    'coinsAdded', v_coins + v_refund + v_bonus, 'coins', v_new_coins, 'bestFloor', v_best, 'capped', v_capped);
end $$;

-- ===== 0025_hero_piece_fields.sql =====
-- 0025: Run v2 hero and piece fields (additive).
--  * characters: level, xp (hero EXP), skill (third skill pick), legacy (existed before Run v2:
--    burns at the higher "reconversion" rate, see burn.ts).
--  * weapons (every piece): roll (+-15%), lines (extra stat lines of gear), legacy.
--  * player_state: levels_day / levels_n, the daily counter of REPEATED levels (pay decays).
-- Rows that exist when this runs are marked legacy exactly once (migration_flags).
create table if not exists public.migration_flags (
  key text primary key,
  applied_at timestamptz not null default now()
);
alter table public.migration_flags enable row level security;
revoke all on public.migration_flags from anon, authenticated;

alter table public.characters
  add column if not exists level int not null default 1 check (level between 1 and 999),
  add column if not exists xp int not null default 0 check (xp >= 0),
  add column if not exists skill text check (skill is null or skill ~ '^[A-Za-z]{3,20}$'),
  add column if not exists legacy boolean not null default false;

alter table public.weapons
  add column if not exists roll numeric check (roll is null or roll between 0.85 and 1.15),
  add column if not exists lines jsonb check (lines is null or (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 3)),
  add column if not exists legacy boolean not null default false;

alter table public.player_state
  add column if not exists levels_day date,
  add column if not exists levels_n int not null default 0 check (levels_n >= 0);

do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0025_mark_legacy') then
    update public.characters set legacy = true;
    update public.weapons set legacy = true;
    insert into public.migration_flags (key) values ('0025_mark_legacy');
  end if;
end $$;

-- ===== 0026_dungeon_progress.sql =====
-- 0026: Run v2 dungeon progress + one-time cleanup + get_profile v2.
--  * dungeon_progress: levels cleared IN ORDER per (rank, ascension). Replaces dungeon_clears,
--    which stays untouched (audit; nothing reads it any more), so everybody starts again.
--  * ONE-TIME (flag 0026_run_v2_reset): half-finished runs of the old engine are closed unpaid
--    (a run_submissions row records why) and the current week's tower scores are archived
--    and cleared (the engine changed). Coins, characters, pieces, parts and pity are kept.
--  * get_profile exposes the new fields (hero level/xp/skill/legacy, piece roll/lines/legacy,
--    dungeons as arrays, levelsDay). The SS pity (pity) is returned but unused.
create table if not exists public.dungeon_progress (
  player_id uuid not null references public.players (id) on delete cascade,
  rank text not null check (rank in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr')),
  ascension int not null check (ascension between 0 and 5),
  cleared int not null default 0 check (cleared between 0 and 12),
  primary key (player_id, rank, ascension)
);
alter table public.dungeon_progress enable row level security;
revoke all on public.dungeon_progress from anon, authenticated;
drop policy if exists deny_all on public.dungeon_progress;
create policy deny_all on public.dungeon_progress as restrictive for all
  to anon, authenticated using (false) with check (false);

-- Tower: rounds = total battle rounds of the best climb (tiebreak: fewer wins).
alter table public.tower_scores
  add column if not exists rounds int not null default 0 check (rounds between 0 and 1000000);
create table if not exists public.tower_scores_archive (
  like public.tower_scores including defaults,
  archived_at timestamptz not null default now(),
  reason text not null default 'run_v2'
);
alter table public.tower_scores_archive enable row level security;
revoke all on public.tower_scores_archive from anon, authenticated;
drop policy if exists deny_all on public.tower_scores_archive;
create policy deny_all on public.tower_scores_archive as restrictive for all
  to anon, authenticated using (false) with check (false);

do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0026_run_v2_reset') then
    insert into public.run_submissions (run_id, player_id, log, verdict, reason)
    select r.id, r.player_id, null, 'rejected', 'run_v2_migration'
      from public.runs r
     where r.status = 'open'
    on conflict (run_id) do nothing;
    update public.runs set status = 'closed', finished_at = now() where status = 'open';
    insert into public.tower_scores_archive (week, mode, player_id, max_floor, updated_at, rounds)
    select week, mode, player_id, max_floor, updated_at, rounds
      from public.tower_scores where week >= public.game_week();
    delete from public.tower_scores where week >= public.game_week();
    insert into public.migration_flags (key) values ('0026_run_v2_reset');
  end if;
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
    'parts', coalesce((
      select jsonb_object_agg(k.key, k.qty)
      from public.part_stock k where k.player_id = p_player and k.qty > 0
    ), '{}'::jsonb),
    -- {rank: [levels cleared at ascension 0, 1, ...]}
    'dungeons', coalesce((
      select jsonb_object_agg(t.rank, t.arr)
      from (
        select m.rank,
               (select jsonb_agg(coalesce(x.cleared, 0) order by a.n)
                  from generate_series(0, m.top) as a(n)
                  left join public.dungeon_progress x
                    on x.player_id = p_player and x.rank = m.rank and x.ascension = a.n) as arr
          from (select d.rank, max(d.ascension) as top
                  from public.dungeon_progress d
                 where d.player_id = p_player group by d.rank) m
      ) t
    ), '{}'::jsonb),
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
        'data', c.data || jsonb_build_object('level', c.level, 'xp', c.xp, 'legacy', c.legacy)
                       || case when c.skill is null then '{}'::jsonb else jsonb_build_object('skill', c.skill) end
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars,
        'data', w.data || jsonb_build_object('legacy', w.legacy)
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

-- ===== 0027_pieces_gacha_burn.sql =====
-- 0027: Run v2 pieces, gacha, forge, burn, hero skill and trade values.
--  * grant_piece(): ONE place that validates a piece's roll/lines and adds it to the
--    collection (new / +1 star keeping the better roll / refund). Pulls, forge and level
--    loot all go through it.
--  * apply_pull: SS pity is gone; SSR pity is guaranteed at 250 (pity_ssr_threshold).
--    p_pity stays in the signature (unused) so the function keeps its grants.
--  * apply_forge: grants carry roll/lines rolled by the server.
--  * burn_item / burn_hero: permanent 8% of trade_value, 50% for "legacy" rows.
--  * choose_hero_skill: the third skill is saved on the hero.
--  * trade_value: SSR 36000 (market fairness follows).
-- Function signatures that are NEW are born executable by anon/authenticated:
-- 0018_lockdown_functions.sql (always the last migration) closes them again.

-- ---------------------------------------------------------------- helpers
create or replace function public.rank_idx(p_rank text) returns int
language sql immutable set search_path = ''
as $$ select array_position(array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'], p_rank) - 1 $$;

-- Extra stat lines of a gear piece by rank: C 1, A 2, SS 3 (extraLines in gear.ts).
create or replace function public.extra_lines(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select (public.rank_idx(p_rank) >= 3)::int + (public.rank_idx(p_rank) >= 5)::int
       + (public.rank_idx(p_rank) >= 7)::int
$$;

create or replace function public.piece_quality(p_roll numeric, p_lines jsonb) returns numeric
language sql immutable set search_path = ''
as $$
  select coalesce(p_roll, 1) + coalesce((
    select sum((l ->> 'roll')::numeric) from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as t(l)
  ), 0)
$$;

-- Mirrors parseRoll/LINE_POOL (gear.ts). Raises invalid_items on anything off.
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
    when 'casco' then array['accuracy', 'crit', 'critDmg', 'def', 'dodge']
    when 'peto' then array['hp', 'regen', 'dodge', 'lifesteal', 'speed']
    when 'piernas' then array['crit', 'critDmg', 'accuracy', 'speed', 'lifesteal']
    when 'zapatos' then array['dodge', 'hp', 'atk', 'regen', 'crit']
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

-- Adds a piece to a player's collection. Returns 'new', 'star' or 'refund' (duplicate at max
-- stars, only when p_refund_on_max; otherwise max_stars is raised). A duplicate keeps the
-- better of the two rolls. The caller locks player_state.
create or replace function public.grant_piece(
  p_player uuid, p_type text, p_element text, p_rank text, p_name text,
  p_roll numeric, p_lines jsonb, p_refund_on_max boolean
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_stars int;
  v_oroll numeric;
  v_olines jsonb;
  v_lines jsonb := case when p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
                        then null else p_lines end;
begin
  if not coalesce(p_type = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
     or not coalesce(p_element = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
     or not coalesce(p_rank = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
    raise exception 'invalid_items';
  end if;
  perform public.piece_check(p_type, p_rank, p_roll, v_lines);
  select stars, roll, lines into v_stars, v_oroll, v_olines from public.weapons
   where player_id = p_player and type = p_type and element = p_element and rarity = p_rank
   for update;
  if found then
    if v_stars >= public.game_const('max_stars') then
      if p_refund_on_max then return 'refund'; end if;
      raise exception 'max_stars';
    end if;
    if public.piece_quality(p_roll, v_lines) > public.piece_quality(v_oroll, v_olines) then
      update public.weapons set stars = v_stars + 1, roll = p_roll, lines = v_lines
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    else
      update public.weapons set stars = v_stars + 1
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    end if;
    return 'star';
  end if;
  insert into public.weapons (player_id, type, element, rarity, roll, lines, data)
  values (p_player, p_type, p_element, p_rank, p_roll, v_lines,
          jsonb_build_object('name', left(coalesce(p_name, 'Pieza'), 60)));
  return 'new';
end $$;

-- ------------------------------------------------------------ trade values
create or replace function public.trade_value(p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case substring(p_key from '[^-]+$')
    when 'f' then 830 when 'e' then 1140 when 'd' then 1560 when 'c' then 2080
    when 'b' then 2780 when 'a' then 4170 when 's' then 8330 when 'ss' then 16670
    when 'ssr' then 36000 else 0 end
$$;
-- Offers that were fair at the old SSR value may not be now: cancel them (as 0017 did).
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and not public.trade_fair(give_key, want_key, coins);

-- ------------------------------------------------------------------ pity
insert into public.game_constants (key, value) values ('pity_ssr_threshold', 250)
on conflict (key) do update set value = excluded.value;
alter table public.gacha_state drop constraint if exists gacha_state_pity_ssr_check;
alter table public.gacha_state
  add constraint gacha_state_pity_ssr_check check (pity_ssr between 0 and 250);

create or replace function public.apply_pull(
  p_player uuid, p_version int, p_idem text, p_banner text, p_cost int,
  p_pity int, p_pity_ssr int, p_seed bigint, p_daily boolean, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_prev public.pulls;
  v_n int;
  v_unit int;
  v_expected int;
  v_old_pity_ssr int;
  v_run_pity_ssr int;
  v_thr_ssr int := public.game_const('pity_ssr_threshold');
  v_max_stars int := public.game_const('max_stars');
  v_item jsonb;
  v_data jsonb;
  v_cls text;
  v_typ text;
  v_el text;
  v_rar text;
  v_key text;
  v_stars int;
  v_status text;
  v_refund int;
  v_refund_total int := 0;
  v_frag int;
  v_fkey text;
  v_results jsonb := '[]'::jsonb;
  v_coins int;
  v_version int;
  v_out jsonb;
  v_daily boolean := coalesce(p_daily, false);
begin
  if p_banner is null or p_banner not in ('character', 'weapon')
     or p_idem is null or char_length(p_idem) not between 8 and 80
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  select * into v_prev from public.pulls
   where player_id = p_player and idempotency_key = p_idem;
  if found then
    return v_prev.result || jsonb_build_object('replayed', true);
  end if;

  if p_version is distinct from v_state.version then
    raise exception 'conflict' using errcode = '40001';
  end if;

  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > public.game_const('multi_pull') then
    raise exception 'invalid_items';
  end if;

  v_unit := case p_banner
    when 'character' then public.game_const('pull_cost_character')
    else public.game_const('pull_cost_weapon') end;
  if v_daily then
    if v_n <> 1 then
      raise exception 'invalid_items';
    end if;
    v_expected := 0;
  elsif v_n = public.game_const('multi_pull') then
    v_expected := round(v_unit * v_n * (100 - public.game_const('multi_discount_pct')) / 100.0)::int;
  else
    v_expected := v_unit * v_n;
  end if;
  if p_cost is distinct from v_expected then
    raise exception 'invalid_cost';
  end if;
  if v_state.coins < v_expected then
    raise exception 'insufficient_coins';
  end if;

  if v_daily then
    begin
      insert into public.daily_claims (player_id, day) values (p_player, public.game_day());
    exception when unique_violation then
      raise exception 'already_claimed';
    end;
  end if;

  select pity_ssr into v_old_pity_ssr from public.gacha_state
   where player_id = p_player and banner = p_banner for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_run_pity_ssr := v_old_pity_ssr;

  for v_item in
    select t.e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by t.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_el := v_item ->> 'element';
    v_rar := v_item ->> 'rarity';
    v_data := coalesce(v_item -> 'data', '{}'::jsonb) - 'level' - 'xp' - 'legacy' - 'skill';
    if jsonb_typeof(v_data) <> 'object'
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;

    -- Pity (same semantics as rollRarity): since the last SSR, the 250th pull MUST be ssr.
    if v_run_pity_ssr >= v_thr_ssr and v_rar <> 'ssr' then
      raise exception 'invalid_pity';
    end if;
    v_run_pity_ssr := case when v_rar = 'ssr' then 0 else least(v_run_pity_ssr + 1, v_thr_ssr) end;

    v_refund := 0;
    v_frag := 0;
    v_fkey := null;

    if p_banner = 'character' then
      v_cls := v_item ->> 'class';
      if not coalesce(v_cls = any (array['caballero', 'mago', 'picaro', 'clerigo']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'c-' || v_cls || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.characters
       where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.characters set stars = v_stars
           where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        if exists (
          select 1 from public.characters
           where player_id = p_player and class = v_cls and rarity = v_rar
        ) then
          v_frag := 1;
          v_fkey := v_cls || ':' || v_rar;
          insert into public.fragments (player_id, class, rarity, qty)
          values (p_player, v_cls, v_rar, 1)
          on conflict (player_id, class, rarity) do update set qty = public.fragments.qty + 1;
        end if;
        insert into public.characters (player_id, class, element, rarity, data)
        values (p_player, v_cls, v_el, v_rar, v_data);
      end if;
    else
      v_typ := v_item ->> 'type';
      v_key := 'w-' || v_typ || '-' || v_el || '-' || v_rar;
      v_status := public.grant_piece(
        p_player, v_typ, v_el, v_rar, v_data ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      if v_status = 'refund' then
        v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', v_status, 'id', v_key, 'stars', v_stars, 'refund', v_refund,
      'fragmentGain', v_frag, 'fragmentKey', v_fkey));
  end loop;

  if v_run_pity_ssr is distinct from p_pity_ssr then
    raise exception 'invalid_pity';
  end if;

  update public.gacha_state set pity_ssr = v_run_pity_ssr
   where player_id = p_player and banner = p_banner;
  update public.player_state
     set coins = coins - v_expected + v_refund_total, version = version + 1
   where player_id = p_player
   returning coins, version into v_coins, v_version;

  v_out := jsonb_build_object(
    'replayed', false, 'coins', v_coins, 'version', v_version, 'pitySsr', v_run_pity_ssr,
    'refundTotal', v_refund_total, 'results', v_results);
  insert into public.pulls (player_id, idempotency_key, banner, cost, daily, seed, items, result)
  values (p_player, p_idem, p_banner, v_expected, v_daily, p_seed, p_items, v_out);
  return v_out;
end $$;

-- ------------------------------------------------------------------ forge
create or replace function public.apply_forge(
  p_player uuid, p_version int, p_coins int,
  p_spend jsonb, p_gain jsonb, p_grant jsonb, p_remove jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_k text;
  v_n text;
  v_item jsonb;
  v_id text;
  v_re constant text := '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$';
begin
  if p_coins is null or p_coins < 0 or p_coins > 200000
     or jsonb_typeof(p_spend) <> 'object' or jsonb_typeof(p_gain) <> 'object'
     or jsonb_typeof(p_grant) <> 'array' or jsonb_typeof(p_remove) <> 'array'
     or jsonb_array_length(p_grant) > 10 or jsonb_array_length(p_remove) > 80 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then
    raise exception 'conflict' using errcode = '40001';
  end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;

  for v_k, v_n in select e.key, e.value from jsonb_each_text(p_spend) as e loop
    if v_k !~ v_re or v_n !~ '^[0-9]{1,3}$' then raise exception 'invalid_items'; end if;
    update public.part_stock set qty = qty - v_n::int
     where player_id = p_player and key = v_k and qty >= v_n::int;
    if not found then raise exception 'insufficient_parts'; end if;
  end loop;
  for v_k, v_n in select e.key, e.value from jsonb_each_text(p_gain) as e loop
    if v_k !~ v_re or v_n !~ '^[0-9]{1,3}$' then raise exception 'invalid_items'; end if;
    insert into public.part_stock (player_id, key, qty) values (p_player, v_k, v_n::int)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + excluded.qty, 9999);
  end loop;

  for v_id in select e from jsonb_array_elements_text(p_remove) as t(e) loop
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_id) then
      raise exception 'equipped';
    end if;
    delete from public.weapons where player_id = p_player and key = v_id;
    if not found then raise exception 'not_owned'; end if;
  end loop;

  for v_item in select e from jsonb_array_elements(p_grant) as t(e) loop
    perform public.grant_piece(
      p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
      case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
      v_item -> 'lines', false);
  end loop;

  update public.player_state
     set coins = coins - p_coins, version = version + 1
   where player_id = p_player
   returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('coins', v_state.coins, 'version', v_state.version);
end $$;

-- ------------------------------------------------------------------- burn
-- Burn value = trade_value x 8% (50% for legacy rows). Keep in sync with burn.ts.
create or replace function public.burn_item(p_player uuid, p_version int, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_legacy boolean;
  v_coins int;
begin
  if p_key is null or p_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select legacy into v_legacy from public.weapons where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if exists (select 1 from public.equipment where player_id = p_player and weapon_key = p_key) then
    raise exception 'equipped';
  end if;
  v_coins := public.trade_value(p_key) * case when v_legacy then 50 else 8 end / 100;
  delete from public.weapons where player_id = p_player and key = p_key;
  update public.player_state set coins = coins + v_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', p_key, 'gained', v_coins, 'coins', v_state.coins, 'version', v_state.version);
end $$;

create or replace function public.burn_hero(p_player uuid, p_version int, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_legacy boolean;
  v_coins int;
begin
  if p_key is null or p_key !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select legacy into v_legacy from public.characters where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if (select count(*) from public.characters where player_id = p_player) <= 1 then
    raise exception 'only_hero';
  end if;
  v_coins := public.trade_value(p_key) * case when v_legacy then 50 else 8 end / 100;
  -- Its gear stays in the collection: the equipment rows go with the hero (FK cascade).
  delete from public.characters where player_id = p_player and key = p_key;
  update public.player_state set coins = coins + v_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', p_key, 'gained', v_coins, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ------------------------------------------------------------ hero skill
-- Third skill: 1 of 2 per class, available from rank C or 3 stars (skills.ts).
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
       when 'mago' then array['tormenta', 'escudoArcano']
       when 'picaro' then array['golpeDoble', 'ejecutar']
       else array['santuario', 'castigo'] end)) then
    raise exception 'invalid_skill';
  end if;
  if public.rank_idx(v_c.rarity) < 3 and v_c.stars < 3 then
    raise exception 'skill_locked';
  end if;
  update public.characters set skill = p_skill where player_id = p_player and key = p_character_id;
  return jsonb_build_object('ok', true, 'skill', p_skill);
end $$;

-- ===== 0028_levels.sql =====
-- 0028: Run v2 dungeon levels. start_level opens a verified attempt (a `runs` row, one open at
-- a time); bank_level pays it ONCE after the server replayed the fights:
--   coins (flat per rank, repeats 60% with a daily decay), the first-clear chest of the dungeon,
--   parts / cores / pieces rolled by the server (levelLoot), hero EXP (kept even when the level
--   is lost), and the dungeon_progress update with the unlock rules.
-- Keep the constants in sync with levelPay.ts / heroLevel.ts / levels.ts (the pglite test
-- levels.mts compares them with the TS functions).

-- ---------------------------------------------------------------- constants
create or replace function public.level_count(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select case p_rank when 'f' then 6 when 'e' then 6 when 'd' then 7 when 'c' then 8
    when 'b' then 8 when 'a' then 9 when 's' then 10 when 'ss' then 11 when 'ssr' then 12 end
$$;

create or replace function public.level_base_coins(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select case p_rank when 'f' then 25 when 'e' then 25 when 'd' then 26 when 'c' then 27
    when 'b' then 28 when 'a' then 30 when 's' then 32 when 'ss' then 34 when 'ssr' then 36 end
$$;

create or replace function public.level_chest(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select case p_rank when 'f' then 1000 when 'e' then 1600 when 'd' then 2500 when 'c' then 1200
    when 'b' then 1500 when 'a' then 2000 when 's' then 2500 when 'ss' then 3000 when 'ssr' then 4000 end
$$;

-- Pay multiplier of the Nth repeated level of the day (levelDecay).
create or replace function public.level_decay(p_n int) returns numeric
language sql immutable set search_path = ''
as $$ select case when p_n <= 20 then 1 when p_n <= 40 then 0.5 when p_n <= 80 then 0.2 else 0.1 end::numeric $$;

-- ----------------------------------------------------------- unlock rules
create or replace function public.progress_cleared(p_player uuid, p_rank text, p_asc int) returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce((select cleared from public.dungeon_progress
                    where player_id = p_player and rank = p_rank and ascension = p_asc), 0)
$$;

-- Why a level is locked ('dungeon_locked', 'ascension_locked', 'level_locked') or null if open.
-- Mirrors isLevelUnlocked (dungeonProgress.ts): rank N opens when rank N-1 is done at
-- ascension 0; ascension A opens when A-1 is done; level L opens when L-1 is cleared.
create or replace function public.level_lock_reason(p_player uuid, p_rank text, p_level int, p_asc int) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ranks constant text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_i int := public.rank_idx(p_rank);
  v_a int := 0;
begin
  if v_i is null or p_level is null or p_asc is null or p_asc < 0 or p_asc > 5
     or p_level < 0 or p_level >= public.level_count(p_rank) then
    return 'level_locked';
  end if;
  if v_i > 0 and public.progress_cleared(p_player, v_ranks[v_i], 0) < public.level_count(v_ranks[v_i]) then
    return 'dungeon_locked';
  end if;
  while v_a < 5 and public.progress_cleared(p_player, p_rank, v_a) >= public.level_count(p_rank) loop
    v_a := v_a + 1;
  end loop;
  if p_asc > v_a then
    return 'ascension_locked';
  end if;
  if p_level > public.progress_cleared(p_player, p_rank, p_asc) then
    return 'level_locked';
  end if;
  return null;
end $$;

-- ------------------------------------------------------------------ EXP
-- Hero EXP (addHeroXp + gapMult in heroLevel.ts): catch-up bonus x2 / x3 when 10 / 20 levels
-- under the player's top hero, cost 10 x L^2 per level, cap 20 + 10 x stars.
create or replace function public.grant_hero_xp(p_player uuid, p_character_id text, p_xp int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
  v_top int;
  v_gap int;
  v_amount int;
  v_cap int;
  v_level int;
  v_xp int;
begin
  if p_xp is null or p_xp < 0 or p_xp > 100000 then raise exception 'invalid_args'; end if;
  select * into v_c from public.characters where player_id = p_player and key = p_character_id for update;
  if not found then
    return jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  end if;
  select max(level) into v_top from public.characters where player_id = p_player;
  v_gap := v_top - v_c.level;
  v_amount := p_xp * case when v_gap >= 20 then 3 when v_gap >= 10 then 2 else 1 end;
  v_cap := 20 + 10 * v_c.stars;
  v_level := v_c.level;
  v_xp := v_c.xp;
  if v_level >= v_cap then
    v_level := least(v_level, v_cap);
    v_xp := 0;
  else
    v_xp := v_xp + v_amount;
    while v_level < v_cap and v_xp >= 10 * v_level * v_level loop
      v_xp := v_xp - 10 * v_level * v_level;
      v_level := v_level + 1;
    end loop;
    if v_level >= v_cap then v_xp := 0; end if;
  end if;
  update public.characters set level = v_level, xp = v_xp
   where player_id = p_player and key = p_character_id;
  return jsonb_build_object('xp', v_amount, 'level', v_level, 'gained', v_level - v_c.level, 'applied', true);
end $$;

-- ------------------------------------------------------------ start a level
-- Opens the attempt. Only one open run per player (the caller closes a stale one first).
-- Rate limits (a script can replay the deterministic engine at CPU speed): at most 40 level
-- starts per hour and 300 per day; a person plays ~15 levels an hour.
create or replace function public.start_level(
  p_player uuid, p_character_id text, p_seed bigint, p_hero jsonb,
  p_rank text, p_level int, p_asc int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
  v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
  if v_why is not null then
    raise exception '%', v_why;
  end if;
  if (select count(*) from public.runs
       where player_id = p_player and hero ->> 'kind' = 'level'
         and started_at > now() - interval '1 hour') >= 40
     or (select count(*) from public.runs
          where player_id = p_player and hero ->> 'kind' = 'level'
            and started_at > now() - interval '1 day') >= 300 then
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
    values (p_player, p_seed,
            p_hero || jsonb_build_object('kind', 'level', 'rank', p_rank, 'level', p_level,
                                         'asc', p_asc, 'heroId', p_character_id))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'run_open';
  end;
  return jsonb_build_object('run_id', v_id);
end $$;

-- ---------------------------------------------------------- bank the attempt
-- p_status: how the replayed stage ended ('cleared' / 'lost'); p_xp: stage EXP of the replay
-- (raw); p_parts / p_pieces: the loot the server rolled with levelLoot (only if cleared);
-- p_repeat: whether that roll assumed the level was already cleared (checked here).
-- p_verdict: accepted | cut (illegal/short log: pay what the replay says) | rejected (pays nothing).
create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
  p_status text, p_xp int, p_parts jsonb, p_pieces jsonb, p_repeat boolean,
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
  v_pkey text;
  v_pqty text;
  v_total int := 0;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'rank' is distinct from p_rank
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

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or (select count(*) from jsonb_object_keys(p_parts)) > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 3 or (select count(*) from jsonb_object_keys(p_parts)) > 40 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.progress_cleared(p_player, p_rank, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_rank) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count(p_rank) then
      v_chest := round(public.level_chest(p_rank) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.dungeon_progress (player_id, rank, ascension, cleared)
      values (p_player, p_rank, p_asc, p_level + 1)
      on conflict (player_id, rank, ascension) do update
        set cleared = greatest(public.dungeon_progress.cleared, excluded.cleared);
    end if;

    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,2}$' then
        raise exception 'invalid_items';
      end if;
      v_total := v_total + v_pqty::int;
      if v_total > 40 then raise exception 'invalid_items'; end if;
      insert into public.part_stock (player_id, key, qty) values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_rank) + 1 then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      if v_status = 'refund' then
        v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
      end if;
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or (select count(*) from jsonb_object_keys(p_parts)) > 0 then
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
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;

-- ===== 0029_tower_rounds.sql =====
-- 0029: the weekly tower stores the total battle rounds of the best climb (tiebreak: fewer
-- rounds wins at equal floors), and the ranking orders by it. tower_record gets a new
-- signature (p_rounds): the old one is dropped so nothing can call it without the tiebreak.
-- tower_settle (weekly prizes) is NOT touched here: see docs/SQL_PENDIENTE_RUN_V2.md.
drop function if exists public.tower_record(uuid, text, int);
create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int, p_rounds int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_floor int; v_rounds int;
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500
     or p_rounds is null or p_rounds < 0 or p_rounds > 1000000 then
    raise exception 'invalid_args';
  end if;
  insert into public.tower_scores (week, mode, player_id, max_floor, rounds)
  values (public.game_week(), p_mode, p_player, p_floor, p_rounds)
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
  return jsonb_build_object('week', public.game_week(), 'max_floor', v_floor, 'rounds', v_rounds);
end $$;

create or replace function public.tower_state(p_player uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := public.game_week();
  v_mode text;
  v_modes jsonb := '{}'::jsonb;
  v_last jsonb := '{}'::jsonb;
  v_top jsonb;
  v_mine jsonb;
  v_my public.tower_scores;
begin
  perform public.tower_settle(v_week - 7);
  perform public.tower_settle(v_week - 14);
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
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'rounds', v_my.rounds, 'place', 1 + (
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
  end loop;
  return jsonb_build_object('week', v_week, 'modes', v_modes, 'last', v_last);
end $$;

-- ===== 0030_missions_tower_prizes.sql =====
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

-- ===== 0031_tutorial.sql =====
-- 0031: tutorial step stored on the account (was per browser).
-- sync_tutorial: p_step raises the step (never back); p_init seeds it once when still null.
-- Returns the stored step. Server only (0018 locks the function down).
alter table public.player_state
  add column if not exists tutorial int check (tutorial is null or tutorial between 0 and 7);

create or replace function public.sync_tutorial(p_player uuid, p_step int default null, p_init int default null)
returns int language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  if p_step is not null then
    update public.player_state set tutorial = greatest(coalesce(tutorial, 0), least(p_step, 7))
     where player_id = p_player returning tutorial into v;
  elsif p_init is not null then
    update public.player_state set tutorial = least(p_init, 7)
     where player_id = p_player and tutorial is null returning tutorial into v;
  end if;
  if v is null then
    select tutorial into v from public.player_state where player_id = p_player;
  end if;
  return v;
end $$;

revoke all on function public.sync_tutorial(uuid, int, int) from public, anon, authenticated;
grant execute on function public.sync_tutorial(uuid, int, int) to service_role;

-- Starter hero + weapon (rank F) for an account with no heroes that has not started the tutorial.
-- Returns true when it granted them (tutorial goes to step 1), false when the guard says no.
create or replace function public.grant_starter(
  p_player uuid, p_class text, p_element text, p_data jsonb,
  p_type text, p_name text, p_roll numeric, p_lines jsonb
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.player_state where player_id = p_player and tutorial is null for update;
  if not found or exists (select 1 from public.characters where player_id = p_player) then
    return false;
  end if;
  if not coalesce(p_class = any (array['caballero', 'mago', 'picaro', 'clerigo']), false)
     or not coalesce(p_element = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
     or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_items';
  end if;
  insert into public.characters (player_id, class, element, rarity, data)
  values (p_player, p_class, p_element, 'f', p_data - 'level' - 'xp' - 'legacy' - 'skill');
  perform public.grant_piece(p_player, p_type, p_element, 'f', p_name, p_roll, p_lines, false);
  update public.player_state set tutorial = 1, version = version + 1 where player_id = p_player;
  return true;
end $$;

revoke all on function public.grant_starter(uuid, text, text, jsonb, text, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.grant_starter(uuid, text, text, jsonb, text, text, numeric, jsonb)
  to service_role;

-- ===== 0032_mage_drain_mana.sql =====
-- 0032: the Mage's second third-skill is now Drenar maná (was escudoArcano).
-- Saved heroes that picked the old one fall back to the class's first option (tormenta).
update public.characters set skill = 'tormenta' where skill = 'escudoArcano';

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
  if public.rank_idx(v_c.rarity) < 3 and v_c.stars < 3 then
    raise exception 'skill_locked';
  end if;
  update public.characters set skill = p_skill where player_id = p_player and key = p_character_id;
  return jsonb_build_object('ok', true, 'skill', p_skill);
end $$;

-- ===== 0033_level_limits.sql =====
-- 0033: level caps. Fights: 200/hour and 1500/day (were 40 and 300, reached by normal play with
-- quick resolve). Sweeps do not count toward them and have their own cap (600/hour).
create or replace function public.start_level(
  p_player uuid, p_character_id text, p_seed bigint, p_hero jsonb,
  p_rank text, p_level int, p_asc int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
  v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
  if v_why is not null then
    raise exception '%', v_why;
  end if;
  -- Sweeps (hero.sweep = true) are instant and paid as repeats: they do not use the
  -- fight caps. Fight caps follow the 150/hour service limit; sweeps have their own.
  if coalesce((p_hero ->> 'sweep')::boolean, false) then
    if (select count(*) from public.runs
         where player_id = p_player and hero ->> 'kind' = 'level'
           and hero ->> 'sweep' = 'true' and started_at > now() - interval '1 hour') >= 600 then
      raise exception 'rate_limited';
    end if;
  elsif (select count(*) from public.runs
          where player_id = p_player and hero ->> 'kind' = 'level'
            and coalesce(hero ->> 'sweep', 'false') <> 'true'
            and started_at > now() - interval '1 hour') >= 200
     or (select count(*) from public.runs
          where player_id = p_player and hero ->> 'kind' = 'level'
            and coalesce(hero ->> 'sweep', 'false') <> 'true'
            and started_at > now() - interval '1 day') >= 1500 then
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
    values (p_player, p_seed,
            p_hero || jsonb_build_object('kind', 'level', 'rank', p_rank, 'level', p_level,
                                         'asc', p_asc, 'heroId', p_character_id))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'run_open';
  end;
  return jsonb_build_object('run_id', v_id);
end $$;

-- ===== 0034_no_piece_refund.sql =====
-- 0034: dungeon drops that duplicate a piece already at max stars pay nothing (they used to refund
-- half a gacha pull, which prints coins now that levels drop ~6 pieces).
create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
  p_status text, p_xp int, p_parts jsonb, p_pieces jsonb, p_repeat boolean,
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
  v_pkey text;
  v_pqty text;
  v_total int := 0;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'rank' is distinct from p_rank
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

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or (select count(*) from jsonb_object_keys(p_parts)) > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 3 or (select count(*) from jsonb_object_keys(p_parts)) > 40 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.progress_cleared(p_player, p_rank, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_rank) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count(p_rank) then
      v_chest := round(public.level_chest(p_rank) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.dungeon_progress (player_id, rank, ascension, cleared)
      values (p_player, p_rank, p_asc, p_level + 1)
      on conflict (player_id, rank, ascension) do update
        set cleared = greatest(public.dungeon_progress.cleared, excluded.cleared);
    end if;

    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,2}$' then
        raise exception 'invalid_items';
      end if;
      v_total := v_total + v_pqty::int;
      if v_total > 40 then raise exception 'invalid_items'; end if;
      insert into public.part_stock (player_id, key, qty) values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_rank) + 1 then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      -- a duplicate already at max stars is ignored: no coin refund (drops are plentiful)
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or (select count(*) from jsonb_object_keys(p_parts)) > 0 then
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
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;

-- ===== 0035_burn_many.sql =====
-- 0035: burn up to 100 pieces or heroes in one call (one version bump, one lock).
-- Same rules as burn_item / burn_hero, except that what cannot be burned (equipped piece,
-- the last hero, not owned) is skipped instead of raising. Rate: 8% of trade value (50% legacy).
create or replace function public.burn_many(p_player uuid, p_version int, p_kind text, p_keys text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_key text;
  v_legacy boolean;
  v_total int := 0;
  v_count int := 0;
begin
  if p_kind not in ('hero', 'piece') or p_keys is null or coalesce(array_length(p_keys, 1), 0) not between 1 and 100 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  foreach v_key in array p_keys loop
    if p_kind = 'piece' then
      if v_key is null or v_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
      select legacy into v_legacy from public.weapons where player_id = p_player and key = v_key for update;
      if not found then continue; end if;
      if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_key) then continue; end if;
      v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 8 end / 100;
      delete from public.weapons where player_id = p_player and key = v_key;
    else
      if v_key is null or v_key !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
      select legacy into v_legacy from public.characters where player_id = p_player and key = v_key for update;
      if not found then continue; end if;
      if (select count(*) from public.characters where player_id = p_player) <= 1 then continue; end if;
      v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 8 end / 100;
      delete from public.characters where player_id = p_player and key = v_key;
    end if;
    v_count := v_count + 1;
  end loop;
  update public.player_state set coins = coins + v_total, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', v_count, 'gained', v_total, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ===== 0036_level_pieces_cap.sql =====
-- 0036: a level can drop up to 30 pieces per bank (was 3). Random loot rolls ~6 per level, up to 15 on
-- a 5-fight level; with the old cap every clear that dropped more than 3 failed with "Datos inválidos".
create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
  p_status text, p_xp int, p_parts jsonb, p_pieces jsonb, p_repeat boolean,
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
  v_pkey text;
  v_pqty text;
  v_total int := 0;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'rank' is distinct from p_rank
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

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or (select count(*) from jsonb_object_keys(p_parts)) > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 30 or (select count(*) from jsonb_object_keys(p_parts)) > 40 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.progress_cleared(p_player, p_rank, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_rank) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count(p_rank) then
      v_chest := round(public.level_chest(p_rank) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.dungeon_progress (player_id, rank, ascension, cleared)
      values (p_player, p_rank, p_asc, p_level + 1)
      on conflict (player_id, rank, ascension) do update
        set cleared = greatest(public.dungeon_progress.cleared, excluded.cleared);
    end if;

    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,2}$' then
        raise exception 'invalid_items';
      end if;
      v_total := v_total + v_pqty::int;
      if v_total > 40 then raise exception 'invalid_items'; end if;
      insert into public.part_stock (player_id, key, qty) values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_rank) + 1 then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      -- a duplicate already at max stars is ignored: no coin refund (drops are plentiful)
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or (select count(*) from jsonb_object_keys(p_parts)) > 0 then
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
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;

-- ===== 0037_ssr_gear_line.sql =====
-- 0037: SSR gear gets a 4th extra line (SS and SSR used to roll the same number of lines) and
-- the per-piece roll range narrows to 0.90..1.10 for NEW pieces (old pieces keep 0.85..1.15, still valid).
create or replace function public.extra_lines(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select (public.rank_idx(p_rank) >= 3)::int + (public.rank_idx(p_rank) >= 5)::int
       + (public.rank_idx(p_rank) >= 7)::int + (public.rank_idx(p_rank) >= 8)::int
$$;

alter table public.weapons drop constraint if exists weapons_lines_check;
alter table public.weapons add constraint weapons_lines_check
  check (lines is null or (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 4));

-- ===== 0038_hero_fusion.sql =====
-- 0038: burn rate 8% -> 4% (50% for legacy rows stays) and hero fusion (fuse_heroes).
-- Fusion: the base hero plus its materials (same rank, ratio from heroFusion.ts) become the base
-- one rank higher (new key, gear moves along) or +1 star to the owned hero of that rank. The
-- server computes coins, level, xp and the new hero data; this function checks ownership,
-- ranks, coins, the base's 3 stars and the optimistic version, and does the rows atomically.
create or replace function public.burn_item(p_player uuid, p_version int, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_legacy boolean;
  v_coins int;
begin
  if p_key is null or p_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select legacy into v_legacy from public.weapons where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if exists (select 1 from public.equipment where player_id = p_player and weapon_key = p_key) then
    raise exception 'equipped';
  end if;
  v_coins := public.trade_value(p_key) * case when v_legacy then 50 else 4 end / 100;
  delete from public.weapons where player_id = p_player and key = p_key;
  update public.player_state set coins = coins + v_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', p_key, 'gained', v_coins, 'coins', v_state.coins, 'version', v_state.version);
end $$;

create or replace function public.burn_hero(p_player uuid, p_version int, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_legacy boolean;
  v_coins int;
begin
  if p_key is null or p_key !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select legacy into v_legacy from public.characters where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if (select count(*) from public.characters where player_id = p_player) <= 1 then
    raise exception 'only_hero';
  end if;
  v_coins := public.trade_value(p_key) * case when v_legacy then 50 else 4 end / 100;
  -- Its gear stays in the collection: the equipment rows go with the hero (FK cascade).
  delete from public.characters where player_id = p_player and key = p_key;
  update public.player_state set coins = coins + v_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', p_key, 'gained', v_coins, 'coins', v_state.coins, 'version', v_state.version);
end $$;


create or replace function public.burn_many(p_player uuid, p_version int, p_kind text, p_keys text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_key text;
  v_legacy boolean;
  v_total int := 0;
  v_count int := 0;
begin
  if p_kind not in ('hero', 'piece') or p_keys is null or coalesce(array_length(p_keys, 1), 0) not between 1 and 100 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  foreach v_key in array p_keys loop
    if p_kind = 'piece' then
      if v_key is null or v_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
      select legacy into v_legacy from public.weapons where player_id = p_player and key = v_key for update;
      if not found then continue; end if;
      if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_key) then continue; end if;
      v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 4 end / 100;
      delete from public.weapons where player_id = p_player and key = v_key;
    else
      if v_key is null or v_key !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
      select legacy into v_legacy from public.characters where player_id = p_player and key = v_key for update;
      if not found then continue; end if;
      if (select count(*) from public.characters where player_id = p_player) <= 1 then continue; end if;
      v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 4 end / 100;
      delete from public.characters where player_id = p_player and key = v_key;
    end if;
    v_count := v_count + 1;
  end loop;
  update public.player_state set coins = coins + v_total, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', v_count, 'gained', v_total, 'coins', v_state.coins, 'version', v_state.version);
end $$;

create or replace function public.fuse_heroes(
  p_player uuid, p_version int, p_base text, p_materials text[], p_coins int,
  p_data jsonb, p_level int, p_xp int, p_stars int default 0
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_b public.characters;
  v_ranks text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_i int;
  v_next text;
  v_new text;
  v_m text;
  v_mc public.characters;
  v_exist public.characters;
begin
  if p_base is null or p_base !~ '^c-[a-z]+-[a-z]+-[a-z]+$'
     or p_materials is null or coalesce(array_length(p_materials, 1), 0) not between 2 and 9
     or p_coins is null or p_coins not between 0 and 100000
     or p_data is null or jsonb_typeof(p_data) <> 'object'
     or p_level is null or p_level not between 1 and 999 or p_xp is null or p_xp < 0
     or p_stars is null or p_stars not between 0 and 5 then
    raise exception 'invalid_args';
  end if;
  if (select count(distinct x) from unnest(p_materials) as x) <> array_length(p_materials, 1)
     or p_base = any (p_materials) then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;

  select * into v_b from public.characters where player_id = p_player and key = p_base for update;
  if not found then raise exception 'not_owned'; end if;
  if v_b.stars < 3 then raise exception 'invalid_args'; end if; -- heroFusion.ts FUSION_STARS
  v_i := array_position(v_ranks, v_b.rarity);
  if v_i is null or v_i >= 9 then raise exception 'invalid_args'; end if;
  v_next := v_ranks[v_i + 1];
  foreach v_m in array p_materials loop
    if v_m is null or v_m !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
    select * into v_mc from public.characters where player_id = p_player and key = v_m for update;
    if not found then raise exception 'not_owned'; end if;
    if v_mc.rarity <> v_b.rarity then raise exception 'rank_mismatch'; end if;
  end loop;

  v_new := 'c-' || v_b.class || '-' || v_b.element || '-' || v_next;
  select * into v_exist from public.characters where player_id = p_player and key = v_new for update;
  if found then
    if v_exist.stars >= 5 then raise exception 'max_stars'; end if;
    update public.characters set stars = stars + 1 where player_id = p_player and key = v_new;
  else
    insert into public.characters (player_id, class, element, rarity, stars, data, level, xp, skill, legacy)
    values (p_player, v_b.class, v_b.element, v_next, p_stars,
            p_data - 'level' - 'xp' - 'legacy' - 'skill', p_level, p_xp, v_b.skill, false);
    -- the gear follows the base hero (its row still exists, so no cascade yet)
    update public.equipment set character_key = v_new
     where player_id = p_player and character_key = p_base;
  end if;
  -- materials and the old base go; whatever they still wear is unequipped by the FK cascade
  delete from public.characters
   where player_id = p_player and key = any (p_materials || p_base);
  update public.player_state set coins = coins - p_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('key', v_new, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ===== 0039_no_fragments.sql =====
-- 0039: hero fragments are gone. Pulls no longer give them and spend_fragments is dropped.
-- Fragments players still hold are paid once as coins (40 each, a third of a star's 125-coin
-- duplicate refund) and the rows removed. The (now empty) fragments table stays so old setups
-- and get_profile keep working.
do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0039_fragments_to_coins') then
    update public.player_state s
       set coins = s.coins + f.total * 40
      from (select player_id, sum(qty)::int as total from public.fragments group by player_id) f
     where s.player_id = f.player_id;
    delete from public.fragments;
    insert into public.migration_flags (key) values ('0039_fragments_to_coins');
  end if;
end $$;

drop function if exists public.spend_fragments(uuid, text);

create or replace function public.apply_pull(
  p_player uuid, p_version int, p_idem text, p_banner text, p_cost int,
  p_pity int, p_pity_ssr int, p_seed bigint, p_daily boolean, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_prev public.pulls;
  v_n int;
  v_unit int;
  v_expected int;
  v_old_pity_ssr int;
  v_run_pity_ssr int;
  v_thr_ssr int := public.game_const('pity_ssr_threshold');
  v_max_stars int := public.game_const('max_stars');
  v_item jsonb;
  v_data jsonb;
  v_cls text;
  v_typ text;
  v_el text;
  v_rar text;
  v_key text;
  v_stars int;
  v_status text;
  v_refund int;
  v_refund_total int := 0;
  v_frag int;
  v_fkey text;
  v_results jsonb := '[]'::jsonb;
  v_coins int;
  v_version int;
  v_out jsonb;
  v_daily boolean := coalesce(p_daily, false);
begin
  if p_banner is null or p_banner not in ('character', 'weapon')
     or p_idem is null or char_length(p_idem) not between 8 and 80
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  select * into v_prev from public.pulls
   where player_id = p_player and idempotency_key = p_idem;
  if found then
    return v_prev.result || jsonb_build_object('replayed', true);
  end if;

  if p_version is distinct from v_state.version then
    raise exception 'conflict' using errcode = '40001';
  end if;

  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > public.game_const('multi_pull') then
    raise exception 'invalid_items';
  end if;

  v_unit := case p_banner
    when 'character' then public.game_const('pull_cost_character')
    else public.game_const('pull_cost_weapon') end;
  if v_daily then
    if v_n <> 1 then
      raise exception 'invalid_items';
    end if;
    v_expected := 0;
  elsif v_n = public.game_const('multi_pull') then
    v_expected := round(v_unit * v_n * (100 - public.game_const('multi_discount_pct')) / 100.0)::int;
  else
    v_expected := v_unit * v_n;
  end if;
  if p_cost is distinct from v_expected then
    raise exception 'invalid_cost';
  end if;
  if v_state.coins < v_expected then
    raise exception 'insufficient_coins';
  end if;

  if v_daily then
    begin
      insert into public.daily_claims (player_id, day) values (p_player, public.game_day());
    exception when unique_violation then
      raise exception 'already_claimed';
    end;
  end if;

  select pity_ssr into v_old_pity_ssr from public.gacha_state
   where player_id = p_player and banner = p_banner for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_run_pity_ssr := v_old_pity_ssr;

  for v_item in
    select t.e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by t.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_el := v_item ->> 'element';
    v_rar := v_item ->> 'rarity';
    v_data := coalesce(v_item -> 'data', '{}'::jsonb) - 'level' - 'xp' - 'legacy' - 'skill';
    if jsonb_typeof(v_data) <> 'object'
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;

    -- Pity (same semantics as rollRarity): since the last SSR, the 250th pull MUST be ssr.
    if v_run_pity_ssr >= v_thr_ssr and v_rar <> 'ssr' then
      raise exception 'invalid_pity';
    end if;
    v_run_pity_ssr := case when v_rar = 'ssr' then 0 else least(v_run_pity_ssr + 1, v_thr_ssr) end;

    v_refund := 0;
    v_frag := 0;
    v_fkey := null;

    if p_banner = 'character' then
      v_cls := v_item ->> 'class';
      if not coalesce(v_cls = any (array['caballero', 'mago', 'picaro', 'clerigo']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'c-' || v_cls || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.characters
       where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.characters set stars = v_stars
           where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        insert into public.characters (player_id, class, element, rarity, data)
        values (p_player, v_cls, v_el, v_rar, v_data);
      end if;
    else
      v_typ := v_item ->> 'type';
      v_key := 'w-' || v_typ || '-' || v_el || '-' || v_rar;
      v_status := public.grant_piece(
        p_player, v_typ, v_el, v_rar, v_data ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      if v_status = 'refund' then
        v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', v_status, 'id', v_key, 'stars', v_stars, 'refund', v_refund,
      'fragmentGain', v_frag, 'fragmentKey', v_fkey));
  end loop;

  if v_run_pity_ssr is distinct from p_pity_ssr then
    raise exception 'invalid_pity';
  end if;

  update public.gacha_state set pity_ssr = v_run_pity_ssr
   where player_id = p_player and banner = p_banner;
  update public.player_state
     set coins = coins - v_expected + v_refund_total, version = version + 1
   where player_id = p_player
   returning coins, version into v_coins, v_version;

  v_out := jsonb_build_object(
    'replayed', false, 'coins', v_coins, 'version', v_version, 'pitySsr', v_run_pity_ssr,
    'refundTotal', v_refund_total, 'results', v_results);
  insert into public.pulls (player_id, idempotency_key, banner, cost, daily, seed, items, result)
  values (p_player, p_idem, p_banner, v_expected, v_daily, p_seed, p_items, v_out);
  return v_out;
end $$;

-- ===== 0040_no_lanza.sql =====
-- 0040: the "lanza" weapon is gone (2 weapons per class). Every lanza becomes an espada with the
-- same rank, stars, element and roll. If the player already owns that espada, the two merge into
-- one with +1 star (max 5). Parts p-lanza-* are added to p-espada-*. Heroes keep their weapon
-- unless their class can no longer use it (e.g. Clerigo with baston): it goes back to the bag.
-- Adds no functions, so the 0018 lockdown needs no change. Runs once (flag).
do $$
begin
  if exists (select 1 from public.migration_flags where key = '0040_no_lanza') then
    return;
  end if;

  create temporary table _equip on commit drop as select * from public.equipment;
  delete from public.equipment;

  -- merge duplicates, then rename the rest
  update public.weapons e
     set stars = least(5, greatest(e.stars, l.stars) + 1)
    from public.weapons l
   where l.type = 'lanza' and e.type = 'espada' and e.player_id = l.player_id
     and e.element = l.element and e.rarity = l.rarity;
  delete from public.weapons l
   where l.type = 'lanza'
     and exists (select 1 from public.weapons e
                  where e.type = 'espada' and e.player_id = l.player_id
                    and e.element = l.element and e.rarity = l.rarity);
  update public.weapons set type = 'espada' where type = 'lanza';

  -- equipment: new key, drop what the class cannot use, one holder per weapon
  insert into public.equipment (player_id, character_key, weapon_key, slot)
  select distinct on (q.player_id, q.wkey) q.player_id, q.character_key, q.wkey, q.slot
    from (
      select e.player_id, e.character_key, e.slot,
             regexp_replace(e.weapon_key, '^w-lanza-', 'w-espada-') as wkey
        from _equip e
    ) q
    join public.characters c on c.player_id = q.player_id and c.key = q.character_key
    join public.weapons w on w.player_id = q.player_id and w.key = q.wkey
   where q.slot <> 'arma'
      or (c.class = 'caballero' and w.type in ('espada', 'hacha'))
      or (c.class = 'mago' and w.type in ('baston', 'varita'))
      or (c.class = 'picaro' and w.type in ('daga', 'arco'))
      or (c.class = 'clerigo' and w.type in ('maza', 'libro'))
   order by q.player_id, q.wkey, q.character_key;

  -- forge parts
  insert into public.part_stock (player_id, key, qty)
  select player_id, regexp_replace(key, '^p-lanza-', 'p-espada-'), qty
    from public.part_stock where key like 'p-lanza-%'
  on conflict (player_id, key) do update set qty = least(9999, public.part_stock.qty + excluded.qty);
  delete from public.part_stock where key like 'p-lanza-%';

  -- market: cancel open offers that would collide after the rename, then rename every key
  update public.market_offers o set status = 'cancelled', closed_at = now()
   where o.status = 'open' and (
     regexp_replace(o.give_key, '^w-lanza-', 'w-espada-') = regexp_replace(coalesce(o.want_key, ''), '^w-lanza-', 'w-espada-')
     or (o.give_key like 'w-lanza-%' and exists (
           select 1 from public.market_offers p
            where p.status = 'open' and p.seller_id = o.seller_id and p.kind = o.kind
              and p.give_key = regexp_replace(o.give_key, '^w-lanza-', 'w-espada-'))));
  update public.market_offers set
    give_key = regexp_replace(give_key, '^w-lanza-', 'w-espada-'),
    want_key = regexp_replace(want_key, '^w-lanza-', 'w-espada-')
   where give_key like 'w-lanza-%' or want_key like 'w-lanza-%';

  insert into public.migration_flags (key) values ('0040_no_lanza');
end $$;

-- ===== 0041_forge_v9.sql =====
-- 0041: Forja v9.0 (docs/FORJA_V9.md). Two actions, two materials.
--  * Escamas and Dado cargado live on player_state (bound to the account, never tradable).
--  * weapons.plus / plus_streak: the Mejorar level (+0..+10) and the consecutive failures.
--  * ONE-TIME (flag 0041_forge_v9): the old part_stock becomes value without loss. Parts of rank S/SS/SSR
--    -> Escamas (1/2/4 each); parts of F..A -> coins (F 5, E 8, D 12, C 20, B 35, A 60 each); every
--    core -> 1 Dado cargado. Keep in sync with PART_TO_ESCAMAS / PART_TO_COINS in profile.ts.
--    part_stock stays (empty, nothing writes to it) so old setups keep working.
--  * apply_forge and grant_core are gone. New: apply_ascend, apply_upgrade, level_escamas.
--  * bank_level: p_parts -> p_dados; it computes the Escamas itself (S/SS/SSR levels 2/3/4, +10% per
--    ascension, repeat decay) and caps the last-level Dado at 2 per game day.
--  * mission_claim, coop_pay, tower_*: cores -> Dados (weekly mission 1, Viernes event 1, coop win 1
--    (+1 MVP), tower top 3 one each). Tower floor prizes are coins only now.
-- New signatures are born executable by anon/authenticated: 0018 (always last) closes them again.

alter table public.player_state add column if not exists escamas int not null default 0 check (escamas >= 0);
alter table public.player_state add column if not exists dados int not null default 0 check (dados >= 0);
alter table public.player_state add column if not exists dado_day date;
alter table public.player_state add column if not exists dado_n int not null default 0 check (dado_n >= 0);
alter table public.weapons add column if not exists plus int not null default 0 check (plus between 0 and 10);
alter table public.weapons add column if not exists plus_streak int not null default 0 check (plus_streak >= 0);

do $$
begin
  if exists (select 1 from public.migration_flags where key = '0041_forge_v9') then
    return;
  end if;
  update public.player_state ps
     set escamas = least(99999, ps.escamas + c.esc),
         dados = least(99999, ps.dados + c.dad),
         coins = ps.coins + c.coin,
         version = ps.version + 1
    from (
      select k.player_id,
             sum(case when k.key like 'core-%' then 0
                      when substring(k.key from '[^-]+$') = 's' then k.qty
                      when substring(k.key from '[^-]+$') = 'ss' then k.qty * 2
                      when substring(k.key from '[^-]+$') = 'ssr' then k.qty * 4 else 0 end)::int as esc,
             sum(case when k.key like 'core-%' then k.qty else 0 end)::int as dad,
             sum(case when k.key like 'core-%' then 0
                      else k.qty * case substring(k.key from '[^-]+$')
                        when 'f' then 5 when 'e' then 8 when 'd' then 12 when 'c' then 20
                        when 'b' then 35 when 'a' then 60 else 0 end end)::int as coin
        from public.part_stock k where k.qty > 0 group by k.player_id
    ) c
   where ps.player_id = c.player_id;
  delete from public.part_stock;
  insert into public.migration_flags (key) values ('0041_forge_v9');
end $$;

drop function if exists public.apply_forge(uuid, int, int, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.grant_core(uuid, text, int);
drop function if exists public.tower_floor_cores(int);

-- Escamas of a cleared level (levelEscamas in levelLoot.ts): S 2, SS 3, SSR 4, +10% per ascension level,
-- times the daily repeat decay (p_mult, 1 for a new level).
create or replace function public.level_escamas(p_rank text, p_asc int, p_mult numeric) returns int
language sql immutable set search_path = ''
as $$
  select round((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc) * p_mult)::int
$$;

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
    -- {rank: [levels cleared at ascension 0, 1, ...]}
    'dungeons', coalesce((
      select jsonb_object_agg(t.rank, t.arr)
      from (
        select m.rank,
               (select jsonb_agg(coalesce(x.cleared, 0) order by a.n)
                  from generate_series(0, m.top) as a(n)
                  left join public.dungeon_progress x
                    on x.player_id = p_player and x.rank = m.rank and x.ascension = a.n) as arr
          from (select d.rank, max(d.ascension) as top
                  from public.dungeon_progress d
                 where d.player_id = p_player group by d.rank) m
      ) t
    ), '{}'::jsonb),
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
        'data', c.data || jsonb_build_object('level', c.level, 'xp', c.xp, 'legacy', c.legacy)
                       || case when c.skill is null then '{}'::jsonb else jsonb_build_object('skill', c.skill) end
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars,
        'data', w.data || jsonb_build_object('legacy', w.legacy, 'plus', w.plus, 'plusStreak', w.plus_streak)
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

drop function if exists public.bank_level(uuid, uuid, text, text, int, int, text, int, jsonb, jsonb, boolean, jsonb, text, text);
create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
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
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
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
     or v_run.hero ->> 'rank' is distinct from p_rank
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
    v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.progress_cleared(p_player, p_rank, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_rank) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count(p_rank) then
      v_chest := round(public.level_chest(p_rank) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.dungeon_progress (player_id, rank, ascension, cleared)
      values (p_player, p_rank, p_asc, p_level + 1)
      on conflict (player_id, rank, ascension) do update
        set cleared = greatest(public.dungeon_progress.cleared, excluded.cleared);
    end if;

    -- Escamas (S+ only) follow the coin rules: +10% per ascension, repeats decay with the day's count.
    v_escamas := public.level_escamas(p_rank, p_asc, case when v_repeat then public.level_decay(v_n) else 1 end);
    -- Dado cargado: only the last level of a dungeon S+; the server rolled it, SQL caps it at 2 per day.
    if p_dados > 0 then
      if public.rank_idx(p_rank) < public.rank_idx('s') or p_level + 1 < public.level_count(p_rank) then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_dn < 2 then v_dado := 1; end if;
    end if;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_rank) + 1 then
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

drop function if exists public.mission_claim(uuid, text, int, jsonb, jsonb);
create or replace function public.mission_claim(
  p_player uuid, p_scope text, p_reached int,
  p_pieces jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_period date;
  v_row public.mission_state;
  v_coins int[];
  v_dados int[];
  v_pieces int[];
  v_pay int := 0;
  v_dado int := 0;
  v_nx int := 0;
  v_best int := public.rank_idx(public.best_cleared_rank(p_player));
  v_refund int := 0;
  v_item jsonb;
  k int;
begin
  if p_scope not in ('daily', 'weekly', 'event') or p_reached is null or p_reached not between 1 and 3
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;
  -- SCOPE_TIERS (missions.ts), one entry per tier (30 / 60 / 90 activity points).
  v_coins := case p_scope when 'daily' then array[20, 30, 250]
                          when 'weekly' then array[120, 100, 500]
                          else array[50, 100, 400] end;
  v_dados := case p_scope when 'daily' then array[0, 0, 0]
                          when 'weekly' then array[0, 0, 1]
                          else array[0, 0, 1] end;
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
    v_dado := v_dado + v_dados[k];
    v_nx := v_nx + v_pieces[k];
  end loop;

  -- Pieces: exactly the promised amount, at most at the best rank.
  if jsonb_array_length(p_pieces) <> v_nx then
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
  update public.player_state set coins = coins + v_pay + v_refund, dados = least(99999, dados + v_dado), version = version + 1
   where player_id = p_player;
  return jsonb_build_object('coins', v_pay + v_refund, 'dados', v_dado,
                            'pieces', v_nx, 'claimed', p_reached);
end $$;

create or replace function public.coop_pay(p_room uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phase text;
  v_row jsonb;
  v_player uuid;
  v_coins int;
  v_chips int;
  v_dados int;
  v_acct boolean;
  v_paid int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 7 then
    raise exception 'invalid_args';
  end if;
  select phase into v_phase from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_phase not in ('night_summary', 'closed') then raise exception 'wrong_phase'; end if;
  for v_row in select e from jsonb_array_elements(p_rows) as t(e) loop
    v_player := (v_row ->> 'player')::uuid;
    v_coins := coalesce((v_row ->> 'coins')::int, 0);
    v_chips := coalesce((v_row ->> 'chips')::int, 0);
    v_dados := coalesce((v_row ->> 'dados')::int, 0);
    if v_coins < 0 or v_coins > 1000 or v_chips < 0 or v_chips > 500 or v_dados < 0 or v_dados > 3 then
      raise exception 'invalid_args';
    end if;
    perform 1 from public.room_coop
     where room_id = p_room and player_id = v_player and not paid for update;
    if not found then continue; end if;
    -- Account prizes (coins, dice) are limited to 3 rooms per 24 h per player; chips are not.
    v_acct := (select count(*) from public.room_coop
                where player_id = v_player and acct and paid_at > now() - interval '24 hours') < 3;
    update public.room_coop set paid = true, paid_at = now(), acct = v_acct
     where room_id = p_room and player_id = v_player;
    if not v_acct then
      v_coins := 0;
      v_dados := 0;
    end if;
    if v_coins > 0 or v_dados > 0 then
      update public.player_state set coins = coins + v_coins, dados = least(99999, dados + v_dados), version = version + 1
       where player_id = v_player;
    end if;
    if v_chips > 0 then
      update public.room_players set chips = chips + v_chips
       where room_id = p_room and player_id = v_player and left_at is null;
      if found then
        insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
        values (p_room, v_player, v_chips, 'coop_prize', 'coop');
      end if;
    end if;
    v_paid := v_paid + 1;
  end loop;
  return jsonb_build_object('paid', v_paid);
end $$;

-- Tower floor prizes are coins only: floor 5 of each 10-cycle 150, floor 10 300, else 5.
create or replace function public.tower_floor_coins(p_floor int) returns int
language sql immutable set search_path = ''
as $$ select case ((p_floor - 1) % 10) + 1 when 10 then 300 when 5 then 150 else 5 end $$;

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
    update public.player_state set coins = coins + 350, version = version + 1
     where player_id = v_win.player_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int, p_rounds int) returns jsonb
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
  select coalesce(sum(public.tower_floor_coins(floor)), 0), count(*)
    into v_coins, v_paid from ins;
  if v_paid > 0 then
    update public.player_state set coins = coins + v_coins, version = version + 1
     where player_id = p_player;
  end if;
  return jsonb_build_object('week', v_week, 'max_floor', v_floor, 'rounds', v_rounds,
                            'prize', jsonb_build_object('floors', v_paid, 'coins', v_coins, 'dados', 0));
end $$;

-- Weekly prizes: 300 / 200 / 100 coins and 1 Dado cargado each (TOWER_PRIZES).
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
       where week = p_week and mode = v_mode and max_floor >= 8
       order by max_floor desc, rounds asc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      update public.player_state set dados = least(99999, dados + 1) where player_id = r.player_id;
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- ------------------------------------------------------------------ Ascender
-- Same rule and table as hero fusion (HERO_FUSION / ASCEND): the base piece + (total - 1) materials of the
-- SAME rank (any type or element, not worn) + coins -> the base one rank up (0 stars, +0, a new roll).
-- The server rolls the new piece (p_new); SQL checks ownership, ranks, counts, coins and the roll.
create or replace function public.apply_ascend(
  p_player uuid, p_version int, p_base text, p_materials jsonb, p_new jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ranks constant text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_total constant int[] := array[6, 6, 5, 5, 4, 4, 3, 3];
  v_cost constant int[] := array[20, 40, 80, 160, 320, 640, 1280, 2560];
  v_state public.player_state;
  v_b public.weapons;
  v_i int;
  v_next text;
  v_m text;
  v_mw public.weapons;
  v_n int;
  v_new text;
  v_eq jsonb;
  v_status text;
begin
  if p_base is null or p_base !~ '^w-[a-z]+-[a-z]+-[a-z]+$'
     or p_materials is null or jsonb_typeof(p_materials) <> 'array'
     or jsonb_array_length(p_materials) not between 2 and 5
     or p_new is null or jsonb_typeof(p_new) <> 'object' then
    raise exception 'invalid_args';
  end if;
  v_n := jsonb_array_length(p_materials);
  if (select count(distinct x) from jsonb_array_elements_text(p_materials) as t(x)) <> v_n
     or p_materials ? p_base then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;

  select * into v_b from public.weapons where player_id = p_player and key = p_base for update;
  if not found then raise exception 'not_owned'; end if;
  v_i := array_position(v_ranks, v_b.rarity);
  if v_i is null or v_i >= 9 then raise exception 'invalid_args'; end if;
  v_next := v_ranks[v_i + 1];
  if v_n + 1 <> v_total[v_i] then raise exception 'invalid_args'; end if;
  if v_state.coins < v_cost[v_i] then raise exception 'insufficient_coins'; end if;
  if p_new ->> 'type' is distinct from v_b.type or p_new ->> 'element' is distinct from v_b.element
     or p_new ->> 'rarity' is distinct from v_next then
    raise exception 'invalid_items';
  end if;

  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    if v_m is null or v_m !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
    select * into v_mw from public.weapons where player_id = p_player and key = v_m for update;
    if not found then raise exception 'not_owned'; end if;
    if v_mw.rarity <> v_b.rarity then raise exception 'rank_mismatch'; end if;
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_m) then
      raise exception 'equipped';
    end if;
  end loop;

  -- The worn base keeps its place under the new key (the FK would cascade the rows away).
  select coalesce(jsonb_agg(jsonb_build_object('c', e.character_key, 's', e.slot)), '[]'::jsonb) into v_eq
    from public.equipment e where e.player_id = p_player and e.weapon_key = p_base;
  delete from public.equipment where player_id = p_player and weapon_key = p_base;
  delete from public.weapons where player_id = p_player and key = p_base;
  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    delete from public.weapons where player_id = p_player and key = v_m;
  end loop;

  v_status := public.grant_piece(
    p_player, v_b.type, v_b.element, v_next, left(coalesce(p_new ->> 'name', v_b.data ->> 'name', 'Pieza'), 60),
    case when (p_new ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (p_new ->> 'roll')::numeric end,
    p_new -> 'lines', false);
  v_new := 'w-' || v_b.type || '-' || v_b.element || '-' || v_next;
  if jsonb_array_length(v_eq) > 0 then
    if v_status <> 'new' then raise exception 'equipped'; end if; -- the target piece already existed
    insert into public.equipment (player_id, character_key, weapon_key, slot)
    select p_player, x ->> 'c', v_new, x ->> 's' from jsonb_array_elements(v_eq) as t(x);
  end if;

  update public.player_state set coins = coins - v_cost[v_i], version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('key', v_new, 'status', v_status, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ------------------------------------------------------------------ Mejorar
-- The server rolled p_success (UPGRADE_TABLE + streak + dado in upgrade.ts); SQL checks the piece
-- (S+, 5 stars, plus < 10) and takes the Escamas (cost = the level you go to) and the die.
create or replace function public.apply_upgrade(
  p_player uuid, p_version int, p_key text, p_use_dado boolean, p_success boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_w public.weapons;
  v_cost int;
begin
  if p_key is null or p_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' or p_use_dado is null or p_success is null then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select * into v_w from public.weapons where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if public.rank_idx(v_w.rarity) < public.rank_idx('s') or v_w.stars < 5 or v_w.plus >= 10 then
    raise exception 'invalid_args';
  end if;
  v_cost := v_w.plus + 1;
  if v_state.escamas < v_cost then raise exception 'insufficient_escamas'; end if;
  if p_use_dado and v_state.dados < 1 then raise exception 'insufficient_dados'; end if;
  update public.weapons
     set plus = case when p_success then plus + 1 else plus end,
         plus_streak = case when p_success then 0 else plus_streak + 1 end
   where player_id = p_player and key = p_key returning plus, plus_streak into v_w.plus, v_w.plus_streak;
  update public.player_state
     set escamas = escamas - v_cost, dados = dados - case when p_use_dado then 1 else 0 end, version = version + 1
   where player_id = p_player returning escamas, dados, version into v_state.escamas, v_state.dados, v_state.version;
  return jsonb_build_object('success', p_success, 'plus', v_w.plus, 'plusStreak', v_w.plus_streak,
                            'escamas', v_state.escamas, 'dados', v_state.dados, 'version', v_state.version);
end $$;

-- ===== 0042_forge_v9_fixes.sql =====
-- 0042: fixes to Forja v9 (0041 already ran; this is incremental and re-runnable).
--  * level_escamas: a repeat clear takes the coin repeat factor (0.6) times the daily decay and FLOORS, so repeats and
--    sweeps of a decayed day reach 0 Escamas (a first clear still rounds). bank_level uses the new 4-argument form.
--  * Dado cargado: every source except the weekly mission and the Viernes event counts in dado_n (cap 2 per game day):
--    grant_dado_capped is used by coop_pay and tower_settle; bank_level keeps its own check. A capped Dado is simply not paid.
--  * apply_ascend: materials with plus > 0 are refused (material_upgraded); a 'refund' from grant_piece (target at max
--    stars) aborts the whole transaction instead of consuming the pieces.
--  * grant_piece: the removed weapon 'lanza' is no longer accepted.
-- New signatures are born executable by anon/authenticated: 0018 (always last) closes them again.

drop function if exists public.level_escamas(text, int, numeric);
create or replace function public.level_escamas(p_rank text, p_asc int, p_repeat boolean, p_mult numeric) returns int
language sql immutable set search_path = ''
as $$
  select case when p_repeat
    then floor((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc) * 0.6 * p_mult)::int
    else round((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc))::int
  end
$$;

-- Pays up to p_n dice, never past 2 per game day (shared with bank_level via dado_day / dado_n). Returns what was paid.
create or replace function public.grant_dado_capped(p_player uuid, p_n int) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_have int;
  v_give int;
begin
  select case when dado_day = public.game_day() then dado_n else 0 end into v_have
    from public.player_state where player_id = p_player for update;
  if not found then return 0; end if;
  v_give := least(coalesce(p_n, 0), greatest(0, 2 - v_have));
  if v_give > 0 then
    update public.player_state
       set dados = least(99999, dados + v_give), dado_day = public.game_day(), dado_n = v_have + v_give
     where player_id = p_player;
  end if;
  return v_give;
end $$;

create or replace function public.grant_piece(
  p_player uuid, p_type text, p_element text, p_rank text, p_name text,
  p_roll numeric, p_lines jsonb, p_refund_on_max boolean
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_stars int;
  v_oroll numeric;
  v_olines jsonb;
  v_lines jsonb := case when p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
                        then null else p_lines end;
begin
  if not coalesce(p_type = any (array['espada', 'hacha', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
     or not coalesce(p_element = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
     or not coalesce(p_rank = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
    raise exception 'invalid_items';
  end if;
  perform public.piece_check(p_type, p_rank, p_roll, v_lines);
  select stars, roll, lines into v_stars, v_oroll, v_olines from public.weapons
   where player_id = p_player and type = p_type and element = p_element and rarity = p_rank
   for update;
  if found then
    if v_stars >= public.game_const('max_stars') then
      if p_refund_on_max then return 'refund'; end if;
      raise exception 'max_stars';
    end if;
    if public.piece_quality(p_roll, v_lines) > public.piece_quality(v_oroll, v_olines) then
      update public.weapons set stars = v_stars + 1, roll = p_roll, lines = v_lines
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    else
      update public.weapons set stars = v_stars + 1
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    end if;
    return 'star';
  end if;
  insert into public.weapons (player_id, type, element, rarity, roll, lines, data)
  values (p_player, p_type, p_element, p_rank, p_roll, v_lines,
          jsonb_build_object('name', left(coalesce(p_name, 'Pieza'), 60)));
  return 'new';
end $$;

create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
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
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
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
     or v_run.hero ->> 'rank' is distinct from p_rank
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
    v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.progress_cleared(p_player, p_rank, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_rank) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count(p_rank) then
      v_chest := round(public.level_chest(p_rank) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.dungeon_progress (player_id, rank, ascension, cleared)
      values (p_player, p_rank, p_asc, p_level + 1)
      on conflict (player_id, rank, ascension) do update
        set cleared = greatest(public.dungeon_progress.cleared, excluded.cleared);
    end if;

    -- Escamas (S+ only) follow the coin rules: +10% per ascension, repeats decay with the day's count.
    v_escamas := public.level_escamas(p_rank, p_asc, v_repeat, case when v_repeat then public.level_decay(v_n) else 1 end);
    -- Dado cargado: only the last level of a dungeon S+; the server rolled it, SQL caps it at 2 per day.
    if p_dados > 0 then
      if public.rank_idx(p_rank) < public.rank_idx('s') or p_level + 1 < public.level_count(p_rank) then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_dn < 2 then v_dado := 1; end if;
    end if;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_rank) + 1 then
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

create or replace function public.coop_pay(p_room uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phase text;
  v_row jsonb;
  v_player uuid;
  v_coins int;
  v_chips int;
  v_dados int;
  v_acct boolean;
  v_paid int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 7 then
    raise exception 'invalid_args';
  end if;
  select phase into v_phase from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_phase not in ('night_summary', 'closed') then raise exception 'wrong_phase'; end if;
  for v_row in select e from jsonb_array_elements(p_rows) as t(e) loop
    v_player := (v_row ->> 'player')::uuid;
    v_coins := coalesce((v_row ->> 'coins')::int, 0);
    v_chips := coalesce((v_row ->> 'chips')::int, 0);
    v_dados := coalesce((v_row ->> 'dados')::int, 0);
    if v_coins < 0 or v_coins > 1000 or v_chips < 0 or v_chips > 500 or v_dados < 0 or v_dados > 3 then
      raise exception 'invalid_args';
    end if;
    perform 1 from public.room_coop
     where room_id = p_room and player_id = v_player and not paid for update;
    if not found then continue; end if;
    -- Account prizes (coins, dice) are limited to 3 rooms per 24 h per player; chips are not.
    v_acct := (select count(*) from public.room_coop
                where player_id = v_player and acct and paid_at > now() - interval '24 hours') < 3;
    update public.room_coop set paid = true, paid_at = now(), acct = v_acct
     where room_id = p_room and player_id = v_player;
    if not v_acct then
      v_coins := 0;
      v_dados := 0;
    end if;
    if v_coins > 0 then
      update public.player_state set coins = coins + v_coins, version = version + 1
       where player_id = v_player;
    end if;
    -- Dice share the daily cap of 2 with the level drops; over the cap they are simply not paid.
    if v_dados > 0 then
      perform public.grant_dado_capped(v_player, v_dados);
    end if;
    if v_chips > 0 then
      update public.room_players set chips = chips + v_chips
       where room_id = p_room and player_id = v_player and left_at is null;
      if found then
        insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
        values (p_room, v_player, v_chips, 'coop_prize', 'coop');
      end if;
    end if;
    v_paid := v_paid + 1;
  end loop;
  return jsonb_build_object('paid', v_paid);
end $$;

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
       where week = p_week and mode = v_mode and max_floor >= 8
       order by max_floor desc, rounds asc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      perform public.grant_dado_capped(r.player_id, 1);
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

create or replace function public.apply_ascend(
  p_player uuid, p_version int, p_base text, p_materials jsonb, p_new jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ranks constant text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_total constant int[] := array[6, 6, 5, 5, 4, 4, 3, 3];
  v_cost constant int[] := array[20, 40, 80, 160, 320, 640, 1280, 2560];
  v_state public.player_state;
  v_b public.weapons;
  v_i int;
  v_next text;
  v_m text;
  v_mw public.weapons;
  v_n int;
  v_new text;
  v_eq jsonb;
  v_status text;
begin
  if p_base is null or p_base !~ '^w-[a-z]+-[a-z]+-[a-z]+$'
     or p_materials is null or jsonb_typeof(p_materials) <> 'array'
     or jsonb_array_length(p_materials) not between 2 and 5
     or p_new is null or jsonb_typeof(p_new) <> 'object' then
    raise exception 'invalid_args';
  end if;
  v_n := jsonb_array_length(p_materials);
  if (select count(distinct x) from jsonb_array_elements_text(p_materials) as t(x)) <> v_n
     or p_materials ? p_base then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;

  select * into v_b from public.weapons where player_id = p_player and key = p_base for update;
  if not found then raise exception 'not_owned'; end if;
  v_i := array_position(v_ranks, v_b.rarity);
  if v_i is null or v_i >= 9 then raise exception 'invalid_args'; end if;
  v_next := v_ranks[v_i + 1];
  if v_n + 1 <> v_total[v_i] then raise exception 'invalid_args'; end if;
  if v_state.coins < v_cost[v_i] then raise exception 'insufficient_coins'; end if;
  if p_new ->> 'type' is distinct from v_b.type or p_new ->> 'element' is distinct from v_b.element
     or p_new ->> 'rarity' is distinct from v_next then
    raise exception 'invalid_items';
  end if;

  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    if v_m is null or v_m !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
    select * into v_mw from public.weapons where player_id = p_player and key = v_m for update;
    if not found then raise exception 'not_owned'; end if;
    if v_mw.rarity <> v_b.rarity then raise exception 'rank_mismatch'; end if;
    if v_mw.plus > 0 then raise exception 'material_upgraded'; end if;
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_m) then
      raise exception 'equipped';
    end if;
  end loop;

  -- The worn base keeps its place under the new key (the FK would cascade the rows away).
  select coalesce(jsonb_agg(jsonb_build_object('c', e.character_key, 's', e.slot)), '[]'::jsonb) into v_eq
    from public.equipment e where e.player_id = p_player and e.weapon_key = p_base;
  delete from public.equipment where player_id = p_player and weapon_key = p_base;
  delete from public.weapons where player_id = p_player and key = p_base;
  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    delete from public.weapons where player_id = p_player and key = v_m;
  end loop;

  v_status := public.grant_piece(
    p_player, v_b.type, v_b.element, v_next, left(coalesce(p_new ->> 'name', v_b.data ->> 'name', 'Pieza'), 60),
    case when (p_new ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (p_new ->> 'roll')::numeric end,
    p_new -> 'lines', false);
  if v_status not in ('new', 'star') then raise exception 'max_stars'; end if; -- 'refund': roll everything back
  v_new := 'w-' || v_b.type || '-' || v_b.element || '-' || v_next;
  if jsonb_array_length(v_eq) > 0 then
    if v_status <> 'new' then raise exception 'equipped'; end if; -- the target piece already existed
    insert into public.equipment (player_id, character_key, weapon_key, slot)
    select p_player, x ->> 'c', v_new, x ->> 's' from jsonb_array_elements(v_eq) as t(x);
  end if;

  update public.player_state set coins = coins - v_cost[v_i], version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('key', v_new, 'status', v_status, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ===== 0043_room_duels.sql =====
-- 0043: 1v1 duels in rooms. TS decides (game/room.ts duel phases, game/duelRoom.ts); SQL stores the
-- server-only duel state (matches, bets, secret picks, replay logs) and applies, in ONE call, the
-- chip deltas and the phase move that go with it. service_role only (0018 closes the function).
-- Idempotent: safe to re-run.

alter table public.room_state drop constraint if exists room_state_phase_check;
alter table public.room_state add constraint room_state_phase_check check (phase in (
  'lobby', 'round_setup', 'floor_intro', 'doors', 'betting', 'fighting',
  'reveal', 'round_end', 'coop_boss', 'duel_setup', 'duel_betting', 'duel_fight',
  'duel_reveal', 'night_summary', 'closed'));

alter table public.chip_ledger drop constraint if exists chip_ledger_reason_check;
alter table public.chip_ledger add constraint chip_ledger_reason_check
  check (reason in ('initial', 'bet_stake', 'bet_win', 'bet_refund', 'interfere',
                    'interfere_comp', 'interfere_refund', 'night_start', 'vote_event',
                    'coop_prize', 'duel_stake', 'duel_payout'));

create table if not exists public.room_duel (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  version int not null default 0 check (version >= 0),
  state jsonb not null check (pg_column_size(state) < 400000),
  updated_at timestamptz not null default now()
);
alter table public.room_duel enable row level security;
revoke all on public.room_duel from anon, authenticated;

-- (Re-runnable; drops the signature of the first draft, before p_missions existed.)
drop function if exists public.duel_save(uuid, int, jsonb, jsonb, text, int, timestamptz, boolean);

-- duel_save: optimistic write (p_expected_version must match; 0 = first write).
--   p_deltas  [{player, delta, reason}]: chip moves; chips never go below 0.
--   p_missions [{player, key}] with key in (duel_win, bet_win): mission progress (best effort).
--   p_phase   optional phase move, guarded by p_expected_seq (the seq the caller saw).
create or replace function public.duel_save(
  p_room uuid,
  p_expected_version int,
  p_state jsonb,
  p_deltas jsonb default '[]'::jsonb,
  p_missions jsonb default '[]'::jsonb,
  p_phase text default null,
  p_expected_seq int default null,
  p_deadline timestamptz default null,
  p_reset_ready boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_st public.room_state;
  v_ver int;
  d jsonb;
  v_chips int;
  v_delta int;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_deltas) <> 'array'
     or jsonb_typeof(p_missions) <> 'array' then
    raise exception 'invalid_args';
  end if;
  select * into v_st from public.room_state where room_id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;

  select version into v_ver from public.room_duel where room_id = p_room for update;
  if not found then
    if p_expected_version <> 0 then raise exception 'conflict'; end if;
    insert into public.room_duel (room_id, version, state) values (p_room, 1, p_state);
    v_ver := 1;
  else
    if v_ver <> p_expected_version then raise exception 'conflict'; end if;
    v_ver := v_ver + 1;
    update public.room_duel set version = v_ver, state = p_state, updated_at = now()
     where room_id = p_room;
  end if;

  for d in select * from jsonb_array_elements(p_deltas) loop
    v_delta := (d ->> 'delta')::int;
    if v_delta is null or abs(v_delta) > 100000
       or (d ->> 'reason') not in ('duel_stake', 'duel_payout') then
      raise exception 'invalid_args';
    end if;
    if v_delta = 0 then continue; end if;
    select chips into v_chips from public.room_players
     where room_id = p_room and player_id = (d ->> 'player')::uuid for update;
    if not found then raise exception 'not_member'; end if;
    if v_chips + v_delta < 0 then raise exception 'insufficient_chips'; end if;
    update public.room_players set chips = chips + v_delta
     where room_id = p_room and player_id = (d ->> 'player')::uuid;
    insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
    values (p_room, (d ->> 'player')::uuid, v_delta, d ->> 'reason', 'duel');
  end loop;

  for d in select * from jsonb_array_elements(p_missions) loop
    if (d ->> 'key') not in ('duel_win', 'bet_win') then raise exception 'invalid_args'; end if;
    begin
      perform public.mission_bump((d ->> 'player')::uuid, d ->> 'key', 1);
    exception when others then null; -- progress never blocks a duel
    end;
  end loop;

  if p_phase is not null then
    if v_st.phase = 'closed' then raise exception 'room_closed'; end if;
    if p_expected_seq is distinct from v_st.phase_seq then raise exception 'stale'; end if;
    update public.room_state
       set phase = p_phase, phase_seq = phase_seq + 1, deadline = p_deadline, updated_at = now()
     where room_id = p_room;
    if p_reset_ready then
      update public.room_players set ready = false where room_id = p_room;
    end if;
  end if;
  return jsonb_build_object('version', v_ver);
end $$;

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
