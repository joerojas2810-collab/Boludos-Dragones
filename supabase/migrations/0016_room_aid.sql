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
