-- 0035: burn up to 100 pieces or heroes in one call (one version bump, one lock).
-- Same rules as burn_item / burn_hero, except that what cannot be burned (equipped piece,
-- the last hero, not owned) is skipped instead of raising. Rate: 8% of trade value (50% legacy).
create or replace function public.burn_many(p_player uuid, p_version int, p_kind text, p_keys text[])
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.player_state;
  v_key text;
  v_legacy boolean;
  v_total int := 0;
  v_count int := 0;
begin
  if p_kind not in ('hero', 'piece') or p_keys is null or coalesce(array_length(p_keys, 1), 0) not between 1 and 100 then
    raise exception 'invalid_args';
  end if;
  select * into v_state from public.player_state where player_id = p_player for update;
  if not found then raise exception 'player_not_found'; end if;
  if v_state.version <> p_version then raise exception 'conflict' using errcode = '40001'; end if;
  foreach v_key in array p_keys loop
    if p_kind = 'piece' then
      if v_key is null or v_key !~ '^w-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
      select legacy into v_legacy from public.weapons where player_id = p_player and key = v_key for update;
      if not found then continue; end if;
      if exists (select 1 from public.equipment where player_id = p_player and weapon_key = v_key) then continue; end if;
      v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 8 end / 100;
      delete from public.weapons where player_id = p_player and key = v_key;
    else
      if v_key is null or v_key !~ '^c-[a-z]+-[a-z]+-[a-z]+$' then raise exception 'invalid_args'; end if;
      select legacy into v_legacy from public.characters where player_id = p_player and key = v_key for update;
      if not found then continue; end if;
      if (select count(*) from public.characters where player_id = p_player) <= 1 then continue; end if;
      v_total := v_total + public.trade_value(v_key) * case when v_legacy then 50 else 8 end / 100;
      delete from public.characters where player_id = p_player and key = v_key;
    end if;
    v_count := v_count + 1;
  end loop;
  update public.player_state set coins = coins + v_total, version = version + 1
   where player_id = p_player returning coins, version into v_state.coins, v_state.version;
  return jsonb_build_object('burned', v_count, 'gained', v_total, 'coins', v_state.coins, 'version', v_state.version);
end $$;
