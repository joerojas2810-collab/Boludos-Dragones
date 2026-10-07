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
