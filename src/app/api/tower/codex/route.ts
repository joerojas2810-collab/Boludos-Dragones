import { ok, route } from "@/lib/server/http";
import { expeditionCodexService } from "@/lib/server/expedition";
import { realDeps, requireUser } from "@/lib/server/supabase";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const id = await requireUser();
  return ok(await expeditionCodexService(realDeps(), id, new URL(req.url).searchParams.get("mode")));
});
