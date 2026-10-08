-- Boludos & Dragones: database upgrade from 0025 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0025_hero_piece_fields.sql =====
-- 0025: Run v2 hero and piece fields (additive).
--  * characters: level, xp (hero EXP), skill (third skill pick), legacy (existed before Run v2:
--    burns at the higher "reconversion" rate, see burn.ts).
--  * weapons (every piece): roll (+-15%), lines (extra stat lines of gear), legacy.
--  * player_state: levels_day / levels_n, the daily counter of REPEATED levels (pay decays).
-- Rows that exist when this runs are marked legacy exactly once (migration_flags).
create table if not exists public.migration_flags (
  key text primary key,
  applied_at timestamptz not null default now()
);
alter table public.migration_flags enable row level security;
revoke all on public.migration_flags from anon, authenticated;

alter table public.characters
  add column if not exists level int not null default 1 check (level between 1 and 999),
  add column if not exists xp int not null default 0 check (xp >= 0),
  add column if not exists skill text check (skill is null or skill ~ '^[A-Za-z]{3,20}$'),
  add column if not exists legacy boolean not null default false;

alter table public.weapons
  add column if not exists roll numeric check (roll is null or roll between 0.85 and 1.15),
  add column if not exists lines jsonb check (lines is null or (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 3)),
  add column if not exists legacy boolean not null default false;

alter table public.player_state
  add column if not exists levels_day date,
  add column if not exists levels_n int not null default 0 check (levels_n >= 0);

do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0025_mark_legacy') then
    update public.characters set legacy = true;
    update public.weapons set legacy = true;
    insert into public.migration_flags (key) values ('0025_mark_legacy');
  end if;
end $$;

