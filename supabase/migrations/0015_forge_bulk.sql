-- 0015: forge shortcuts (bulk operations) send more pieces per call: raise the limits.
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
