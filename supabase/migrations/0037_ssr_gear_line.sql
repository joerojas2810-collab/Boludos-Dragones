-- 0037: SSR gear gets a 4th extra line (SS and SSR used to roll the same number of lines) and
-- the per-piece roll range narrows to 0.90..1.10 for NEW pieces (old pieces keep 0.85..1.15, still valid).
create or replace function public.extra_lines(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select (public.rank_idx(p_rank) >= 3)::int + (public.rank_idx(p_rank) >= 5)::int
       + (public.rank_idx(p_rank) >= 7)::int + (public.rank_idx(p_rank) >= 8)::int
$$;

alter table public.weapons drop constraint if exists weapons_lines_check;
alter table public.weapons add constraint weapons_lines_check
  check (lines is null or (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 4));
