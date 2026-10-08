import { ApiError } from "./http";

// Injectable shape of supabase.rpc(): tests pass a fake.
export type RpcResult = {
  data: unknown;
  error: { message: string } | null;
};
export type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<RpcResult>;

export interface Deps {
  rpc: Rpc;
  randomSeed(): number; // uint32 from crypto in production
  // Table reads that have no RPC (service role, never exposed to clients).
  openRunId(playerId: string): Promise<string | null>;
  getRun(
    playerId: string,
    runId: string,
  ): Promise<{
    seed: number;
    hero: unknown;
    status: string;
    startedAt?: number; // ms epoch, set by the DB when the run opened
  } | null>;
  /** Runs this player banked in the last 24 h. */
  runsToday(playerId: string): Promise<number>;
}

// SQL errors arrive as the exception message == contract error code.
export class RpcError extends Error {}

export async function call<T = Record<string, unknown>>(
  rpc: Rpc,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new RpcError(error.message.trim());
  return data as T;
}

const KNOWN: Record<string, [number, string]> = {
  insufficient_coins: [409, "No te alcanzan las monedas."],
  conflict: [409, "Tu perfil cambió. Intenta de nuevo."],
  already_claimed: [409, "Ya reclamaste tu tirada gratis de hoy."],
  character_not_found: [404, "Personaje no encontrado."],
  not_owned: [404, "No tienes ese objeto."],
  max_stars: [409, "Ya tiene el máximo de estrellas."],
  insufficient_fragments: [409, "Te faltan fragmentos."],
  duplicate_run: [409, "Esta run ya fue entregada."],
  run_not_found: [404, "Run no encontrada."],
  run_open: [409, "Ya tienes una run abierta."],
  forbidden: [403, "No permitido."],
  player_not_found: [404, "Jugador no encontrado."],
  name_taken: [409, "Ese nombre ya existe."],
  invalid_args: [400, "Datos inválidos."],
  offer_not_found: [404, "Esa oferta ya no existe."],
  offer_closed: [409, "Esa oferta ya no está disponible."],
  own_offer: [409, "No puedes aceptar tu propia oferta."],
  already_offered: [409, "Ya tienes una oferta abierta de esa pieza."],
  too_many_offers: [409, "Tienes demasiadas ofertas abiertas."],
  invalid_name: [400, "Nombre inválido."],
  unfair_trade: [
    409,
    "El intercambio no es equivalente (hasta ±25% de diferencia de valor).",
  ],
  insufficient_parts: [409, "No tienes suficientes partes."],
  equipped: [409, "Esa pieza está equipada."],
  nothing_to_claim: [409, "No hay premios para reclamar."],
  already_rerolled: [409, "Ya cambiaste una misión en este periodo."],
  dungeon_locked: [409, "Ese dungeon todavía está bloqueado."],
  ascension_locked: [409, "Esa ascensión todavía está bloqueada."],
  level_locked: [409, "Ese nivel todavía está bloqueado."],
  only_hero: [409, "No puedes quemar a tu único héroe."],
  invalid_skill: [400, "Esa habilidad no es de esta clase."],
  skill_locked: [409, "Esa habilidad aún no está disponible para este héroe."],
  invalid_items: [400, "Datos inválidos."],
  rate_limited: [429, "Espera un momento."],
};

// Known contract codes -> friendly API error; unknown -> generic (rethrown).
export const mapRpcError = (e: unknown): never => {
  if (e instanceof RpcError && KNOWN[e.message]) {
    const [status, msg] = KNOWN[e.message];
    throw new ApiError(status, e.message, msg);
  }
  throw e;
};

// Per-key counter in Postgres (rate_limit_hit never throws for "denied").
export async function limit(
  rpc: Rpc,
  key: string,
  max: number,
  windowSec: number,
  message = "Espera un momento.",
): Promise<void> {
  const r = await call<{ allowed: boolean }>(rpc, "rate_limit_hit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSec,
  });
  if (!r.allowed)
    throw new ApiError(429, "rate_limited", message, {
      retryAfter: windowSec,
    });
}

export const audit = (
  rpc: Rpc,
  actor: string | null,
  event: string,
  detail: Record<string, unknown> = {},
) =>
  call(rpc, "log_audit", {
    p_actor: actor,
    p_event: event,
    p_detail: detail,
  }).catch(
    () => undefined, // auditing must never break the request
  );
