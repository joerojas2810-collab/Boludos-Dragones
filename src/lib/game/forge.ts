// The forge (docs/DUNGEONS_FORJA.md): turn parts into gear, merge parts or gear
// into a higher rank, re-type parts and dismantle gear. Pure functions over the
// Profile; the server runs the same code and persists the diff atomically.
import type { Element } from "./elements";
import { ELEMENT_LABEL } from "./elements";
import {
  addParts,
  coreKey,
  MAX_STACK,
  partKey,
  parsePartKey,
  partLabel,
  type Parts,
} from "./parts";
import { grantPiece, type Profile } from "./profile";
import type { RunPiece } from "./loot";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { WEAPON_TYPE_DATA, weaponKey, type WeaponType } from "./weapons";

// Tune here (coins calibrated with scripts/forge-sim.ts: ~3-4 weeks of regular
// play of coins for an SSR piece by pure fusion, at ~700 coins per dungeon run).
// Merging N things of rank R into one of the next rank costs coins and 1 core.
export const COMBINE: Partial<
  Record<RarityId, { ratio: number; coins: number }>
> = {
  f: { ratio: 4, coins: 5 },
  e: { ratio: 4, coins: 10 },
  d: { ratio: 3, coins: 20 },
  c: { ratio: 3, coins: 50 },
  b: { ratio: 3, coins: 150 },
  a: { ratio: 2, coins: 450 },
  s: { ratio: 2, coins: 1400 },
  ss: { ratio: 2, coins: 4200 },
};
export const CRAFT_PARTS = 3; // parts of the type (same rank) + 1 core of the element
export const REFINE_RATIO = 3; // any 3 parts of a rank -> 1 part of the type you choose
export const DISMANTLE_PARTS = 2; // + 1 per star

const rankIdx = (r: RarityId) => RARITY_IDS.indexOf(r);
const prevRank = (r: RarityId): RarityId | null =>
  RARITY_IDS[rankIdx(r) - 1] ?? null;
const nextRank = (r: RarityId): RarityId | null =>
  RARITY_IDS[rankIdx(r) + 1] ?? null;

// Crafting a piece costs half of what merging INTO that rank costs (F: 3).
export const craftCoins = (rank: RarityId) => {
  const prev = prevRank(rank);
  return prev ? Math.max(3, Math.round(COMBINE[prev]!.coins / 2)) : 3;
};
export const refineCoins = (rank: RarityId) => Math.round(craftCoins(rank) / 2);

export interface ForgeDiff {
  coins: number; // coins spent (>= 0)
  spend: Parts; // parts/cores consumed
  gain: Parts; // parts gained
  grant: RunPiece[]; // pieces gained (new or +1 star)
  remove: string[]; // piece ids consumed
}
export type ForgeResult =
  | { ok: true; profile: Profile; diff: ForgeDiff; text: string }
  | { ok: false; error: string };

const fail = (error: string): ForgeResult => ({ ok: false, error });

const pieceName = (type: WeaponType, element: Element) =>
  `${WEAPON_TYPE_DATA[type].noun} de ${ELEMENT_LABEL[element]}`;

function takeParts(p: Profile, spend: Parts): Profile | null {
  const parts = { ...p.parts };
  for (const [k, n] of Object.entries(spend)) {
    if ((parts[k] ?? 0) < n) return null;
    parts[k] -= n;
    if (parts[k] === 0) delete parts[k];
  }
  return { ...p, parts };
}

const finish = (p: Profile, diff: ForgeDiff, text: string): ForgeResult => {
  if (p.coins < diff.coins)
    return fail(`Te faltan ${diff.coins - p.coins} monedas.`);
  const spent = takeParts({ ...p, coins: p.coins - diff.coins }, diff.spend);
  if (!spent) return fail("No tienes suficientes partes.");
  let out: Profile = {
    ...spent,
    parts: addParts(spent.parts, diff.gain),
    weapons: spent.weapons.filter((w) => !diff.remove.includes(w.id)),
  };
  for (const g of diff.grant) out = grantPiece(out, g);
  return { ok: true, profile: out, diff, text };
};

const owned = (
  p: Profile,
  type: WeaponType,
  element: Element,
  rank: RarityId,
) => p.weapons.find((w) => w.id === weaponKey(type, element, rank));

// Arm a piece: CRAFT_PARTS parts of the type + 1 core of the element + coins.
export function craft(
  p: Profile,
  a: { type: WeaponType; element: Element; rank: RarityId },
): ForgeResult {
  const have = owned(p, a.type, a.element, a.rank);
  if (have && have.stars >= MAX_STARS)
    return fail("Ya tienes esa pieza con el máximo de estrellas.");
  const diff: ForgeDiff = {
    coins: craftCoins(a.rank),
    spend: { [partKey(a.type, a.rank)]: CRAFT_PARTS, [coreKey(a.element)]: 1 },
    gain: {},
    grant: [
      {
        type: a.type,
        element: a.element,
        rarity: a.rank,
        name: pieceName(a.type, a.element),
      },
    ],
    remove: [],
  };
  return finish(
    p,
    diff,
    `Forjas ${pieceName(a.type, a.element)} ${RARITIES[a.rank].label}${have ? " (+1 estrella)" : ""}.`,
  );
}

