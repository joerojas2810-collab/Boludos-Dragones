import type { MarketOffer, PieceKind } from "./game/market";
import type { Profile } from "./game/profile";
import { replaceProfile } from "./useProfile";

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Sin conexión con el servidor.");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      (json as { error?: { message?: string } } | null)?.error?.message ??
        "Algo salió mal. Intenta de nuevo.",
    );
  return json as T;
}

export const listOffers = async () =>
  (await api<{ offers: MarketOffer[] }>("/api/market")).offers;
export const createOffer = (
  kind: PieceKind,
  give: string,
  want: string | null,
  coins = 0,
) => api("/api/market/offer", { kind, give, want, coins });
export const cancelOffer = (offerId: string) =>
  api("/api/market/cancel", { offerId });
export const acceptOffer = async (offerId: string) =>
  replaceProfile(
    (await api<{ profile: Profile }>("/api/market/accept", { offerId }))
      .profile,
  );
