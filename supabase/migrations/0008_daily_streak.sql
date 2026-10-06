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
