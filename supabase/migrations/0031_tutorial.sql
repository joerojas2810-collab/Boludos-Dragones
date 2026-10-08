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
