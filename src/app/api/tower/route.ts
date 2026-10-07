import { ok, route } from "@/lib/server/http";
import { towerStateService } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";

export const runtime = "nodejs";

export const GET = route(async () => {
  const id = await requireUser();
  return ok(await towerStateService(realDeps(), id));
});
