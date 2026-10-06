-- 0004_realtime: private channels. Topic format: room:<rooms.id uuid>.
-- Only active members of that room can receive or send (broadcast/presence).
-- Policies are cached per connection: after kicking someone, force reconnect
-- or refresh their JWT. Also disable "Allow public access" in
-- Dashboard > Realtime > Settings so only private channels work.
-- Docs: https://supabase.com/docs/guides/realtime/authorization

-- CASE guards the uuid cast (a malformed topic must yield false, not an error).
create or replace function private.is_room_topic_member(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_topic ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_room_member(substr(p_topic, 6)::uuid)
    else false
  end
$$;
revoke all on function private.is_room_topic_member(text) from public, anon;
grant execute on function private.is_room_topic_member(text) to authenticated;

drop policy if exists "room members can receive" on realtime.messages;
create policy "room members can receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_room_topic_member((select realtime.topic()))
  );

drop policy if exists "room members can send" on realtime.messages;
create policy "room members can send" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_room_topic_member((select realtime.topic()))
  );

-- Postgres Changes (respects the SELECT policies of 0002) for the live room state.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['rooms', 'room_players', 'room_battles', 'bets', 'interferences'] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
