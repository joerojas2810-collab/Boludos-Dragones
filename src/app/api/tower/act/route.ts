import { MAX_BODY_EXPEDITION, ok, readJson, route } from "@/lib/server/http";
import { expeditionActService } from "@/lib/server/expedition";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { expeditionActBody } from "@/lib/server/validators";
import type { ExpAction } from "@/lib/game/expedition";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const body = await readJson(req, expeditionActBody, MAX_BODY_EXPEDITION);
  return ok(await expeditionActService(realDeps(), id, { mode: body.mode, actions: body.actions as ExpAction[] }));
});
