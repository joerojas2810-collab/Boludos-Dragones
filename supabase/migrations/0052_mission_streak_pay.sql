-- 0052: missions and the daily streak pay enough to matter (about a fifth of a day's income).
--  daily 150/250/700, weekly 500/800/1500, Friday event 300/500/1000 (missions.ts SCOPE_TIERS);
--  streak bonus 500 on day 3 and 1500 on day 7 (streak.ts STREAK_BONUS).
update public.game_constants set value = 500 where key = 'streak_bonus_3';
update public.game_constants set value = 1500 where key = 'streak_bonus_7';

do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'mission_claim'
  loop
    v_def := pg_get_functiondef(r.oid);
    continue when v_def like '%array[150, 250, 700]%'; -- already patched (re-run)
    v_new := replace(v_def, 'array[20, 30, 250]', 'array[150, 250, 700]');
    v_new := replace(v_new, 'array[120, 100, 500]', 'array[500, 800, 1500]');
    v_new := replace(v_new, 'array[50, 100, 400]', 'array[300, 500, 1000]');
    if v_new = v_def then raise exception '0052: mission_claim pattern not found'; end if;
    execute v_new;
  end loop;
end $$;
