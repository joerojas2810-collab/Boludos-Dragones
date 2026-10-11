import { ok, readJson, route } from "@/lib/server/http";
import { doSwapCopy } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { swapCopyBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, swapCopyBody);
  return ok(await doSwapCopy(realDeps(), id, b.heroId, b.index));
});
