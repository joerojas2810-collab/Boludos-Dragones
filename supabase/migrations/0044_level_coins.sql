-- 0044: level coins x2.4..7.5 (steady state ~2 ten-pulls a day). Mirror of LEVEL_COINS in
-- src/lib/game/levelPay.ts. Idempotent.
create or replace function public.level_base_coins(p_rank text) returns int
language sql immutable set search_path = ''
as $$
  select case p_rank when 'f' then 60 when 'e' then 75 when 'd' then 95 when 'c' then 120
    when 'b' then 150 when 'a' then 180 when 's' then 210 when 'ss' then 240 when 'ssr' then 270 end
$$;
