import { ok, readJson, route } from "@/lib/server/http";
import { doSwapTrait } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { swapTraitBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, swapTraitBody);
  return ok(await doSwapTrait(realDeps(), id, b.heroId, b.index));
});
