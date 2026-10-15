-- Boludos & Dragones: database upgrade from 0057 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0057_dungeon_economy.sql =====
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

-- ===== 0058_class_mastery_loadouts.sql =====
-- 0058: class mastery (highest hero level reached per class) and equipped skill loadouts,
-- plus their exposure through get_profile. Mastery is maintained by a trigger on
-- characters.level, so the client can never raise it; loadouts are validated again here
-- (skill ids, class, unlock tier) as defence in depth behind the server's loadoutError.
-- Re-runnable. New tables are deny-all (only the server's service_role reads/writes them).
create table if not exists public.class_mastery (
  player_id uuid not null references public.players(id) on delete cascade,
  class text not null check (class in ('caballero', 'mago', 'picaro', 'clerigo', 'berserker')),
  level int not null default 0 check (level between 0 and 1000),
  primary key (player_id, class)
);
create table if not exists public.skill_loadouts (
  player_id uuid not null references public.players(id) on delete cascade,
  scope text not null check (scope in ('hero', 'level')), -- hero: key = characters.key; level (nivelado): key = class
  key text not null check (char_length(key) between 1 and 60),
  skills text[] not null check (cardinality(skills) = 2 and skills[1] <> skills[2]),
  updated_at timestamptz not null default now(),
  primary key (player_id, scope, key)
);
alter table public.class_mastery enable row level security;
alter table public.skill_loadouts enable row level security;
revoke all on public.class_mastery, public.skill_loadouts from public, anon, authenticated;
drop policy if exists deny_all on public.class_mastery;
create policy deny_all on public.class_mastery as restrictive for all using (false) with check (false);
drop policy if exists deny_all on public.skill_loadouts;
create policy deny_all on public.skill_loadouts as restrictive for all using (false) with check (false);

-- Catalogue mirror of src/lib/game/skills.ts (SKILLS: class + unlock tier). A pglite test keeps both in sync.
create or replace function public.skill_class(p_skill text) returns text
language sql immutable set search_path = '' as $$
  select case split_part(p_skill, '_', 1)
    when 'knight' then 'caballero' when 'mage' then 'mago' when 'rogue' then 'picaro'
    when 'cleric' then 'clerigo' when 'berserker' then 'berserker' end
  where p_skill = any(array[
    'knight_advance','knight_breaker','knight_bastion','knight_sweep',
    'mage_inscribe','mage_detonate','mage_barrier','mage_seal',
    'rogue_feint','rogue_finish','rogue_step','rogue_sabotage',
    'cleric_judgment','cleric_consecrate','cleric_restore','cleric_cleanse',
    'berserker_charge','berserker_release','berserker_recover','berserker_shatter'])
$$;
create or replace function public.skill_unlock(p_skill text) returns int
language sql immutable set search_path = '' as $$
  select case when public.skill_class(p_skill) is null then null
    when p_skill = any(array['knight_bastion','mage_barrier','rogue_step','cleric_restore','berserker_recover']) then 5
    when p_skill = any(array['knight_sweep','mage_seal','rogue_sabotage','cleric_cleanse','berserker_shatter']) then 12
    else 0 end
$$;

-- Mastery follows the hero's level, whichever path changed it (xp, dungeon bank, fusion upsert).
create or replace function public.touch_class_mastery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.class_mastery (player_id, class, level)
  values (new.player_id, new.class, least(1000, greatest(0, new.level)))
  on conflict (player_id, class) do update set level = greatest(public.class_mastery.level, excluded.level);
  return new;
end $$;
drop trigger if exists characters_mastery on public.characters;
create trigger characters_mastery after insert or update of level on public.characters
  for each row execute function public.touch_class_mastery();
insert into public.class_mastery (player_id, class, level)
select player_id, class, least(1000, max(level)) from public.characters group by player_id, class
on conflict (player_id, class) do update set level = greatest(public.class_mastery.level, excluded.level);

-- Saves one selection. hero: p_key = characters.key (must be owned; unlock tiers follow the stored
-- mastery). level: p_key = class (nivelado, all four skills available).
create or replace function public.set_loadout(p_player uuid, p_scope text, p_key text, p_skills jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_class text;
  v_mastery int;
  v_a text;
  v_b text;
begin
  if p_scope not in ('hero', 'level') or p_key is null or char_length(p_key) not between 1 and 60
     or p_skills is null or jsonb_typeof(p_skills) <> 'array' or jsonb_array_length(p_skills) <> 2
     or jsonb_typeof(p_skills -> 0) <> 'string' or jsonb_typeof(p_skills -> 1) <> 'string' then
    raise exception 'invalid_args';
  end if;
  v_a := p_skills ->> 0;
  v_b := p_skills ->> 1;
  if v_a = v_b or public.skill_class(v_a) is null or public.skill_class(v_b) is null then
    raise exception 'invalid_skill';
  end if;
  if p_scope = 'hero' then
    perform 1 from public.characters where player_id = p_player and key = p_key;
    if not found then raise exception 'character_not_found'; end if;
    v_class := split_part(p_key, '-', 2);
    select coalesce(max(level), 0) into v_mastery from public.class_mastery where player_id = p_player and class = v_class;
  else
    v_class := p_key;
    v_mastery := null;
  end if;
  if public.skill_class(v_a) is distinct from v_class or public.skill_class(v_b) is distinct from v_class then
    raise exception 'invalid_skill';
  end if;
  if v_mastery is not null and (public.skill_unlock(v_a) > v_mastery or public.skill_unlock(v_b) > v_mastery) then
    raise exception 'skill_locked';
  end if;
  insert into public.skill_loadouts (player_id, scope, key, skills)
  values (p_player, p_scope, p_key, array[v_a, v_b])
  on conflict (player_id, scope, key) do update set skills = excluded.skills, updated_at = now();
  return jsonb_build_object('scope', p_scope, 'key', p_key, 'skills', jsonb_build_array(v_a, v_b));
end $$;

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
    -- Shared step clears and independently completed routes, serialized as profile maps.
    'dungeonProgress', jsonb_build_object(
      'steps', coalesce((select jsonb_object_agg(difficulty || ':' || ascension, to_jsonb(true))
                           from public.step_clears where player_id = p_player), '{}'::jsonb),
      'routes', coalesce((select jsonb_object_agg(route || ':' || difficulty || ':' || ascension, levels)
                            from public.route_progress where player_id = p_player), '{}'::jsonb)),
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
        'data', c.data || jsonb_build_object('level', c.level, 'xp', c.xp, 'legacy', c.legacy, 'copies', c.copies)
                       || case when c.skill is null then '{}'::jsonb else jsonb_build_object('skill', c.skill) end
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars,
        'data', w.data || jsonb_build_object('legacy', w.legacy, 'plus', w.plus, 'plusStreak', w.plus_streak, 'copies', w.copies)
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
    ), '{}'::jsonb),
    'classMastery', coalesce((
      select jsonb_object_agg(m.class, m.level) from public.class_mastery m where m.player_id = p_player
    ), '{}'::jsonb),
    'loadouts', coalesce((
      select jsonb_object_agg(l.key, to_jsonb(l.skills))
      from public.skill_loadouts l where l.player_id = p_player and l.scope = 'hero'
    ), '{}'::jsonb),
    'levelLoadouts', coalesce((
      select jsonb_object_agg(l.key, to_jsonb(l.skills))
      from public.skill_loadouts l where l.player_id = p_player and l.scope = 'level'
    ), '{}'::jsonb)
  );
