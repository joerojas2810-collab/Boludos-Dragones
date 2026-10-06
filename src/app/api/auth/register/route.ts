import {
  derivePassword,
  safeEqual,
  syntheticEmail,
} from "@/lib/server/credentials";
import { env } from "@/lib/server/env";
import { ApiError, clientIp, ok, readJson, route } from "@/lib/server/http";
import { isAdminName } from "@/lib/server/loginFlow";
import { audit, call, limit, mapRpcError } from "@/lib/server/rpc";
import { adminClient, realDeps, sessionClient } from "@/lib/server/supabase";
import { nameKeyOf, registerBody } from "@/lib/server/validators";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const body = await readJson(req, registerBody);
  const e = env();
  const { rpc } = realDeps();
  const ip = clientIp(req);
  await limit(rpc, `register:${ip}`, 10, 3600);
  if (!safeEqual(body.houseCode, e.HOUSE_CODE)) {
    await audit(rpc, null, "register_bad_house_code", { ip });
    throw new ApiError(
      403,
      "invalid_house_code",
      "Código de la casa incorrecto.",
    );
  }
  const nameKey = nameKeyOf(body.name);
  const password = derivePassword(e.PIN_PEPPER, nameKey, body.pin);
  const email = syntheticEmail(nameKey);
  const admin = adminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new ApiError(409, "name_taken", "Ese nombre ya existe.");
  const userId = created.data.user.id;
  try {
    await call(rpc, "create_player", {
      p_user: userId,
      p_name: body.name,
      p_name_key: nameKey,
      p_is_admin: isAdminName(body.name, e.ADMIN_NAME),
    });
  } catch (err) {
    await admin.auth.admin.deleteUser(userId); // no orphan Auth users
    return mapRpcError(err);
  }
  const sb = await sessionClient();
  await sb.auth.signInWithPassword({ email, password });
  return ok({ ok: true });
});