// Merge parts: ratio parts of (type, rank) + 1 core + coins -> 1 part of the next rank.
export function combineParts(
  p: Profile,
  a: { type: WeaponType; rank: RarityId; core: Element },
): ForgeResult {
  const rule = COMBINE[a.rank];
  const next = nextRank(a.rank);
  if (!rule || !next) return fail("Ese rango ya no se puede fusionar.");
  const diff: ForgeDiff = {
    coins: rule.coins,
    spend: { [partKey(a.type, a.rank)]: rule.ratio, [coreKey(a.core)]: 1 },
    gain: { [partKey(a.type, next)]: 1 },
    grant: [],
    remove: [],
  };
  return finish(
    p,
    diff,
    `Fusionas ${rule.ratio} × ${partLabel(partKey(a.type, a.rank))} en 1 ${partLabel(partKey(a.type, next))}.`,
  );
}

// Merge pieces: ratio different-element pieces of (type, rank) -> 1 piece of the next
// rank with one of their elements (+ 1 core of it + coins). Their stars are lost.
export function combinePieces(
  p: Profile,
  a: { ids: string[]; element: Element },
): ForgeResult {
  const ids = Array.from(new Set(a.ids));
  const items = ids.map((id) => p.weapons.find((w) => w.id === id));
  if (items.some((w) => !w)) return fail("Una de las piezas no es tuya.");
  const ws = items as NonNullable<(typeof items)[number]>[];
  const first = ws[0];
  if (
    !first ||
    ws.some((w) => w.type !== first.type || w.rarity !== first.rarity)
  )
    return fail("Las piezas deben ser del mismo tipo y rango.");
  const rule = COMBINE[first.rarity];
  const next = nextRank(first.rarity);
  if (!rule || !next) return fail("Ese rango ya no se puede fusionar.");
  if (ws.length !== rule.ratio)
    return fail(
      `Necesitas exactamente ${rule.ratio} piezas (de distinto elemento).`,
    );
  if (!ws.some((w) => w.element === a.element))
    return fail("El elemento resultante debe ser el de una de las piezas.");
  if (ws.some((w) => Object.values(p.equipped).includes(w.id)))
    return fail("Una de las piezas está equipada.");
  const have = owned(p, first.type, a.element, next);
  if (have && have.stars >= MAX_STARS)
    return fail("Ya tienes esa pieza con el máximo de estrellas.");
  const diff: ForgeDiff = {
    coins: rule.coins,
    spend: { [coreKey(a.element)]: 1 },
    gain: {},
    grant: [
      {
        type: first.type,
        element: a.element,
        rarity: next,
        name: pieceName(first.type, a.element),
      },
    ],
    remove: ws.map((w) => w.id),
  };
  return finish(
    p,
    diff,
    `Fusionas ${rule.ratio} piezas en ${pieceName(first.type, a.element)} ${RARITIES[next].label}.`,
  );
}

// Re-type: REFINE_RATIO parts of any type (all of the same rank) -> 1 part of `toType`.
export function refine(
  p: Profile,
  a: { spend: Parts; toType: WeaponType; rank: RarityId },
): ForgeResult {
  let total = 0;
  for (const [k, n] of Object.entries(a.spend)) {
    const i = parsePartKey(k);
    if (
      i?.kind !== "part" ||
      i.rank !== a.rank ||
      !Number.isInteger(n) ||
      n < 1
    )
      return fail("Solo partes del mismo rango.");
    total += n;
  }
  if (total !== REFINE_RATIO)
    return fail(`Necesitas exactamente ${REFINE_RATIO} partes.`);
  const diff: ForgeDiff = {
    coins: refineCoins(a.rank),
    spend: a.spend,
    gain: { [partKey(a.toType, a.rank)]: 1 },
    grant: [],
    remove: [],
  };
  return finish(
    p,
    diff,
    `Refinas ${REFINE_RATIO} partes en 1 ${partLabel(partKey(a.toType, a.rank))}.`,
  );
}

// Dismantle an unequipped piece into parts of its type and rank.
export function dismantle(p: Profile, a: { id: string }): ForgeResult {
  const w = p.weapons.find((x) => x.id === a.id);
  if (!w) return fail("Esa pieza no es tuya.");
  if (Object.values(p.equipped).includes(w.id))
    return fail("La pieza está equipada.");
  const n = DISMANTLE_PARTS + w.stars;
  const diff: ForgeDiff = {
    coins: 0,
    spend: {},
    gain: { [partKey(w.type, w.rarity)]: Math.min(n, MAX_STACK) },
    grant: [],
    remove: [w.id],
  };
  return finish(
    p,
    diff,
    `Desmontas ${w.name} y recibes ${n} × ${partLabel(partKey(w.type, w.rarity))}.`,
  );
}

export type ForgeOp =
  | ({ op: "craft" } & Parameters<typeof craft>[1])
  | ({ op: "combineParts" } & Parameters<typeof combineParts>[1])
  | ({ op: "combinePieces" } & Parameters<typeof combinePieces>[1])
  | ({ op: "refine" } & Parameters<typeof refine>[1])
  | ({ op: "dismantle" } & Parameters<typeof dismantle>[1]);

export function applyForge(p: Profile, o: ForgeOp): ForgeResult {
  switch (o.op) {
    case "craft":
      return craft(p, o);
    case "combineParts":
      return combineParts(p, o);
    case "combinePieces":
      return combinePieces(p, o);
    case "refine":
      return refine(p, o);
    case "dismantle":
      return dismantle(p, o);
  }
}
