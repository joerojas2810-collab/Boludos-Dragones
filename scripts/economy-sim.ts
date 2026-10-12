// Simulates the shared F–S dungeon economy. Steady state assumes a completed S+5
// staircase and all 30 daily dungeon clears are repeats; routes never multiply clears.
import { levelCoins, levelDecay } from "../src/lib/game/levelPay";

const PULL = 250;
const TEN_PULL = 2250;
const DAILY_LEVELS = 30;
const ESCAMAS_CAP = 12;
const DADO_CAP = 1;
// Existing non-dungeon routine rewards retained by the current proposal.
const MISSIONS_PER_DAY = 275 + 700 / 7 + 550 / 7;
const TOWER_PER_DAY = 50;
const DAILY_FREE_PULL_VALUE = PULL;

function steadyState(levels: number) {
  const dungeon = Array.from({ length: levels }, (_, i) =>
    levelCoins("s", 5, true, i + 1),
  ).reduce((a, b) => a + b, 0);
  const fixed = MISSIONS_PER_DAY + TOWER_PER_DAY + DAILY_FREE_PULL_VALUE;
  const total = dungeon + fixed;
  return { dungeon, fixed, total, pulls: total / PULL, tens: total / TEN_PULL };
}

function firstClearStep(difficulty: "f" | "e" | "d" | "c" | "b" | "a" | "s", asc: number) {
  const coins = Array.from({ length: 4 }, () => levelCoins(difficulty, asc, false)).reduce((a, b) => a + b, 0);
  const chestBase = { f: 1000, e: 1600, d: 2500, c: 1200, b: 1500, a: 2000, s: 2500 }[difficulty];
  return coins + Math.round(chestBase * (asc === 0 ? 1 : 0.5));
}

console.log("Dungeon economy, 7 difficulties × 6 ascensions × 9 shared routes");
console.log(`First-clear chest is paid once per step; route count does not multiply it.`);
let firstClear = 0;
for (const difficulty of ["f", "e", "d", "c", "b", "a", "s"] as const) {
  for (let asc = 0; asc <= 5; asc++) firstClear += firstClearStep(difficulty, asc);
}
console.log(`One-time first-clear coins across 42 steps: ${firstClear.toLocaleString("en-US")}`);

for (const levels of [20, DAILY_LEVELS]) {
  const row = steadyState(levels);
  console.log(
    `${levels} repeat levels/day at S+5: dungeon ${Math.round(row.dungeon)}, fixed ${Math.round(row.fixed)}, ` +
      `total ${Math.round(row.total)} coins = ${row.pulls.toFixed(2)} single pulls / ${row.tens.toFixed(2)} ten-pulls per day`,
  );
}
console.log(`Shared daily material caps: ${ESCAMAS_CAP} Escamas and ${DADO_CAP} Dado cargado.`);
console.log(`Repeat payout decay: ${[1, 20, 21, 40, 41, 80, 81].map((n) => `${n}:${levelDecay(n)}`).join(" ")}`);
