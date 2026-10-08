-- 0025: Run v2 hero and piece fields (additive).
--  * characters: level, xp (hero EXP), skill (third skill pick), legacy (existed before Run v2:
--    burns at the higher "reconversion" rate, see burn.ts).
--  * weapons (every piece): roll (+-15%), lines (extra stat lines of gear), legacy.
--  * player_state: levels_day / levels_n, the daily counter of REPEATED levels (pay decays).
-- Rows that exist when this runs are marked legacy exactly once (migration_flags).
create table if not exists public.migration_flags (
  key text primary key,
  applied_at timestamptz not null default now()
);
alter table public.migration_flags enable row level security;
revoke all on public.migration_flags from anon, authenticated;

alter table public.characters
  add column if not exists level int not null default 1 check (level between 1 and 999),
  add column if not exists xp int not null default 0 check (xp >= 0),
  add column if not exists skill text check (skill is null or skill ~ '^[A-Za-z]{3,20}$'),
  add column if not exists legacy boolean not null default false;

alter table public.weapons
  add column if not exists roll numeric check (roll is null or roll between 0.85 and 1.15),
  add column if not exists lines jsonb check (lines is null or (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 3)),
  add column if not exists legacy boolean not null default false;

alter table public.player_state
  add column if not exists levels_day date,
  add column if not exists levels_n int not null default 0 check (levels_n >= 0);

do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0025_mark_legacy') then
    update public.characters set legacy = true;
    update public.weapons set legacy = true;
    insert into public.migration_flags (key) values ('0025_mark_legacy');
  end if;
end $$;
