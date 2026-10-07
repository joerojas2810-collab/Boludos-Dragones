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
import { rollPiece } from "./gear";
import { grantPiece, type Profile } from "./profile";
import { createRng, hashSeed, type Rng } from "./rng";
import type { RunPiece } from "./loot";
import { MAX_STARS, RARITIES, RARITY_IDS, type RarityId } from "./rarity";
import { WEAPON_TYPE_DATA, weaponKey, type WeaponType } from "./weapons";

// Tune here (coins calibrated with scripts/forge-sim.ts against the 0017 economy: ~30k coins
// for an SSR piece by pure fusion, ~60% of what the gacha charges for an SSR copy).
// Merging N things of rank R into one of the next rank costs coins and 1 core.
export const COMBINE: Partial<
  Record<RarityId, { ratio: number; coins: number }>
> = {
  f: { ratio: 4, coins: 3 },
  e: { ratio: 4, coins: 5 },
  d: { ratio: 3, coins: 10 },
  c: { ratio: 3, coins: 20 },
  b: { ratio: 3, coins: 50 },
  a: { ratio: 2, coins: 130 },
  s: { ratio: 2, coins: 350 },
  ss: { ratio: 2, coins: 1000 },
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

// Randomness for new pieces' rolls. The caller (server) should pass a real rng; without one
// it is derived from the profile state, so the same input always gives the same piece.
const stateRng = (p: Profile, tag: number): Rng =>
  createRng(
    hashSeed(
      tag,
      p.coins,
      p.runsPlayed,
      p.weapons.length,
      Object.values(p.parts).reduce((a, b) => a + b, 0),
    ),
  );

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
  rng: Rng = stateRng(p, 1),
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
        ...rollPiece(rng, a.type, a.rank),
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
    `Fusionas ${rule.ratio} × ${partLabel(partKey(a.type, a.rank))} en 1 ${partLabel(partKey(a.type, next))} (es una parte: míralo en Héroes → Partes; para la pieza usa Armar).`,
  );
}

