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
