import { ok, readJson, route } from "@/lib/server/http";
import { doPull } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { pullBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  return ok(await doPull(realDeps(), id, await readJson(req, pullBody)));
});
