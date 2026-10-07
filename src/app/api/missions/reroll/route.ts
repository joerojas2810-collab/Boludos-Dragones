import { z } from "zod";
import { ok, readJson, route } from "@/lib/server/http";
import { rerollMissionService } from "@/lib/server/missions";
import { realDeps, requireUser } from "@/lib/server/supabase";

export const runtime = "nodejs";

const body = z.object({
  scope: z.enum(["daily", "weekly"]),
  slot: z.number().int().min(0).max(2),
});

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, body);
  return ok(await rerollMissionService(realDeps(), id, b.scope, b.slot));
});
