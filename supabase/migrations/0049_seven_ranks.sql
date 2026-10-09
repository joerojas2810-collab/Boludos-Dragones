-- 0049: item ranks are F..S (SS and SSR remain only as dungeon tiers) and the gacha has no pity.
-- 1) Pity: apply_pull no longer demands an SSR at the threshold and keeps pity_ssr at 0.
-- 2) Gear lines: C 1, A 2, S 3 plus the S capstone line (dmgTaken / dmgDealt) = at most 4.
-- 3) piece_check accepts the capstone stat of each slot.
do $$
declare r record; v_def text; v_new text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'apply_pull'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'if v_run_pity_ssr >= v_thr_ssr and v_rar <> ''ssr'' then', 'if false then');
    v_new := replace(v_new, 'v_run_pity_ssr := case when v_rar = ''ssr'' then 0 else least(v_run_pity_ssr + 1, v_thr_ssr) end;', 'v_run_pity_ssr := 0;');
    if v_new <> v_def then execute v_new; end if;
  end loop;
end $$;

create or replace function public.extra_lines(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select (public.rank_idx(p_rank) >= 3)::int + (public.rank_idx(p_rank) >= 5)::int
       + 2 * (public.rank_idx(p_rank) >= 6)::int
$$;

create or replace function public.piece_check(
  p_type text, p_rank text, p_roll numeric, p_lines jsonb
) returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_pool text[];
  v_l jsonb;
  v_seen text[] := '{}';
  v_stat text;
  v_roll text;
begin
  if p_roll is null or p_roll < 0.85 or p_roll > 1.15 then
    raise exception 'invalid_items';
  end if;
  v_pool := case p_type
    when 'casco' then array['accuracy', 'crit', 'critDmg', 'def', 'resist', 'dmgTaken']
    when 'peto' then array['hp', 'regen', 'resist', 'lifesteal', 'speed', 'dmgTaken']
    when 'piernas' then array['crit', 'critDmg', 'accuracy', 'speed', 'lifesteal', 'dmgDealt']
    when 'zapatos' then array['resist', 'hp', 'atk', 'regen', 'crit', 'dmgDealt']
    when 'collar' then array['critDmg', 'accuracy', 'atk', 'speed', 'lifesteal', 'dmgDealt']
    else null end;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return;
  end if;
  if v_pool is null or jsonb_array_length(p_lines) > public.extra_lines(p_rank) then
    raise exception 'invalid_items'; -- hand weapons have no lines; gear has at most extra_lines(rank)
  end if;
  for v_l in select e from jsonb_array_elements(p_lines) as t(e) loop
    v_stat := v_l ->> 'stat';
    v_roll := v_l ->> 'roll';
    if jsonb_typeof(v_l) <> 'object'
       or coalesce(not (v_stat = any (v_pool)), true)
       or coalesce(v_stat = any (v_seen), false)
       or coalesce(v_roll !~ '^[0-9]+(\.[0-9]+)?$', true) then
      raise exception 'invalid_items';
    end if;
    if v_roll::numeric < 0.85 or v_roll::numeric > 1.15 then
      raise exception 'invalid_items';
    end if;
    -- the capstone stats only exist on S pieces
    if v_stat in ('dmgTaken', 'dmgDealt') and public.rank_idx(p_rank) < 6 then
      raise exception 'invalid_items';
    end if;
    v_seen := v_seen || v_stat;
  end loop;
end $$;

-- 4) Trade value follows the new top rank: S is worth 250 / 3% = 8330 (burn and the market derive from it).
create or replace function public.trade_value(p_key text) returns int
language sql immutable set search_path = ''
as $$
  select case substring(p_key from '[^-]+$')
    when 'f' then 830 when 'e' then 1140 when 'd' then 1560 when 'c' then 2080
    when 'b' then 2780 when 'a' then 4170 when 's' then 8330 else 0 end
$$;
update public.market_offers set status = 'cancelled', closed_at = now()
 where status = 'open' and not public.trade_fair(give_key, want_key, coins);
