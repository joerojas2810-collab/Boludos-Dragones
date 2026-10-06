import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC-SHA256(pepper, "bd1:<name_key>:<pin>") as hex (64 chars: fits bcrypt's
// 72 bytes and Supabase's minimum password length). The PIN only exists in
// server memory; the pepper never touches the database.
export const derivePassword = (
  pepper: string,
  nameKey: string,
  pin: string,
): string =>
  createHmac("sha256", pepper).update(`bd1:${nameKey}:${pin}`).digest("hex");

export const syntheticEmail = (nameKey: string) => `${nameKey}@players.invalid`;

export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb); // equal-length digests: no length leak
}
