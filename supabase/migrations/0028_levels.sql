-- 0028: Run v2 dungeon levels. start_level opens a verified attempt (a `runs` row, one open at
-- a time); bank_level pays it ONCE after the server replayed the fights:
--   coins (flat per rank, repeats 60% with a daily decay), the first-clear chest of the dungeon,
--   parts / cores / pieces rolled by the server (levelLoot), hero EXP (kept even when the level
--   is lost), and the dungeon_progress update with the unlock rules.
-- Keep the constants in sync with levelPay.ts / heroLevel.ts / levels.ts (the pglite test
-- levels.mts compares them with the TS functions).

-- ---------------------------------------------------------------- constants
create or replace function public.level_count(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select case p_rank when 'f' then 6 when 'e' then 6 when 'd' then 7 when 'c' then 8
    when 'b' then 8 when 'a' then 9 when 's' then 10 when 'ss' then 11 when 'ssr' then 12 end
$$;

create or replace function public.level_base_coins(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select case p_rank when 'f' then 25 when 'e' then 25 when 'd' then 26 when 'c' then 27
    when 'b' then 28 when 'a' then 30 when 's' then 32 when 'ss' then 34 when 'ssr' then 36 end
$$;

create or replace function public.level_chest(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select case p_rank when 'f' then 1000 when 'e' then 1600 when 'd' then 2500 when 'c' then 1200
    when 'b' then 1500 when 'a' then 2000 when 's' then 2500 when 'ss' then 3000 when 'ssr' then 4000 end
$$;

-- Pay multiplier of the Nth repeated level of the day (levelDecay).
create or replace function public.level_decay(p_n int) returns numeric
language sql immutable set search_path = ''
as $$ select case when p_n <= 20 then 1 when p_n <= 40 then 0.5 when p_n <= 80 then 0.2 else 0.1 end::numeric $$;

-- ----------------------------------------------------------- unlock rules
create or replace function public.progress_cleared(p_player uuid, p_rank text, p_asc int) returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce((select cleared from public.dungeon_progress
                    where player_id = p_player and rank = p_rank and ascension = p_asc), 0)
$$;

-- Why a level is locked ('dungeon_locked', 'ascension_locked', 'level_locked') or null if open.
-- Mirrors isLevelUnlocked (dungeonProgress.ts): rank N opens when rank N-1 is done at
-- ascension 0; ascension A opens when A-1 is done; level L opens when L-1 is cleared.
create or replace function public.level_lock_reason(p_player uuid, p_rank text, p_level int, p_asc int) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ranks constant text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_i int := public.rank_idx(p_rank);
  v_a int := 0;
begin
  if v_i is null or p_level is null or p_asc is null or p_asc < 0 or p_asc > 5
     or p_level < 0 or p_level >= public.level_count(p_rank) then
    return 'level_locked';
  end if;
  if v_i > 0 and public.progress_cleared(p_player, v_ranks[v_i], 0) < public.level_count(v_ranks[v_i]) then
    return 'dungeon_locked';
  end if;
  while v_a < 5 and public.progress_cleared(p_player, p_rank, v_a) >= public.level_count(p_rank) loop
    v_a := v_a + 1;
  end loop;
  if p_asc > v_a then
    return 'ascension_locked';
  end if;
  if p_level > public.progress_cleared(p_player, p_rank, p_asc) then
    return 'level_locked';
  end if;
  return null;
end $$;

-- ------------------------------------------------------------------ EXP
-- Hero EXP (addHeroXp + gapMult in heroLevel.ts): catch-up bonus x2 / x3 when 10 / 20 levels
-- under the player's top hero, cost 10 x L^2 per level, cap 20 + 10 x stars.
create or replace function public.grant_hero_xp(p_player uuid, p_character_id text, p_xp int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
  v_top int;
  v_gap int;
  v_amount int;
  v_cap int;
  v_level int;
  v_xp int;
begin
  if p_xp is null or p_xp < 0 or p_xp > 100000 then raise exception 'invalid_args'; end if;
  select * into v_c from public.characters where player_id = p_player and key = p_character_id for update;
  if not found then
    return jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  end if;
  select max(level) into v_top from public.characters where player_id = p_player;
  v_gap := v_top - v_c.level;
  v_amount := p_xp * case when v_gap >= 20 then 3 when v_gap >= 10 then 2 else 1 end;
  v_cap := 20 + 10 * v_c.stars;
  v_level := v_c.level;
  v_xp := v_c.xp;
  if v_level >= v_cap then
    v_level := least(v_level, v_cap);
    v_xp := 0;
  else
    v_xp := v_xp + v_amount;
    while v_level < v_cap and v_xp >= 10 * v_level * v_level loop
      v_xp := v_xp - 10 * v_level * v_level;
      v_level := v_level + 1;
    end loop;
    if v_level >= v_cap then v_xp := 0; end if;
  end if;
  update public.characters set level = v_level, xp = v_xp
   where player_id = p_player and key = p_character_id;
  return jsonb_build_object('xp', v_amount, 'level', v_level, 'gained', v_level - v_c.level, 'applied', true);
end $$;

-- ------------------------------------------------------------ start a level
-- Opens the attempt. Only one open run per player (the caller closes a stale one first).
-- Rate limits (a script can replay the deterministic engine at CPU speed): at most 40 level
-- starts per hour and 300 per day; a person plays ~15 levels an hour.
create or replace function public.start_level(
  p_player uuid, p_character_id text, p_seed bigint, p_hero jsonb,
  p_rank text, p_level int, p_asc int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_why text;
begin
  if p_hero is null or jsonb_typeof(p_hero) <> 'object' or p_character_id is null then
    raise exception 'invalid_args';
  end if;
  if not exists (select 1 from public.characters where player_id = p_player and key = p_character_id) then
    raise exception 'character_not_found';
  end if;
  v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
  if v_why is not null then
    raise exception '%', v_why;
  end if;
  if (select count(*) from public.runs
       where player_id = p_player and hero ->> 'kind' = 'level'
         and started_at > now() - interval '1 hour') >= 40
     or (select count(*) from public.runs
          where player_id = p_player and hero ->> 'kind' = 'level'
            and started_at > now() - interval '1 day') >= 300 then
    raise exception 'rate_limited';
  end if;
  update public.runs set status = 'expired', finished_at = now()
   where player_id = p_player and status = 'open'
     and started_at < now() - interval '1 hour' * public.game_const('run_stale_hours');
  if exists (select 1 from public.runs where player_id = p_player and status = 'open') then
    raise exception 'run_open';
  end if;
  begin
    insert into public.runs (player_id, seed, hero)
    values (p_player, p_seed,
            p_hero || jsonb_build_object('kind', 'level', 'rank', p_rank, 'level', p_level,
                                         'asc', p_asc, 'heroId', p_character_id))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'run_open';
  end;
  return jsonb_build_object('run_id', v_id);
end $$;

-- ---------------------------------------------------------- bank the attempt
-- p_status: how the replayed stage ended ('cleared' / 'lost'); p_xp: stage EXP of the replay
-- (raw); p_parts / p_pieces: the loot the server rolled with levelLoot (only if cleared);
-- p_repeat: whether that roll assumed the level was already cleared (checked here).
-- p_verdict: accepted | cut (illegal/short log: pay what the replay says) | rejected (pays nothing).
create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
  p_status text, p_xp int, p_parts jsonb, p_pieces jsonb, p_repeat boolean,
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
  v_n int;
  v_base numeric;
  v_coins int := 0;
  v_chest int := 0;
  v_refund int := 0;
  v_xp int;
  v_capped boolean := false;
  v_item jsonb;
  v_status text;
  v_pkey text;
  v_pqty text;
  v_total int := 0;
  v_hero jsonb := jsonb_build_object('xp', 0, 'level', 0, 'gained', 0, 'applied', false);
  v_new_coins int;
  v_version int;
  v_dungeon_done boolean := false;
begin
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
     or p_asc is null or p_asc < 0 or p_asc > 5
     or p_hero_id is null or p_status not in ('cleared', 'lost')
     or v_verdict not in ('accepted', 'cut', 'rejected')
     or p_xp is null or p_xp < 0
     or p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;

  -- One bank per attempt: the run row is locked and flipped open -> closed.
  select * into v_run from public.runs where id = p_run_id and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'closed' then raise exception 'duplicate_run'; end if;
  if v_run.status <> 'open' then raise exception 'run_expired'; end if;
  if v_run.hero ->> 'kind' is distinct from 'level'
     or v_run.hero ->> 'rank' is distinct from p_rank
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

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or (select count(*) from jsonb_object_keys(p_parts)) > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 3 or (select count(*) from jsonb_object_keys(p_parts)) > 40 then
    raise exception 'invalid_items';
  end if;
  v_xp := least(p_xp, c_max_xp);
  v_capped := p_xp > c_max_xp;

  if p_status = 'cleared' then
    v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
    if v_why is not null then raise exception '%', v_why; end if;
    v_done := public.progress_cleared(p_player, p_rank, p_asc);
    v_repeat := p_level < v_done;
    if p_repeat is distinct from v_repeat then
      raise exception 'conflict' using errcode = '40001'; -- the loot was rolled for the other case
    end if;
    v_n := case when v_state.levels_day = public.game_day() then v_state.levels_n else 0 end
         + case when v_repeat then 1 else 0 end;
    v_base := public.level_base_coins(p_rank) * (1 + 0.2 * p_asc);
    v_coins := round(case when v_repeat then v_base * 0.6 * public.level_decay(v_n) else v_base end)::int;
    if not v_repeat and p_level + 1 >= public.level_count(p_rank) then
      v_chest := round(public.level_chest(p_rank) * case when p_asc = 0 then 1 else 0.5 end)::int;
      v_dungeon_done := true;
    end if;
    if not v_repeat then
      insert into public.dungeon_progress (player_id, rank, ascension, cleared)
      values (p_player, p_rank, p_asc, p_level + 1)
      on conflict (player_id, rank, ascension) do update
        set cleared = greatest(public.dungeon_progress.cleared, excluded.cleared);
    end if;

    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,2}$' then
        raise exception 'invalid_items';
      end if;
      v_total := v_total + v_pqty::int;
      if v_total > 40 then raise exception 'invalid_items'; end if;
      insert into public.part_stock (player_id, key, qty) values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;

    for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
      -- a level drops at most one rank above its dungeon
      if public.rank_idx(v_item ->> 'rarity') is null
         or public.rank_idx(v_item ->> 'rarity') > public.rank_idx(p_rank) + 1 then
        raise exception 'invalid_items';
      end if;
      v_status := public.grant_piece(
        p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      if v_status = 'refund' then
        v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
      end if;
    end loop;
  elsif jsonb_array_length(p_pieces) > 0 or (select count(*) from jsonb_object_keys(p_parts)) > 0 then
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
    'newLevel', (v_hero ->> 'level')::int, 'dungeonDone', v_dungeon_done,
    'balance', v_new_coins, 'version', v_version, 'verdict', v_verdict, 'capped', v_capped);
end $$;
