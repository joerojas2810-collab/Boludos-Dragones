import { MAX_BODY_RUN, ok, readJson, route } from "@/lib/server/http";
import { finishLevelService } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { levelFinishBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const body = await readJson(req, levelFinishBody, MAX_BODY_RUN);
  return ok(await finishLevelService(realDeps(), id, body));
});
