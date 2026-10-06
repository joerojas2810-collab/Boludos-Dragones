import { derivePassword, syntheticEmail } from "./credentials";
import { ApiError } from "./http";
import { call, type Rpc } from "./rpc";
import { nameKeyOf } from "./validators";

export const BAD_CREDENTIALS = "Nombre o PIN incorrecto";

export interface LoginCtx {
  rpc: Rpc;
  // Real impl: supabase.auth.signInWithPassword (sets the cookie session).
  signIn(email: string, password: string): Promise<boolean>;
  pepper: string;
  adminName: string;
}

interface Check {
  allowed: boolean;
  reason: "ok" | "wait" | "locked" | "ip_limited";
  retry_after: number;
}

// Every failure (unknown name, wrong PIN) is the same 401 + same work done
// (HMAC + sign-in attempt + counter). Limits are checked BEFORE the PIN.
export async function login(
  c: LoginCtx,
  nameKey: string,
  pin: string,
  ip: string,
): Promise<void> {
  const chk = await call<Check>(c.rpc, "auth_check", {
    p_name_key: nameKey,
    p_ip: ip,
  });
  if (!chk.allowed) {
    if (chk.reason === "locked")
      throw new ApiError(
        429,
        "locked",
        `Cuenta bloqueada. Pídele a ${c.adminName} que reinicie tu PIN.`,
      );
    throw new ApiError(429, "rate_limited", "Espera un momento.", {
      retryAfter: chk.retry_after,
    });
  }
  const password = derivePassword(c.pepper, nameKey, pin);
  const good = await c.signIn(syntheticEmail(nameKey), password);
  if (!good) {
    await call(c.rpc, "auth_fail", { p_name_key: nameKey, p_ip: ip });
    throw new ApiError(401, "bad_credentials", BAD_CREDENTIALS);
  }
  await call(c.rpc, "auth_success", { p_name_key: nameKey, p_ip: ip });
}

export const isAdminName = (name: string, adminName: string) =>
  nameKeyOf(name) === nameKeyOf(adminName);