end $$;

-- ===== 0059_tower_expeditions.sql =====
-- 0059: tower expeditions (docs/torre). The weekly tower becomes a server-authoritative run of
-- sectors of 10 nodes. The server stores the canonical state (tower_runs), folds the client's actions
-- itself (TypeScript reducer, src/lib/game/expedition.ts) and commits progress, per-node payouts,
-- ranking score and codex in ONE transaction (tower_run_commit). Everything is service_role only.
--  * Weeks are Buenos Aires Mondays (game_week_of); a run freezes week + deadline when it starts and
--    never lands in another week: after the deadline it ends as 'season'.
--  * Score = nodes fully resolved (tower_scores.max_floor), tie-break fewer won-fight turns
--    (tower_scores.rounds), then the SERVER time the milestone was reached (updated_at), then player id.
--  * Payouts: tower_node_paid, one row per (player, mode, week, node); only nodes 1..30 pay
--    (5 normal / 150 elite / 300 boss) and Collection mode gets 25 % EXP on those same first wins.
--    Mirror of expedition.ts TOWER_PAY / nodePay and tower.ts TOWER_XP.
--  * Weekly top 3 (unchanged amounts) now needs node 10 (the first boss) cleared.

-- ------------------------------------------------------------------ week authority
create or replace function public.game_week_of(p_ts timestamptz) returns date
language sql stable set search_path = ''
as $$ select date_trunc('week', p_ts at time zone public.game_tz())::date $$;

