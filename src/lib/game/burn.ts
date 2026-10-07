// Burn (quemar): turn a piece or hero into coins. The rate is far below the gacha price so
// burning back what you pulled can never profit (see burn.test.ts). Items saved before
// profile v5 are "legacy" and burn at a higher rate so old collections are not wiped for nothing.
import { TRADE_VALUE } from "./market";
import type { Profile } from "./profile";
import type { RarityId } from "./rarity";

export const BURN_RATE = 0.08;
export const LEGACY_BURN_RATE = 0.5;

export const burnValue = (rank: RarityId, legacy = false): number =>
  Math.floor(TRADE_VALUE[rank] * (legacy ? LEGACY_BURN_RATE : BURN_RATE));

export type BurnTarget = { kind: "hero" | "piece"; id: string };

// Remove the item and add its coins. null when it does not exist, a piece is equipped, or
// it is the only hero. Burning a hero unequips its gear (the pieces stay in the collection).
export function burn(
  p: Profile,
  t: BurnTarget,
): { profile: Profile; coins: number } | null {
  if (t.kind === "piece") {
    const w = p.weapons.find((x) => x.id === t.id);
    if (!w || Object.values(p.equipped).includes(w.id)) return null;
    const coins = burnValue(w.rarity, w.legacy);
    return {
      coins,
      profile: {
        ...p,
        coins: p.coins + coins,
        weapons: p.weapons.filter((x) => x.id !== w.id),
      },
    };
  }
  const c = p.characters.find((x) => x.id === t.id);
  if (!c || p.characters.length <= 1) return null;
  const coins = burnValue(c.rarity, c.legacy);
  const equipped = Object.fromEntries(
    Object.entries(p.equipped).filter(([k]) => k.split("|")[0] !== c.id),
  );
  return {
    coins,
    profile: {
      ...p,
      coins: p.coins + coins,
      characters: p.characters.filter((x) => x.id !== c.id),
      equipped,
    },
  };
}
