import { ok, readJson, route } from "@/lib/server/http";
import { doStarUpPiece } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { starUpPieceBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, starUpPieceBody);
  return ok(await doStarUpPiece(realDeps(), id, b.baseId, b.materials));
});
