-- 0057: shared first-clear payouts and dungeon-material daily caps.
-- Re-runnable; public RPC argument names remain unchanged.
create table if not exists public.dungeon_reward_days (
  player_id uuid not null references public.players(id) on delete cascade,
  day date not null,
  escamas int not null default 0 check (escamas between 0 and 12),
  dados int not null default 0 check (dados between 0 and 1),
  primary key (player_id, day)
);
alter table public.dungeon_reward_days enable row level security;
revoke all on public.dungeon_reward_days from public, anon, authenticated;
drop policy if exists deny_all on public.dungeon_reward_days;
create policy deny_all on public.dungeon_reward_days as restrictive for all
  using (false) with check (false);

create or replace function public.difficulty_level_coins(p_difficulty text) returns int
language sql immutable set search_path = '' as $$
  select case p_difficulty when 'f' then 60 when 'e' then 75 when 'd' then 95 when 'c' then 120
    when 'b' then 150 when 'a' then 180 when 's' then 210 end
$$;

create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_route text, p_difficulty text, p_level int, p_asc int,
  p_status text, p_xp int, p_dados int, p_pieces jsonb, p_repeat boolean,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_max_xp constant int := 1500; -- a 5-fight level with a final boss gives 1125
  v_run public.runs;
  v_state public.player_state;
  v_verdict text := coalesce(p_verdict, 'accepted');
  v_why text;
  v_done int;
  v_repeat boolean := false;
  v_route_repeat boolean := false;
  v_daily_escamas int := 0;
  v_daily_dados int := 0;
  v_rows int := 0;
  v_n int;
  v_base numeric;
  v_coins int := 0;
  v_chest int := 0;
  v_refund int := 0;
  v_xp int;
  v_capped boolean := false;
  v_item jsonb;
  v_status text;
  v_escamas int := 0;
  v_dado int := 0;
  v_dn int;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_difficulty is null or public.rank_idx(p_difficulty) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count()
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_dados is null or p_dados not in (0, 1)
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'route' is distinct from p_route
     or v_run.hero ->> 'difficulty' is distinct from p_difficulty
     or (v_run.hero ->> 'level')::int is distinct from p_level
     or (v_run.hero ->> 'asc')::int is distinct from p_asc
     or v_run.hero ->> 'heroId' is distinct from p_hero_id then
    raise exception 'invalid_args'; -- the attempt that was started is not the one being paid
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;

  if v_verdict = 'rejected' then
    update public.runs set status = 'closed', finished_at = now() where id = p_run_id;
    insert into public.run_submissions (run_id, player_id, log, verdict, reason)
    values (p_run_id, p_player, p_log, 'rejected', left(p_reason, 300));
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_rejected', jsonb_build_object('run_id', p_run_id, 'reason', left(p_reason, 300)));
    return jsonb_build_object('cleared', false, 'repeat', false, 'coins', 0, 'chest', 0, 'xp', 0,
                              'levelsGained', 0, 'newLevel', 0, 'dungeonDone', false, 'verdict', 'rejected');
  end if;

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or p_dados > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 30 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_route, p_difficulty, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.route_cleared(p_player, p_route, p_difficulty, p_asc);
    v_route_repeat := p_level < v_done;
    select exists (select 1 from public.route_progress
      where player_id = p_player and difficulty = p_difficulty and ascension = p_asc and levels > p_level)
      into v_repeat;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.difficulty_level_coins(p_difficulty) * (1 + 0.04 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_route_repeat then
      v_dungeon_done := p_level + 1 >= public.level_count();
      insert into public.route_progress (player_id, route, difficulty, ascension, levels)
      values (p_player, p_route, p_difficulty, p_asc, p_level + 1)
      on conflict (player_id, route, difficulty, ascension) do update
        set levels = greatest(public.route_progress.levels, excluded.levels);
      if p_level + 1 = public.level_count() then
        insert into public.step_clears (player_id, difficulty, ascension)
        values (p_player, p_difficulty, p_asc) on conflict do nothing;
        get diagnostics v_rows = row_count;
        if v_rows = 1 then
          v_chest := round(public.difficulty_level_chest(p_difficulty)
            * case when p_asc = 0 then 1 else 0.5 end)::int;
        end if;
      end if;
    end if;

    -- One S+5 full clear's daily dungeon payout: 12 Escamas and one Dado, shared by routes.
    insert into public.dungeon_reward_days (player_id, day, escamas, dados)
      values (p_player, public.game_day(), 0, 0) on conflict do nothing;
    select escamas, dados into v_daily_escamas, v_daily_dados
      from public.dungeon_reward_days where player_id = p_player and day = public.game_day() for update;
    v_escamas := least(public.difficulty_level_escamas(p_difficulty, p_asc, v_repeat,
      case when v_repeat then public.level_decay(v_n) else 1 end), greatest(0, 12 - v_daily_escamas));
    -- Dado cargado: only the last level of S; the server rolls it, SQL enforces both caps.
    if p_dados > 0 then
      if p_difficulty <> 's' or p_level + 1 < public.level_count() then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_daily_dados < 1 and v_dn < 2 then v_dado := 1; end if;
    end if;

    if v_escamas > 0 or v_dado > 0 then
      update public.dungeon_reward_days set escamas = escamas + v_escamas, dados = dados + v_dado
       where player_id = p_player and day = public.game_day();
    end if;
    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level never drops above its dungeon difficulty
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_difficulty) then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      -- a duplicate already at max stars is ignored: no coin refund (drops are plentiful)
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or p_dados > 0 then
    raise exception 'invalid_args';
  end if;

  -- EXP: always (a lost level keeps what the replay earned).
  if v_xp > 0 then
    v_hero := public.grant_hero_xp(p_player, p_hero_id, v_xp);
  end if;

  update public.runs
     set status = 'closed', finished_at = now(), max_floor = case when p_status = 'cleared' then p_level + 1 else 0 end,
         coins_earned = v_coins + v_chest
   where id = p_run_id;
  insert into public.run_submissions (run_id, player_id, log, verdict, reason)
  values (p_run_id, p_player, p_log, v_verdict, left(p_reason, 300));

  update public.player_state
     set coins = coins + v_coins + v_chest + v_refund, version = version + 1,
         escamas = least(99999, escamas + v_escamas), dados = least(99999, dados + v_dado),
         dado_day = case when v_dado > 0 then public.game_day() else dado_day end,
         dado_n = case when v_dado > 0 then v_dn + 1 else dado_n end,
         levels_day = case when p_status = 'cleared' then public.game_day() else levels_day end,
         levels_n = case when p_status = 'cleared' then v_n else levels_n end
   where player_id = p_player
   returning coins, version into v_new_coins, v_version;

  if v_capped or v_verdict = 'cut' then
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'level_' || case when v_capped then 'capped' else 'cut' end,
            jsonb_build_object('run_id', p_run_id, 'claimed_xp', p_xp, 'credited_xp', v_xp, 'reason', left(p_reason, 300)));
  end if;

  return jsonb_build_object(
    'cleared', p_status = 'cleared', 'repeat', v_repeat, 'coins', v_coins, 'chest', v_chest,
    'refund', v_refund, 'xp', (v_hero ->> 'xp')::int, 'levelsGained', (v_hero ->> 'gained')::int,
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done, 'escamas', v_escamas, 'dados', v_dado,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;
revoke all on function public.bank_level(uuid, uuid, text, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.bank_level(uuid, uuid, text, text, text, int, int, text, int, int, jsonb, boolean, jsonb, text, text) to service_role;
