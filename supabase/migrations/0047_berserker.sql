-- 0047: Berserker class and its hand weapons (mandoble, martillo).
-- Tables: widen the class and weapon type checks.
do $$
declare r record;
begin
  for r in
    select con.conrelid::regclass as tbl, con.conname
      from pg_constraint con
     where con.conrelid = 'public.characters'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%caballero%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table public.characters
  add constraint characters_class_check
  check (class in ('caballero', 'mago', 'picaro', 'clerigo', 'berserker'));

alter table public.weapons drop constraint if exists weapons_type_check;
alter table public.weapons
  add constraint weapons_type_check check (type in ('espada', 'hacha', 'lanza', 'arco', 'baston', 'daga', 'maza', 'varita', 'libro', 'mandoble', 'martillo', 'casco', 'peto', 'piernas', 'zapatos', 'collar'));

-- Functions: the class / weapon-type lists are literals inside their bodies. Rewrite the
-- live definitions in place instead of copying every function (grants are kept).
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'array[''caballero'', ''mago'', ''picaro'', ''clerigo'']',
                            'array[''caballero'', ''mago'', ''picaro'', ''clerigo'', ''berserker'']');
    v_new := replace(v_new, '''varita'', ''libro'',', '''varita'', ''libro'', ''mandoble'', ''martillo'',');
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;
