-- pgTAP: SEGURIDAD.md sec. 7 attacks #1-#4 (anon / authenticated cannot read or write
-- what they must not, cannot call server functions, CHECKs reject bad data).
-- Run: supabase start && supabase test db
-- STATUS: NOT EXECUTED (no Docker). The same assertions ran in PGlite via tests/pglite/.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'ana@players.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'beto@players.invalid');
select public.create_player('00000000-0000-0000-0000-000000000001', 'ana', 'ana', true);
select public.create_player('00000000-0000-0000-0000-000000000002', 'beto', 'beto', false);
update public.player_state set coins = 500 where player_id = '00000000-0000-0000-0000-000000000002';
insert into public.characters (player_id, class, element, rarity)
values ('00000000-0000-0000-0000-000000000002', 'mago', 'fuego', 'raro');

-- #1 advisor-style catalog checks
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0,
  'RLS enabled on every public table');
select is((select count(*)::int from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and (p.proconfig is null or p.proconfig::text not like '%search_path%')), 0,
  'every public function pins search_path');
select is((select count(*)::int from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname not in ('is_room_member', 'is_room_topic_member')
              and (has_function_privilege('anon', p.oid, 'execute')
                or has_function_privilege('authenticated', p.oid, 'execute'))), 0,
  'server functions are not executable by anon/authenticated');
select is((select count(*)::int from pg_class c, unnest(array['anon', 'authenticated']) r,
                  unnest(array['insert', 'update', 'delete', 'truncate']) pv
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
              and has_table_privilege(r, c.oid, pv)), 0,
  'no client write privilege on any table or view');

-- #2 anon sees nothing
set local role anon;
select throws_ok(format('select 1 from public.%I', t), '42501', null, 'anon cannot read ' || t)
  from unnest(array['players', 'player_state', 'gacha_state', 'characters', 'weapons', 'equipment',
    'fragments', 'pulls', 'daily_claims', 'weekly_seeds', 'weekly_scores', 'runs', 'run_submissions',
    'rooms', 'room_players', 'room_battles', 'bets', 'interferences', 'chip_ledger',
    'game_constants', 'auth_attempts', 'rate_limit_hits', 'audit_log', 'leaderboard']) t;
select throws_ok($$select public.get_profile('00000000-0000-0000-0000-000000000001')$$, '42501', null,
  'anon cannot call get_profile');
reset role;

-- #2/#3 authenticated user (ana)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.player_state), 1, 'sees only own player_state');
select is((select count(*)::int from public.characters), 0, 'cannot see other players'' characters');
select is((select count(*)::int from public.leaderboard), 2, 'leaderboard readable');
select throws_ok($$select name_key from public.players$$, '42501', null, 'name_key is not readable');
select throws_ok($$select is_admin from public.players$$, '42501', null, 'is_admin is not readable');
select throws_ok($$update public.player_state set coins = 999999$$, '42501', null, 'cannot edit own coins');
select throws_ok($$update public.gacha_state set pity = 0$$, '42501', null, 'cannot edit pity');
select throws_ok($$delete from public.characters$$, '42501', null, 'cannot delete collection');
select throws_ok($$insert into public.fragments values (gen_random_uuid(), 'mago', 'raro', 9)$$, '42501', null,
  'cannot insert fragments');
select throws_ok($$select public.apply_pull('00000000-0000-0000-0000-000000000001', 0, 'idem-12345678',
  'character', 0, 0, 1, false, '[]'::jsonb)$$, '42501', null, '#4 authenticated cannot call apply_pull');
select throws_ok($$select public.bank_run('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 1, 1)$$,
  '42501', null, 'authenticated cannot call bank_run');
select throws_ok($$select public.auth_fail('x', 'y')$$, '42501', null, 'authenticated cannot call auth_fail');
reset role;

-- CHECK constraints
select throws_ok($$update public.player_state set coins = -1$$, '23514', null, 'coins >= 0');
select throws_ok($$update public.gacha_state set pity = 101$$, '23514', null, 'pity <= 100');
select throws_ok($$update public.characters set stars = 6$$, '23514', null, 'stars <= 5');
select throws_ok($$insert into public.characters (player_id, class, element, rarity)
  values ('00000000-0000-0000-0000-000000000001', 'bard', 'fuego', 'raro')$$, '23514', null, 'class enum');
select throws_ok($$insert into public.weapons (player_id, type, element, rarity)
  values ('00000000-0000-0000-0000-000000000001', 'espada', 'fuego', 'mitico')$$, '23514', null, 'rarity enum');
select throws_ok($$insert into public.characters (player_id, class, element, rarity)
  values ('00000000-0000-0000-0000-000000000002', 'mago', 'fuego', 'raro')$$, '23505', null,
  'character key class+element+rarity is unique per player');

select * from finish();
rollback;
