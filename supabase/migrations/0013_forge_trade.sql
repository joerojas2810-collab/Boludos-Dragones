-- 0013: forge persistence + value-equivalent trades.
-- (1) apply_forge: the server runs the TS forge (src/lib/game/forge.ts) and this
--     function persists its diff atomically (optimistic version, like apply_pull).
-- (2) market offers carry coins and must be EQUIVALENT in value (+-25%).

-- ---------------------------------------------------------------- forge
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
  v_typ text; v_el text; v_rar text; v_stars int;
  v_re constant text := '^(p-(espada|hacha|lanza|arco|baston|daga|maza|varita|libro|casco|peto|piernas|zapatos|collar)-(f|e|d|c|b|a|s|ss|ssr)|core-(agua|fuego|viento|tierra|rayo))$';
begin
  if p_coins is null or p_coins < 0 or p_coins > 200000
     or jsonb_typeof(p_spend) <> 'object' or jsonb_typeof(p_gain) <> 'object'
     or jsonb_typeof(p_grant) <> 'array' or jsonb_typeof(p_remove) <> 'array'
     or jsonb_array_length(p_grant) > 4 or jsonb_array_length(p_remove) > 8 then
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
    v_typ := v_item ->> 'type'; v_el := v_item ->> 'element'; v_rar := v_item ->> 'rarity';
    if not coalesce(v_typ = any (array['espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar']), false)
       or not coalesce(v_el = any (array['agua', 'fuego', 'viento', 'tierra', 'rayo']), false)
       or not coalesce(v_rar = any (array['f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr']), false) then
      raise exception 'invalid_items';
    end if;
    select stars into v_stars from public.weapons
     where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar for update;
    if found then
      if v_stars >= public.game_const('max_stars') then raise exception 'max_stars'; end if;
      update public.weapons set stars = stars + 1
       where player_id = p_player and type = v_typ and element = v_el and rarity = v_rar;
    else
      insert into public.weapons (player_id, type, element, rarity, data)
      values (p_player, v_typ, v_el, v_rar,
              jsonb_build_object('name', left(coalesce(v_item ->> 'name', 'Pieza'), 60)));
    end if;
  end loop;

  update public.player_state
     set coins = coins - p_coins, version = version + 1
   where player_id = p_player
   returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('coins', v_state.coins, 'version', v_state.version);
end $$;

-- ----------------------------------------------------------------- trades
alter table public.market_offers
  add column if not exists coins int not null default 0 check (coins between -100000 and 100000);

