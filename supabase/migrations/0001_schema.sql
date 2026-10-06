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
