// Balanced-mode duel matrix: win rate of row class vs column class (same element).
//   npx tsx scripts/duel-sim.ts [duels=400]
// Policies: "mix" = weighted random; "greedy" = always the strongest ready move.
import { CLASS_IDS, type ClassId } from "../src/lib/game/characters";
import type { Action } from "../src/lib/game/combat";
import { balancedHero, canAct, duelRound, startDuel, type Duel } from "../src/lib/game/duel";
import { createRng, type Rng } from "../src/lib/game/rng";

const N = Number(process.argv[2] ?? 400);
type Policy = (d: Duel, side: "a" | "b", rng: Rng) => Action;
const mix: Policy = (d, side, rng) => {
  const c = d[side];
  const r = rng.next();
  if (r < 0.15) return "defend";
  if (r < 0.4 && canAct(c, "attack2")) return "attack2";
  if (r < 0.65 && canAct(c, "attack3")) return "attack3";
  return "attack1";
};
const greedy: Policy = (d, side) => {
  const c = d[side];
  return canAct(c, "attack3") ? "attack3" : canAct(c, "attack2") ? "attack2" : "attack1";
};

function winRate(a: ClassId, b: ClassId, pol: Policy): number {
  let w = 0;
  for (let i = 0; i < N; i++) {
    const rng = createRng(i + 1);
    let d = startDuel(balancedHero(a, "fuego"), balancedHero(b, "fuego"));
    for (let k = 0; k < 200 && d.status === "ongoing"; k++)
      d = duelRound(d, pol(d, "a", rng), pol(d, "b", rng), rng);
    w += d.status === "a" ? 1 : d.status === "draw" ? 0.5 : 0;
  }
  return (100 * w) / N;
}

for (const [name, pol] of [["mix", mix], ["greedy", greedy]] as const) {
  console.log(`\n${name} (row wins %)`);
  console.log("            " + CLASS_IDS.map((c) => c.padEnd(10)).join(""));
  const avg: Record<string, number> = {};
  for (const a of CLASS_IDS) {
    const row = CLASS_IDS.map((b) => winRate(a, b, pol));
    avg[a] = row.reduce((x, y) => x + y, 0) / row.length;
    console.log(a.padEnd(12) + row.map((v) => v.toFixed(1).padEnd(10)).join("") + `avg ${avg[a].toFixed(1)}`);
  }
}