// Merge pieces: ratio different-element pieces of (type, rank) -> 1 piece of the next
// rank with one of their elements (+ 1 core of it + coins). Their stars are lost.
export function combinePieces(
  p: Profile,
  a: { ids: string[]; element: Element },
  rng: Rng = stateRng(p, 2),
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
        ...rollPiece(rng, first.type, next),
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

// ---------------------------------------------------------------- shortcuts
// Bulk operations: they simulate the single operations above on a copy of the
// profile and return ONE net diff, so the server persists them atomically.
interface Acc {
  p: Profile;
  diff: ForgeDiff;
  ops: number;
}
const startAcc = (p: Profile): Acc => ({
  p,
  ops: 0,
  diff: { coins: 0, spend: {}, gain: {}, grant: [], remove: [] },
});
function step(acc: Acc, r: ForgeResult): boolean {
  if (!r.ok) return false;
  acc.p = r.profile;
  acc.ops++;
  acc.diff.coins += r.diff.coins;
  acc.diff.spend = addParts(acc.diff.spend, r.diff.spend);
  acc.diff.gain = addParts(acc.diff.gain, r.diff.gain);
  acc.diff.grant.push(...r.diff.grant);
  acc.diff.remove.push(...r.diff.remove);
  return true;
}
// Parts both gained and spent in the same plan (intermediate ranks) cancel out.
function netDiff(d: ForgeDiff): ForgeDiff {
  const spend: Parts = {};
  const gain: Parts = {};
  for (const k of new Set([...Object.keys(d.spend), ...Object.keys(d.gain)])) {
    const n = (d.gain[k] ?? 0) - (d.spend[k] ?? 0);
    if (n > 0) gain[k] = n;
    else if (n < 0) spend[k] = -n;
  }
  return { ...d, spend, gain };
}
const finishBulk = (p: Profile, acc: Acc, what: string): ForgeResult => {
  if (acc.ops === 0) return fail(`No hay nada que ${what}.`);
  const d = netDiff(acc.diff);
  const cores = Object.entries(d.spend)
    .filter(([k]) => k.startsWith("core-"))
    .reduce((n, [, q]) => n + q, 0);
  const got = Object.entries(d.gain)
    .map(([k, q]) => `${q} × ${partLabel(k)}`)
    .join(", ");
  return finish(
    p,
    d,
    `${acc.ops} operaciones: gastas ${d.coins} monedas${cores ? ` y ${cores} núcleos` : ""}${got ? `; obtienes ${got}` : ""}${d.grant.length ? `; forjas ${d.grant.length} piezas` : ""}${d.remove.length ? `; desmontas ${d.remove.length} piezas` : ""}.`,
  );
};

const bestCore = (p: Profile): Element | null => {
  let best: Element | null = null;
  for (const e of Object.keys(ELEMENT_LABEL) as Element[])
    if ((p.parts[coreKey(e)] ?? 0) > (best ? (p.parts[coreKey(best)] ?? 0) : 0))
      best = e;
  return best;
};

// Merge every group of parts of `rank` it can afford (cores and coins permitting).
function mergeAllAt(acc: Acc, rank: RarityId) {
  for (const type of Object.keys(WEAPON_TYPE_DATA) as WeaponType[]) {
    for (let guard = 0; guard < 500; guard++) {
      const core = bestCore(acc.p);
      if (!core || !step(acc, combineParts(acc.p, { type, rank, core }))) break;
    }
  }
}

// Refine leftovers so the biggest stack reaches the next full merge group.
function refineAt(acc: Acc, rank: RarityId) {
  const rule = COMBINE[rank];
  if (!rule) return;
  for (let guard = 0; guard < 200; guard++) {
    const stacks = (Object.keys(WEAPON_TYPE_DATA) as WeaponType[])
      .map((t) => [t, acc.p.parts[partKey(t, rank)] ?? 0] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    if (stacks.length < 2) return;
    const [target, count] = stacks[0];
    if (count % rule.ratio === 0) return; // already a full group
    const donors = stacks.slice(1);
    if (donors.reduce((n, [, q]) => n + q, 0) < REFINE_RATIO) return;
    const spend: Parts = {};
    let need = REFINE_RATIO;
    for (const [t, q] of donors) {
      const take = Math.min(q, need);
      if (take > 0) spend[partKey(t, rank)] = take;
      need -= take;
      if (need === 0) break;
    }
    if (!step(acc, refine(acc.p, { spend, toType: target, rank }))) return;
  }
}

export function mergeAll(p: Profile, a: { rank: RarityId }): ForgeResult {
  const acc = startAcc(p);
  mergeAllAt(acc, a.rank);
  return finishBulk(p, acc, "fusionar");
}

// Merge rank by rank up to `maxRank` (optionally refining leftovers first).
export function chain(
  p: Profile,
  a: { maxRank: RarityId; refine: boolean },
): ForgeResult {
  const acc = startAcc(p);
  for (const r of RARITY_IDS.slice(0, rankIdx(a.maxRank))) {
    if (a.refine) refineAt(acc, r);
    mergeAllAt(acc, r);
  }
  return finishBulk(p, acc, "fusionar");
}

export function refineAll(p: Profile, a: { rank: RarityId }): ForgeResult {
  const acc = startAcc(p);
  refineAt(acc, a.rank);
  return finishBulk(p, acc, "refinar");
}

// Dismantle every unequipped piece of rank <= maxRank with <= maxStars stars.
export function dismantleLow(
  p: Profile,
  a: { maxRank: RarityId; maxStars: number },
): ForgeResult {
  const acc = startAcc(p);
  const worn = new Set(Object.values(p.equipped));
  const ids = p.weapons
    .filter(
      (w) =>
        !worn.has(w.id) &&
        rankIdx(w.rarity) <= rankIdx(a.maxRank) &&
        w.stars <= a.maxStars,
    )
    .slice(0, 60)
    .map((w) => w.id);
  for (const id of ids) step(acc, dismantle(acc.p, { id }));
  return finishBulk(p, acc, "desmontar");
}

// Craft the same piece until the materials or the stars run out.
export function craftMax(
  p: Profile,
  a: { type: WeaponType; element: Element; rank: RarityId },
  rng?: Rng,
): ForgeResult {
  const acc = startAcc(p);
  for (let i = 0; i <= MAX_STARS; i++)
    if (!step(acc, craft(acc.p, a, rng))) break;
  return finishBulk(p, acc, "forjar");
}

export interface ForgeReceipt {
  spent: string[]; // what the forge took
  got: string[]; // what came out (new piece / +1 star / parts)
}

/** Plain-language account of a diff against the profile it was applied to. */
export function forgeReceipt(before: Profile, d: ForgeDiff): ForgeReceipt {
  const spent: string[] = [];
  if (d.coins > 0) spent.push(`${d.coins} monedas`);
  for (const [k, n] of Object.entries(d.spend))
    spent.push(`${n} × ${partLabel(k)}`);
  for (const id of d.remove) {
    const w = before.weapons.find((x) => x.id === id);
    spent.push(
      w
        ? `${w.name} ${RARITIES[w.rarity].label}${w.stars ? ` (${w.stars}★)` : ""}`
        : id,
    );
  }
  const got = Object.entries(d.gain).map(([k, n]) => `${n} × ${partLabel(k)}`);
  const stars = new Map<string, number>(); // piece id -> stars after the grants
  const first = new Map<string, RunPiece>();
  for (const g of d.grant) {
    const id = weaponKey(g.type, g.element, g.rarity);
    const prev =
      stars.get(id) ?? before.weapons.find((w) => w.id === id)?.stars;
    stars.set(id, prev === undefined ? 0 : prev + 1);
    if (!first.has(id)) first.set(id, g);
  }
  for (const [id, g] of first) {
    const was = before.weapons.find((w) => w.id === id);
    const now = stars.get(id) ?? 0;
    const label = `${g.name} ${RARITIES[g.rarity].label}`;
    got.push(
      was
        ? `${label}: ya la tenías, ahora ${now}★ (+${now - was.stars} estrella)`
        : now > 0
          ? `${label} nueva con ${now}★`
          : `${label} (nueva)`,
    );
  }
  if (got.length === 0) got.push("nada");
  return { spent, got };
}

export type ForgeOp =
  | ({ op: "craft" } & Parameters<typeof craft>[1])
  | ({ op: "combineParts" } & Parameters<typeof combineParts>[1])
  | ({ op: "combinePieces" } & Parameters<typeof combinePieces>[1])
  | ({ op: "refine" } & Parameters<typeof refine>[1])
  | ({ op: "dismantle" } & Parameters<typeof dismantle>[1])
  | ({ op: "mergeAll" } & Parameters<typeof mergeAll>[1])
  | ({ op: "chain" } & Parameters<typeof chain>[1])
  | ({ op: "refineAll" } & Parameters<typeof refineAll>[1])
  | ({ op: "dismantleLow" } & Parameters<typeof dismantleLow>[1])
  | ({ op: "craftMax" } & Parameters<typeof craftMax>[1]);

export function applyForge(p: Profile, o: ForgeOp, rng?: Rng): ForgeResult {
  switch (o.op) {
    case "craft":
      return craft(p, o, rng);
    case "combineParts":
      return combineParts(p, o);
    case "combinePieces":
      return combinePieces(p, o, rng);
    case "refine":
      return refine(p, o);
    case "dismantle":
      return dismantle(p, o);
    case "mergeAll":
      return mergeAll(p, o);
    case "chain":
      return chain(p, o);
    case "refineAll":
      return refineAll(p, o);
    case "dismantleLow":
      return dismantleLow(p, o);
    case "craftMax":
      return craftMax(p, o, rng);
  }
}
