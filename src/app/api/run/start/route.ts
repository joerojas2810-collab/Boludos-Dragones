import { ok, readJson, route } from "@/lib/server/http";
import { startRunService } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { runStartBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  return ok(
    await startRunService(realDeps(), id, await readJson(req, runStartBody)),
  );
});
