import { ok, route } from "@/lib/server/http";
import { loadMe } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";

export const runtime = "nodejs";

export const GET = route(async () => {
  const id = await requireUser();
  const me = await loadMe(realDeps().rpc, id);
  return ok({ name: me.name, isAdmin: me.isAdmin, profile: me.profile });
});
