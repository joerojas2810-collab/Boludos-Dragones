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

commit;
