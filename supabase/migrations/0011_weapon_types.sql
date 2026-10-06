-- Item types: add maza, varita, libro and the 5 gear slots (casco, peto, piernas, zapatos, collar) (class compatibility lives in TS: CLASS_WEAPONS).
-- The key regexes and apply_pull are updated in 0012_ranks.sql.
alter table public.weapons drop constraint if exists weapons_type_check;
alter table public.weapons
  add constraint weapons_type_check check (type in ('espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'casco', 'peto', 'piernas', 'zapatos', 'collar'));
