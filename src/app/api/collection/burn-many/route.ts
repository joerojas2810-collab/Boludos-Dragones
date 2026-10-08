import { ok, readJson, route } from "@/lib/server/http";
import { doBurnMany } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { burnManyBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, burnManyBody);
  return ok(await doBurnMany(realDeps(), id, b.kind, b.ids));
});
