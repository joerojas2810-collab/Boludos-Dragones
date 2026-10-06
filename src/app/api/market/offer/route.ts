import { ok, readJson, route } from "@/lib/server/http";
import { audit, call, limit, mapRpcError } from "@/lib/server/rpc";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { marketOfferBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, marketOfferBody);
  const { rpc } = realDeps();
  await limit(rpc, `market:${id}`, 30, 60);
  try {
    const r = await call(rpc, "market_create", {
      p_player: id,
      p_kind: b.kind,
      p_give: b.give,
      p_want: b.want,
    });
    await audit(rpc, id, "market_offer", { ...b });
    return ok(r);
  } catch (e) {
    return mapRpcError(e);
  }
});
