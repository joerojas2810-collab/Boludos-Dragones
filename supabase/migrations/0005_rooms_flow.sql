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
