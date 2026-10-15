import { ok, readJson, route } from "@/lib/server/http";
import { expeditionStartService } from "@/lib/server/expedition";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { expeditionStartBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  return ok(await expeditionStartService(realDeps(), id, await readJson(req, expeditionStartBody)));
});
