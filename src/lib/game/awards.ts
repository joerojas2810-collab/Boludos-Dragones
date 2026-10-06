// End-of-night surprise awards (pure). Works with 2 to 7 players, never gives
// the same player two awards while another qualifying player is available.
// Fields marked optional are not stored by the server yet (see docs/SALAS.md);
// awards that need them are skipped when the data is missing.

import { ROOM_K } from "./room";

export interface AwardInput {
  id: string;
  chips: number;
  maxFloor: number;
  wins: number;
  losses: number;
  betNet: number; // chips won (+) or lost (-) betting
  interferences: number; // interferences this player CAST
  interfered?: number; // interferences received (pending: server)
  deaths?: number; // times eliminated/lives lost (pending: server)
  braveWins?: number; // wins with low HP (pending: server)
  betsLost?: number; // bets lost (pending: server)
}

export type AwardId =
  | "apostador"
  | "mecenas"
  | "saboteador"
  | "interferido"
  | "gafe"
  | "murio"
  | "valiente"
  | "apuestas_perdidas"
  | "invicto"
  | "escalador"
  | "rey";

export interface AwardResult {
  id: AwardId;
  player: string;
  value: number;
}

/** Order = priority when two awards want the same player. */
const DEFS: { id: AwardId; score: (p: AwardInput) => number | null }[] = [
  { id: "apostador", score: (p) => (p.betNet > 0 ? p.betNet : null) },
  { id: "mecenas", score: (p) => (p.betNet < 0 ? -p.betNet : null) },
  { id: "saboteador", score: (p) => (p.interferences > 0 ? p.interferences : null) },
  { id: "interferido", score: (p) => (p.interfered ? p.interfered : null) },
  { id: "valiente", score: (p) => (p.braveWins ? p.braveWins : null) },
  { id: "murio", score: (p) => (p.deaths ? p.deaths : null) },
  { id: "apuestas_perdidas", score: (p) => (p.betsLost ? p.betsLost : null) },
  { id: "gafe", score: (p) => (p.losses > 0 ? p.losses : null) },
  { id: "invicto", score: (p) => (p.wins > 0 && p.losses === 0 ? p.wins : null) },
  { id: "escalador", score: (p) => (p.maxFloor > 0 ? p.maxFloor : null) },
  { id: "rey", score: (p) => (p.chips > 0 ? p.chips : null) },
];

export function computeAwards(players: readonly AwardInput[]): AwardResult[] {
  const out: AwardResult[] = [];
  const taken = new Map<string, number>();
  for (const def of DEFS) {
    const cands = players
      .map((p) => ({ id: p.id, v: def.score(p) }))
      .filter((c): c is { id: string; v: number } => c.v !== null)
      .sort(
        (a, b) =>
          (taken.get(a.id) ?? 0) - (taken.get(b.id) ?? 0) ||
          b.v - a.v ||
          (a.id < b.id ? -1 : 1),
      );
    // Fewest awards first: a repeat happens only when no other player qualifies.
    const pick = cands[0];
    if (!pick || (taken.get(pick.id) ?? 0) >= ROOM_K.maxAwardsPerPlayer) continue;
    taken.set(pick.id, (taken.get(pick.id) ?? 0) + 1);
    out.push({ id: def.id, player: pick.id, value: pick.v });
  }
  return out;
}

export const AWARD_INFO: Record<AwardId, { title: string; blurb: (v: number) => string }> = {
  apostador: { title: "El Oráculo", blurb: (v) => `Adivinó la noche entera: +${v} fichas apostando.` },
  mecenas: { title: "El Mecenas", blurb: (v) => `Regaló ${v} fichas a sus amigos en apuestas.` },
  saboteador: { title: "El Saboteador", blurb: (v) => `${v} zancadillas lanzadas. Sin remordimientos.` },
  interferido: { title: "El Blanco Favorito", blurb: (v) => `Le interfirieron ${v} veces. Algo habrá hecho.` },
  valiente: { title: "El Valiente", blurb: (v) => `${v} victorias con un hilo de vida.` },
  murio: { title: "El Mártir", blurb: (v) => `Murió ${v} veces. Siempre con estilo.` },
  apuestas_perdidas: { title: "El Gafe de las Apuestas", blurb: (v) => `${v} apuestas perdidas. Que no apueste por ti.` },
  gafe: { title: "El Gafe", blurb: (v) => `${v} derrotas. La suerte lo evita.` },
  invicto: { title: "El Intocable", blurb: (v) => `${v} victorias y ni un rasguño de derrota.` },
  escalador: { title: "El Escalador", blurb: (v) => `Llegó hasta el piso ${v}.` },
  rey: { title: "El Rey de las Fichas", blurb: (v) => `Cierra la noche con ${v} fichas.` },
};
