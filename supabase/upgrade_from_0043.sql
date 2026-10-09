-- Boludos & Dragones: database upgrade from 0043 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

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
