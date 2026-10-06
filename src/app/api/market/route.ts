import { ok, route } from "@/lib/server/http";
import { call } from "@/lib/server/rpc";
import { realDeps, requireUser } from "@/lib/server/supabase";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireUser();
  return ok({ offers: await call(realDeps().rpc, "market_list", {}) });
});
