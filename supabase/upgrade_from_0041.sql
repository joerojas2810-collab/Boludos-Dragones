-- Boludos & Dragones: database upgrade from 0041 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0041_forge_v9.sql =====
-- 0041: Forja v9.0 (docs/FORJA_V9.md). Two actions, two materials.
--  * Escamas and Dado cargado live on player_state (bound to the account, never tradable).
--  * weapons.plus / plus_streak: the Mejorar level (+0..+10) and the consecutive failures.
--  * ONE-TIME (flag 0041_forge_v9): the old part_stock becomes value without loss. Parts of rank S/SS/SSR
--    -> Escamas (1/2/4 each); parts of F..A -> coins (F 5, E 8, D 12, C 20, B 35, A 60 each); every
--    core -> 1 Dado cargado. Keep in sync with PART_TO_ESCAMAS / PART_TO_COINS in profile.ts.
--    part_stock stays (empty, nothing writes to it) so old setups keep working.
--  * apply_forge and grant_core are gone. New: apply_ascend, apply_upgrade, level_escamas.
--  * bank_level: p_parts -> p_dados; it computes the Escamas itself (S/SS/SSR levels 2/3/4, +10% per
--    ascension, repeat decay) and caps the last-level Dado at 2 per game day.
--  * mission_claim, coop_pay, tower_*: cores -> Dados (weekly mission 1, Viernes event 1, coop win 1
--    (+1 MVP), tower top 3 one each). Tower floor prizes are coins only now.
-- New signatures are born executable by anon/authenticated: 0018 (always last) closes them again.

alter table public.player_state add column if not exists escamas int not null default 0 check (escamas >= 0);
alter table public.player_state add column if not exists dados int not null default 0 check (dados >= 0);
alter table public.player_state add column if not exists dado_day date;
alter table public.player_state add column if not exists dado_n int not null default 0 check (dado_n >= 0);
alter table public.weapons add column if not exists plus int not null default 0 check (plus between 0 and 10);
alter table public.weapons add column if not exists plus_streak int not null default 0 check (plus_streak >= 0);

do $$
begin
  if exists (select 1 from public.migration_flags where key = '0041_forge_v9') then
    return;
  end if;
  update public.player_state ps
     set escamas = least(99999, ps.escamas + c.esc),
         dados = least(99999, ps.dados + c.dad),
         coins = ps.coins + c.coin,
         version = ps.version + 1
    from (
      select k.player_id,
             sum(case when k.key like 'core-%' then 0
                      when substring(k.key from '[^-]+$') = 's' then k.qty
                      when substring(k.key from '[^-]+$') = 'ss' then k.qty * 2
                      when substring(k.key from '[^-]+$') = 'ssr' then k.qty * 4 else 0 end)::int as esc,
             sum(case when k.key like 'core-%' then k.qty else 0 end)::int as dad,
             sum(case when k.key like 'core-%' then 0
                      else k.qty * case substring(k.key from '[^-]+$')
                        when 'f' then 5 when 'e' then 8 when 'd' then 12 when 'c' then 20
                        when 'b' then 35 when 'a' then 60 else 0 end end)::int as coin
        from public.part_stock k where k.qty > 0 group by k.player_id
    ) c
   where ps.player_id = c.player_id;
  delete from public.part_stock;
  insert into public.migration_flags (key) values ('0041_forge_v9');
end $$;

