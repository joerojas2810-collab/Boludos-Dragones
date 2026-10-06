import "server-only";
import { parseEnv, type ServerEnv } from "./envSchema";
import { ApiError } from "./http";

let cached: ServerEnv | null = null;
// Fail fast: the readable reason goes to the server log, clients only see 503.
export function env(): ServerEnv {
  if (cached) return cached;
  try {
    return (cached = parseEnv(process.env));
  } catch (e) {
    console.error(e instanceof Error ? e.message : "env invalid");
    throw new ApiError(
      503,
      "not_configured",
      "El servidor no está configurado.",
    );
  }
}
