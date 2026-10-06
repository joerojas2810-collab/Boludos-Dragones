import type { ZodType } from "zod";

// Uniform JSON API: { error: { code, message } } with Spanish, internals-free text.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const NO_STORE = { "Cache-Control": "no-store" };
export const ok = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers as object) },
  });
export const errorResponse = (e: ApiError) =>
  Response.json(
    { error: { code: e.code, message: e.message, ...e.extra } },
    {
      status: e.status,
      headers: {
        ...NO_STORE,
        ...(e.status === 429 && typeof e.extra.retryAfter === "number"
          ? { "Retry-After": String(e.extra.retryAfter) }
          : {}),
      },
    },
  );

export const E = {
  unauthorized: () => new ApiError(401, "unauthorized", "Inicia sesión."),
  forbidden: () => new ApiError(403, "forbidden", "No permitido."),
  badInput: () => new ApiError(400, "invalid_input", "Datos inválidos."),
  tooLarge: () => new ApiError(413, "too_large", "Petición demasiado grande."),
  rateLimited: (retryAfter = 30) =>
    new ApiError(429, "rate_limited", "Espera un momento.", { retryAfter }),
};

export const MAX_BODY_DEFAULT = 8 * 1024;
export const MAX_BODY_RUN = 200 * 1024;

// Reads at most `max` bytes (checks Content-Length and the real stream).
export async function readJson<T>(
  req: Request,
  schema: ZodType<T>,
  max = MAX_BODY_DEFAULT,
): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) throw E.tooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw E.badInput();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel();
      throw E.tooLarge();
    }
    chunks.push(value);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw E.badInput();
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw E.badInput();
  return r.data;
}

// CSRF: state-changing requests must come from our own origin (Origin host
// == Host). No CORS headers are ever sent, so cross-site fetches cannot read.
export function checkOrigin(req: Request): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  try {
    ok = !!origin && !!host && new URL(origin).host === host;
  } catch {
    ok = false;
  }
  if (!ok) throw E.forbidden();
}

export const clientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

// Wraps a handler: origin check, ApiError -> JSON, anything else -> generic 500.
export function route(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      checkOrigin(req);
      return await fn(req);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e);
      console.error("api error", e instanceof Error ? e.name : "unknown");
      return errorResponse(
        new ApiError(500, "server_error", "Algo salió mal. Intenta de nuevo."),
      );
    }
  };
}
