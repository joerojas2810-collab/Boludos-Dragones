import { randomInt } from "node:crypto";
import { derivePassword } from "@/lib/server/credentials";
import { env } from "@/lib/server/env";
import { ok, readJson, route } from "@/lib/server/http";
import { audit, call, limit, mapRpcError } from "@/lib/server/rpc";
import { adminClient, realDeps, requireUser } from "@/lib/server/supabase";
import { nameKeyOf, resetPinBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const adminId = await requireUser();
  const { name } = await readJson(req, resetPinBody);
  const { rpc } = realDeps();
  await limit(rpc, `reset:${adminId}`, 20, 600);
  const nameKey = nameKeyOf(name);
  try {
    // SQL checks is_admin (forbidden), clears locks and audits.
    const r = await call<{ player_id: string }>(rpc, "admin_reset_pin", {
      p_admin: adminId,
      p_name_key: nameKey,
    });
    const pin = String(randomInt(0, 10000)).padStart(4, "0");
    const upd = await adminClient().auth.admin.updateUserById(r.player_id, {
      password: derivePassword(env().PIN_PEPPER, nameKey, pin),
    });
    if (upd.error) throw new Error("password update failed");
    await audit(rpc, adminId, "pin_reset_done", { target: nameKey });
    return ok({ pin }); // shown once to the admin, never stored or logged
  } catch (e) {
    return mapRpcError(e);
  }
});
