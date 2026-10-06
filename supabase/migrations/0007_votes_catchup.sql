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
