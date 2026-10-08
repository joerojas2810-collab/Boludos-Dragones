-- Boludos & Dragones: database upgrade from 0042 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0042_forge_v9_fixes.sql =====
-- 0042: fixes to Forja v9 (0041 already ran; this is incremental and re-runnable).
--  * level_escamas: a repeat clear takes the coin repeat factor (0.6) times the daily decay and FLOORS, so repeats and
--    sweeps of a decayed day reach 0 Escamas (a first clear still rounds). bank_level uses the new 4-argument form.
--  * Dado cargado: every source except the weekly mission and the Viernes event counts in dado_n (cap 2 per game day):
--    grant_dado_capped is used by coop_pay and tower_settle; bank_level keeps its own check. A capped Dado is simply not paid.
--  * apply_ascend: materials with plus > 0 are refused (material_upgraded); a 'refund' from grant_piece (target at max
--    stars) aborts the whole transaction instead of consuming the pieces.
--  * grant_piece: the removed weapon 'lanza' is no longer accepted.
-- New signatures are born executable by anon/authenticated: 0018 (always last) closes them again.

drop function if exists public.level_escamas(text, int, numeric);
create or replace function public.level_escamas(p_rank text, p_asc int, p_repeat boolean, p_mult numeric) returns int
language sql immutable set search_path = ''
as $$
  select case when p_repeat
    then floor((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc) * 0.6 * p_mult)::int
    else round((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc))::int
  end
$$;

-- Pays up to p_n dice, never past 2 per game day (shared with bank_level via dado_day / dado_n). Returns what was paid.
create or replace function public.grant_dado_capped(p_player uuid, p_n int) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_have int;
  v_give int;
begin
  select case when dado_day = public.game_day() then dado_n else 0 end into v_have
    from public.player_state where player_id = p_player for update;
  if not found then return 0; end if;
  v_give := least(coalesce(p_n, 0), greatest(0, 2 - v_have));
  if v_give > 0 then
    update public.player_state
       set dados = least(99999, dados + v_give), dado_day = public.game_day(), dado_n = v_have + v_give
     where player_id = p_player;
  end if;
  return v_give;
end $$;

