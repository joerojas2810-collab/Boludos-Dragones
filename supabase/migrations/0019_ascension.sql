-- 0019: dungeon ascension. dungeon_clears.best_asc = highest ascension level (0-5) cleared
-- in that dungeon; clearing level N unlocks N+1. get_profile exposes it as 'ascensions' and
-- bank_run reads p_clear.asc. Same signatures as before (create or replace keeps the lockdown
-- from 0018, so no new grants are needed).
alter table public.dungeon_clears
  add column if not exists best_asc int not null default 0 check (best_asc between 0 and 5);

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
    'ascensions', coalesce((
      select jsonb_object_agg(d.rank, d.best_asc)
      from public.dungeon_clears d where d.player_id = p_player and d.best_asc > 0
    ), '{}'::jsonb),
    'dungeons', coalesce((
      select jsonb_object_agg(d.rank, d.best_lives)
      from public.dungeon_clears d where d.player_id = p_player
    ), '{}'::jsonb),
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
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
      select jsonb_object_agg(case when e.slot = 'arma' then e.character_key else e.character_key || '|' || e.slot end, e.weapon_key)
      from public.equipment e where e.player_id = p_player
    ), '{}'::jsonb),
    'fragments', coalesce((
      select jsonb_object_agg(f.class || ':' || f.rarity, f.qty)
      from public.fragments f where f.player_id = p_player and f.qty > 0
    ), '{}'::jsonb)
  );
end $$;


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
  v_item jsonb;
  v_typ text;
  v_el text;
  v_rar text;
  v_stars int;
  v_refund int := 0;
  v_pkey text;
  v_pqty text;
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
  -- A verified dungeon clear pays its victory bonus on top (max 17180, see VICTORY_COINS).
  if p_clear is not null then
    v_cap := v_cap + 20000;
  end if;
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

  -- Loot secured by bosses (the server replayed the run): new piece, +1 star on a
  -- duplicate, or a coin refund when the duplicate is already at max stars.
  if p_loot is null or jsonb_typeof(p_loot) <> 'array' or jsonb_array_length(p_loot) > 80 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_item in select e from jsonb_array_elements(p_loot) as t(e) loop
      v_typ := v_item ->> 'type';
      v_el := v_item ->> 'element';
      v_rar := v_item ->> 'rarity';
      if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
         or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
         or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
        raise exception 'invalid_items';
      end if;
      select stars into v_stars from public.weapons
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar
       for update;
      if found then
        if v_stars >= public.game_const('max_stars') then
          v_refund := v_refund + round(public.game_const('pull_cost_weapon') * public.game_const('duplicate_refund_pct') / 100.0)::int;
        else
          update public.weapons set stars = v_stars + 1
           where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
        end if;
      else
        insert into public.weapons (player_id, type, element, rarity, data)
        values (p_player, v_typ, v_el, v_rar,
                jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
      end if;
    end loop;
  end if;

  -- Forge parts secured by bosses (as replayed): add to the stock.
  if p_parts is null or jsonb_typeof(p_parts) <> 'object'
     or (select count(*) from jsonb_object_keys(p_parts)) > 300 then
    raise exception 'invalid_args';
  end if;
  if v_verdict <> 'rejected' then
    for v_pkey, v_pqty in select e.key, e.value from jsonb_each_text(p_parts) as e loop
      if v_pkey !~ '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$'
         or v_pqty !~ '^[0-9]{1,3}$' then
        raise exception 'invalid_items';
      end if;
      insert into public.part_stock (player_id, key, qty)
      values (p_player, v_pkey, v_pqty::int)
      on conflict (player_id, key) do update
        set qty = least(public.part_stock.qty + excluded.qty, 9999);
    end loop;
  end if;

  -- Dungeon clear (the server replayed the victory): keep the best lives left.
  if p_clear is not null and v_verdict <> 'rejected' then
    insert into public.dungeon_clears (player_id, rank, best_lives, best_asc)
    values (p_player, p_clear ->> 'rank', (p_clear ->> 'lives')::int,
            least(greatest(coalesce((p_clear ->> 'asc')::int, 0), 0), 5))
    on conflict (player_id, rank) do update
      set best_lives = greatest(public.dungeon_clears.best_lives, excluded.best_lives),
          best_asc = greatest(public.dungeon_clears.best_asc, excluded.best_asc);
  end if;

  update public.player_state
     set coins = coins + v_coins + v_refund, version = version + 1
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
    'coinsAdded', v_coins + v_refund, 'coins', v_new_coins, 'bestFloor', v_best, 'capped', v_capped);
end $$;