-- First instant of the week AFTER p_week (a Monday date): the deadline of its ranking.
create or replace function public.game_week_end(p_week date) returns timestamptz
language sql stable set search_path = ''
as $$ select ((p_week + 7)::timestamp at time zone public.game_tz()) $$;

-- ------------------------------------------------------------------ tables
create table if not exists public.tower_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  week date not null,                 -- ART Monday frozen at start (== state.weekKey)
  deadline timestamptz not null,      -- first instant of the next week
  seed bigint not null check (seed between 0 and 4294967295),
  engine_version int not null,
  catalog_version int not null,
  revision int not null default 0 check (revision >= 0),
  status text not null check (status in ('active', 'suspended', 'ended')),
  state jsonb not null check (pg_column_size(state) < 1000000),
  nodes int not null default 0 check (nodes between 0 and 500),
  turns int not null default 0 check (turns between 0 and 1000000),
  actions int not null default 0 check (actions >= 0),  -- validated actions so far (budget)
  hero_id text,                       -- owned hero that gets the EXP (collection mode)
  hero_class text,
  hero_element text,
  end_reason text check (end_reason is null or end_reason in ('death', 'draw', 'retired', 'season', 'limit', 'engine')),
  last_batch jsonb,                   -- {first, last, count} of the last committed batch (retry idempotency)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists tower_runs_one_open on public.tower_runs (player_id, mode)
  where status in ('active', 'suspended');
create index if not exists tower_runs_history on public.tower_runs (player_id, created_at desc);

create table if not exists public.tower_node_paid (
  player_id uuid not null references public.players (id) on delete cascade,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  week date not null,
  node int not null check (node between 1 and 500),
  kind text not null check (kind in ('normal', 'elite', 'boss')),
  coins int not null default 0,
  xp int not null default 0,
  run_id uuid references public.tower_runs (id) on delete set null,
  paid_at timestamptz not null default now(),
  primary key (player_id, mode, week, node)
);

