import { clientIp, ok, readJson, route } from "@/lib/server/http";
import { login } from "@/lib/server/loginFlow";
import { env } from "@/lib/server/env";
import { realDeps, sessionClient } from "@/lib/server/supabase";
import { credsBody, nameKeyOf } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const { name, pin } = await readJson(req, credsBody);
  const e = env();
  const sb = await sessionClient();
  await login(
    {
      rpc: realDeps().rpc,
      signIn: async (email, password) =>
        !(await sb.auth.signInWithPassword({ email, password })).error,
      pepper: e.PIN_PEPPER,
      adminName: e.ADMIN_NAME,
    },
    nameKeyOf(name),
    pin,
    clientIp(req),
  );
  return ok({ ok: true });
});
