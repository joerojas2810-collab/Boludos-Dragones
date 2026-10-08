import { ok, readJson, route } from "@/lib/server/http";
import { doUpgrade } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { upgradeBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, upgradeBody);
  return ok(await doUpgrade(realDeps(), id, b.pieceId, b.useDado));
});