create or replace function public.grant_piece(
  p_player uuid, p_type text, p_element text, p_rank text, p_name text,
  p_roll numeric, p_lines jsonb, p_refund_on_max boolean
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_stars int;
  v_oroll numeric;
  v_olines jsonb;
  v_lines jsonb := case when p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
                        then null else p_lines end;
begin
  if not coalesce(p_type = any (array['espada', 'hacha', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
     or not coalesce(p_element = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
     or not coalesce(p_rank = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
    raise exception 'invalid_items';
  end if;
  perform public.piece_check(p_type, p_rank, p_roll, v_lines);
  select stars, roll, lines into v_stars, v_oroll, v_olines from public.weapons
   where player_id = p_player and type = p_type and element = p_element and rarity = p_rank
   for update;
  if found then
    if v_stars >= public.game_const('max_stars') then
      if p_refund_on_max then return 'refund'; end if;
      raise exception 'max_stars';
    end if;
    if public.piece_quality(p_roll, v_lines) > public.piece_quality(v_oroll, v_olines) then
      update public.weapons set stars = v_stars + 1, roll = p_roll, lines = v_lines
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    else
      update public.weapons set stars = v_stars + 1
       where player_id = p_player and type = p_type and element = p_element and rarity = p_rank;
    end if;
    return 'star';
  end if;
  insert into public.weapons (player_id, type, element, rarity, roll, lines, data)
  values (p_player, p_type, p_element, p_rank, p_roll, v_lines,
          jsonb_build_object('name', left(coalesce(p_name, 'Pieza'), 60)));
  return 'new';
end $$;

create or replace function public.bank_level(
  p_player uuid, p_run_id uuid, p_hero_id text, p_rank text, p_level int, p_asc int,
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
  if p_rank is null or public.rank_idx(p_rank) is null
     or p_level is null or p_level < 0 or p_level >= public.level_count(p_rank)
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

  if p_status = 'lost' and (jsonb_array_length(p_pieces) > 0 or p_dados > 0) then
    raise exception 'invalid_args'; -- a lost level has no loot
  end if;
  if jsonb_array_length(p_pieces) > 30 then
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

    -- Escamas (S+ only) follow the coin rules: +10% per ascension, repeats decay with the day's count.
    v_escamas := public.level_escamas(p_rank, p_asc, v_repeat, case when v_repeat then public.level_decay(v_n) else 1 end);
    -- Dado cargado: only the last level of a dungeon S+; the server rolled it, SQL caps it at 2 per day.
    if p_dados > 0 then
      if public.rank_idx(p_rank) < public.rank_idx('s') or p_level + 1 < public.level_count(p_rank) then
        raise exception 'invalid_items';
      end if;
      v_dn := case when v_state.dado_day = public.game_day() then v_state.dado_n else 0 end;
      if v_dn < 2 then v_dado := 1; end if;
    end if;

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

create or replace function public.coop_pay(p_room uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_phase text;
  v_row jsonb;
  v_player uuid;
  v_coins int;
  v_chips int;
  v_dados int;
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
    v_dados := coalesce((v_row ->> 'dados')::int, 0);
    if v_coins < 0 or v_coins > 1000 or v_chips < 0 or v_chips > 500 or v_dados < 0 or v_dados > 3 then
      raise exception 'invalid_args';
    end if;
    perform 1 from public.room_coop
     where room_id = p_room and player_id = v_player and not paid for update;
    if not found then continue; end if;
    -- Account prizes (coins, dice) are limited to 3 rooms per 24 h per player; chips are not.
    v_acct := (select count(*) from public.room_coop
                where player_id = v_player and acct and paid_at > now() - interval '24 hours') < 3;
    update public.room_coop set paid = true, paid_at = now(), acct = v_acct
     where room_id = p_room and player_id = v_player;
    if not v_acct then
      v_coins := 0;
      v_dados := 0;
    end if;
    if v_coins > 0 then
      update public.player_state set coins = coins + v_coins, version = version + 1
       where player_id = v_player;
    end if;
    -- Dice share the daily cap of 2 with the level drops; over the cap they are simply not paid.
    if v_dados > 0 then
      perform public.grant_dado_capped(v_player, v_dados);
    end if;
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

create or replace function public.tower_settle(p_week date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  r record;
  v_place int;
  v_coins int[] := array[300, 200, 100];
  v_win jsonb;
  v_n int := 0;
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
       order by max_floor desc, rounds asc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      perform public.grant_dado_capped(r.player_id, 1);
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

create or replace function public.apply_ascend(
  p_player uuid, p_version int, p_base text, p_materials jsonb, p_new jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_ranks constant text[] := array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'];
  v_total constant int[] := array[6, 6, 5, 5, 4, 4, 3, 3];
  v_cost constant int[] := array[20, 40, 80, 160, 320, 640, 1280, 2560];
  v_state public.player_state;
  v_b public.weapons;
  v_i int;
  v_next text;
  v_m text;
  v_mw public.weapons;
  v_n int;
  v_new text;
  v_eq jsonb;
  v_status text;
begin
  if p_base is null or p_base !~ '^w-[a-z]+-[a-z]+-[a-z]+$'
     or p_materials is null or jsonb_typeof(p_materials) <> 'array'
     or jsonb_array_length(p_materials) not between 2 and 5
     or p_new is null or jsonb_typeof(p_new) <> 'object' then
    raise exception 'invalid_args';
  end if;
  v_n := jsonb_array_length(p_materials);
  if (select count(distinct x) from jsonb_array_elements_text(p_materials) as t(x)) <> v_n
     or p_materials ? p_base then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;

  select * into v_b from public.weapons where player_id = p_player and key = p_base for update;
  if not found then raise exception 'not_owned'; end if;
  v_i := array_position(v_ranks, v_b.rarity);
  if v_i is null or v_i >= 9 then raise exception 'invalid_args'; end if;
  v_next := v_ranks[v_i + 1];
  if v_n + 1 <> v_total[v_i] then raise exception 'invalid_args'; end if;
  if v_state.coins < v_cost[v_i] then raise exception 'insufficient_coins'; end if;
  if p_new ->> 'type' is distinct from v_b.type or p_new ->> 'element' is distinct from v_b.element
     or p_new ->> 'rarity' is distinct from v_next then
    raise exception 'invalid_items';
  end if;

  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    if v_m is null or v_m !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
    select * into v_mw from public.weapons where player_id = p_player and key = v_m for update;
    if not found then raise exception 'not_owned'; end if;
    if v_mw.rarity <> v_b.rarity then raise exception 'rank_mismatch'; end if;
    if v_mw.plus > 0 then raise exception 'material_upgraded'; end if;
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_m) then
      raise exception 'equipped';
    end if;
  end loop;

  -- The worn base keeps its place under the new key (the FK would cascade the rows away).
  select coalesce(jsonb_agg(jsonb_build_object('c', e.character_key, 's', e.slot)), '[]'::jsonb) into v_eq
    from public.equipment e where e.player_id = p_player and e.weapon_key = p_base;
  delete from public.equipment where player_id = p_player and weapon_key = p_base;
  delete from public.weapons where player_id = p_player and key = p_base;
  for v_m in select e from jsonb_array_elements_text(p_materials) as t(e) loop
    delete from public.weapons where player_id = p_player and key = v_m;
  end loop;

  v_status := public.grant_piece(
    p_player, v_b.type, v_b.element, v_next, left(coalesce(p_new ->> 'name', v_b.data ->> 'name', 'Pieza'), 60),
    case when (p_new ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (p_new ->> 'roll')::numeric end,
    p_new -> 'lines', false);
  if v_status not in ('new', 'star') then raise exception 'max_stars'; end if; -- 'refund': roll everything back
  v_new := 'w-' || v_b.type || '-' || v_b.element || '-' || v_next;
  if jsonb_array_length(v_eq) > 0 then
    if v_status <> 'new' then raise exception 'equipped'; end if; -- the target piece already existed
    insert into public.equipment (player_id, character_key, weapon_key, slot)
    select p_player, x ->> 'c', v_new, x ->> 's' from jsonb_array_elements(v_eq) as t(x);
  end if;

  update public.player_state set coins = coins - v_cost[v_i], version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('key', v_new, 'status', v_status, 'coins', v_state.coins, 'version', v_state.version);
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
