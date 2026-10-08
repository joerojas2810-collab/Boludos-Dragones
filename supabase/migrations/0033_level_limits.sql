-- 0033: level caps. Fights: 200/hour and 1500/day (were 40 and 300, reached by normal play with
-- quick resolve). Sweeps do not count toward them and have their own cap (600/hour).
create or replace function public.start_level(
  p_player uuid, p_character_id text, p_seed bigint, p_hero jsonb,
  p_rank text, p_level int, p_asc int
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_why text;
begin
  if p_hero is null or jsonb_typeof(p_hero) <> 'object' or p_character_id is null then
    raise exception 'invalid_args';
  end if;
  if not exists (select 1 from public.characters where player_id = p_player and key = p_character_id) then
    raise exception 'character_not_found';
  end if;
  v_why := public.level_lock_reason(p_player, p_rank, p_level, p_asc);
  if v_why is not null then
    raise exception '%', v_why;
  end if;
  -- Sweeps (hero.sweep = true) are instant and paid as repeats: they do not use the
  -- fight caps. Fight caps follow the 150/hour service limit; sweeps have their own.
  if coalesce((p_hero ->> 'sweep')::boolean, false) then
    if (select count(*) from public.runs
         where player_id = p_player and hero ->> 'kind' = 'level'
           and hero ->> 'sweep' = 'true' and started_at > now() - interval '1 hour') >= 600 then
      raise exception 'rate_limited';
    end if;
  elsif (select count(*) from public.runs
          where player_id = p_player and hero ->> 'kind' = 'level'
            and coalesce(hero ->> 'sweep', 'false') <> 'true'
            and started_at > now() - interval '1 hour') >= 200
     or (select count(*) from public.runs
          where player_id = p_player and hero ->> 'kind' = 'level'
            and coalesce(hero ->> 'sweep', 'false') <> 'true'
            and started_at > now() - interval '1 day') >= 1500 then
    raise exception 'rate_limited';
  end if;
  update public.runs set status = 'expired', finished_at = now()
   where player_id = p_player and status = 'open'
     and started_at < now() - interval '1 hour' * public.game_const('run_stale_hours');
  if exists (select 1 from public.runs where player_id = p_player and status = 'open') then
    raise exception 'run_open';
  end if;
  begin
    insert into public.runs (player_id, seed, hero)
    values (p_player, p_seed,
            p_hero || jsonb_build_object('kind', 'level', 'rank', p_rank, 'level', p_level,
                                         'asc', p_asc, 'heroId', p_character_id))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'run_open';
  end;
  return jsonb_build_object('run_id', v_id);
end $$;
