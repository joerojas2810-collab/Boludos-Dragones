// Calibrates the coop boss: npx tsx scripts/coop-sim.ts [rooms] [rank]
// Each simulated room has N players (2-7) with random nivelado heroes; every
// player plays the same bot (autoPolicy with guard) against the coop boss and the
// party wins when the summed damage reaches the pool. Tune COOP_K in lib/game/coop.ts.
import { autoPolicy } from "../src/lib/game/auto";
import { generateCharacter } from "../src/lib/game/characters";
import {
  bossUnit,
  coopNode,
  damageDealt,
  startCoop,
} from "../src/lib/game/coop";
import { normalizeHero } from "../src/lib/game/nivelado";
import type { RarityId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { step } from "../src/lib/game/combat";
import { newClimb } from "../src/lib/game/floorFights";

const ROOMS = Number(process.argv[2] ?? 200);
const RANK = (
  process.argv[3] === "null" ? null : (process.argv[3] ?? "f")
) as RarityId | null;
const POOLS = (process.env.POOLS ?? "0.8,1,1.2,1.4,1.7,2")
  .split(",")
  .map(Number);

function fight(seed: number, who: number): number {
  const hero = normalizeHero(
    generateCharacter(createRng(hashSeed(seed, who))),
    "nivelado",
  );
  const run = newClimb(seed, hero, RANK);
  const f = startCoop(run, coopNode(seed, RANK));
  let b = f.battle;
  for (let i = 0; i < 400 && b.status === "ongoing"; i++) {
    const p = autoPolicy(b, { guard: true });
    const n = step(b, p.action, f.rng, p.target);
    if (n === b) break;
    b = n;
  }
  return damageDealt(b);
}

for (let n = 2; n <= 7; n++) {
  const dmg: number[][] = [];
  let unit = 0;
  for (let r = 0; r < ROOMS; r++) {
    const seed = 1000 + r;
    unit = bossUnit(seed, RANK);
    dmg.push(Array.from({ length: n }, (_, i) => fight(seed, i) / unit));
  }
  const per = dmg.flat().reduce((a, b) => a + b, 0) / dmg.flat().length;
  const row = POOLS.map((p) => {
    const wins = dmg.filter(
      (d) => d.reduce((a, b) => a + b, 0) >= p * n,
    ).length;
    return `${p}:${((100 * wins) / ROOMS).toFixed(0)}%`;
  });
  console.log(
    `N=${n} avg dmg/player=${per.toFixed(2)} units | win by poolPerPlayer ${row.join("  ")}`,
  );
}

if (process.env.DIST) {
  const out: string[] = [];
  for (let r = 0; r < 24; r++) {
    const seed = 1000 + r;
    const u = bossUnit(seed, RANK);
    out.push(
      `${seed} ${coopNode(seed, RANK).enemies[0].classId}/${coopNode(seed, RANK).enemies[0].element}: ` +
        Array.from({ length: 6 }, (_, i) =>
          (fight(seed, i) / u).toFixed(1),
        ).join(" "),
    );
  }
  console.log(out.join("\n"));
}
