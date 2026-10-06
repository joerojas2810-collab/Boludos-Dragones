-- 0006_hardening: Security Advisor follow-ups.
-- 1) Remove the old PUBLIC copies of the RLS helpers (they are now in schema `private`,
--    which the REST API does not expose). Policies were recreated against private.* by
--    0002/0004/0005 earlier in this same script, so nothing depends on these anymore.
drop function if exists public.is_room_member(uuid);
drop function if exists public.is_room_topic_member(text);

-- 2) Tables only touched by the server (service_role bypasses RLS): make "no access for
--    anon/authenticated" explicit instead of "RLS on, zero policies" (lint 0008).
do $$
declare t text;
begin
  foreach t in array array['audit_log','auth_attempts','game_constants','rate_limit_hits','run_submissions']
  loop
    execute format('drop policy if exists deny_all on public.%I', t);
    execute format('create policy deny_all on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;

-- Not changed on purpose: "Leaked password protection" (Auth). Our passwords are never chosen
-- by users: they are HMAC(PEPPER, name:pin) derived on the server, so HaveIBeenPwned does not apply.
