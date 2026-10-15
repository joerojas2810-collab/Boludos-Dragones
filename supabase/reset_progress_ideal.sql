-- MANUAL, DESTRUCTIVE, NOT A MIGRATION (not part of setup.sql / upgrade_from_*.sql).
-- Reset for the "estado ideal" release (turn-based engine, ENGINE_VERSION 26, PROFILE_VERSION 8).
-- Wipes GAME PROGRESS only; every account keeps logging in with the same name and PIN.
-- Requires 0058 applied first (class_mastery / skill_loadouts). Cannot be undone: take a backup first.
-- Run once in the Supabase SQL editor, AFTER upgrade_from_0057.sql and BEFORE deploying the new code.
--
-- WIPED (all rows):
--   characters (heroes, copies, factors; cascades equipment), weapons, equipment, fragments, part_stock,
--   pulls, daily_claims (streak), mission_state, market_offers,
--   runs, run_submissions, weekly_scores,
--   route_progress, step_clears, dungeon_clears, dungeon_reward_days,
--   tower_scores, tower_scores_archive, tower_floor_paid, tower_daily, tower_settled,
--   class_mastery, skill_loadouts,
--   rooms (cascades room_players, room_battles, bets, interferences, room_state, room_floor,
--          room_votes, room_vote_results, room_coop, room_duel) and chip_ledger:
--          rooms hold climbs/duels saved with the old engine, which are never mixed with the new one.
-- RESET IN PLACE (rows kept):
--   player_state: coins = starting_coins, escamas/dados/daily counters = 0, tutorial = null (a starter hero
--                 is granted again at next login), version + 1 (invalidates in-flight client writes)
--   gacha_state: pity = 0;  players.best_floor = 0
-- PRESERVED (untouched):
--   auth.users (synthetic email + derived password = name + PIN credentials), players (id, name, name_key,
--   is_admin, created_at), game_constants, weekly_seeds, migration_flags (deleting it would re-run old
--   one-off migrations), auth_attempts, rate_limit_hits, audit_log. The house code is an environment
--   variable, not a table. Nothing in schema auth is touched.
begin;
delete from public.rooms;        -- cascades every room_* table, bets, interferences
delete from public.chip_ledger;  -- composite FK to room_players already cascaded; this clears any stragglers
delete from public.market_offers;
delete from public.run_submissions;
delete from public.runs;
delete from public.equipment;
delete from public.weapons;
delete from public.characters;
delete from public.fragments;
delete from public.part_stock;
delete from public.route_progress;
delete from public.step_clears;
delete from public.dungeon_clears;
delete from public.dungeon_reward_days;
delete from public.pulls;
delete from public.daily_claims;
delete from public.weekly_scores;
delete from public.mission_state;
delete from public.tower_scores;
delete from public.tower_scores_archive;
delete from public.tower_floor_paid;
delete from public.tower_daily;
delete from public.tower_settled;
delete from public.class_mastery;
delete from public.skill_loadouts;
update public.gacha_state set pity = 0, pity_ssr = 0;
update public.player_state
   set coins = public.game_const('starting_coins'),
       escamas = 0, dados = 0, dado_day = null, dado_n = 0,
       levels_day = null, levels_n = 0, tutorial = null,
       version = version + 1;
update public.players set best_floor = 0;
commit;
-- Checks: select count(*) from public.characters;            -- 0
--         select count(*) from public.players;               -- unchanged
--         select count(*) from auth.users;                   -- unchanged
