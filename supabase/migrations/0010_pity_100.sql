-- Guaranteed Legendario now at 100 pulls without one (was 30).
update public.game_constants set value = 100 where key = 'pity_threshold';
alter table public.gacha_state drop constraint if exists gacha_state_pity_check;
alter table public.gacha_state
  add constraint gacha_state_pity_check check (pity between 0 and 100);
