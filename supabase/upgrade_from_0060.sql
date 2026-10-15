-- Boludos & Dragones: database upgrade from 0060 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0060_skill_identity.sql =====
-- 0060: Cleric starts with Juicio + Restaurar; Consagrar is the mastery-5 alternative.
-- Only the SQL catalogue changes. Do not erase existing profiles or selections;
-- loadoutFor sanitizes old locked pairs and the server validates new selections.
create or replace function public.skill_unlock(p_skill text) returns int
language sql immutable set search_path = '' as $$
  select case
    when public.skill_class(p_skill) is null then null
    when p_skill = any(array['knight_bastion','mage_barrier','rogue_step','cleric_consecrate','berserker_recover']) then 5
    when p_skill = any(array['knight_sweep','mage_seal','rogue_sabotage','cleric_cleanse','berserker_shatter']) then 12
    else 0 end
$$;

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
