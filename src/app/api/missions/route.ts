import { ok, route } from "@/lib/server/http";
import { missionsStateService } from "@/lib/server/missions";
import { realDeps, requireUser } from "@/lib/server/supabase";

export const runtime = "nodejs";

export const GET = route(async () => {
  const id = await requireUser();
  return ok(await missionsStateService(realDeps(), id));
});
