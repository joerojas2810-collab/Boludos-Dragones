-- 0051: SS and SSR stop being item ranks (heroes and pieces top out at S). Whatever players already
-- own in SS / SSR becomes S, so nothing disappears from their collection:
--  - a hero or piece with no S twin simply changes rank (equipment follows it);
--  - with an S twin (same class + element / type + element) a hero becomes a spare copy of the S one
--    (its trait is kept as the copy's trait; stars and level take the higher value) and a piece gives
--    the S piece +1 star (max 5); the gear worn by the merged one is dropped, the piece stays owned.
-- Open market offers of SS / SSR items are cancelled. Safe to re-run: nothing is left to convert.
do $$
declare
  r record;
  e record;
begin
  create temporary table _eq on commit drop as
    select * from public.equipment where character_key ~ '-(ss|ssr)$' or weapon_key ~ '-(ss|ssr)$';
  delete from public.equipment q using _eq
   where q.player_id = _eq.player_id and q.character_key = _eq.character_key and q.slot = _eq.slot;

  for r in select * from public.characters where rarity in ('ss', 'ssr') order by player_id, rarity loop
    if exists (select 1 from public.characters
                where player_id = r.player_id and class = r.class and element = r.element and rarity = 's') then
      update public.characters c
         set copies = case when cardinality(c.copies) < 50 and r.data -> 'traits' ->> 0 is not null
                           then c.copies || (r.data -> 'traits' ->> 0) else c.copies end,
             stars = greatest(c.stars, r.stars),
             level = greatest(c.level, r.level),
             xp = case when r.level > c.level then r.xp else c.xp end
       where c.player_id = r.player_id and c.class = r.class and c.element = r.element and c.rarity = 's';
      delete from public.characters
       where player_id = r.player_id and class = r.class and element = r.element and rarity = r.rarity;
    else
      update public.characters set rarity = 's'
       where player_id = r.player_id and class = r.class and element = r.element and rarity = r.rarity;
    end if;
  end loop;

  for r in select * from public.weapons where rarity in ('ss', 'ssr') order by player_id, rarity loop
    if exists (select 1 from public.weapons
                where player_id = r.player_id and type = r.type and element = r.element and rarity = 's') then
      update public.weapons w
         set stars = least(5, w.stars + 1), plus = greatest(w.plus, r.plus),
             plus_streak = greatest(w.plus_streak, r.plus_streak)
       where w.player_id = r.player_id and w.type = r.type and w.element = r.element and w.rarity = 's';
      delete from public.weapons
       where player_id = r.player_id and type = r.type and element = r.element and rarity = r.rarity;
    else
      update public.weapons set rarity = 's'
       where player_id = r.player_id and type = r.type and element = r.element and rarity = r.rarity;
    end if;
  end loop;

  -- The gear that was worn goes back on, where both sides still exist and the slot is free.
  for e in select * from _eq loop
    insert into public.equipment (player_id, character_key, weapon_key, slot)
    select e.player_id,
           regexp_replace(e.character_key, '-(ss|ssr)$', '-s'),
           regexp_replace(e.weapon_key, '-(ss|ssr)$', '-s'),
           e.slot
     where exists (select 1 from public.characters c
                    where c.player_id = e.player_id and c.key = regexp_replace(e.character_key, '-(ss|ssr)$', '-s'))
       and exists (select 1 from public.weapons w
                    where w.player_id = e.player_id and w.key = regexp_replace(e.weapon_key, '-(ss|ssr)$', '-s'))
    on conflict do nothing;
  end loop;

  update public.market_offers set status = 'cancelled', closed_at = now()
   where status = 'open' and (give_key ~ '-(ss|ssr)$' or want_key ~ '-(ss|ssr)$');
end $$;
