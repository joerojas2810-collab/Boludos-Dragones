-- Boludos & Dragones: database upgrade from 0040 (GENERATED, do not edit).
-- Source: supabase/migrations/*.sql. Regenerate: npx tsx scripts/build-setup-sql.ts
-- Paste into Supabase Dashboard > SQL Editor > Run. Safe to re-run.
-- All-or-nothing: if any statement fails, nothing is applied.
begin;

-- ===== 0040_no_lanza.sql =====
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
