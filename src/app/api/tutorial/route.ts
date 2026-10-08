import { ok, readJson, route } from "@/lib/server/http";
import { doTutorialStep } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { tutorialBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, tutorialBody);
  return ok(await doTutorialStep(realDeps(), id, b.step));
});
