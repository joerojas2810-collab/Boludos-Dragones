import { ok, readJson, route } from "@/lib/server/http";
import { doAscend } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { ascendBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, ascendBody);
  return ok(await doAscend(realDeps(), id, b.baseId, b.materialIds));
});