-- ===== 0026_dungeon_progress.sql =====
-- 0026: Run v2 dungeon progress + one-time cleanup + get_profile v2.
--  * dungeon_progress: levels cleared IN ORDER per (rank, ascension). Replaces dungeon_clears,
--    which stays untouched (audit; nothing reads it any more), so everybody starts again.
--  * ONE-TIME (flag 0026_run_v2_reset): half-finished runs of the old engine are closed unpaid
--    (a run_submissions row records why) and the current week's tower scores are archived
--    and cleared (the engine changed). Coins, characters, pieces, parts and pity are kept.
--  * get_profile exposes the new fields (hero level/xp/skill/legacy, piece roll/lines/legacy,
--    dungeons as arrays, levelsDay). The SS pity (pity) is returned but unused.
create table if not exists public.dungeon_progress (
  player_id uuid not null references public.players (id) on delete cascade,
  rank text not null check (rank in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr')),
  ascension int not null check (ascension between 0 and 5),
  cleared int not null default 0 check (cleared between 0 and 12),
  primary key (player_id, rank, ascension)
);
alter table public.dungeon_progress enable row level security;
revoke all on public.dungeon_progress from anon, authenticated;
drop policy if exists deny_all on public.dungeon_progress;
create policy deny_all on public.dungeon_progress as restrictive for all
  to anon, authenticated using (false) with check (false);

-- Tower: rounds = total battle rounds of the best climb (tiebreak: fewer wins).
alter table public.tower_scores
  add column if not exists rounds int not null default 0 check (rounds between 0 and 1000000);
create table if not exists public.tower_scores_archive (
  like public.tower_scores including defaults,
  archived_at timestamptz not null default now(),
  reason text not null default 'run_v2'
);
alter table public.tower_scores_archive enable row level security;
revoke all on public.tower_scores_archive from anon, authenticated;
drop policy if exists deny_all on public.tower_scores_archive;
create policy deny_all on public.tower_scores_archive as restrictive for all
  to anon, authenticated using (false) with check (false);

do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0026_run_v2_reset') then
    insert into public.run_submissions (run_id, player_id, log, verdict, reason)
    select r.id, r.player_id, null, 'rejected', 'run_v2_migration'
      from public.runs r
     where r.status = 'open'
    on conflict (run_id) do nothing;
    update public.runs set status = 'closed', finished_at = now() where status = 'open';
    insert into public.tower_scores_archive (week, mode, player_id, max_floor, updated_at, rounds)
    select week, mode, player_id, max_floor, updated_at, rounds
      from public.tower_scores where week >= public.game_week();
    delete from public.tower_scores where week >= public.game_week();
    insert into public.migration_flags (key) values ('0026_run_v2_reset');
  end if;
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
    'parts', coalesce((
      select jsonb_object_agg(k.key, k.qty)
      from public.part_stock k where k.player_id = p_player and k.qty > 0
    ), '{}'::jsonb),
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
        'data', w.data || jsonb_build_object('legacy', w.legacy)
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

-- ===== 0027_pieces_gacha_burn.sql =====
-- 0027: Run v2 pieces, gacha, forge, burn, hero skill and trade values.
--  * grant_piece(): ONE place that validates a piece's roll/lines and adds it to the
--    collection (new / +1 star keeping the better roll / refund). Pulls, forge and level
--    loot all go through it.
--  * apply_pull: SS pity is gone; SSR pity is guaranteed at 250 (pity_ssr_threshold).
--    p_pity stays in the signature (unused) so the function keeps its grants.
--  * apply_forge: grants carry roll/lines rolled by the server.
--  * burn_item / burn_hero: permanent 8% of trade_value, 50% for "legacy" rows.
--  * choose_hero_skill: the third skill is saved on the hero.
--  * trade_value: SSR 36000 (market fairness follows).
-- Function signatures that are NEW are born executable by anon/authenticated:
-- 0018_lockdown_functions.sql (always the last migration) closes them again.

-- ---------------------------------------------------------------- helpers
create or replace function public.rank_idx(p_rank text) returns int
language sql immutable set search_path = ''
as $$ select array_position(array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr'], p_rank) - 1 $$;

-- Extra stat lines of a gear piece by rank: C 1, A 2, SS 3 (extraLines in gear.ts).
create or replace function public.extra_lines(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select (public.rank_idx(p_rank) >= 3)::int + (public.rank_idx(p_rank) >= 5)::int
       + (public.rank_idx(p_rank) >= 7)::int
$$;

create or replace function public.piece_quality(p_roll numeric, p_lines jsonb) returns numeric
language sql immutable set search_path = ''
as $$
  select coalesce(p_roll, 1) + coalesce((
    select sum((l ->> 'roll')::numeric) from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as t(l)
  ), 0)
$$;

-- Mirrors parseRoll/LINE_POOL (gear.ts). Raises invalid_items on anything off.
create or replace function public.piece_check(
  p_type text, p_rank text, p_roll numeric, p_lines jsonb
) returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_pool text[];
  v_l jsonb;
  v_seen text[] := '{}';
  v_stat text;
  v_roll text;
begin
  if p_roll is null or p_roll < 0.85 or p_roll > 1.15 then
    raise exception 'invalid_items';
  end if;
  v_pool := case p_type
    when 'casco' then array['accuracy', 'crit', 'critDmg', 'def', 'dodge']
    when 'peto' then array['hp', 'regen', 'dodge', 'lifesteal', 'speed']
    when 'piernas' then array['crit', 'critDmg', 'accuracy', 'speed', 'lifesteal']
    when 'zapatos' then array['dodge', 'hp', 'atk', 'regen', 'crit']
    when 'collar' then array['critDmg', 'accuracy', 'atk', 'speed', 'lifesteal']
    else null end;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return;
  end if;
  if v_pool is null or jsonb_array_length(p_lines) > public.extra_lines(p_rank) then
    raise exception 'invalid_items'; -- hand weapons have no lines; gear has at most extra_lines(rank)
  end if;
  for v_l in select e from jsonb_array_elements(p_lines) as t(e) loop
    v_stat := v_l ->> 'stat';
    v_roll := v_l ->> 'roll';
    if jsonb_typeof(v_l) <> 'object'
       or coalesce(not (v_stat = any (v_pool)), true)
       or coalesce(v_stat = any (v_seen), false)
       or coalesce(v_roll !~ '^[0-9]+(\.[0-9]+)?$', true) then
      raise exception 'invalid_items';
    end if;
    if v_roll::numeric < 0.85 or v_roll::numeric > 1.15 then
      raise exception 'invalid_items';
    end if;
    v_seen := v_seen || v_stat;
  end loop;
end $$;

-- Adds a piece to a player's collection. Returns 'new', 'star' or 'refund' (duplicate at max
-- stars, only when p_refund_on_max; otherwise max_stars is raised). A duplicate keeps the
-- better of the two rolls. The caller locks player_state.
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
  if not coalesce(p_type = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
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

-- ------------------------------------------------------------ trade values
create or replace function public.trade_value(p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case substring(p_key from '[^-]+$')
    when 'f' then 830 when 'e' then 1140 when 'd' then 1560 when 'c' then 2080
    when 'b' then 2780 when 'a' then 4170 when 's' then 8330 when 'ss' then 16670
    when 'ssr' then 36000 else 0 end
$$;
-- Offers that were fair at the old SSR value may not be now: cancel them (as 0017 did).
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and not public.trade_fair(give_key, want_key, coins);

-- ------------------------------------------------------------------ pity
insert into public.game_constants (key, value) values ('pity_ssr_threshold', 250)
on conflict (key) do update set value = excluded.value;
alter table public.gacha_state drop constraint if exists gacha_state_pity_ssr_check;
alter table public.gacha_state
  add constraint gacha_state_pity_ssr_check check (pity_ssr between 0 and 250);

create or replace function public.apply_pull(
  p_player uuid, p_version int, p_idem text, p_banner text, p_cost int,
  p_pity int, p_pity_ssr int, p_seed bigint, p_daily boolean, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_prev public.pulls;
  v_n int;
  v_unit int;
  v_expected int;
  v_old_pity_ssr int;
  v_run_pity_ssr int;
  v_thr_ssr int := public.game_const('pity_ssr_threshold');
  v_max_stars int := public.game_const('max_stars');
  v_item jsonb;
  v_data jsonb;
  v_cls text;
  v_typ text;
  v_el text;
  v_rar text;
  v_key text;
  v_stars int;
  v_status text;
  v_refund int;
  v_refund_total int := 0;
  v_frag int;
  v_fkey text;
  v_results jsonb := '[]'::jsonb;
  v_coins int;
  v_version int;
  v_out jsonb;
  v_daily boolean := coalesce(p_daily, false);
begin
  if p_banner is null or p_banner not in ('character', 'weapon')
     or p_idem is null or char_length(p_idem) not between 8 and 80
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;

  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  select * into v_prev from public.pulls
   where player_id = p_player and idempotency_key = p_idem;
  if found then
    return v_prev.result || jsonb_build_object('replayed', true);
  end if;

  if p_version is distinct from v_state.version then
    raise exception 'conflict' using errcode = '40001';
  end if;

  v_n := jsonb_array_length(p_items);
  if v_n < 1 or v_n > public.game_const('multi_pull') then
    raise exception 'invalid_items';
  end if;

  v_unit := case p_banner
    when 'character' then public.game_const('pull_cost_character')
    else public.game_const('pull_cost_weapon') end;
  if v_daily then
    if v_n <> 1 then
      raise exception 'invalid_items';
    end if;
    v_expected := 0;
  elsif v_n = public.game_const('multi_pull') then
    v_expected := round(v_unit * v_n * (100 - public.game_const('multi_discount_pct')) / 100.0)::int;
  else
    v_expected := v_unit * v_n;
  end if;
  if p_cost is distinct from v_expected then
    raise exception 'invalid_cost';
  end if;
  if v_state.coins < v_expected then
    raise exception 'insufficient_coins';
  end if;

  if v_daily then
    begin
      insert into public.daily_claims (player_id, day) values (p_player, public.game_day());
    exception when unique_violation then
      raise exception 'already_claimed';
    end;
  end if;

  select pity_ssr into v_old_pity_ssr from public.gacha_state
   where player_id = p_player and banner = p_banner for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_run_pity_ssr := v_old_pity_ssr;

  for v_item in
    select t.e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by t.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_el := v_item ->> 'element';
    v_rar := v_item ->> 'rarity';
    v_data := coalesce(v_item -> 'data', '{}'::jsonb) - 'level' - 'xp' - 'legacy' - 'skill';
    if jsonb_typeof(v_data) <> 'object'
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;

    -- Pity (same semantics as rollRarity): since the last SSR, the 250th pull MUST be ssr.
    if v_run_pity_ssr >= v_thr_ssr and v_rar <> 'ssr' then
      raise exception 'invalid_pity';
    end if;
    v_run_pity_ssr := case when v_rar = 'ssr' then 0 else least(v_run_pity_ssr + 1, v_thr_ssr) end;

    v_refund := 0;
    v_frag := 0;
    v_fkey := null;

    if p_banner = 'character' then
      v_cls := v_item ->> 'class';
      if not coalesce(v_cls = any (array['caballero', 'mago', 'picaro', 'clerigo']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'c-' || v_cls || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.characters
       where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.characters set stars = v_stars
           where player_id = p_player and class = v_cls and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        if exists (
          select 1 from public.characters
           where player_id = p_player and class = v_cls and rarity = v_rar
        ) then
          v_frag := 1;
          v_fkey := v_cls || ':' || v_rar;
          insert into public.fragments (player_id, class, rarity, qty)
          values (p_player, v_cls, v_rar, 1)
          on conflict (player_id, class, rarity) do update set qty = public.fragments.qty + 1;
        end if;
        insert into public.characters (player_id, class, element, rarity, data)
        values (p_player, v_cls, v_el, v_rar, v_data);
      end if;
    else
      v_typ := v_item ->> 'type';
      v_key := 'w-' || v_typ || '-' || v_el || '-' || v_rar;
      v_status := public.grant_piece(
        p_player, v_typ, v_el, v_rar, v_data ->> 'name',
        case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
        v_item -> 'lines', true);
      if v_status = 'refund' then
        v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', v_status, 'id', v_key, 'stars', v_stars, 'refund', v_refund,
      'fragmentGain', v_frag, 'fragmentKey', v_fkey));
  end loop;

  if v_run_pity_ssr is distinct from p_pity_ssr then
    raise exception 'invalid_pity';
  end if;

  update public.gacha_state set pity_ssr = v_run_pity_ssr
   where player_id = p_player and banner = p_banner;
  update public.player_state
     set coins = coins - v_expected + v_refund_total, version = version + 1
   where player_id = p_player
   returning coins, version into v_coins, v_version;

  v_out := jsonb_build_object(
    'replayed', false, 'coins', v_coins, 'version', v_version, 'pitySsr', v_run_pity_ssr,
    'refundTotal', v_refund_total, 'results', v_results);
  insert into public.pulls (player_id, idempotency_key, banner, cost, daily, seed, items, result)
  values (p_player, p_idem, p_banner, v_expected, v_daily, p_seed, p_items, v_out);
  return v_out;
end $$;

-- ------------------------------------------------------------------ forge
create or replace function public.apply_forge(
  p_player uuid, p_version int, p_coins int,
  p_spend jsonb, p_gain jsonb, p_grant jsonb, p_remove jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_k text;
  v_n text;
  v_item jsonb;
  v_id text;
  v_re constant text := '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$';
begin
  if p_coins is null or p_coins < 0 or p_coins > 200000
     or jsonb_typeof(p_spend) <> 'object' or jsonb_typeof(p_gain) <> 'object'
     or jsonb_typeof(p_grant) <> 'array' or jsonb_typeof(p_remove) <> 'array'
     or jsonb_array_length(p_grant) > 10 or jsonb_array_length(p_remove) > 80 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then
    raise exception 'conflict' using errcode = '40001';
  end if;
  if v_state.coins < p_coins then raise exception 'insufficient_coins'; end if;

  for v_k, v_n in select e.key, e.value from jsonb_each_text(p_spend) as e loop
    if v_k !~ v_re or v_n !~ '^[0-9]{1,3}$' then raise exception 'invalid_items'; end if;
    update public.part_stock set qty = qty - v_n::int
     where player_id = p_player and key = v_k and qty >= v_n::int;
    if not found then raise exception 'insufficient_parts'; end if;
  end loop;
  for v_k, v_n in select e.key, e.value from jsonb_each_text(p_gain) as e loop
    if v_k !~ v_re or v_n !~ '^[0-9]{1,3}$' then raise exception 'invalid_items'; end if;
    insert into public.part_stock (player_id, key, qty) values (p_player, v_k, v_n::int)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + excluded.qty, 9999);
  end loop;

  for v_id in select e from jsonb_array_elements_text(p_remove) as t(e) loop
    if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_id) then
      raise exception 'equipped';
    end if;
    delete from public.weapons where player_id = p_player and key = v_id;
    if not found then raise exception 'not_owned'; end if;
  end loop;

  for v_item in select e from jsonb_array_elements(p_grant) as t(e) loop
    perform public.grant_piece(
      p_player, v_item ->> 'type', v_item ->> 'element', v_item ->> 'rarity', v_item ->> 'name',
      case when (v_item ->> 'roll') ~ '^[0-9]+(\.[0-9]+)?$' then (v_item ->> 'roll')::numeric end,
      v_item -> 'lines', false);
  end loop;

  update public.player_state
     set coins = coins - p_coins, version = version + 1
   where player_id = p_player
   returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('coins', v_state.coins, 'version', v_state.version);
end $$;

-- ------------------------------------------------------------------- burn
-- Burn value = trade_value x 8% (50% for legacy rows). Keep in sync with burn.ts.
create or replace function public.burn_item(p_player uuid, p_version int, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_legacy boolean;
  v_coins int;
begin
  if p_key is null or p_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select legacy into v_legacy from public.weapons where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if exists (select 1 from public.equipment where player_id = p_player and weapon_key = p_key) then
    raise exception 'equipped';
  end if;
  v_coins := public.trade_value(p_key) * case when v_legacy then 50 else 8 end / 100;
  delete from public.weapons where player_id = p_player and key = p_key;
  update public.player_state set coins = coins + v_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', p_key, 'gained', v_coins, 'coins', v_state.coins, 'version', v_state.version);
end $$;

create or replace function public.burn_hero(p_player uuid, p_version int, p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_legacy boolean;
  v_coins int;
begin
  if p_key is null or p_key !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  select legacy into v_legacy from public.characters where player_id = p_player and key = p_key for update;
  if not found then raise exception 'not_owned'; end if;
  if (select count(*) from public.characters where player_id = p_player) <= 1 then
    raise exception 'only_hero';
  end if;
  v_coins := public.trade_value(p_key) * case when v_legacy then 50 else 8 end / 100;
  -- Its gear stays in the collection: the equipment rows go with the hero (FK cascade).
  delete from public.characters where player_id = p_player and key = p_key;
  update public.player_state set coins = coins + v_coins, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', p_key, 'gained', v_coins, 'coins', v_state.coins, 'version', v_state.version);
end $$;

-- ------------------------------------------------------------ hero skill
-- Third skill: 1 of 2 per class, available from rank C or 3 stars (skills.ts).
create or replace function public.choose_hero_skill(p_player uuid, p_character_id text, p_skill text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
begin
  if p_skill is null or p_character_id is null then raise exception 'invalid_args'; end if;
  select * into v_c from public.characters where player_id = p_player and key = p_character_id for update;
  if not found then raise exception 'character_not_found'; end if;
  if not (p_skill = any (case v_c.class
       when 'caballero' then array['barrido', 'contraataque']
       when 'mago' then array['tormenta', 'escudoArcano']
       when 'picaro' then array['golpeDoble', 'ejecutar']
       else array['santuario', 'castigo'] end)) then
    raise exception 'invalid_skill';
  end if;
  if public.rank_idx(v_c.rarity) < 3 and v_c.stars < 3 then
    raise exception 'skill_locked';
  end if;
  update public.characters set skill = p_skill where player_id = p_player and key = p_character_id;
  return jsonb_build_object('ok', true, 'skill', p_skill);
end $$;

-- ===== 0028_levels.sql =====
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

-- ===== 0029_tower_rounds.sql =====
-- 0029: the weekly tower stores the total battle rounds of the best climb (tiebreak: fewer
-- rounds wins at equal floors), and the ranking orders by it. tower_record gets a new
-- signature (p_rounds): the old one is dropped so nothing can call it without the tiebreak.
-- tower_settle (weekly prizes) is NOT touched here: see docs/SQL_PENDIENTE_RUN_V2.md.
drop function if exists public.tower_record(uuid, text, int);
create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int, p_rounds int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_floor int; v_rounds int;
begin
  if p_mode not in ('nivelado', 'coleccion') or p_floor is null or p_floor < 0 or p_floor > 500
     or p_rounds is null or p_rounds < 0 or p_rounds > 1000000 then
    raise exception 'invalid_args';
  end if;
  insert into public.tower_scores (week, mode, player_id, max_floor, rounds)
  values (public.game_week(), p_mode, p_player, p_floor, p_rounds)
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
  return jsonb_build_object('week', public.game_week(), 'max_floor', v_floor, 'rounds', v_rounds);
end $$;

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
                    'name', t.name, 'floor', t.max_floor, 'rounds', t.rounds) order by t.place), '[]'::jsonb)
      into v_top
      from (
        select row_number() over (order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id) as place,
               s.player_id, p.name, s.max_floor, s.rounds
          from public.tower_scores s join public.players p on p.id = s.player_id
         where s.week = v_week and s.mode = v_mode
         order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id
         limit 10
      ) t;
    select * into v_my from public.tower_scores
     where week = v_week and mode = v_mode and player_id = p_player;
    if found then
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'rounds', v_my.rounds, 'place', 1 + (
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
  end loop;
  return jsonb_build_object('week', v_week, 'modes', v_modes, 'last', v_last);
end $$;

-- ===== 0030_missions_tower_prizes.sql =====
-- 0030: Run v2 final server pass.
--  * mission_claim pays the new SCOPE_TIERS (missions.ts): coins, cores, N parts and pieces.
--    Parts / pieces are rolled by the TS server (it needs the gear RNG) from the rank
--    best_cleared_rank() returns, and passed in; SQL validates counts, keys, rank and every piece
--    with grant_piece. Tiers keep paying once (claimed counter, row lock).
--  * Tower: floor prizes (tower_floor_paid, paid by tower_record, each floor once per week and
--    mode), the daily king (tower_daily: #1 of each ranking at 21:00 ART = 00:00 UTC, settled
--    lazily by the first request after it) and tower_settle ordered by rounds.
--  * bank_run only closes a run and pays coins: p_clear / p_loot / p_parts must be empty.
-- Keep the numbers in sync with SCOPE_TIERS (missions.ts) and TOWER_FLOOR_PRIZES /
-- TOWER_DAILY_PRIZE / TOWER_PRIZES (tower.ts).

-- ------------------------------------------------------------------ helpers
-- Highest dungeon rank fully cleared at ascension 0 ('f' when none).
create or replace function public.best_cleared_rank(p_player uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select t.r from unnest(array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']) with ordinality as t(r, i)
     where public.progress_cleared(p_player, t.r, 0) >= public.level_count(t.r)
     order by t.i desc limit 1), 'f')
$$;

-- Adds n cores of an element picked from a seed text. Internal.
create or replace function public.grant_core(p_player uuid, p_seed text, p_n int) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_els constant text[] := array['agua', 'fuego', 'viento', 'tierra', 'rayo'];
  k int;
begin
  for k in 1 .. p_n loop
    insert into public.part_stock (player_id, key, qty)
    values (p_player, 'core-' || v_els[1 + (abs(hashtext(p_seed || ':' || k::text)) % 5)], 1)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + 1, 9999);
  end loop;
end $$;

-- ------------------------------------------------------------------ missions
drop function if exists public.mission_claim(uuid, text, int);
create or replace function public.mission_claim(
  p_player uuid, p_scope text, p_reached int,
  p_parts jsonb default '{}'::jsonb, p_pieces jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_period date;
  v_row public.mission_state;
  v_coins int[];
  v_cores int[];
  v_parts int[];
  v_pieces int[];
  v_pay int := 0;
  v_core int := 0;
  v_np int := 0;
  v_nx int := 0;
  v_best int := public.rank_idx(public.best_cleared_rank(p_player));
  v_refund int := 0;
  v_got int := 0;
  v_key text;
  v_qty text;
  v_item jsonb;
  k int;
begin
  if p_scope not in ('daily', 'weekly', 'event') or p_reached is null or p_reached not between 1 and 3
     or p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    raise exception 'invalid_args';
  end if;
  -- SCOPE_TIERS (missions.ts), one entry per tier (30 / 60 / 90 activity points).
  v_coins := case p_scope when 'daily' then array[0, 0, 250]
                          when 'weekly' then array[100, 100, 500]
                          else array[50, 100, 400] end;
  v_cores := case p_scope when 'daily' then array[0, 1, 0]
                          when 'weekly' then array[0, 0, 1]
                          else array[0, 0, 1] end;
  v_parts := case p_scope when 'daily' then array[2, 0, 0]
                          when 'weekly' then array[3, 0, 0]
                          else array[0, 0, 0] end;
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
    v_core := v_core + v_cores[k];
    v_np := v_np + v_parts[k];
    v_nx := v_nx + v_pieces[k];
  end loop;

  -- Parts: exactly the promised amount, hand-weapon / gear parts at most at the best rank.
  if jsonb_array_length(p_pieces) <> v_nx or (select count(*) from jsonb_object_keys(p_parts)) > 20 then
    raise exception 'invalid_items';
  end if;
  for v_key, v_qty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
    if v_key !~ '^p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)$'
       or v_qty !~ '^[0-9]{1,2}$'
       or public.rank_idx(substring(v_key from '[^-]+$')) > v_best then
      raise exception 'invalid_items';
    end if;
    v_got := v_got + v_qty::int;
    insert into public.part_stock (player_id, key, qty) values (p_player, v_key, v_qty::int)
    on conflict (player_id, key) do update
      set qty = least(public.part_stock.qty + excluded.qty, 9999);
  end loop;
  if v_got <> v_np then
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
  update public.player_state set coins = coins + v_pay + v_refund, version = version + 1
   where player_id = p_player;
  perform public.grant_core(p_player, v_period::text || p_scope || p_player::text, v_core);
  return jsonb_build_object('coins', v_pay + v_refund, 'cores', v_core, 'parts', v_np,
                            'pieces', v_nx, 'claimed', p_reached);
end $$;

-- ------------------------------------------------------------------ tower tables
create table if not exists public.tower_floor_paid (
  week date not null,
  mode text not null check (mode in ('nivelado', 'coleccion')),
  player_id uuid not null references public.players (id) on delete cascade,
  floor int not null check (floor between 1 and 500),
  primary key (week, mode, player_id, floor)
);
create table if not exists public.tower_daily (
  day date not null, -- ART date on which the 21:00 window ended
  mode text not null check (mode in ('nivelado', 'coleccion')),
  player_id uuid not null references public.players (id) on delete cascade,
  floor int not null,
  settled_at timestamptz not null default now(),
  primary key (day, mode)
);
alter table public.tower_floor_paid enable row level security;
alter table public.tower_daily enable row level security;
revoke all on public.tower_floor_paid, public.tower_daily from anon, authenticated;
drop policy if exists deny_all on public.tower_floor_paid;
create policy deny_all on public.tower_floor_paid as restrictive for all
  to anon, authenticated using (false) with check (false);
drop policy if exists deny_all on public.tower_daily;
create policy deny_all on public.tower_daily as restrictive for all
  to anon, authenticated using (false) with check (false);

-- towerFloorReward: floor 5 of each 10-cycle 100 coins + 1 core, floor 10 250 + 1, else 5.
create or replace function public.tower_floor_coins(p_floor int) returns int
language sql immutable set search_path = ''
as $$ select case ((p_floor - 1) % 10) + 1 when 10 then 250 when 5 then 100 else 5 end $$;
create or replace function public.tower_floor_cores(p_floor int) returns int
language sql immutable set search_path = ''
as $$ select case when ((p_floor - 1) % 10) + 1 in (5, 10) then 1 else 0 end $$;

-- Daily king: the window that ended at the last 00:00 UTC (21:00 ART). The #1 of each mode's
-- weekly ranking at that moment gets 250 coins + 1 core + the title (the tower_daily row).
-- Called first by tower_record and tower_state, so the ranking is still the one of the window.
-- ponytail: only the latest window is settled; days nobody opened the game are not paid.
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
    update public.player_state set coins = coins + 250, version = version + 1
     where player_id = v_win.player_id;
    perform public.grant_core(v_win.player_id, 'king' || v_day::text || v_mode, 1);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Records a VERIFIED climb (the server replayed it) and pays the floors not paid yet this week.
create or replace function public.tower_record(p_player uuid, p_mode text, p_floor int, p_rounds int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_floor int;
  v_rounds int;
  v_coins int;
  v_cores int;
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
  select coalesce(sum(public.tower_floor_coins(floor)), 0), coalesce(sum(public.tower_floor_cores(floor)), 0),
         count(*)
    into v_coins, v_cores, v_paid from ins;
  if v_paid > 0 then
    update public.player_state set coins = coins + v_coins, version = version + 1
     where player_id = p_player;
    perform public.grant_core(p_player, v_week::text || p_mode || p_player::text || p_floor::text, v_cores);
  end if;
  return jsonb_build_object('week', v_week, 'max_floor', v_floor, 'rounds', v_rounds,
                            'prize', jsonb_build_object('floors', v_paid, 'coins', v_coins, 'cores', v_cores));
end $$;

-- Weekly prizes (TOWER_PRIZES, unchanged); ties now break by fewer rounds.
create or replace function public.tower_settle(p_week date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
  r record;
  v_place int;
  v_coins int[] := array[300, 200, 100];
  v_cores int[] := array[2, 1, 1];
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
      perform public.grant_core(r.player_id, p_week::text || r.player_id::text, v_cores[v_place]);
      v_win := v_win || jsonb_build_object('place', v_place, 'player', r.player_id, 'floor', r.max_floor);
    end loop;
    insert into public.tower_settled (week, mode, winners) values (p_week, v_mode, v_win);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('settled', v_n);
end $$;

-- tower_state (0029) + the current daily kings and my paid floors.
create or replace function public.tower_state(p_player uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_week date := public.game_week();
  v_mode text;
  v_modes jsonb := '{}'::jsonb;
  v_last jsonb := '{}'::jsonb;
  v_king jsonb := '{}'::jsonb;
  v_top jsonb;
  v_mine jsonb;
  v_my public.tower_scores;
  v_k record;
begin
  perform public.tower_settle(v_week - 7);
  perform public.tower_settle(v_week - 14);
  perform public.tower_settle_daily();
  foreach v_mode in array array['nivelado', 'coleccion'] loop
    select coalesce(jsonb_agg(jsonb_build_object('place', t.place, 'player', t.player_id,
                    'name', t.name, 'floor', t.max_floor, 'rounds', t.rounds) order by t.place), '[]'::jsonb)
      into v_top
      from (
        select row_number() over (order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id) as place,
               s.player_id, p.name, s.max_floor, s.rounds
          from public.tower_scores s join public.players p on p.id = s.player_id
         where s.week = v_week and s.mode = v_mode
         order by s.max_floor desc, s.rounds asc, s.updated_at asc, s.player_id
         limit 10
      ) t;
    select * into v_my from public.tower_scores
     where week = v_week and mode = v_mode and player_id = p_player;
    if found then
      v_mine := jsonb_build_object('floor', v_my.max_floor, 'rounds', v_my.rounds,
        'paidFloors', (select count(*) from public.tower_floor_paid
                        where week = v_week and mode = v_mode and player_id = p_player),
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
    -- The latest daily king of this mode (holds the title until the next window).
    select d.day, d.floor, p.name, d.player_id into v_k
      from public.tower_daily d join public.players p on p.id = d.player_id
     where d.mode = v_mode order by d.day desc limit 1;
    v_king := v_king || jsonb_build_object(v_mode,
      case when v_k.day is null then null else jsonb_build_object(
        'day', v_k.day, 'name', v_k.name, 'floor', v_k.floor, 'me', v_k.player_id = p_player) end);
  end loop;
  return jsonb_build_object('week', v_week, 'modes', v_modes, 'last', v_last, 'king', v_king);
end $$;

-- ------------------------------------------------------------------ bank_run
-- 0024 minus loot / parts / clear bonus: dungeon levels pay through bank_level now, so the
-- old run closer accepts only coins (the tower pays 0). The three extra parameters stay so the
-- signature does not change; any non-empty value is refused.
create or replace function public.bank_run(
  p_player uuid, p_run_id uuid, p_coins int, p_max_floor int,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null,
  p_loot jsonb default '[]'::jsonb,
  p_clear jsonb default null,
  p_parts jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.runs;
  v_floor int;
  v_cap bigint;
  v_coins int;
  v_capped boolean;
  v_verdict text := coalesce(p_verdict, 'accepted');
  v_new_coins int;
  v_best int;
begin
  if p_coins is null or p_coins < 0 or p_max_floor is null or p_max_floor < 0
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut')
     or p_clear is not null
     or p_loot is distinct from '[]'::jsonb
     or p_parts is distinct from '{}'::jsonb then
    raise exception 'invalid_args';
  end if;
  select * into v_run from public.runs
   where id = p_run_id and player_id = p_player for update;
  if not found then
    raise exception 'run_not_found';
  end if;
  if v_run.status = 'closed' then
    raise exception 'duplicate_run';
  end if;
  if v_run.status <> 'open' then
    raise exception 'run_expired';
  end if;

  v_floor := least(p_max_floor, public.game_const('run_max_floor'));
  v_cap := v_floor::bigint * public.game_const('run_coins_per_floor_base')
         + public.game_const('run_coins_per_floor_slope')::bigint * v_floor * (v_floor + 1) / 2;
  v_capped := p_max_floor > v_floor or p_coins > v_cap;
  v_coins := least(p_coins::bigint, v_cap)::int;
  if v_verdict = 'rejected' then
    v_coins := 0;
    v_floor := 0;
  elsif v_capped and v_verdict = 'accepted' then
    v_verdict := 'capped';
  end if;

  update public.runs
     set status = 'closed', finished_at = now(), max_floor = v_floor, coins_earned = v_coins
   where id = p_run_id;
  insert into public.run_submissions (run_id, player_id, log, verdict, reason)
  values (p_run_id, p_player, p_log, v_verdict, left(p_reason, 300));

  update public.player_state
     set coins = coins + v_coins, version = version + 1
   where player_id = p_player
   returning coins into v_new_coins;
  if not found then
    raise exception 'player_not_found';
  end if;
  update public.players set best_floor = greatest(best_floor, v_floor)
   where id = p_player
   returning best_floor into v_best;
  insert into public.weekly_scores (week, player_id, max_floor)
  values (public.game_week(), p_player, v_floor)
  on conflict (week, player_id) do update
    set max_floor = greatest(public.weekly_scores.max_floor, excluded.max_floor);

  if v_capped or v_verdict in ('rejected', 'cut') then
    insert into public.audit_log (actor, event, detail)
    values (p_player, 'run_' || v_verdict, jsonb_build_object(
      'run_id', p_run_id, 'claimed_coins', p_coins, 'claimed_floor', p_max_floor,
      'credited_coins', v_coins, 'credited_floor', v_floor));
  end if;

  return jsonb_build_object(
    'coinsAdded', v_coins, 'coins', v_new_coins, 'bestFloor', v_best, 'capped', v_capped);
end $$;

revoke all on function public.tower_settle_daily(), public.tower_floor_coins(int), public.tower_floor_cores(int),
  public.best_cleared_rank(uuid), public.grant_core(uuid, text, int) from public, anon, authenticated;
grant execute on function public.tower_settle_daily(), public.best_cleared_rank(uuid) to service_role;

-- ===== 0031_tutorial.sql =====
-- 0031: tutorial step stored on the account (was per browser).
-- sync_tutorial: p_step raises the step (never back); p_init seeds it once when still null.
-- Returns the stored step. Server only (0018 locks the function down).
alter table public.player_state
  add column if not exists tutorial int check (tutorial is null or tutorial between 0 and 7);

create or replace function public.sync_tutorial(p_player uuid, p_step int default null, p_init int default null)
returns int language plpgsql security definer set search_path = ''
as $$
declare v int;
begin
  if p_step is not null then
    update public.player_state set tutorial = greatest(coalesce(tutorial, 0), least(p_step, 7))
     where player_id = p_player returning tutorial into v;
  elsif p_init is not null then
    update public.player_state set tutorial = least(p_init, 7)
     where player_id = p_player and tutorial is null returning tutorial into v;
  end if;
  if v is null then
    select tutorial into v from public.player_state where player_id = p_player;
  end if;
  return v;
end $$;

revoke all on function public.sync_tutorial(uuid, int, int) from public, anon, authenticated;
grant execute on function public.sync_tutorial(uuid, int, int) to service_role;

-- Starter hero + weapon (rank F) for an account with no heroes that has not started the tutorial.
-- Returns true when it granted them (tutorial goes to step 1), false when the guard says no.
create or replace function public.grant_starter(
  p_player uuid, p_class text, p_element text, p_data jsonb,
  p_type text, p_name text, p_roll numeric, p_lines jsonb
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.player_state where player_id = p_player and tutorial is null for update;
  if not found or exists (select 1 from public.characters where player_id = p_player) then
    return false;
  end if;
  if not coalesce(p_class = any (array['caballero', 'mago', 'picaro', 'clerigo']), false)
     or not coalesce(p_element = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
     or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_items';
  end if;
  insert into public.characters (player_id, class, element, rarity, data)
  values (p_player, p_class, p_element, 'f', p_data - 'level' - 'xp' - 'legacy' - 'skill');
  perform public.grant_piece(p_player, p_type, p_element, 'f', p_name, p_roll, p_lines, false);
  update public.player_state set tutorial = 1, version = version + 1 where player_id = p_player;
  return true;
end $$;

revoke all on function public.grant_starter(uuid, text, text, jsonb, text, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.grant_starter(uuid, text, text, jsonb, text, text, numeric, jsonb)
  to service_role;

-- ===== 0032_mage_drain_mana.sql =====
-- 0032: the Mage's second third-skill is now Drenar maná (was escudoArcano).
-- Saved heroes that picked the old one fall back to the class's first option (tormenta).
update public.characters set skill = 'tormenta' where skill = 'escudoArcano';

create or replace function public.choose_hero_skill(p_player uuid, p_character_id text, p_skill text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
begin
  if p_skill is null or p_character_id is null then raise exception 'invalid_args'; end if;
  select * into v_c from public.characters where player_id = p_player and key = p_character_id for update;
  if not found then raise exception 'character_not_found'; end if;
  if not (p_skill = any (case v_c.class
       when 'caballero' then array['barrido', 'contraataque']
       when 'mago' then array['tormenta', 'drenarMana']
       when 'picaro' then array['golpeDoble', 'ejecutar']
       else array['santuario', 'castigo'] end)) then
    raise exception 'invalid_skill';
  end if;
  if public.rank_idx(v_c.rarity) < 3 and v_c.stars < 3 then
    raise exception 'skill_locked';
  end if;
  update public.characters set skill = p_skill where player_id = p_player and key = p_character_id;
  return jsonb_build_object('ok', true, 'skill', p_skill);
end $$;

-- ===== 0033_level_limits.sql =====
-- 0033: level caps. Fights: 200/hour and 1500/day (were 40 and 300, reached by normal play with
-- quick resolve). Sweeps do not count toward them and have their own cap (600/hour).
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
  -- Sweeps (hero.sweep = true) are instant and paid as repeats: they do not use the
  -- fight caps. Fight caps follow the 150/hour service limit; sweeps have their own.
  if coalesce((p_hero ->> 'sweep')::boolean, false) then
    if (select count(*) from public.runs
         where player_id = p_player and hero ->> 'kind' = 'level'
           and hero ->> 'sweep' = 'true' and started_at > now() - interval '1 hour') >= 600 then
      raise exception 'rate_limited';
    end if;
  elsif (select count(*) from public.runs
          where player_id = p_player and hero ->> 'kind' = 'level'
            and coalesce(hero ->> 'sweep', 'false') <> 'true'
            and started_at > now() - interval '1 hour') >= 200
     or (select count(*) from public.runs
          where player_id = p_player and hero ->> 'kind' = 'level'
            and coalesce(hero ->> 'sweep', 'false') <> 'true'
            and started_at > now() - interval '1 day') >= 1500 then
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