drop function if exists public.apply_forge(uuid, int, int, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.grant_core(uuid, text, int);
drop function if exists public.tower_floor_cores(int);

-- Escamas of a cleared level (levelEscamas in levelLoot.ts): S 2, SS 3, SSR 4, +10% per ascension level,
-- times the daily repeat decay (p_mult, 1 for a new level).
create or replace function public.level_escamas(p_rank text, p_asc int, p_mult numeric) returns int
language sql immutable set search_path = ''
as $$
  select round((case p_rank when 's' then 2 when 'ss' then 3 when 'ssr' then 4 else 0 end)
               * (1 + 0.1 * p_asc) * p_mult)::int
$$;

create or replace function public.get_profile(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_p public.players;
  v_s public.player_state;
begin
  select * into v_p from public.players where id = p_player;
  if not found then
    raise exception 'player_not_found';
  end if;
  select * into v_s from public.player_state where player_id = p_player;
  return jsonb_build_object(
    'name', v_p.name,
    'isAdmin', v_p.is_admin,
    'bestFloor', v_p.best_floor,
    'stateVersion', v_s.version,
    'coins', v_s.coins,
    'pity', coalesce((
      select jsonb_object_agg(g.banner, g.pity)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'escamas', v_s.escamas,
    'dados', v_s.dados,
    'dadosDay', case when v_s.dado_day = public.game_day()
                     then jsonb_build_object('day', to_char(v_s.dado_day, 'YYYY-MM-DD'), 'n', v_s.dado_n)
                     else null end,
    -- {rank: [levels cleared at ascension 0, 1, ...]}
    'dungeons', coalesce((
      select jsonb_object_agg(t.rank, t.arr)
      from (
        select m.rank,
               (select jsonb_agg(coalesce(x.cleared, 0) order by a.n)
                  from generate_series(0, m.top) as a(n)
                  left join public.dungeon_progress x
                    on x.player_id = p_player and x.rank = m.rank and x.ascension = a.n) as arr
          from (select d.rank, max(d.ascension) as top
                  from public.dungeon_progress d
                 where d.player_id = p_player group by d.rank) m
      ) t
    ), '{}'::jsonb),
    'levelsDay', case when v_s.levels_day = public.game_day()
                      then jsonb_build_object('day', to_char(v_s.levels_day, 'YYYY-MM-DD'), 'n', v_s.levels_n)
                      else null end,
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars,
        'data', c.data || jsonb_build_object('level', c.level, 'xp', c.xp, 'legacy', c.legacy)
                       || case when c.skill is null then '{}'::jsonb else jsonb_build_object('skill', c.skill) end
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars,
        'data', w.data || jsonb_build_object('legacy', w.legacy, 'plus', w.plus, 'plusStreak', w.plus_streak)
                       || case when w.roll is null then '{}'::jsonb else jsonb_build_object('roll', w.roll) end
                       || case when w.lines is null then '{}'::jsonb else jsonb_build_object('lines', w.lines) end
      ) order by w.created_at, w.key)
      from public.weapons w where w.player_id = p_player
    ), '[]'::jsonb),
    'equipped', coalesce((
      select jsonb_object_agg(case when e.slot = 'arma' then e.character_key else e.character_key || '|' || e.slot end, e.weapon_key)
      from public.equipment e where e.player_id = p_player
    ), '{}'::jsonb),
    'fragments', coalesce((
      select jsonb_object_agg(f.class || ':' || f.rarity, f.qty)
      from public.fragments f where f.player_id = p_player and f.qty > 0
    ), '{}'::jsonb)
  );
end $$;

drop function if exists public.bank_level(uuid, uuid, text, text, int, int, text, int, jsonb, jsonb, boolean, jsonb, text, text);
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
    v_escamas := public.level_escamas(p_rank, p_asc, case when v_repeat then public.level_decay(v_n) else 1 end);
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