-- Value of a piece = coins it costs to pull a copy of that rank (150 / odds).
-- Keep in sync with TRADE_VALUE in src/lib/game/market.ts.
create or replace function public.trade_value(p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case substring(p_key from '[^-]+$')
    when 'f' then 500 when 'e' then 700 when 'd' then 950 when 'c' then 1250
    when 'b' then 1650 when 'a' then 2500 when 's' then 5000 when 'ss' then 10000
    when 'ssr' then 30000 else 0 end
$$;

-- Equivalent trade: value(want) + coins within +-25% of value(give).
-- coins > 0: the acceptor pays the seller; coins < 0: the seller pays the acceptor.
create or replace function public.trade_fair(p_give text, p_want text, p_coins int) returns boolean
language sql immutable set search_path = ''
as $$
  select abs(public.trade_value(p_give)
             - (coalesce(public.trade_value(p_want), 0) + p_coins))
         <= public.trade_value(p_give) * 0.25
$$;

drop function if exists public.market_create(uuid, text, text, text);
create or replace function public.market_create(
  p_player uuid, p_kind text, p_give text, p_want text default null, p_coins int default 0
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_stars int;
begin
  if not public.market_key_ok(p_kind, p_give)
     or (p_want is not null and not public.market_key_ok(p_kind, p_want))
     or p_want is not distinct from p_give
     or p_coins is null or p_coins < -100000 or p_coins > 100000 then
    raise exception 'invalid_args';
  end if;
  if not public.trade_fair(p_give, p_want, p_coins) then
    raise exception 'unfair_trade';
  end if;
  perform 1 from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if p_kind = 'character' then
    select stars into v_stars from public.characters where player_id = p_player and key = p_give;
  else
    select stars into v_stars from public.weapons where player_id = p_player and key = p_give;
  end if;
  if v_stars is null or v_stars < 1 then raise exception 'not_owned'; end if;
  update public.market_offers set status = 'expired', closed_at = now()
   where seller_id = p_player and status = 'open' and expires_at <= now();
  if (select count(*) from public.market_offers
       where seller_id = p_player and status = 'open') >= public.game_const('market_max_open') then
    raise exception 'too_many_offers';
  end if;
  begin
    insert into public.market_offers (seller_id, kind, give_key, want_key, coins, expires_at)
    values (p_player, p_kind, p_give, p_want, p_coins,
            now() + interval '1 day' * public.game_const('market_ttl_days'))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_offered';
  end;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.market_accept(p_player uuid, p_offer uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_o public.market_offers;
  v_payer uuid;
  v_payee uuid;
  v_amount int;
begin
  select * into v_o from public.market_offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_o.status <> 'open' or v_o.expires_at <= now() then raise exception 'offer_closed'; end if;
  if v_o.seller_id = p_player then raise exception 'own_offer'; end if;
  -- Fixed lock order (by id) so two crossing trades cannot deadlock.
  perform 1 from public.player_state
   where player_id in (v_o.seller_id, p_player) order by player_id for update;
  if not exists (select 1 from public.players where id = p_player) then
    raise exception 'player_not_found';
  end if;
  if not public.trade_fair(v_o.give_key, v_o.want_key, v_o.coins) then
    raise exception 'unfair_trade';
  end if;
  if v_o.coins <> 0 then
    v_amount := abs(v_o.coins);
    v_payer := case when v_o.coins > 0 then p_player else v_o.seller_id end;
    v_payee := case when v_o.coins > 0 then v_o.seller_id else p_player end;
    if (select coins from public.player_state where player_id = v_payer) < v_amount then
      raise exception 'insufficient_coins';
    end if;
  end if;
  perform public.market_move(v_o.seller_id, p_player, v_o.kind, v_o.give_key);
  if v_o.want_key is not null then
    perform public.market_move(p_player, v_o.seller_id, v_o.kind, v_o.want_key);
  end if;
  if v_o.coins <> 0 then
    update public.player_state set coins = coins - v_amount, version = version + 1
     where player_id = v_payer;
    update public.player_state set coins = coins + v_amount, version = version + 1
     where player_id = v_payee;
  end if;
  update public.market_offers
     set status = 'done', buyer_id = p_player, closed_at = now() where id = p_offer;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.market_list() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(s.x order by s.created desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', o.id, 'sellerId', o.seller_id, 'seller', p.name, 'kind', o.kind,
      'give', o.give_key, 'want', o.want_key, 'coins', o.coins,
      'expiresAt', o.expires_at) as x,
      o.created_at as created
    from public.market_offers o join public.players p on p.id = o.seller_id
    where o.status = 'open' and o.expires_at > now()
    order by o.created_at desc limit 100
  ) s
$$;

revoke all on function
  public.apply_forge(uuid, int, int, jsonb, jsonb, jsonb, jsonb),
  public.trade_value(text), public.trade_fair(text, text, int),
  public.market_create(uuid, text, text, text, int), public.market_accept(uuid, uuid),
  public.market_list()
  from public, anon, authenticated;
grant execute on function
  public.apply_forge(uuid, int, int, jsonb, jsonb, jsonb, jsonb),
  public.trade_value(text), public.trade_fair(text, text, int),
  public.market_create(uuid, text, text, text, int), public.market_accept(uuid, uuid),
  public.market_list()
  to service_role;

-- Old open offers (gifts / lopsided swaps) cannot be valid under the new rule.
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and not public.trade_fair(give_key, want_key, coins);
