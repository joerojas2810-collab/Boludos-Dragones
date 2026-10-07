import { z } from "zod";
import { ok, readJson, route } from "@/lib/server/http";
import { claimMissionService } from "@/lib/server/missions";
import { realDeps, requireUser } from "@/lib/server/supabase";

export const runtime = "nodejs";

const body = z.object({ scope: z.enum(["daily", "weekly", "event"]) });

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, body);
  return ok(await claimMissionService(realDeps(), id, b.scope));
});
