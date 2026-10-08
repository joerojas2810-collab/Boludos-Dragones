-- 0026: Run v2 dungeon progress + one-time cleanup + get_profile v2.
--  * dungeon_progress: levels cleared IN ORDER per (rank, ascension). Replaces dungeon_clears,
--    which stays untouched (audit; nothing reads it any more), so everybody starts again.
--  * ONE-TIME (flag 0026_run_v2_reset): half-finished runs of the old engine are closed unpaid
--    (a run_submissions row records why) and the current week's tower scores are archived
--    and cleared (the engine changed). Coins, characters, pieces, parts and pity are kept.
--  * get_profile exposes the new fields (hero level/xp/skill/legacy, piece roll/lines/legacy,
--    dungeons as arrays, levelsDay). The SS pity (pity) is returned but unused.
create table if not exists public.dungeon_progress (
  player_id uuid not null references public.players (id) on delete cascade,
  rank text not null check (rank in ('f', 'e', 'd', 'c', 'b', 'a', 's', 'ss', 'ssr')),
  ascension int not null check (ascension between 0 and 5),
  cleared int not null default 0 check (cleared between 0 and 12),
  primary key (player_id, rank, ascension)
);
alter table public.dungeon_progress enable row level security;
revoke all on public.dungeon_progress from anon, authenticated;
drop policy if exists deny_all on public.dungeon_progress;
create policy deny_all on public.dungeon_progress as restrictive for all
  to anon, authenticated using (false) with check (false);

-- Tower: rounds = total battle rounds of the best climb (tiebreak: fewer wins).
alter table public.tower_scores
  add column if not exists rounds int not null default 0 check (rounds between 0 and 1000000);
create table if not exists public.tower_scores_archive (
  like public.tower_scores including defaults,
  archived_at timestamptz not null default now(),
  reason text not null default 'run_v2'
);
alter table public.tower_scores_archive enable row level security;
revoke all on public.tower_scores_archive from anon, authenticated;
drop policy if exists deny_all on public.tower_scores_archive;
create policy deny_all on public.tower_scores_archive as restrictive for all
  to anon, authenticated using (false) with check (false);

do $$
begin
  if not exists (select 1 from public.migration_flags where key = '0026_run_v2_reset') then
    insert into public.run_submissions (run_id, player_id, log, verdict, reason)
    select r.id, r.player_id, null, 'rejected', 'run_v2_migration'
      from public.runs r
     where r.status = 'open'
    on conflict (run_id) do nothing;
    update public.runs set status = 'closed', finished_at = now() where status = 'open';
    insert into public.tower_scores_archive (week, mode, player_id, max_floor, updated_at, rounds)
    select week, mode, player_id, max_floor, updated_at, rounds
      from public.tower_scores where week >= public.game_week();
    delete from public.tower_scores where week >= public.game_week();
    insert into public.migration_flags (key) values ('0026_run_v2_reset');
  end if;
end $$;

create or replace function public.get_profile(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_p public.players;
  v_s public.player_state;
begin
  select * into v_p from public.players where id = p_player;
  if not found then
    raise exception 'player_not_found';
  end if;
  select * into v_s from public.player_state where player_id = p_player;
  return jsonb_build_object(
    'name', v_p.name,
    'isAdmin', v_p.is_admin,
    'bestFloor', v_p.best_floor,
    'stateVersion', v_s.version,
    'coins', v_s.coins,
    'pity', coalesce((
      select jsonb_object_agg(g.banner, g.pity)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'parts', coalesce((
      select jsonb_object_agg(k.key, k.qty)
      from public.part_stock k where k.player_id = p_player and k.qty > 0
    ), '{}'::jsonb),
    -- {rank: [levels cleared at ascension 0, 1, ...]}
    'dungeons', coalesce((
      select jsonb_object_agg(t.rank, t.arr)
      from (
        select m.rank,
               (select jsonb_agg(coalesce(x.cleared, 0) order by a.n)
                  from generate_series(0, m.top) as a(n)
                  left join public.dungeon_progress x
                    on x.player_id = p_player and x.rank = m.rank and x.ascension = a.n) as arr
          from (select d.rank, max(d.ascension) as top
                  from public.dungeon_progress d
                 where d.player_id = p_player group by d.rank) m
      ) t
    ), '{}'::jsonb),
    'levelsDay', case when v_s.levels_day = public.game_day()
                      then jsonb_build_object('day', to_char(v_s.levels_day, 'YYYY-MM-DD'), 'n', v_s.levels_n)
                      else null end,
    'pitySsr', coalesce((
      select jsonb_object_agg(g.banner, g.pity_ssr)
      from public.gacha_state g where g.player_id = p_player
    ), '{}'::jsonb),
    'characters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.key, 'classId', c.class, 'element', c.element,
        'rarity', c.rarity, 'stars', c.stars,
        'data', c.data || jsonb_build_object('level', c.level, 'xp', c.xp, 'legacy', c.legacy)
                       || case when c.skill is null then '{}'::jsonb else jsonb_build_object('skill', c.skill) end
      ) order by c.created_at, c.key)
      from public.characters c where c.player_id = p_player
    ), '[]'::jsonb),
    'weapons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.key, 'type', w.type, 'element', w.element,
        'rarity', w.rarity, 'stars', w.stars,
        'data', w.data || jsonb_build_object('legacy', w.legacy)
                       || case when w.roll is null then '{}'::jsonb else jsonb_build_object('roll', w.roll) end
                       || case when w.lines is null then '{}'::jsonb else jsonb_build_object('lines', w.lines) end
      ) order by w.created_at, w.key)
      from public.weapons w where w.player_id = p_player
    ), '[]'::jsonb),
    'equipped', coalesce((
      select jsonb_object_agg(case when e.slot = 'arma' then e.character_key else e.character_key || '|' || e.slot end, e.weapon_key)
      from public.equipment e where e.player_id = p_player
    ), '{}'::jsonb),
    'fragments', coalesce((
      select jsonb_object_agg(f.class || ':' || f.rarity, f.qty)
      from public.fragments f where f.player_id = p_player and f.qty > 0
    ), '{}'::jsonb)
  );
end $$;
