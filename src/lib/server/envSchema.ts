import { z } from "zod";

// Fail fast with a readable message. Secrets never get a NEXT_PUBLIC_ prefix.
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  PIN_PEPPER: z.string().min(32, "PIN_PEPPER: mínimo 32 caracteres aleatorios"),
  HOUSE_CODE: z.string().min(6, "HOUSE_CODE: mínimo 6 caracteres"),
  ADMIN_NAME: z.string().min(3),
});
export type ServerEnv = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, string | undefined>): ServerEnv {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const bad = r.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Configuración del servidor inválida (${bad})`);
  }
  return r.data;
}
