import { ok, readJson, route } from "@/lib/server/http";
import { saveLoadoutService } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { loadoutSaveBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  return ok(await saveLoadoutService(realDeps(), id, await readJson(req, loadoutSaveBody)));
});
