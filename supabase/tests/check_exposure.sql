-- Read-only exposure check. Paste in the Supabase SQL Editor after every migration.
-- EVERY query below must return ZERO rows. (service_role is allowed everything.)

-- 1. Functions in public that anon / authenticated can execute (all should be locked).
select p.proname as function, r.rolname as role
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
join pg_roles r on r.rolname in ('anon', 'authenticated')
where p.prokind = 'f'
  and has_function_privilege(r.oid, p.oid, 'execute')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- 2. Write privileges (insert/update/delete/truncate) of anon / authenticated on any public table.
select c.relname as table, r.rolname as role, priv
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_roles r on r.rolname in ('anon', 'authenticated')
cross join unnest(array['insert', 'update', 'delete', 'truncate']) as priv
where c.relkind in ('r', 'p', 'v')
  and has_table_privilege(r.oid, c.oid, priv);

-- 3. Any public table without row level security.
select relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r' and not c.relrowsecurity;

-- 4. anon can read anything in public (it should not read a single table).
select c.relname as table_readable_by_anon
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
join pg_roles r on r.rolname = 'anon'
where c.relkind in ('r', 'p', 'v')
  and has_table_privilege(r.oid, c.oid, 'select');
