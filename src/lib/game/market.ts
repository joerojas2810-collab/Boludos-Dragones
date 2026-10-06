import { CLASS_IDS, CLASSES } from "./characters";
import { ELEMENTS, ELEMENT_LABEL, type Element } from "./elements";
import type { Profile } from "./profile";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { WEAPON_TYPES, WEAPON_TYPE_DATA } from "./weapons";

// Keep in sync with game_constants market_max_open / market_ttl_days (migration 0009).
export const MARKET_MAX_OPEN = 5;
export const MARKET_TTL_DAYS = 7;

export type PieceKind = "character" | "weapon";
export interface PieceRef {
  kind: PieceKind;
  base: string; // class id or weapon type
  element: Element;
  rarity: RarityId;
}
export interface MarketOffer {
  id: string;
  sellerId: string;
  seller: string;
  kind: PieceKind;
  give: string;
  want: string | null; // null = gift
  expiresAt: string;
}

const alt = (a: readonly string[]) => a.join("|");
const KEY_RE = new RegExp(
  `^(c|w)-(${alt([...CLASS_IDS, ...WEAPON_TYPES])})-(${alt(ELEMENTS)})-(${alt(RARITY_IDS)})$`,
);

// Parses a piece key ("c-mago-fuego-raro" / "w-espada-rayo-epico"); null if malformed
// or the base does not belong to the kind.
export function parsePieceKey(key: string): PieceRef | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const kind: PieceKind = m[1] === "c" ? "character" : "weapon";
  const ok = (kind === "character" ? CLASS_IDS : WEAPON_TYPES).some(
    (b) => b === m[2],
  );
  return ok
    ? {
        kind,
        base: m[2],
        element: m[3] as Element,
        rarity: m[4] as RarityId,
      }
    : null;
}

export const isPieceKey = (kind: PieceKind, key: string) =>
  parsePieceKey(key)?.kind === kind;

export function pieceLabel(key: string): string {
  const p = parsePieceKey(key);
  if (!p) return key;
  const base =
    p.kind === "character"
      ? CLASSES[p.base as keyof typeof CLASSES].name
      : WEAPON_TYPE_DATA[p.base as keyof typeof WEAPON_TYPE_DATA].label;
  return `${base} ${ELEMENT_LABEL[p.element]} ${RARITIES[p.rarity].label}`;
}

const starsOf = (p: Profile, kind: PieceKind, key: string): number | null =>
  (kind === "character" ? p.characters : p.weapons).find((x) => x.id === key)
    ?.stars ?? null;

// Repeated pieces (stars >= 1) are the only ones that can be offered or given.
export const spareKeys = (p: Profile, kind: PieceKind): string[] =>
  (kind === "character" ? p.characters : p.weapons)
    .filter((x) => x.stars >= 1)
    .map((x) => x.id);

// Why `me` cannot accept the offer (Spanish), or null if it looks acceptable.
// Informative only: the server re-checks everything.
export function acceptBlock(
  p: Profile,
  offer: MarketOffer,
  isMine: boolean,
): string | null {
  if (isMine) return "Es tu oferta.";
  if ((starsOf(p, offer.kind, offer.give) ?? -1) >= MAX_STARS)
    return "Ya tienes el máximo de estrellas de esa pieza.";
  if (offer.want && (starsOf(p, offer.kind, offer.want) ?? 0) < 1)
    return "No tienes repetida la pieza que piden.";
  return null;
}
