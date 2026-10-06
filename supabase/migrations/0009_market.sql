-- 0009_market: barter market between friends for REPEATED pieces.
-- A "repeated" piece is one with stars >= 1 (duplicates become stars). Trading moves ONE
-- star: the giver keeps the piece (stars - 1, never deleted, so equipment is untouched),
-- the receiver gets +1 star or the piece at 0 stars. Total copies are conserved: nothing
-- is created. No coins. Server only (service_role); clients never touch these tables.
insert into public.game_constants (key, value) values
  ('market_max_open', 5),
  ('market_ttl_days', 7)
on conflict (key) do nothing;

create table if not exists public.market_offers (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.players (id) on delete cascade,
  kind text not null check (kind in ('character', 'weapon')),
  give_key text not null check (char_length(give_key) between 5 and 60),
  want_key text check (want_key is null or char_length(want_key) between 5 and 60),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled', 'expired')),
  buyer_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  check (want_key is distinct from give_key)
);
-- One open offer per piece per seller.
create unique index if not exists market_one_open_per_piece
  on public.market_offers (seller_id, kind, give_key) where status = 'open';
create index if not exists market_open_idx
  on public.market_offers (created_at desc) where status = 'open';

alter table public.market_offers enable row level security;
revoke all on public.market_offers from anon, authenticated;
drop policy if exists deny_all on public.market_offers;
create policy deny_all on public.market_offers as restrictive for all
  to anon, authenticated using (false) with check (false);

-- Well-formed key of an existing piece type (ids mirror the CHECKs of characters/weapons).
create or replace function public.market_key_ok(p_kind text, p_key text) returns boolean
language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'character' then p_key ~ '^c-(caballero|mago|picaro|clerigo)-(agua|fuego|viento|tierra|rayo)-(comun|pococomun|raro|epico|legendario)$'
    when 'weapon' then p_key ~ '^w-(espada|hacha|lanza|arco|baston|daga)-(agua|fuego|viento|tierra|rayo)-(comun|pococomun|raro|epico|legendario)$'
    else false end
$$;

-- Moves one star of a repeated piece from p_from to p_to. Raises not_owned / max_stars.
create or replace function public.market_move(
  p_from uuid, p_to uuid, p_kind text, p_key text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_stars int;
  v_to_stars int;
begin
  if p_kind = 'character' then
    select stars into v_stars from public.characters
     where player_id = p_from and key = p_key for update;
    if not found or v_stars < 1 then raise exception 'not_owned'; end if;
    select stars into v_to_stars from public.characters
     where player_id = p_to and key = p_key for update;
    if found then
      if v_to_stars >= 5 then raise exception 'max_stars'; end if;
      update public.characters set stars = stars + 1 where player_id = p_to and key = p_key;
    else
      insert into public.characters (player_id, class, element, rarity, data)
      select p_to, class, element, rarity, data from public.characters
       where player_id = p_from and key = p_key;
    end if;
    update public.characters set stars = stars - 1 where player_id = p_from and key = p_key;
  else
    select stars into v_stars from public.weapons
     where player_id = p_from and key = p_key for update;
    if not found or v_stars < 1 then raise exception 'not_owned'; end if;
    select stars into v_to_stars from public.weapons
     where player_id = p_to and key = p_key for update;
    if found then
      if v_to_stars >= 5 then raise exception 'max_stars'; end if;
      update public.weapons set stars = stars + 1 where player_id = p_to and key = p_key;
    else
      insert into public.weapons (player_id, type, element, rarity, data)
      select p_to, type, element, rarity, data from public.weapons
       where player_id = p_from and key = p_key;
    end if;
    update public.weapons set stars = stars - 1 where player_id = p_from and key = p_key;
  end if;
end $$;

create or replace function public.market_create(
  p_player uuid, p_kind text, p_give text, p_want text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_stars int;
begin
  if not public.market_key_ok(p_kind, p_give)
     or (p_want is not null and not public.market_key_ok(p_kind, p_want))
     or p_want is not distinct from p_give then
    raise exception 'invalid_args';
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
    insert into public.market_offers (seller_id, kind, give_key, want_key, expires_at)
    values (p_player, p_kind, p_give, p_want,
            now() + interval '1 day' * public.game_const('market_ttl_days'))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_offered';
  end;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.market_cancel(p_player uuid, p_offer uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_o public.market_offers;
begin
  select * into v_o from public.market_offers where id = p_offer for update;
  if not found then raise exception 'offer_not_found'; end if;
  if v_o.seller_id <> p_player then raise exception 'forbidden'; end if;
  if v_o.status <> 'open' then raise exception 'offer_closed'; end if;
  update public.market_offers set status = 'cancelled', closed_at = now() where id = p_offer;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.market_accept(p_player uuid, p_offer uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_o public.market_offers;
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
  perform public.market_move(v_o.seller_id, p_player, v_o.kind, v_o.give_key);
  if v_o.want_key is not null then
    perform public.market_move(p_player, v_o.seller_id, v_o.kind, v_o.want_key);
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
      'give', o.give_key, 'want', o.want_key, 'expiresAt', o.expires_at) as x,
      o.created_at as created
    from public.market_offers o join public.players p on p.id = o.seller_id
    where o.status = 'open' and o.expires_at > now()
    order by o.created_at desc limit 100
  ) s
$$;

revoke all on function
  public.market_key_ok(text, text), public.market_move(uuid, uuid, text, text),
  public.market_create(uuid, text, text, text), public.market_cancel(uuid, uuid),
  public.market_accept(uuid, uuid), public.market_list()
  from public, anon, authenticated;
grant execute on function
  public.market_key_ok(text, text), public.market_move(uuid, uuid, text, text),
  public.market_create(uuid, text, text, text), public.market_cancel(uuid, uuid),
  public.market_accept(uuid, uuid), public.market_list()
  to service_role;
