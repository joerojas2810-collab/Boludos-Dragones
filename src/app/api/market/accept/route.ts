import { ok, readJson, route } from "@/lib/server/http";
import { audit, call, limit, mapRpcError } from "@/lib/server/rpc";
import { loadMe } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { marketIdBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, marketIdBody);
  const { rpc } = realDeps();
  await limit(rpc, `market:${id}`, 30, 60);
  try {
    await call(rpc, "market_accept", { p_player: id, p_offer: b.offerId });
  } catch (e) {
    return mapRpcError(e);
  }
  await audit(rpc, id, "market_accept", { offerId: b.offerId });
  return ok({ profile: (await loadMe(rpc, id)).profile });
});
