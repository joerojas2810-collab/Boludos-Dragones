import { ok, readJson, route } from "@/lib/server/http";
import { doBurn } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { burnBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, burnBody);
  return ok(await doBurn(realDeps(), id, b.kind, b.id));
});
