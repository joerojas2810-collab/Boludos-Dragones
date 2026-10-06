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
