// Usage: npx tsx scripts/gacha-sim.ts [players=20000] [pulls=300]
import { createRng, hashSeed } from "../src/lib/game/rng";
import { RARITY_IDS } from "../src/lib/game/rarity";
import {
  createProfile,
  PULL_COST_CHARACTER,
  pullCharacter,
  pullWeapon,
  type Profile,
} from "../src/lib/game/profile";

const N = Number(process.argv[2] ?? 20000);
const P = Number(process.argv[3] ?? 300);
const CHECK = [100, 300].filter((c) => c <= P);

for (const banner of ["character", "weapon"] as const) {
  const dist: Record<string, number> = {};
  let total = 0;
  let firstLegSum = 0;
  let firstLegN = 0;
  let refunds = 0;
  let refundCount = 0;
  const five: Record<number, number> = {};
  const owned: Record<number, number> = {};
  for (let i = 0; i < N; i++) {
    const rng = createRng(hashSeed(i, banner === "weapon" ? 1 : 0));
    let p: Profile = { ...createProfile(), coins: 1e9 };
    let first = 0;
    for (let n = 1; n <= P; n++) {
      const r = (banner === "weapon" ? pullWeapon : pullCharacter)(p, rng)!;
      p = r.profile;
      const res = r.results[0];
      dist[res.rarity] = (dist[res.rarity] ?? 0) + 1;
      total++;
      refunds += res.refund;
      if (res.status === "refund") refundCount++;
      if (!first && res.rarity === "s") first = n;
      if (CHECK.includes(n)) {
        const items = banner === "weapon" ? p.weapons : p.characters;
        owned[n] = (owned[n] ?? 0) + items.length;
        if (items.some((x) => x.rarity === "s" && x.stars === 5))
          five[n] = (five[n] ?? 0) + 1;
      }
    }
    if (first) {
      firstLegSum += first;
      firstLegN++;
    }
  }
  console.log(`\n== banner ${banner}: ${N} players x ${P} pulls ==`);
  console.log(
    RARITY_IDS.map(
      (r) => `${r} ${(((dist[r] ?? 0) / total) * 100).toFixed(2)}%`,
    ).join(" | "),
  );
  console.log(
    `avg pulls to first Legendario: ${(firstLegSum / firstLegN).toFixed(1)}`,
  );
  for (const c of CHECK)
    console.log(
      `after ${c} pulls: ${(((five[c] ?? 0) / N) * 100).toFixed(1)}% have a 5-star Legendario | avg unique items ${((owned[c] ?? 0) / N).toFixed(1)} | cost ${c * PULL_COST_CHARACTER} coins`,
    );
  console.log(
    `avg refunds per ${P} pulls: ${(refundCount / N).toFixed(2)} (${(refunds / N).toFixed(0)} coins)`,
  );
}
