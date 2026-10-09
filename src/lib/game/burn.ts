// Burn (quemar): turn a piece into coins. The rate is far below the gacha price so
// burning back what you pulled can never profit (see burn.test.ts). Items saved before
// profile v5 are "legacy" and burn at a higher rate so old collections are not wiped for nothing.
import { TRADE_VALUE } from "./market";
import type { Profile } from "./profile";
import type { RarityId } from "./rarity";

export const BURN_RATE = 0.04;
export const LEGACY_BURN_RATE = 0.5;

export const burnValue = (rank: RarityId, legacy = false): number =>
  Math.floor(TRADE_VALUE[rank] * (legacy ? LEGACY_BURN_RATE : BURN_RATE));

// Remove the piece and add its coins. null when it does not exist or is equipped.
// Heroes are not burned: they grow (Forja > Héroes) or trade (market).
export function burn(
  p: Profile,
  id: string,
): { profile: Profile; coins: number } | null {
  const w = p.weapons.find((x) => x.id === id);
  if (!w || Object.values(p.equipped).includes(w.id)) return null;
  const coins = burnValue(w.rarity, w.legacy);
  return {
    coins,
    profile: { ...p, coins: p.coins + coins, weapons: p.weapons.filter((x) => x.id !== w.id) },
  };
}

export const BURN_MANY_MAX = 100;

// Burns every id it can (equipped pieces are skipped, never an error).
export function burnMany(
  p: Profile,
  ids: string[],
): { profile: Profile; coins: number; count: number } {
  let cur = p;
  let coins = 0;
  let count = 0;
  for (const id of ids.slice(0, BURN_MANY_MAX)) {
    const r = burn(cur, id);
    if (!r) continue;
    cur = r.profile;
    coins += r.coins;
    count++;
  }
  return { profile: cur, coins, count };
}
