-- 0003_functions: server-authoritative functions. All are SECURITY DEFINER with
-- search_path = '' and are executable ONLY by service_role (see the lockdown
-- block at the end). Gameplay randomness is NOT implemented here: the Next.js
-- server rolls with the seeded TS engine and passes results; SQL validates
-- invariants (coins, caps, uniqueness, pity coherence) and persists atomically.
-- Errors are exceptions whose message is the code (see supabase/CONTRACT.md).

-- ======================================================== players / audit
create or replace function public.create_player(
  p_user uuid, p_name text, p_name_key text, p_is_admin boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or p_name is null or p_name_key is null
     or char_length(p_name) not between 2 and 16
     or char_length(p_name_key) not between 2 and 16 then
    raise exception 'invalid_name';
  end if;
  begin
    insert into public.players (id, name, name_key, is_admin)
    values (p_user, p_name, p_name_key, coalesce(p_is_admin, false));
  exception when unique_violation then
    raise exception 'name_taken';
  end;
  insert into public.player_state (player_id, coins)
  values (p_user, public.game_const('starting_coins'));
  insert into public.gacha_state (player_id, banner)
  values (p_user, 'character'), (p_user, 'weapon');
  return jsonb_build_object('player_id', p_user);
end $$;

create or replace function public.log_audit(
  p_actor uuid, p_event text, p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor, event, detail)
  values (
    p_actor,
    left(coalesce(p_event, 'unknown'), 80),
    case
      when p_detail is not null and pg_column_size(p_detail) < 8000 then p_detail
      else jsonb_build_object('truncated', true)
    end
  );
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
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars, 'data', c.data
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars, 'data', w.data
      ) order by w.created_at, w.key)
      from public.weapons w where w.player_id = p_player
    ), '[]'::jsonb),
    'equipped', coalesce((
      select jsonb_object_agg(e.character_key, e.weapon_key)
      from public.equipment e where e.player_id = p_player
    ), '{}'::jsonb),
    'fragments', coalesce((
      select jsonb_object_agg(f.class || ':' || f.rarity, f.qty)
      from public.fragments f where f.player_id = p_player and f.qty > 0
    ), '{}'::jsonb)
  );
end $$;

create or replace function public.game_clock() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'now', now(), 'day', public.game_day(), 'week', public.game_week(), 'tz', public.game_tz()
  )
$$;

