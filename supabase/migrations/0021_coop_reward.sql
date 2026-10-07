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
