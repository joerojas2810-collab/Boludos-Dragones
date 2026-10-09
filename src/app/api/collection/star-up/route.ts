import { ok, readJson, route } from "@/lib/server/http";
import { doStarUpHero } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { starUpHeroBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, starUpHeroBody);
  return ok(await doStarUpHero(realDeps(), id, b.baseId, b.materials));
});
