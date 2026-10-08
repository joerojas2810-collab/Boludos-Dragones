-- 0032: the Mage's second third-skill is now Drenar maná (was escudoArcano).
-- Saved heroes that picked the old one fall back to the class's first option (tormenta).
update public.characters set skill = 'tormenta' where skill = 'escudoArcano';

create or replace function public.choose_hero_skill(p_player uuid, p_character_id text, p_skill text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.characters;
begin
  if p_skill is null or p_character_id is null then raise exception 'invalid_args'; end if;
  select * into v_c from public.characters where player_id = p_player and key = p_character_id for update;
  if not found then raise exception 'character_not_found'; end if;
  if not (p_skill = any (case v_c.class
       when 'caballero' then array['barrido', 'contraataque']
       when 'mago' then array['tormenta', 'drenarMana']
       when 'picaro' then array['golpeDoble', 'ejecutar']
       else array['santuario', 'castigo'] end)) then
    raise exception 'invalid_skill';
  end if;
  if public.rank_idx(v_c.rarity) < 3 and v_c.stars < 3 then
    raise exception 'skill_locked';
  end if;
  update public.characters set skill = p_skill where player_id = p_player and key = p_character_id;
  return jsonb_build_object('ok', true, 'skill', p_skill);
end $$;
