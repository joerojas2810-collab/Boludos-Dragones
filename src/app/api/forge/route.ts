import { ok, readJson, route } from "@/lib/server/http";
import { doForge } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { forgeBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  return ok(await doForge(realDeps(), id, await readJson(req, forgeBody)));
});