create or replace function public.get_weekly_seed(p_seed bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_seed bigint;
begin
  insert into public.weekly_seeds (week, seed)
  values (public.game_week(), p_seed)
  on conflict (week) do nothing;
  select seed into v_seed from public.weekly_seeds where week = public.game_week();
  return jsonb_build_object('week', public.game_week(), 'seed', v_seed);
end $$;

-- Housekeeping, call occasionally from a server job (not required).
create or replace function public.purge_stale() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_a int; v_r int;
begin
  delete from public.auth_attempts
   where not hard_locked and updated_at < now() - interval '1 day';
  get diagnostics v_a = row_count;
  delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  get diagnostics v_r = row_count;
  return jsonb_build_object('auth_attempts', v_a, 'rate_limit_hits', v_r);
end $$;

-- ================================================= login attempts / limits
-- Never raises for expected failures: the counter update must persist.
create or replace function public.auth_check(p_name_key text, p_ip text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_n public.auth_attempts;
  v_i public.auth_attempts;
  v_win int := public.game_const('ip_window_s');
begin
  select * into v_n from public.auth_attempts
   where key = 'name:' || left(coalesce(p_name_key, ''), 64);
  if found then
    if v_n.hard_locked then
      return jsonb_build_object('allowed', false, 'reason', 'locked', 'retry_after', 0);
    end if;
    if v_n.locked_until is not null and v_n.locked_until > now() then
      return jsonb_build_object(
        'allowed', false, 'reason', 'wait',
        'retry_after', ceil(extract(epoch from (v_n.locked_until - now())))::int
      );
    end if;
  end if;

  if coalesce(p_ip, '') <> '' then
    select * into v_i from public.auth_attempts where key = 'ip:' || left(p_ip, 64);
    if found
       and v_i.window_start > now() - interval '1 second' * v_win
       and v_i.fails >= public.game_const('ip_fail_max') then
      return jsonb_build_object(
        'allowed', false, 'reason', 'ip_limited',
        'retry_after', ceil(extract(epoch from (v_i.window_start + interval '1 second' * v_win - now())))::int
      );
    end if;
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'retry_after', 0);
end $$;

create or replace function public.auth_fail(p_name_key text, p_ip text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_nk text := 'name:' || left(coalesce(p_name_key, ''), 64);
  v_fails int;
  v_step int := public.game_const('name_fail_step');
  v_win int := public.game_const('ip_window_s');
  v_wait int;
begin
  -- Counts unknown names too, so "no such user" and "locked" look the same.
  insert into public.auth_attempts (key, fails, window_start, updated_at)
  values (v_nk, 1, now(), now())
  on conflict (key) do update
    set fails = public.auth_attempts.fails + 1, updated_at = now()
  returning fails into v_fails;

  if v_fails >= public.game_const('name_hard_lock') then
    update public.auth_attempts set hard_locked = true, locked_until = null where key = v_nk;
    insert into public.audit_log (event, detail)
    values ('login_hard_lock', jsonb_build_object('name_key', left(coalesce(p_name_key, ''), 64)));
  elsif v_fails % v_step = 0 then
    -- 5 fails: 60 s, 10: 120 s, 15: 240 s ... capped.
    v_wait := least(
      public.game_const('name_wait_max_s'),
      public.game_const('name_wait_base_s') * (1 << ((v_fails / v_step) - 1))
    );
    update public.auth_attempts
       set locked_until = now() + interval '1 second' * v_wait
     where key = v_nk;
    insert into public.audit_log (event, detail)
    values ('login_wait', jsonb_build_object(
      'name_key', left(coalesce(p_name_key, ''), 64), 'fails', v_fails, 'wait_s', v_wait));
  end if;

  if coalesce(p_ip, '') <> '' then
    insert into public.auth_attempts (key, fails, window_start, updated_at)
    values ('ip:' || left(p_ip, 64), 1, now(), now())
    on conflict (key) do update set
      fails = case
        when public.auth_attempts.window_start < now() - interval '1 second' * v_win then 1
        else public.auth_attempts.fails + 1 end,
      window_start = case
        when public.auth_attempts.window_start < now() - interval '1 second' * v_win then now()
        else public.auth_attempts.window_start end,
      updated_at = now();
  end if;

  return public.auth_check(p_name_key, p_ip);
end $$;

create or replace function public.auth_success(p_name_key text, p_ip text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.auth_attempts
   where key = 'name:' || left(coalesce(p_name_key, ''), 64) and not hard_locked;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reset_pin(p_admin uuid, p_name_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_target uuid;
begin
  if not coalesce((select is_admin from public.players where id = p_admin), false) then
    insert into public.audit_log (actor, event, detail)
    values (p_admin, 'admin_reset_denied', jsonb_build_object('name_key', left(coalesce(p_name_key, ''), 64)));
    raise exception 'forbidden';
  end if;
  select id into v_target from public.players where name_key = p_name_key;
  if v_target is null then
    raise exception 'player_not_found';
  end if;
  delete from public.auth_attempts where key = 'name:' || p_name_key;
  insert into public.audit_log (actor, event, detail)
  values (p_admin, 'admin_reset_pin', jsonb_build_object('target', v_target));
  return jsonb_build_object('player_id', v_target);
end $$;

create or replace function public.rate_limit_hit(
  p_key text, p_max int, p_window_seconds int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_hits int;
begin
  if p_key is null or char_length(p_key) > 120 or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid_args';
  end if;
  insert into public.rate_limit_hits (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case
      when public.rate_limit_hits.window_start < now() - interval '1 second' * p_window_seconds then 1
      else public.rate_limit_hits.hits + 1 end,
    window_start = case
      when public.rate_limit_hits.window_start < now() - interval '1 second' * p_window_seconds then now()
      else public.rate_limit_hits.window_start end
  returning hits into v_hits;
  return jsonb_build_object('allowed', v_hits <= p_max, 'hits', v_hits);
end $$;

-- ===================================================== gacha / collection
-- p_items (1..10), in pull order:
--   character: {"class","element","rarity","data":{...}}
--   weapon:    {"type","element","rarity","data":{...}}
-- SQL recomputes: duplicate -> +1 star, duplicate at max stars -> coin refund,
-- new character with an owned same class+rarity -> +1 fragment, pity coherence,
-- price, coins. `data` is only stored when the item is new.
-- ponytail: stat magnitudes inside data are not range-checked here; only the
-- server writes it. Add per-class ranges if that ever changes.
create or replace function public.apply_pull(
  p_player uuid, p_version int, p_idem text, p_banner text, p_cost int,
  p_pity int, p_seed bigint, p_daily boolean, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_prev public.pulls;
  v_n int;
  v_unit int;
  v_expected int;
  v_old_pity int;
  v_run_pity int;
  v_thr int := public.game_const('pity_threshold');
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

  -- Serialize everything for this player.
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  -- Idempotency first: a replay must not fail on the (now bumped) version.
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

  select pity into v_old_pity from public.gacha_state
   where player_id = p_player and banner = p_banner for update;
  if not found then
    raise exception 'player_not_found';
  end if;
  v_run_pity := v_old_pity;

  for v_item in
    select t.e from jsonb_array_elements(p_items) with ordinality as t(e, ord) order by t.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_items';
    end if;
    v_el := v_item ->> 'element';
    v_rar := v_item ->> 'rarity';
    v_data := coalesce(v_item -> 'data', '{}'::jsonb);
    if jsonb_typeof(v_data) <> 'object'
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['comun', 'pococomun', 'raro', 'epico', 'legendario']), false) then
      raise exception 'invalid_items';
    end if;

    -- Pity (same semantics as rollRarity): at threshold the pull MUST be legendario.
    if v_run_pity >= v_thr and v_rar <> 'legendario' then
      raise exception 'invalid_pity';
    end if;
    v_run_pity := case when v_rar = 'legendario' then 0 else v_run_pity + 1 end;

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
        -- Same class + rarity already owned (other element): fragment instead of a star.
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
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga']), false) then
        raise exception 'invalid_items';
      end if;
      v_key := 'w-' || v_typ || '-' || v_el || '-' || v_rar;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= v_max_stars then
          v_status := 'refund';
          v_refund := round(v_unit * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          v_status := 'star';
          v_stars := v_stars + 1;
          update public.weapons set stars = v_stars
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        v_status := 'new';
        v_stars := 0;
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar, v_data);
      end if;
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'status', v_status, 'id', v_key, 'stars', v_stars, 'refund', v_refund,
      'fragmentGain', v_frag, 'fragmentKey', v_fkey));
  end loop;

  if v_run_pity is distinct from p_pity then
    raise exception 'invalid_pity';
  end if;

  update public.gacha_state set pity = v_run_pity
   where player_id = p_player and banner = p_banner;
  update public.player_state
     set coins = coins - v_expected + v_refund_total, version = version + 1
   where player_id = p_player
   returning coins, version into v_coins, v_version;

  v_out := jsonb_build_object(
    'replayed', false, 'coins', v_coins, 'version', v_version, 'pity', v_run_pity,
    'refundTotal', v_refund_total, 'results', v_results);
  insert into public.pulls (player_id, idempotency_key, banner, cost, daily, seed, items, result)
  values (p_player, p_idem, p_banner, v_expected, v_daily, p_seed, p_items, v_out);
  return v_out;
end $$;

create or replace function public.spend_fragments(p_player uuid, p_character_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
  v_have int;
  v_per int := public.game_const('fragments_per_star');
  v_stars int;
begin
  select * into v_c from public.characters
   where player_id = p_player and key = p_character_id for update;
  if not found then
    raise exception 'character_not_found';
  end if;
  if v_c.stars >= public.game_const('max_stars') then
    raise exception 'max_stars';
  end if;
  select qty into v_have from public.fragments
   where player_id = p_player and class = v_c.class and rarity = v_c.rarity for update;
  if not found or v_have < v_per then
    raise exception 'insufficient_fragments';
  end if;
  update public.fragments set qty = qty - v_per
   where player_id = p_player and class = v_c.class and rarity = v_c.rarity;
  update public.characters set stars = stars + 1
   where player_id = p_player and key = p_character_id
   returning stars into v_stars;
  return jsonb_build_object('stars', v_stars, 'fragments', v_have - v_per);
end $$;

create or replace function public.equip_weapon(
  p_player uuid, p_character_id text, p_weapon_id text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where player_id = p_player and key = p_character_id)
     or not exists (select 1 from public.weapons where player_id = p_player and key = p_weapon_id) then
    raise exception 'not_owned';
  end if;
  delete from public.equipment
   where player_id = p_player
     and (character_key = p_character_id or weapon_key = p_weapon_id);
  insert into public.equipment (player_id, character_key, weapon_key)
  values (p_player, p_character_id, p_weapon_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.unequip_weapon(p_player uuid, p_character_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.equipment where player_id = p_player and character_key = p_character_id;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================== runs
create or replace function public.start_run(
  p_player uuid, p_character_id text, p_seed bigint, p_hero jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  -- p_character_id is NULL for a random Común hero (no collection needed).
  if p_character_id is not null
     and not exists (select 1 from public.characters where player_id = p_player and key = p_character_id) then
    raise exception 'character_not_found';
  end if;
  if p_hero is null or jsonb_typeof(p_hero) <> 'object' then
    raise exception 'invalid_args';
  end if;
  update public.runs set status = 'expired', finished_at = now()
   where player_id = p_player and status = 'open'
     and started_at < now() - interval '1 hour' * public.game_const('run_stale_hours');
  if exists (select 1 from public.runs where player_id = p_player and status = 'open') then
    raise exception 'run_open';
  end if;
  begin
    insert into public.runs (player_id, seed, hero)
    values (p_player, p_seed, p_hero)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'run_open';
  end;
  return jsonb_build_object('run_id', v_id);
end $$;

create or replace function public.save_run_state(
  p_player uuid, p_run_id uuid, p_state jsonb, p_log_len int, p_max_floor int, p_coins int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_state is not null and pg_column_size(p_state) > public.game_const('run_state_max_bytes') then
    raise exception 'state_too_big';
  end if;
  if p_log_len < 0 or p_max_floor < 0 or p_coins < 0 then
    raise exception 'invalid_args';
  end if;
  update public.runs
     set state = p_state,
         log_len = p_log_len,
         max_floor = greatest(max_floor, least(p_max_floor, public.game_const('run_max_floor'))),
         coins_earned = p_coins
   where id = p_run_id and player_id = p_player and status = 'open';
  if not found then
    raise exception 'run_not_open';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- One bank per run: the run row is locked and flipped open -> closed.
create or replace function public.bank_run(
  p_player uuid, p_run_id uuid, p_coins int, p_max_floor int,
  p_log jsonb default null, p_verdict text default 'accepted', p_reason text default null
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
     or v_verdict not in ('accepted', 'capped', 'rejected', 'cut') then
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

-- ================================================================== rooms
create or replace function public.create_room(p_player uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_exp timestamptz;
begin
  if p_code is null or p_code !~ '^[A-Z]{4}$' then
    raise exception 'invalid_code';
  end if;
  if not exists (select 1 from public.players where id = p_player) then
    raise exception 'player_not_found';
  end if;
  -- Free the codes / host slots of rooms that already expired.
  update public.rooms set status = 'closed' where status = 'open' and expires_at <= now();
  if exists (select 1 from public.rooms where host_id = p_player and status = 'open') then
    raise exception 'room_limit';
  end if;
  begin
    insert into public.rooms (code, host_id, expires_at)
    values (p_code, p_player, now() + interval '1 hour' * public.game_const('room_hours'))
    returning id, expires_at into v_id, v_exp;
  exception when unique_violation then
    raise exception 'code_taken';
  end;
  insert into public.room_players (room_id, player_id, chips)
  values (v_id, p_player, public.game_const('initial_chips'));
  insert into public.chip_ledger (room_id, player_id, delta, reason)
  values (v_id, p_player, public.game_const('initial_chips'), 'initial');
  return jsonb_build_object('room_id', v_id, 'code', p_code, 'expiresAt', v_exp);
end $$;

-- Expected failures are returned (not raised) so the failure counter persists.
create or replace function public.join_room(p_player uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rl_key text := 'join:' || p_player::text;
  v_max int := public.game_const('join_fail_max');
  v_win int := public.game_const('join_fail_window_s');
  v_hits int;
  v_room public.rooms;
  v_count int;
  v_member public.room_players;
  v_exists boolean;
begin
  select hits into v_hits from public.rate_limit_hits
   where key = v_rl_key and window_start > now() - interval '1 second' * v_win;
  if found and v_hits >= v_max then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_room from public.rooms
   where code = upper(coalesce(p_code, '')) and status = 'open' and expires_at > now()
   for update;
  if not found then
    perform public.rate_limit_hit(v_rl_key, v_max, v_win);
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  select * into v_member from public.room_players
   where room_id = v_room.id and player_id = p_player for update;
  v_exists := found;
  if not (v_exists and v_member.left_at is null) then
    select count(*) into v_count from public.room_players
     where room_id = v_room.id and left_at is null;
    if v_count >= public.game_const('max_room_players') then
      return jsonb_build_object('ok', false, 'error', 'room_full');
    end if;
  end if;
  if v_exists and v_member.left_at is not null then
    update public.room_players set left_at = null
     where room_id = v_room.id and player_id = p_player;
  elsif not v_exists then
    insert into public.room_players (room_id, player_id, chips)
    values (v_room.id, p_player, public.game_const('initial_chips'));
    insert into public.chip_ledger (room_id, player_id, delta, reason)
    values (v_room.id, p_player, public.game_const('initial_chips'), 'initial');
  end if;
  return jsonb_build_object(
    'ok', true, 'room_id', v_room.id, 'code', v_room.code, 'host_id', v_room.host_id);
end $$;

create or replace function public.leave_room(p_player uuid, p_room uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_new uuid;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  update public.room_players set left_at = now()
   where room_id = p_room and player_id = p_player and left_at is null;
  if not found then
    raise exception 'not_member';
  end if;
  if v_room.host_id = p_player and v_room.status = 'open' then
    select player_id into v_new from public.room_players
     where room_id = p_room and left_at is null
     order by joined_at, player_id limit 1;
    if v_new is null then
      update public.rooms set status = 'closed' where id = p_room;
    else
      begin
        update public.rooms set host_id = v_new where id = p_room;
      exception when unique_violation then
        -- new host already hosts another open room: close this one
        update public.rooms set status = 'closed' where id = p_room;
        v_new := null;
      end;
    end if;
    return jsonb_build_object('host_id', v_new);
  end if;
  return jsonb_build_object('host_id', v_room.host_id);
end $$;

create or replace function public.close_room(p_player uuid, p_room uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.host_id <> p_player then
    raise exception 'forbidden';
  end if;
  update public.rooms set status = 'closed' where id = p_room;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_turn_seconds(p_player uuid, p_room uuid, p_seconds int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_room public.rooms;
begin
  if p_seconds is null or p_seconds not between 10 and 120 then
    raise exception 'invalid_args';
  end if;
  select * into v_room from public.rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  if v_room.host_id <> p_player then
    raise exception 'forbidden';
  end if;
  update public.rooms set turn_seconds = p_seconds where id = p_room;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================ battles / bets / chips
create or replace function public.open_battle(p_room uuid, p_fighter uuid, p_battle_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_battle_key is null or char_length(p_battle_key) not between 1 and 80 then
    raise exception 'invalid_args';
  end if;
  if not exists (
    select 1 from public.room_players
     where room_id = p_room and player_id = p_fighter and left_at is null
  ) then
    raise exception 'not_member';
  end if;
  begin
    insert into public.room_battles (room_id, battle_key, fighter_id)
    values (p_room, p_battle_key, p_fighter)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'battle_exists';
  end;
  return jsonb_build_object('battle_id', v_id);
end $$;

create or replace function public.lock_battle(p_room uuid, p_battle_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_b public.room_battles;
begin
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status = 'settled' then
    raise exception 'battle_settled';
  end if;
  update public.room_battles set status = 'locked' where id = v_b.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.place_bet(
  p_room uuid, p_bettor uuid, p_battle_key text, p_prediction text, p_stake int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_chips int;
begin
  if p_prediction is null or p_prediction not in ('win', 'lose') or p_stake is null then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status <> 'open' then
    raise exception 'battle_locked';
  end if;
  if v_b.fighter_id = p_bettor then
    raise exception 'self_bet';
  end if;
  if p_stake < public.game_const('min_bet') then
    raise exception 'stake_too_low';
  end if;
  select chips into v_chips from public.room_players
   where room_id = p_room and player_id = p_bettor and left_at is null for update;
  if not found then
    raise exception 'not_member';
  end if;
  if v_chips < p_stake then
    raise exception 'insufficient_chips';
  end if;
  begin
    insert into public.bets (room_id, battle_key, bettor_id, prediction, stake)
    values (p_room, p_battle_key, p_bettor, p_prediction, p_stake);
  exception when unique_violation then
    raise exception 'duplicate_bet';
  end;
  update public.room_players set chips = chips - p_stake
   where room_id = p_room and player_id = p_bettor;
  insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
  values (p_room, p_bettor, -p_stake, 'bet_stake', p_battle_key);
  return jsonb_build_object('chips', v_chips - p_stake);
end $$;

create or replace function public.interfere(
  p_room uuid, p_from uuid, p_battle_key text, p_kind text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_chips int;
  v_cost int := public.game_const('interfere_cost');
begin
  if p_kind is null or p_kind not in ('stronger_enemy', 'adverse_element') then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status <> 'open' then
    raise exception 'battle_locked';
  end if;
  if v_b.fighter_id = p_from then
    raise exception 'self_interfere';
  end if;
  select chips into v_chips from public.room_players
   where room_id = p_room and player_id = p_from and left_at is null for update;
  if not found then
    raise exception 'not_member';
  end if;
  if v_chips < v_cost then
    raise exception 'insufficient_chips';
  end if;
  begin
    insert into public.interferences (room_id, battle_key, from_player, kind, cost)
    values (p_room, p_battle_key, p_from, p_kind, v_cost);
  exception when unique_violation then
    raise exception 'already_interfered';
  end;
  update public.room_players set chips = chips - v_cost
   where room_id = p_room and player_id = p_from;
  insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
  values (p_room, p_from, -v_cost, 'interfere', p_battle_key);
  return jsonb_build_object('cost', v_cost, 'chips', v_chips - v_cost);
end $$;

-- Shared pot: winners split the losers' stakes pro rata; an empty side voids
-- (refunds) the battle. Integer division dust stays out of circulation.
create or replace function public.settle_battle(
  p_room uuid, p_battle_key text, p_outcome text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.room_battles;
  v_win bigint;
  v_lose bigint;
  v_void boolean;
  v_bet public.bets;
  v_pay int;
  v_count int := 0;
begin
  if p_outcome is null or p_outcome not in ('win', 'lose') then
    raise exception 'invalid_args';
  end if;
  select * into v_b from public.room_battles
   where room_id = p_room and battle_key = p_battle_key for update;
  if not found then
    raise exception 'battle_not_found';
  end if;
  if v_b.status = 'settled' then
    raise exception 'battle_settled';
  end if;

  select coalesce(sum(stake) filter (where prediction = p_outcome), 0),
         coalesce(sum(stake) filter (where prediction <> p_outcome), 0)
    into v_win, v_lose
    from public.bets
   where room_id = p_room and battle_key = p_battle_key and status = 'open';
  v_void := (v_win = 0 or v_lose = 0);

  for v_bet in
    select * from public.bets
     where room_id = p_room and battle_key = p_battle_key and status = 'open'
     order by id for update
  loop
    if v_void then
      v_pay := v_bet.stake;
    elsif v_bet.prediction = p_outcome then
      v_pay := v_bet.stake + (v_bet.stake::bigint * v_lose / v_win)::int;
    else
      v_pay := 0;
    end if;
    update public.bets
       set status = case when v_void then 'void' else 'settled' end,
           payout = v_pay, settled_at = now()
     where id = v_bet.id;
    if v_pay > 0 then
      update public.room_players set chips = chips + v_pay
       where room_id = p_room and player_id = v_bet.bettor_id;
      insert into public.chip_ledger (room_id, player_id, delta, reason, ref)
      values (p_room, v_bet.bettor_id, v_pay,
              case when v_void then 'bet_refund' else 'bet_win' end, p_battle_key);
    end if;
    v_count := v_count + 1;
  end loop;

  update public.room_battles set status = 'settled', outcome = p_outcome where id = v_b.id;
  return jsonb_build_object('settled', v_count, 'voided', v_void);
end $$;

-- ============================================================== lockdown
-- Every function in public: no execute for public/anon/authenticated; only
-- service_role. Exceptions: is_room_member / is_room_topic_member (used by RLS
-- and Realtime policies, so authenticated must be able to execute them).
do $$
declare f record;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (  -- skip functions owned by extensions
         select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', f.proname, f.args);
    execute format('grant execute on function public.%I(%s) to service_role', f.proname, f.args);
    if f.proname in ('is_room_member', 'is_room_topic_member') then
      execute format('grant execute on function public.%I(%s) to authenticated', f.proname, f.args);
    end if;
  end loop;
end $$;
