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
