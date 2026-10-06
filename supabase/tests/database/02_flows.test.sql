-- pgTAP: authoritative flows (attacks #7-#9, #11, #13, #14): idempotent pulls, no
-- negative coins, one bank per run, login lockouts, room code brute force, bets.
-- STATUS: NOT EXECUTED (no Docker). Equivalent assertions ran in PGlite (tests/pglite/).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-00000000000' || i)::uuid, 'u' || i || '@players.invalid'
  from generate_series(1, 3) i;
select public.create_player(('00000000-0000-0000-0000-00000000000' || i)::uuid, 'user' || i, 'user' || i, i = 1)
  from generate_series(1, 3) i;
update public.player_state set coins = 300 where player_id = '00000000-0000-0000-0000-000000000002';

-- #8 pulls: charge once, replay does not charge, stale version / low coins / bad cost rejected
select is((public.apply_pull('00000000-0000-0000-0000-000000000002', 0, 'idem-aaaaaaaa', 'character', 150, 1, 7,
  false, '[{"class":"mago","element":"fuego","rarity":"comun","data":{}}]'::jsonb) ->> 'coins')::int, 150,
  'pull charges 150');
select is((public.apply_pull('00000000-0000-0000-0000-000000000002', 0, 'idem-aaaaaaaa', 'character', 150, 1, 7,
  false, '[{"class":"mago","element":"fuego","rarity":"comun","data":{}}]'::jsonb) ->> 'replayed')::boolean, true,
  'same idempotency key is a replay');
select is((select coins from public.player_state where player_id = '00000000-0000-0000-0000-000000000002'), 150,
  'replay did not charge again');
select throws_ok($$select public.apply_pull('00000000-0000-0000-0000-000000000002', 0, 'idem-bbbbbbbb', 'character',
  150, 2, 7, false, '[{"class":"mago","element":"agua","rarity":"comun","data":{}}]'::jsonb)$$,
  '40001', null, 'stale version -> conflict');
select throws_ok($$select public.apply_pull('00000000-0000-0000-0000-000000000002', 1, 'idem-cccccccc', 'character',
  100, 2, 7, false, '[{"class":"mago","element":"agua","rarity":"comun","data":{}}]'::jsonb)$$,
  'P0001', 'invalid_cost', 'wrong price rejected');
select throws_ok($$select public.apply_pull('00000000-0000-0000-0000-000000000002', 1, 'idem-dddddddd', 'character',
  1350, 12, 7, false, (select jsonb_agg('{"class":"mago","element":"agua","rarity":"comun","data":{}}'::jsonb)
  from generate_series(1, 10)))$$, 'P0001', 'insufficient_coins', 'cannot overspend');
select throws_ok($$select public.apply_pull('00000000-0000-0000-0000-000000000002', 1, 'idem-eeeeeeee', 'character',
  150, 99, 7, false, '[{"class":"mago","element":"agua","rarity":"comun","data":{}}]'::jsonb)$$,
  'P0001', 'invalid_pity', 'incoherent pity rejected');
-- #14 daily only once
select lives_ok($$select public.apply_pull('00000000-0000-0000-0000-000000000003', 0, 'daily-11111111', 'character', 0,
  1, 7, true, '[{"class":"mago","element":"agua","rarity":"comun","data":{}}]'::jsonb)$$, 'first daily ok');
select throws_ok($$select public.apply_pull('00000000-0000-0000-0000-000000000003', 1, 'daily-22222222', 'character', 0,
  2, 7, true, '[{"class":"mago","element":"fuego","rarity":"comun","data":{}}]'::jsonb)$$,
  'P0001', 'already_claimed', 'second daily rejected');

-- #7 run banked once, capped
select public.start_run('00000000-0000-0000-0000-000000000002', 'c-mago-fuego-comun', 42, '{}'::jsonb);
select is((public.bank_run('00000000-0000-0000-0000-000000000002',
  (select id from public.runs where player_id = '00000000-0000-0000-0000-000000000002'), 99999, 5) ->> 'capped')::boolean,
  true, 'absurd coins are capped');
select throws_ok($$select public.bank_run('00000000-0000-0000-0000-000000000002',
  (select id from public.runs where player_id = '00000000-0000-0000-0000-000000000002'), 10, 5)$$,
  'P0001', 'duplicate_run', 'second bank of the same run rejected');

-- #9 login lockouts (thresholds from SEGURIDAD.md sec. 2)
select public.auth_fail('victim', '10.0.0.1') from generate_series(1, 4);
select is(public.auth_check('victim', '10.0.0.2') ->> 'allowed', 'true', '4 fails: still allowed');
select is(public.auth_fail('victim', '10.0.0.1') ->> 'reason', 'wait', '5th fail: waiting');
update public.auth_attempts set locked_until = null where key = 'name:victim';
select public.auth_fail('victim', '10.0.0.3') from generate_series(6, 19);
select is(public.auth_fail('victim', '10.0.0.4') ->> 'reason', 'locked', '20th fail: hard lock');
select is(public.auth_success('victim', '10.0.0.5') ->> 'ok', 'true', 'success call returns ok');
select is(public.auth_check('victim', '10.0.0.5') ->> 'reason', 'locked', 'success does not clear hard lock');
select public.admin_reset_pin('00000000-0000-0000-0000-000000000001', 'user2');
select throws_ok($$select public.admin_reset_pin('00000000-0000-0000-0000-000000000002', 'user3')$$,
  'P0001', 'forbidden', 'non-admin cannot reset');
select public.auth_fail('n' || i, '9.9.9.9') from generate_series(1, 20) i;
select is(public.auth_check('fresh', '9.9.9.9') ->> 'reason', 'ip_limited', '20 fails from one IP: limited');

-- #11 room codes
select public.create_room('00000000-0000-0000-0000-000000000001', 'ABCD');
select public.join_room('00000000-0000-0000-0000-000000000003', 'ZZ' || chr(64 + i) || 'Z') from generate_series(1, 10) i;
select is(public.join_room('00000000-0000-0000-0000-000000000003', 'ABCD') ->> 'error', 'rate_limited',
  'after 10 wrong codes even the right one is refused');
select is(public.join_room('00000000-0000-0000-0000-000000000002', 'abcd') ->> 'ok', 'true', 'valid join works');

-- #13 bets
select public.open_battle((select id from public.rooms where code = 'ABCD'),
  '00000000-0000-0000-0000-000000000002', 'r1:b1');
select throws_ok($$select public.place_bet((select id from public.rooms where code = 'ABCD'),
  '00000000-0000-0000-0000-000000000002', 'r1:b1', 'win', 20)$$, 'P0001', 'self_bet', 'no bet on yourself');
select throws_ok($$select public.place_bet((select id from public.rooms where code = 'ABCD'),
  '00000000-0000-0000-0000-000000000001', 'r1:b1', 'win', 101)$$, 'P0001', 'insufficient_chips',
  'cannot bet more chips than owned');
select public.lock_battle((select id from public.rooms where code = 'ABCD'), 'r1:b1');
select throws_ok($$select public.place_bet((select id from public.rooms where code = 'ABCD'),
  '00000000-0000-0000-0000-000000000001', 'r1:b1', 'win', 20)$$, 'P0001', 'battle_locked',
  'no bet after the fight started');
-- #15 host actions
select throws_ok($$select public.close_room('00000000-0000-0000-0000-000000000002',
  (select id from public.rooms where code = 'ABCD'))$$, 'P0001', 'forbidden', 'guest cannot close the room');

select * from finish();
rollback;
