-- 0040: the "lanza" weapon is gone (2 weapons per class). Every lanza becomes an espada with the
-- same rank, stars, element and roll. If the player already owns that espada, the two merge into
-- one with +1 star (max 5). Parts p-lanza-* are added to p-espada-*. Heroes keep their weapon
-- unless their class can no longer use it (e.g. Clerigo with baston): it goes back to the bag.
-- Adds no functions, so the 0018 lockdown needs no change. Runs once (flag).
do $$
begin
  if exists (select 1 from public.migration_flags where key = '0040_no_lanza') then
    return;
  end if;

  create temporary table _equip on commit drop as select * from public.equipment;
  delete from public.equipment;

  -- merge duplicates, then rename the rest
  update public.weapons e
     set stars = least(5, greatest(e.stars, l.stars) + 1)
    from public.weapons l
   where l.type = 'lanza' and e.type = 'espada' and e.player_id = l.player_id
     and e.element = l.element and e.rarity = l.rarity;
  delete from public.weapons l
   where l.type = 'lanza'
     and exists (select 1 from public.weapons e
                  where e.type = 'espada' and e.player_id = l.player_id
                    and e.element = l.element and e.rarity = l.rarity);
  update public.weapons set type = 'espada' where type = 'lanza';

  -- equipment: new key, drop what the class cannot use, one holder per weapon
  insert into public.equipment (player_id, character_key, weapon_key, slot)
  select distinct on (q.player_id, q.wkey) q.player_id, q.character_key, q.wkey, q.slot
    from (
      select e.player_id, e.character_key, e.slot,
             regexp_replace(e.weapon_key, '^w-lanza-', 'w-espada-') as wkey
        from _equip e
    ) q
    join public.characters c on c.player_id = q.player_id and c.key = q.character_key
    join public.weapons w on w.player_id = q.player_id and w.key = q.wkey
   where q.slot <> 'arma'
      or (c.class = 'caballero' and w.type in ('espada', 'hacha'))
      or (c.class = 'mago' and w.type in ('baston', 'varita'))
      or (c.class = 'picaro' and w.type in ('daga', 'arco'))
      or (c.class = 'clerigo' and w.type in ('maza', 'libro'))
   order by q.player_id, q.wkey, q.character_key;

  -- forge parts
  insert into public.part_stock (player_id, key, qty)
  select player_id, regexp_replace(key, '^p-lanza-', 'p-espada-'), qty
    from public.part_stock where key like 'p-lanza-%'
  on conflict (player_id, key) do update set qty = least(9999, public.part_stock.qty + excluded.qty);
  delete from public.part_stock where key like 'p-lanza-%';

  -- market: cancel open offers that would collide after the rename, then rename every key
  update public.market_offers o set status = 'cancelled', closed_at = now()
   where o.status = 'open' and (
     regexp_replace(o.give_key, '^w-lanza-', 'w-espada-') = regexp_replace(coalesce(o.want_key, ''), '^w-lanza-', 'w-espada-')
     or (o.give_key like 'w-lanza-%' and exists (
           select 1 from public.market_offers p
            where p.status = 'open' and p.seller_id = o.seller_id and p.kind = o.kind
              and p.give_key = regexp_replace(o.give_key, '^w-lanza-', 'w-espada-'))));
  update public.market_offers set
    give_key = regexp_replace(give_key, '^w-lanza-', 'w-espada-'),
    want_key = regexp_replace(want_key, '^w-lanza-', 'w-espada-')
   where give_key like 'w-lanza-%' or want_key like 'w-lanza-%';

  insert into public.migration_flags (key) values ('0040_no_lanza');
end $$;
