-- MANUAL, DESTRUCTIVE, NOT A MIGRATION (not part of setup.sql): wipes every player's progress
-- so all accounts restart as if freshly created (name + PIN are kept).
-- Run once in the Supabase SQL editor. Cannot be undone: take a backup first if in doubt.
-- Updated for v9/H2/6a-1 (route progress, shared dungeon steps, Escamas/Dados, hero profiles, tower identity).
-- Deleting character rows also removes all hero copies and their {trait, factors} profiles.
-- Deleting tower score rows clears every mode/selection, including future class/element metadata.
-- Rooms/chips history is left alone.
begin;
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
delete from public.dungeon_reward_days;
delete from public.pulls;
delete from public.daily_claims;
delete from public.weekly_scores;
delete from public.mission_state;
delete from public.tower_scores;
delete from public.tower_floor_paid;
delete from public.tower_daily;
delete from public.tower_settled;
delete from public.tower_runs;       -- 0059: expedition runs (cascades nothing else)
delete from public.tower_node_paid;  -- 0059: weekly node payout ledger
delete from public.tower_codex;      -- 0059: relic/event codex
update public.gacha_state set pity = 0, pity_ssr = 0;
update public.player_state
   set coins = public.game_const('starting_coins'),
       escamas = 0, dados = 0, dado_day = null, dado_n = 0,
       version = version + 1;
update public.players set best_floor = 0;
commit;
-- Check: select count(*) from public.characters;  -- 0
