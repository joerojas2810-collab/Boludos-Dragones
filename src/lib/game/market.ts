import { CLASS_IDS, CLASSES } from "./characters";
import { ELEMENTS, ELEMENT_LABEL, type Element } from "./elements";
import type { Profile } from "./profile";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { WEAPON_TYPES, WEAPON_TYPE_DATA } from "./weapons";

// Keep in sync with game_constants market_max_open / market_ttl_days (migration 0009).
export const MARKET_MAX_OPEN = 5;
export const MARKET_TTL_DAYS = 7;

// Trades must be EQUIVALENT in value (+-25%). A piece is worth the coins a gacha
// pull of its rank costs (250 / odds). Keep in sync with trade_value() in
// supabase/migrations/0017_economy.sql.
export const TRADE_VALUE: Record<RarityId, number> = {
  f: 830,
  e: 1140,
  d: 1560,
  c: 2080,
  b: 2780,
  a: 4170,
  s: 8330,
  ss: 16670,
  ssr: 50000,
};
export const TRADE_TOLERANCE = 0.25;
export const MAX_TRADE_COINS = 100000;

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
  want: string | null; // null = sale for coins
  coins: number; // > 0: the acceptor pays the seller; < 0: the seller pays the acceptor
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

export const tradeValue = (key: string | null): number => {
  const p = key ? parsePieceKey(key) : null;
  return p ? TRADE_VALUE[p.rarity] : 0;
};

// Coins that make the trade exactly even, and the range that is still allowed.
export function tradeBand(give: string, want: string | null) {
  const v = tradeValue(give);
  const base = v - tradeValue(want);
  return {
    fair: base,
    min: Math.ceil(base - v * TRADE_TOLERANCE),
    max: Math.floor(base + v * TRADE_TOLERANCE),
  };
}

export const isFairTrade = (give: string, want: string | null, coins: number) =>
  Math.abs(tradeValue(give) - (tradeValue(want) + coins)) <=
  tradeValue(give) * TRADE_TOLERANCE;

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
  if (offer.coins > 0 && p.coins < offer.coins)
    return `Te faltan ${offer.coins - p.coins} monedas.`;
  return null;
}