drop function if exists public.mission_claim(uuid, text, int, jsonb, jsonb);
create or replace function public.mission_claim(
  p_player uuid, p_scope text, p_reached int,
  p_pieces jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_period date;
  v_row public.mission_state;
  v_coins int[];
  v_dados int[];
  v_pieces int[];
  v_pay int := 0;
  v_dado int := 0;
  v_nx int := 0;
  v_best int := public.rank_idx(public.best_cleared_rank(p_player));
  v_refund int := 0;
  v_item jsonb;
  k int;
begin
  if p_scope not in ('daily', 'weekly', 'event') or p_reached is null or p_reached not between 1 and 3
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;
  -- SCOPE_TIERS (missions.ts), one entry per tier (30 / 60 / 90 activity points).
  v_coins := case p_scope when 'daily' then array[20, 30, 250]
                          when 'weekly' then array[120, 100, 500]
                          else array[50, 100, 400] end;
  v_dados := case p_scope when 'daily' then array[0, 0, 0]
                          when 'weekly' then array[0, 0, 1]
                          else array[0, 0, 1] end;
  v_pieces := case p_scope when 'weekly' then array[0, 1, 0] else array[0, 0, 0] end;
  v_period := case when p_scope = 'daily' then public.game_day() else public.game_week() end;
  perform 1 from public.player_state where player_id = p_player for update;
  select * into v_row from public.mission_state
   where player_id = p_player and scope = p_scope and period = v_period for update;
  if not found or v_row.claimed >= p_reached then
    raise exception 'nothing_to_claim';
  end if;
  for k in v_row.claimed + 1 .. p_reached loop
    v_pay := v_pay + v_coins[k];
    v_dado := v_dado + v_dados[k];
    v_nx := v_nx + v_pieces[k];
  end loop;

  -- Pieces: exactly the promised amount, at most at the best rank.
  if jsonb_array_length(p_pieces) <> v_nx then
    raise exception 'invalid_items';
  end if;
  for v_item in select e from jsonb_array_elements(p_pieces) as t(e) loop
    if public.rank_idx(v_item ->> 'rarity') is null or public.rank_idx(v_item ->> 'rarity') > v_best then
      raise exception 'invalid_items';
    end if;
    if public.grant_piece(
         p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
         case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
         v_item -> 'lines', true) = 'refund' then
      v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
    end if;
  end loop;

  update public.mission_state set claimed = p_reached
   where player_id = p_player and scope = p_scope and period = v_period;
  update public.player_state set coins = coins + v_pay + v_refund, dados = least(99999, dados + v_dado), version = version + 1
   where player_id = p_player;
  return jsonb_build_object('coins', v_pay + v_refund, 'dados', v_dado,
                            'pieces', v_nx, 'claimed', p_reached);
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
    if v_coins > 0 or v_dados > 0 then
      update public.player_state set coins = coins + v_coins, dados = least(99999, dados + v_dados), version = version + 1
       where player_id = v_player;
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

-- Tower floor prizes are coins only: floor 5 of each 10-cycle 150, floor 10 300, else 5.
create or replace function public.tower_floor_coins(p_floor int) returns int
language sql immutable set search_path = ''
as $$ select case ((p_floor - 1) % 10) + 1 when 10 then 300 when 5 then 150 else 5 end $$;

create or replace function public.tower_settle_daily() returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date - 1;
  v_week date := date_trunc('week', ((now() at time zone 'utc')::date - 1)::timestamp)::date;
  v_mode text;
  v_win record;
  v_n int := 0;
begin
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    perform pg_advisory_xact_lock(hashtext('tower_daily:' || v_day::text || v_mode));
    if exists (select 1 from public.tower_daily where day = v_day and mode = v_mode) then
      continue;
    end if;
    select player_id, max_floor into v_win from public.tower_scores
     where week = v_week and mode = v_mode and max_floor >= 1
     order by max_floor desc, rounds asc, updated_at asc, player_id
     limit 1;
    if not found then
      continue;
    end if;
    insert into public.tower_daily (day, mode, player_id, floor) values (v_day, v_mode, v_win.player_id, v_win.max_floor);
    update public.player_state set coins = coins + 350, version = version + 1
     where player_id = v_win.player_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int, p_rounds int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_floor int;
  v_rounds int;
  v_coins int;
  v_paid int;
  v_week date := public.game_week();
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500
     or p_rounds is null or p_rounds < 0 or p_rounds > 1000000 then
    raise exception 'invalid_args';
  end if;
  perform public.tower_settle_daily();
  insert into public.tower_scores (week, mode, player_id, max_floor, rounds)
  values (v_week, p_mode, p_player, p_floor, p_rounds)
  on conflict (week, mode, player_id) do update
    set max_floor = case when excluded.max_floor > public.tower_scores.max_floor
                           or (excluded.max_floor = public.tower_scores.max_floor
                               and excluded.rounds < public.tower_scores.rounds)
                         then excluded.max_floor else public.tower_scores.max_floor end,
        rounds = case when excluded.max_floor > public.tower_scores.max_floor
                        or (excluded.max_floor = public.tower_scores.max_floor
                            and excluded.rounds < public.tower_scores.rounds)
                      then excluded.rounds else public.tower_scores.rounds end,
        updated_at = case when excluded.max_floor > public.tower_scores.max_floor
                            or (excluded.max_floor = public.tower_scores.max_floor
                                and excluded.rounds < public.tower_scores.rounds)
                          then now() else public.tower_scores.updated_at end
  returning max_floor, rounds into v_floor, v_rounds;

  with ins as (
    insert into public.tower_floor_paid (week, mode, player_id, floor)
    select v_week, p_mode, p_player, g from generate_series(1, p_floor) as g
    on conflict do nothing
    returning floor
  )
  select coalesce(sum(public.tower_floor_coins(floor)), 0), count(*)
    into v_coins, v_paid from ins;
  if v_paid > 0 then
    update public.player_state set coins = coins + v_coins, version = version + 1
     where player_id = p_player;
  end if;
  return jsonb_build_object('week', v_week, 'max_floor', v_floor, 'rounds', v_rounds,
                            'prize', jsonb_build_object('floors', v_paid, 'coins', v_coins, 'dados', 0));
end $$;

-- Weekly prizes: 300 / 200 / 100 coins and 1 Dado cargado each (TOWER_PRIZES).
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
      update public.player_state set dados = least(99999, dados + 1) where player_id = r.player_id;
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- ------------------------------------------------------------------ Ascender
-- Same rule and table as hero fusion (HERO_FUSION / ASCEND): the base piece + (total - 1) materials of the
-- SAME rank (any type or element, not worn) + coins -> the base one rank up (0 stars, +0, a new roll).
-- The server rolls the new piece (p_new); SQL checks ownership, ranks, counts, coins and the roll.
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

-- ------------------------------------------------------------------ Mejorar
-- The server rolled p_success (UPGRADE_TABLE + streak + dado in upgrade.ts); SQL checks the piece
-- (S+, 5 stars, plus < 10) and takes the Escamas (cost = the level you go to) and the die.
create or replace function public.apply_upgrade(
  p_player uuid, p_version int, p_key text, p_use_dado boolean, p_success boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_w public.weapons;
  v_cost int;
begin
  if p_key is null or p_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' or p_use_dado is null or p_success is null then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select * into v_w from public.weapons where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if public.rank_idx(v_w.rarity) < public.rank_idx('s') or v_w.stars < 5 or v_w.plus >= 10 then
    raise exception 'invalid_args';
  end if;
  v_cost := v_w.plus + 1;
  if v_state.escamas < v_cost then raise exception 'insufficient_escamas'; end if;
  if p_use_dado and v_state.dados < 1 then raise exception 'insufficient_dados'; end if;
  update public.weapons
     set plus = case when p_success then plus + 1 else plus end,
         plus_streak = case when p_success then 0 else plus_streak + 1 end
   where player_id = p_player and key = p_key returning plus, plus_streak into v_w.plus, v_w.plus_streak;
  update public.player_state
     set escamas = escamas - v_cost, dados = dados - case when p_use_dado then 1 else 0 end, version = version + 1
   where player_id = p_player returning escamas, dados, version into v_state.escamas, v_state.dados, v_state.version;
  return jsonb_build_object('success', p_success, 'plus', v_w.plus, 'plusStreak', v_w.plus_streak,
                            'escamas', v_state.escamas, 'dados', v_state.dados, 'version', v_state.version);
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
