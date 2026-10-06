-- pgTAP: attack #12 (private Realtime channels). Tests the policy helper and that the
-- policies exist; a live subscribe test must be done with two browser sessions.
-- STATUS: NOT EXECUTED against Supabase (no Docker). Helper logic ran in PGlite.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'a@players.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'b@players.invalid');
select public.create_player('00000000-0000-0000-0000-000000000001', 'aaa', 'aaa');
select public.create_player('00000000-0000-0000-0000-000000000002', 'bbb', 'bbb');
select public.create_room('00000000-0000-0000-0000-000000000001', 'ROOM');

select policies_are('realtime', 'messages',
  array['room members can receive', 'room members can send'],
  'only our two policies exist on realtime.messages') ;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(private.is_room_topic_member('room:' || (select id from public.rooms where code = 'ROOM')), true,
  'member passes');
select is(private.is_room_topic_member('room:00000000-0000-0000-0000-0000000000ff'), false, 'other room fails');
select is(private.is_room_topic_member('room:not-a-uuid'), false, 'malformed topic is false, not an error');
select is(private.is_room_topic_member(null), false, 'null topic is false');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(private.is_room_topic_member('room:' || (select id from public.rooms where code = 'ROOM')), false,
  'non-member fails');
reset role;

select * from finish();
rollback;
