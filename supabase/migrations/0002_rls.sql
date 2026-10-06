-- 0002_rls: default deny. RLS on EVERY table in public; clients get SELECT on
-- their own rows only (plus leaderboard-style public reads with minimal
-- columns). No client INSERT/UPDATE/DELETE anywhere: the server writes with
-- the service_role key (bypasses RLS) through the functions in 0003.

-- 1. Future objects created in public must not be exposed to API roles by default.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- 2. Every existing table: RLS on, no grants to anon/authenticated.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;

-- 3. Membership helper (security definer: avoids recursive policies).
-- Lives in the `private` schema, which the REST API does not expose, so it cannot be
-- called via /rest/v1/rpc (Security Advisor lint 0029). RLS policies can still call it.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room
      and player_id = (select auth.uid())
      and left_at is null
  )
$$;
revoke all on function private.is_room_member(uuid) from public, anon;
grant execute on function private.is_room_member(uuid) to authenticated;

-- 4. SELECT grants (column-limited for players so name_key / is_admin stay private).
grant select (id, name, best_floor) on public.players to authenticated;
grant select on
  public.player_state, public.gacha_state, public.characters, public.weapons,
  public.equipment, public.fragments, public.pulls, public.daily_claims,
  public.weekly_seeds, public.weekly_scores, public.runs,
  public.rooms, public.room_players, public.room_battles, public.bets,
  public.interferences, public.chip_ledger
to authenticated;
-- No grants and no policies (deny all) for: game_constants, run_submissions,
-- auth_attempts, rate_limit_hits, audit_log.

-- 5. Policies (SELECT only).
drop policy if exists players_read on public.players;
create policy players_read on public.players
  for select to authenticated using (true);

drop policy if exists player_state_own on public.player_state;
create policy player_state_own on public.player_state
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists gacha_state_own on public.gacha_state;
create policy gacha_state_own on public.gacha_state
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists characters_own on public.characters;
create policy characters_own on public.characters
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists weapons_own on public.weapons;
create policy weapons_own on public.weapons
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists equipment_own on public.equipment;
create policy equipment_own on public.equipment
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists fragments_own on public.fragments;
create policy fragments_own on public.fragments
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists pulls_own on public.pulls;
create policy pulls_own on public.pulls
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists daily_claims_own on public.daily_claims;
create policy daily_claims_own on public.daily_claims
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists weekly_seeds_read on public.weekly_seeds;
create policy weekly_seeds_read on public.weekly_seeds
  for select to authenticated using (true);

drop policy if exists weekly_scores_read on public.weekly_scores;
create policy weekly_scores_read on public.weekly_scores
  for select to authenticated using (true);

drop policy if exists runs_own on public.runs;
create policy runs_own on public.runs
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists rooms_member on public.rooms;
create policy rooms_member on public.rooms
  for select to authenticated using (private.is_room_member(id));

drop policy if exists room_players_member on public.room_players;
create policy room_players_member on public.room_players
  for select to authenticated using (private.is_room_member(room_id));

drop policy if exists room_battles_member on public.room_battles;
create policy room_battles_member on public.room_battles
  for select to authenticated using (private.is_room_member(room_id));

drop policy if exists bets_member on public.bets;
create policy bets_member on public.bets
  for select to authenticated using (private.is_room_member(room_id));

drop policy if exists interferences_member on public.interferences;
create policy interferences_member on public.interferences
  for select to authenticated using (private.is_room_member(room_id));

drop policy if exists chip_ledger_member on public.chip_ledger;
create policy chip_ledger_member on public.chip_ledger
  for select to authenticated using (private.is_room_member(room_id));

-- 6. Leaderboard: minimal columns, evaluated with the caller's rights.
create or replace view public.leaderboard with (security_invoker = on) as
  select id, name, best_floor from public.players;
revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to authenticated;
