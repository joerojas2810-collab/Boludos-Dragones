import { ok, route } from "@/lib/server/http";
import { sessionClient } from "@/lib/server/supabase";

export const runtime = "nodejs";

export const POST = route(async () => {
  await (await sessionClient()).auth.signOut();
  return ok({ ok: true });
});
