-- 0022: weekly tower. Everybody climbs the SAME endless run (the week's seed) in two
-- separate modes: 'nivelado' (equal heroes) and 'coleccion' (your full-power hero).
-- One row per (week, mode, player) with the best floor; unlimited attempts. The week is
-- settled lazily (first request after it ends): top 3 per mode with at least 8 floors
-- get coins and cores, once. Server-only tables and functions (service_role).
create table if not exists public.tower_scores (
  week date not null,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  player_id uuid not null references public.players (id) on delete cascade,
  max_floor int not null check (max_floor between 0 and 500),
  updated_at timestamptz not null default now(),
  primary key (week, mode, player_id)
);
create table if not exists public.tower_settled (
  week date not null,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  winners jsonb not null default '[]'::jsonb,
  settled_at timestamptz not null default now(),
  primary key (week, mode)
);
alter table public.tower_scores enable row level security;
alter table public.tower_settled enable row level security;
revoke all on public.tower_scores, public.tower_settled from anon, authenticated;

create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_floor int;
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500 then
    raise exception 'invalid_args';
  end if;
  insert into public.tower_scores (week, mode, player_id, max_floor)
  values (public.game_week(), p_mode, p_player, p_floor)
  on conflict (week, mode, player_id) do update
    set max_floor = greatest(public.tower_scores.max_floor, excluded.max_floor),
        updated_at = case when excluded.max_floor > public.tower_scores.max_floor
                          then now() else public.tower_scores.updated_at end
  returning max_floor into v_floor;
  return jsonb_build_object('week', public.game_week(), 'max_floor', v_floor);
end $$;

-- Pays a finished week once per mode. Prizes (keep in sync with TOWER_PRIZES in tower.ts):
-- 1st 300 coins + 2 cores, 2nd 200 + 1, 3rd 100 + 1; needs >= 8 floors.
create or replace function public.tower_settle(p_week date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  r record;
  v_place int;
  v_coins int[] := array[300, 200, 100];
  v_cores int[] := array[2, 1, 1];
  v_els text[] := array['agua', 'fuego', 'viento', 'tierra', 'rayo'];
  v_win jsonb;
  v_n int := 0;
  k int;
begin
  if p_week is null or p_week >= public.game_week() then
    return jsonb_build_object('settled', 0);
  end if;
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    perform pg_advisory_xact_lock(hashtext('tower_settle:' || p_week::text || v_mode));
    if exists (select 1 from public.tower_settled where week = p_week and mode = v_mode) then
      continue;
    end if;
    v_win := '[]'::jsonb;
    v_place := 0;
    for r in
      select player_id, max_floor from public.tower_scores
       where week = p_week and mode = v_mode and max_floor >= 8
       order by max_floor desc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      for k in 1 .. v_cores[v_place] loop
        insert into public.part_stock (player_id, key, qty)
        values (r.player_id,
                'core-' || v_els[1 + (abs(hashtext(p_week::text || r.player_id::text || k::text)) % 5)], 1)
        on conflict (player_id, key) do update
          set qty = least(public.part_stock.qty + 1, 9999);
      end loop;
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- Everything the tower screen needs in one call (also settles the last 2 finished weeks,
-- idempotently, so no scheduler is needed): the week, the top 10 and my place per mode,
-- and last week's podium per mode.
create or replace function public.tower_state(p_player uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := public.game_week();
  v_mode text;
  v_modes jsonb := '{}'::jsonb;
  v_last jsonb := '{}'::jsonb;
  v_top jsonb;
  v_mine jsonb;
  v_my public.tower_scores;
begin
  perform public.tower_settle(v_week - 7);
  perform public.tower_settle(v_week - 14);
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    select coalesce(jsonb_agg(jsonb_build_object('place', t.place, 'player', t.player_id,
                    'name', t.name, 'floor', t.max_floor) order by t.place), '[]'::jsonb)
      into v_top
      from (
        select row_number() over (order by s.max_floor desc, s.updated_at asc, s.player_id) as place,
               s.player_id, p.name, s.max_floor
          from public.tower_scores s join public.players p on p.id = s.player_id
         where s.week = v_week and s.mode = v_mode
         order by s.max_floor desc, s.updated_at asc, s.player_id
         limit 10
      ) t;
    select * into v_my from public.tower_scores
     where week = v_week and mode = v_mode and player_id = p_player;
    if found then
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'place', 1 + (
        select count(*) from public.tower_scores o
         where o.week = v_week and o.mode = v_mode
           and (o.max_floor > v_my.max_floor
                or (o.max_floor = v_my.max_floor and o.updated_at < v_my.updated_at)
                or (o.max_floor = v_my.max_floor and o.updated_at = v_my.updated_at
                    and o.player_id < v_my.player_id))));
    else
      v_mine := null;
    end if;
    v_modes := v_modes || jsonb_build_object(v_mode,
      jsonb_build_object('top', v_top, 'mine', v_mine));
    select coalesce(jsonb_agg(jsonb_build_object('place', (w ->> 'place')::int,
             'name', p.name, 'floor', (w ->> 'floor')::int) order by (w ->> 'place')::int), '[]'::jsonb)
      into v_top
      from public.tower_settled ts
      cross join lateral jsonb_array_elements(ts.winners) as w
      join public.players p on p.id = (w ->> 'player')::uuid
     where ts.week = v_week - 7 and ts.mode = v_mode;
    v_last := v_last || jsonb_build_object(v_mode, v_top);
  end loop;
  return jsonb_build_object('week', v_week, 'modes', v_modes, 'last', v_last);
end $$;

revoke all on function public.tower_record(uuid, text, int) from public, anon, authenticated;
revoke all on function public.tower_settle(date) from public, anon, authenticated;
grant execute on function public.tower_record(uuid, text, int) to service_role;
grant execute on function public.tower_settle(date) to service_role;
revoke all on function public.tower_state(uuid) from public, anon, authenticated;
grant execute on function public.tower_state(uuid) to service_role;
