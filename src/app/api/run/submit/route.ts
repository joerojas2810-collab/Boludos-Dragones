import { MAX_BODY_RUN, ok, readJson, route } from "@/lib/server/http";
import { submitRunService } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { runSubmitBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const body = await readJson(req, runSubmitBody, MAX_BODY_RUN);
  return ok(await submitRunService(realDeps(), id, body));
});
