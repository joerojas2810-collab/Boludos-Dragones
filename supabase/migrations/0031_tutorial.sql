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
