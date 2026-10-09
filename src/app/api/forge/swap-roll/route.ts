import { ok, readJson, route } from "@/lib/server/http";
import { doSwapRoll } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { swapRollBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, swapRollBody);
  return ok(await doSwapRoll(realDeps(), id, b.pieceId, b.index));
});
