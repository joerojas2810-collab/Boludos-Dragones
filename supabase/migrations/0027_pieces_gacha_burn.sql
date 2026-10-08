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
