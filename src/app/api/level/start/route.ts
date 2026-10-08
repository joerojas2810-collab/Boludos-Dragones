import { ok, readJson, route } from "@/lib/server/http";
import { startLevelService } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { levelStartBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  return ok(
    await startLevelService(realDeps(), id, await readJson(req, levelStartBody)),
  );
});