create table if not exists public.tower_codex (
  player_id uuid primary key references public.players (id) on delete cascade,
  relics text[] not null default '{}',
  events text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.tower_runs enable row level security;
alter table public.tower_node_paid enable row level security;
alter table public.tower_codex enable row level security;
revoke all on public.tower_runs, public.tower_node_paid, public.tower_codex from anon, authenticated;
drop policy if exists deny_all on public.tower_runs;
create policy deny_all on public.tower_runs as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_all on public.tower_node_paid;
create policy deny_all on public.tower_node_paid as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_all on public.tower_codex;
create policy deny_all on public.tower_codex as restrictive for all to anon, authenticated using (false) with check (false);

-- Rankings of the current week were floors of the old tower: archive them, the new score is nodes.
do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0059_tower_expeditions') then
    insert into public.tower_scores_archive (week, mode, player_id, max_floor, updated_at, rounds)
    select week, mode, player_id, max_floor, updated_at, rounds
      from public.tower_scores where week >= public.game_week();
    delete from public.tower_scores where week >= public.game_week();
    insert into public.migration_flags (key) values ('0059_tower_expeditions');
  end if;
end $$;

-- ------------------------------------------------------------------ payouts
-- expedition.ts TOWER_PAY / TOWER_PAID_SECTORS (3 sectors x 10 nodes).
create or replace function public.tower_node_coins(p_node int, p_kind text) returns int
language sql immutable set search_path = ''
as $$ select case when p_node < 1 or p_node > 30 then 0
  else case p_kind when 'boss' then 300 when 'elite' then 150 when 'normal' then 5 else 0 end end $$;

-- tower.ts TOWER_XP: a quarter of FIGHT_XP (normal 100 / elite 250 / final 500), rounded.
create or replace function public.tower_node_xp(p_node int, p_kind text) returns int
language sql immutable set search_path = ''
as $$ select case when p_node < 1 or p_node > 30 then 0
  else case p_kind when 'boss' then 125 when 'elite' then 63 when 'normal' then 25 else 0 end end $$;

-- ------------------------------------------------------------------ ranking
-- Records the validated score of a run (best nodes of the week, then fewer turns). updated_at is the
-- SERVER time the milestone was reached. Only called by tower_run_commit. Same signature and parameter
-- names as 0055 (p_floor = nodes, p_rounds = turns) so that re-running the whole setup stays valid; it no
-- longer pays anything: node payouts live in tower_node_paid.
create or replace function public.tower_record(
  p_player uuid, p_mode text, p_floor int, p_rounds int, p_class text, p_element text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_nodes int;
  v_turns int;
  v_week date := public.game_week();
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500
     or p_rounds is null or p_rounds < 0 or p_rounds > 1000000
     or p_class is null or p_class not in ('caballero', 'mago', 'picaro', 'clerigo', 'berserker')
     or p_element is null or p_element not in ('agua', 'fuego', 'viento', 'tierra', 'rayo') then
    raise exception 'invalid_args';
  end if;
  perform public.tower_settle_daily();
  insert into public.tower_scores (week, mode, player_id, max_floor, rounds, hero_class, hero_element)
  values (v_week, p_mode, p_player, p_floor, p_rounds, p_class, p_element)
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
                          then now() else public.tower_scores.updated_at end,
        hero_class = case when excluded.max_floor > public.tower_scores.max_floor
                            or (excluded.max_floor = public.tower_scores.max_floor
                                and excluded.rounds < public.tower_scores.rounds)
                          then excluded.hero_class else public.tower_scores.hero_class end,
        hero_element = case when excluded.max_floor > public.tower_scores.max_floor
                              or (excluded.max_floor = public.tower_scores.max_floor
                                  and excluded.rounds < public.tower_scores.rounds)
                            then excluded.hero_element else public.tower_scores.hero_element end
  returning max_floor, rounds into v_nodes, v_turns;
  return jsonb_build_object('week', v_week, 'nodes', v_nodes, 'turns', v_turns);
end $$;

-- ------------------------------------------------------------------ runs
create or replace function public.tower_run_view(r public.tower_runs) returns jsonb
language sql stable set search_path = ''
as $$ select jsonb_build_object(
  'id', r.id, 'mode', r.mode, 'week', r.week, 'deadline', r.deadline, 'seed', r.seed,
  'engineVersion', r.engine_version, 'catalogVersion', r.catalog_version,
  'revision', r.revision, 'status', r.status, 'state', r.state, 'nodes', r.nodes, 'turns', r.turns,
  'actions', r.actions, 'lastBatch', r.last_batch, 'endReason', r.end_reason,
  'ageMs', (extract(epoch from (now() - r.created_at)) * 1000)::bigint) $$;

-- Ends an open run for a technical reason (season | engine | limit). Idempotent: an ended run is returned as is.
create or replace function public.tower_run_end(p_player uuid, p_run uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_run public.tower_runs;
begin
  if p_reason is null or p_reason not in ('season', 'engine', 'limit') then
    raise exception 'invalid_args';
  end if;
  select * into v_run from public.tower_runs where id = p_run and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status <> 'ended' then
    update public.tower_runs
       set status = 'ended', end_reason = p_reason, ended_at = now(), updated_at = now(),
           revision = v_run.revision + 1,
           state = v_run.state || jsonb_build_object(
             'phase', 'ended', 'battle', null, 'revision', v_run.revision + 1,
             'end', jsonb_build_object('reason', p_reason, 'node', v_run.nodes))
     where id = p_run
     returning * into v_run;
  end if;
  return public.tower_run_view(v_run);
end $$;

-- The open run of a mode (null if none). A run past its week deadline is closed as 'season' here.
create or replace function public.tower_run_current(p_player uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.tower_runs;
  v_closed jsonb := null;
begin
  if p_mode is null or p_mode not in ('nivelado', 'coleccion') then raise exception 'invalid_args'; end if;
  select * into v_run from public.tower_runs
   where player_id = p_player and mode = p_mode and status in ('active', 'suspended') for update;
  if found and now() >= v_run.deadline then
    v_closed := public.tower_run_end(p_player, v_run.id, 'season');
    v_run := null;
  end if;
  return jsonb_build_object('week', public.game_week(), 'run',
    case when v_run.id is null then null else public.tower_run_view(v_run) end, 'closed', v_closed);
end $$;

-- Creates the run (or returns the open one). The caller (server) builds the state from its own profile;
-- p_week must still be the current week or the call fails with week_changed and is retried.
create or replace function public.tower_run_create(
  p_player uuid, p_mode text, p_week date, p_seed bigint, p_engine int, p_catalog int,
  p_state jsonb, p_hero_id text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.tower_runs;
  v_cur jsonb;
begin
  if p_mode is null or p_mode not in ('nivelado', 'coleccion') or p_state is null
     or p_seed is null or p_seed < 0 or p_seed > 4294967295
     or p_state ->> 'mode' <> p_mode or p_state ->> 'weekKey' <> p_week::text
     or coalesce((p_state ->> 'revision')::int, -1) <> 0 then
    raise exception 'invalid_args';
  end if;
  if p_week <> public.game_week() then raise exception 'week_changed'; end if;
  v_cur := public.tower_run_current(p_player, p_mode);
  if jsonb_typeof(v_cur -> 'run') = 'object' then
    return jsonb_build_object('created', false, 'run', v_cur -> 'run');
  end if;
  begin
    insert into public.tower_runs (player_id, mode, week, deadline, seed, engine_version, catalog_version,
                                   status, state, hero_id, hero_class, hero_element)
    values (p_player, p_mode, p_week, public.game_week_end(p_week), p_seed, p_engine, p_catalog,
            'active', p_state, p_hero_id, p_state #>> '{hero,classId}', p_state #>> '{hero,element}')
    returning * into v_run;
  exception when unique_violation then
    select * into v_run from public.tower_runs
     where player_id = p_player and mode = p_mode and status in ('active', 'suspended');
    return jsonb_build_object('created', false, 'run', public.tower_run_view(v_run));
  end;
  return jsonb_build_object('created', true, 'run', public.tower_run_view(v_run));
end $$;

-- One atomic step: the new canonical state, the payouts of the nodes it won, the ranking score and
-- the codex. p_revision = the revision the server loaded (optimistic lock: 'conflict' = reload and refold).
-- p_paid = [{node, kind}] won fights newly in the ledger; the per-node unique row makes it idempotent.
create or replace function public.tower_run_commit(
  p_run uuid, p_player uuid, p_revision int, p_state jsonb, p_paid jsonb, p_added int, p_batch jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.tower_runs;
  v_phase text := p_state ->> 'phase';
  v_status text;
  v_reason text;
  v_nodes int := (p_state ->> 'nodes')::int;
  v_turns int := (p_state ->> 'turns')::int;
  v_rev int := (p_state ->> 'revision')::int;
  v_coins int := 0;
  v_xp int := 0;
  v_n int := 0;
  v_c int;
  v_x int;
  r record;
begin
  select * into v_run from public.tower_runs where id = p_run and player_id = p_player for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'ended' then raise exception 'run_ended'; end if;
  if v_run.revision <> p_revision then raise exception 'conflict'; end if;
  -- Past the week deadline nothing new is validated: the run ends as 'season' keeping what was confirmed.
  if now() >= v_run.deadline then
    return jsonb_build_object('season', true, 'run', public.tower_run_end(p_player, p_run, 'season'));
  end if;
  if p_state is null or v_phase is null or v_nodes is null or v_turns is null or v_rev is null
     or v_rev <= v_run.revision or v_nodes < v_run.nodes or v_nodes > 500 or v_turns < 0 or v_turns > 1000000
     or p_state ->> 'mode' <> v_run.mode or (p_state ->> 'seed')::bigint <> v_run.seed
     or p_state ->> 'weekKey' <> v_run.week::text
     or p_added is null or p_added < 0 or p_added > 1000 then
    raise exception 'invalid_args';
  end if;
  v_status := case v_phase when 'ended' then 'ended' when 'suspended' then 'suspended' else 'active' end;
  v_reason := case when v_status = 'ended' then p_state #>> '{end,reason}' else null end;
  if v_status = 'ended' and v_reason is null then raise exception 'invalid_args'; end if;

  for r in
    select (e ->> 'node')::int as node, e ->> 'kind' as kind
      from jsonb_array_elements(coalesce(p_paid, '[]'::jsonb)) e
  loop
    continue when r.node is null or r.node < 1 or r.node > 30 or r.kind is null or r.kind not in ('normal', 'elite', 'boss');
    v_c := public.tower_node_coins(r.node, r.kind);
    v_x := case when v_run.mode = 'coleccion' and v_run.hero_id is not null
                then public.tower_node_xp(r.node, r.kind) else 0 end;
    insert into public.tower_node_paid (player_id, mode, week, node, kind, coins, xp, run_id)
    values (p_player, v_run.mode, v_run.week, r.node, r.kind, v_c, v_x, p_run)
    on conflict do nothing;
    if found then
      v_coins := v_coins + v_c;
      v_xp := v_xp + v_x;
      v_n := v_n + 1;
    end if;
  end loop;
  if v_coins > 0 then
    update public.player_state set coins = coins + v_coins, version = version + 1 where player_id = p_player;
  end if;
  if v_xp > 0 then
    perform public.grant_hero_xp(p_player, v_run.hero_id, v_xp);
  end if;

  if v_nodes > 0 then
    perform public.tower_record(p_player, v_run.mode, v_nodes, v_turns,
                                p_state #>> '{hero,classId}', p_state #>> '{hero,element}');
  end if;

  insert into public.tower_codex (player_id, relics, events)
  values (p_player,
          array(select jsonb_array_elements_text(coalesce(p_state #> '{seen,relics}', '[]'::jsonb))),
          array(select jsonb_array_elements_text(coalesce(p_state #> '{seen,events}', '[]'::jsonb))))
  on conflict (player_id) do update
    set relics = array(select distinct x from unnest(public.tower_codex.relics || excluded.relics) x),
        events = array(select distinct x from unnest(public.tower_codex.events || excluded.events) x),
        updated_at = now();

  update public.tower_runs
     set state = p_state, revision = v_rev, status = v_status, nodes = v_nodes, turns = v_turns,
         actions = actions + p_added, end_reason = v_reason, last_batch = p_batch, updated_at = now(),
         ended_at = case when v_status = 'ended' then now() else null end
   where id = p_run;
  return jsonb_build_object('season', false, 'revision', v_rev, 'status', v_status,
    'prize', jsonb_build_object('nodes', v_n, 'coins', v_coins, 'xp', v_xp));
end $$;

-- Codex + history of a player: discovered relics/events, personal record, last ended runs.
create or replace function public.tower_codex_get(p_player uuid, p_mode text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_c public.tower_codex;
  v_best jsonb;
  v_hist jsonb;
begin
  if p_mode is not null and p_mode not in ('nivelado', 'coleccion') then raise exception 'invalid_args'; end if;
  select * into v_c from public.tower_codex where player_id = p_player;
  select jsonb_build_object('nodes', nodes, 'turns', turns) into v_best
    from public.tower_runs
   where player_id = p_player and nodes > 0 and (p_mode is null or mode = p_mode)
   order by nodes desc, turns asc, created_at asc limit 1;
  select coalesce(jsonb_agg(h order by (h ->> 'at') desc), '[]'::jsonb) into v_hist from (
    select jsonb_build_object('id', id, 'weekKey', week::text, 'mode', mode, 'nodes', nodes, 'turns', turns,
             'combats', coalesce((state ->> 'combats')::int, 0), 'heroName', state #>> '{hero,name}',
             'classId', hero_class, 'element', hero_element,
             'relics', coalesce(state -> 'relics', '[]'::jsonb), 'reason', end_reason,
             'killer', coalesce(state #> '{end,killer}', '[]'::jsonb), 'at', ended_at) as h
      from public.tower_runs
     where player_id = p_player and status = 'ended' and (p_mode is null or mode = p_mode)
     order by ended_at desc limit 20) t;
  return jsonb_build_object(
    'relics', to_jsonb(coalesce(v_c.relics, '{}'::text[])),
    'events', to_jsonb(coalesce(v_c.events, '{}'::text[])),
    'best', v_best, 'history', v_hist);
end $$;

-- ------------------------------------------------------------------ weekly prizes
-- Top 3 per finished week and mode; unchanged amounts, but now it needs the first boss (node 10).
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
       where week = p_week and mode = v_mode and max_floor >= 10
       order by max_floor desc, rounds asc, updated_at asc, player_id
       limit 3
    loop
      v_place := v_place + 1;
      update public.player_state set coins = coins + v_coins[v_place], version = version + 1
       where player_id = r.player_id;
      perform public.grant_dado_capped(r.player_id, 1);
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor,
                                           'nodes', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- Everything the tower screen needs in one call. `floor`/`rounds` are kept as aliases of nodes/turns.
create or replace function public.tower_state(p_player uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := public.game_week();
  v_mode text;
  v_modes jsonb := '{}'::jsonb;
  v_last jsonb := '{}'::jsonb;
  v_king jsonb := '{}'::jsonb;
  v_active jsonb := '{}'::jsonb;
  v_top jsonb;
  v_mine jsonb;
  v_my public.tower_scores;
  v_run public.tower_runs;
  v_k record;
begin
  perform public.tower_settle(v_week - 7);
  perform public.tower_settle(v_week - 14);
  perform public.tower_settle_daily();
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    select coalesce(jsonb_agg(jsonb_build_object('place', t.place, 'player', t.player_id,
                    'name', t.name, 'floor', t.max_floor, 'nodes', t.max_floor, 'rounds', t.rounds,
                    'turns', t.rounds, 'at', t.updated_at, 'eligible', t.max_floor >= 10,
                    'class', t.hero_class, 'element', t.hero_element) order by t.place), '[]'::jsonb)
      into v_top
      from (
        select row_number() over (order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id) as place,
               s.player_id, p.name, s.max_floor, s.rounds, s.updated_at, s.hero_class, s.hero_element
          from public.tower_scores s join public.players p on p.id = s.player_id
         where s.week = v_week and s.mode = v_mode
         order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id
         limit 10
      ) t;
    select * into v_my from public.tower_scores
     where week = v_week and mode = v_mode and player_id = p_player;
    select * into v_run from public.tower_runs
     where player_id = p_player and mode = v_mode and status in ('active', 'suspended');
    if found then
      v_active := v_active || jsonb_build_object(v_mode, jsonb_build_object(
        'nodes', v_run.nodes, 'turns', v_run.turns, 'revision', v_run.revision, 'status', v_run.status,
        'week', v_run.week, 'deadline', v_run.deadline, 'stale', now() >= v_run.deadline));
    else
      v_active := v_active || jsonb_build_object(v_mode, null);
    end if;
    if v_my.player_id is not null then
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'nodes', v_my.max_floor,
        'rounds', v_my.rounds, 'turns', v_my.rounds, 'at', v_my.updated_at,
        'eligible', v_my.max_floor >= 10,
        'class', v_my.hero_class, 'element', v_my.hero_element,
        'paidFloors', (select count(*) from public.tower_node_paid
                        where week = v_week and mode = v_mode and player_id = p_player),
        'pending', coalesce(v_run.nodes > v_my.max_floor, false),
        'place', 1 + (
        select count(*) from public.tower_scores o
         where o.week = v_week and o.mode = v_mode
           and (o.max_floor > v_my.max_floor
                or (o.max_floor = v_my.max_floor and o.rounds < v_my.rounds)
                or (o.max_floor = v_my.max_floor and o.rounds = v_my.rounds and o.updated_at < v_my.updated_at)
                or (o.max_floor = v_my.max_floor and o.rounds = v_my.rounds
                    and o.updated_at = v_my.updated_at and o.player_id < v_my.player_id))));
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
    select d.day, d.floor, p.name, d.player_id into v_k
      from public.tower_daily d join public.players p on p.id = d.player_id
     where d.mode = v_mode order by d.day desc limit 1;
    v_king := v_king || jsonb_build_object(v_mode,
      case when v_k.day is null then null else jsonb_build_object(
        'day', v_k.day, 'name', v_k.name, 'floor', v_k.floor, 'me', v_k.player_id = p_player) end);
  end loop;
  return jsonb_build_object('week', v_week, 'weekKey', v_week::text, 'deadline', public.game_week_end(v_week),
    'modes', v_modes, 'last', v_last, 'king', v_king, 'activeByMode', v_active);
end $$;

revoke all on function public.game_week_of(timestamptz), public.game_week_end(date),
  public.tower_node_coins(int, text), public.tower_node_xp(int, text),
  public.tower_record(uuid, text, int, int, text, text), public.tower_run_view(public.tower_runs),
  public.tower_run_end(uuid, uuid, text), public.tower_run_current(uuid, text),
  public.tower_run_create(uuid, text, date, bigint, int, int, jsonb, text),
  public.tower_run_commit(uuid, uuid, int, jsonb, jsonb, int, jsonb),
  public.tower_codex_get(uuid, text) from public, anon, authenticated;
grant execute on function public.game_week_of(timestamptz), public.game_week_end(date),
  public.tower_node_coins(int, text), public.tower_node_xp(int, text),
  public.tower_record(uuid, text, int, int, text, text), public.tower_run_view(public.tower_runs),
  public.tower_run_end(uuid, uuid, text), public.tower_run_current(uuid, text),
  public.tower_run_create(uuid, text, date, bigint, int, int, jsonb, text),
  public.tower_run_commit(uuid, uuid, int, jsonb, jsonb, int, jsonb),
  public.tower_codex_get(uuid, text) to service_role;

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
