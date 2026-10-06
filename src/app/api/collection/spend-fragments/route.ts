import { ok, readJson, route } from "@/lib/server/http";
import { call, limit, mapRpcError } from "@/lib/server/rpc";
import { loadMe } from "@/lib/server/services";
import { realDeps, requireUser } from "@/lib/server/supabase";
import { spendFragmentsBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const id = await requireUser();
  const b = await readJson(req, spendFragmentsBody);
  const { rpc } = realDeps();
  await limit(rpc, `frag:${id}`, 60, 60);
  try {
    await call(rpc, "spend_fragments", {
      p_player: id,
      p_character_id: b.characterId,
    });
  } catch (e) {
    return mapRpcError(e);
  }
  return ok({ profile: (await loadMe(rpc, id)).profile });
});
