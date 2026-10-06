import { ok, readJson, route } from "@/lib/server/http";
import { call, limit, mapRpcError } from "@/lib/server/rpc";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { marketIdBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, marketIdBody);
  const { rpc } = realDeps();
  await limit(rpc, `market:${id}`, 30, 60);
  try {
    return ok(
      await call(rpc, "market_cancel", { p_player: id, p_offer: b.offerId }),
    );
  } catch (e) {
    return mapRpcError(e);
  }
});
