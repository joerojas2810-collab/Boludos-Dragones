import {
  CLASS_IDS,
  CLASSES,
  generateCharacter,
  type ClassId,
} from "../src/lib/game/characters";
import {
  estimateDamage,
  hitChance,
  startBattle,
  step,
  type Action,
  type Battle,
} from "../src/lib/game/combat";
import { createRng } from "../src/lib/game/rng";

const N = 2000;

function choose(b: Battle): Action {
  const { player } = b;
  const enemy = b.enemies[0];
  if (player.cooldown > 0) return "attack1";
  const ev = (k: "attack1" | "attack2") =>
    hitChance(player, k) * estimateDamage(player, enemy, k);
  const a2 = CLASSES[player.char.classId].attack2;
  return a2.heal > 0
    ? player.hp < player.char.stats.hp * 0.6
      ? "attack2"
      : "attack1"
    : ev("attack2") > ev("attack1")
      ? "attack2"
      : "attack1";
}

const rng = createRng(12345);
const wins: Record<string, number> = {};
const pair = (a: ClassId, b: ClassId) => `${a}>${b}`;
let turnsTotal = 0;
let promptsTotal = 0;

for (const p of CLASS_IDS) {
  for (const e of CLASS_IDS) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      let b = startBattle(
        generateCharacter(rng, p),
        generateCharacter(rng, e),
        rng,
      );
      for (let t = 0; t < 300 && b.status === "ongoing"; t++) {
        b = step(b, choose(b), rng);
        promptsTotal++;
      }
      if (b.status === "won") w++;
      turnsTotal += b.turn;
    }
    wins[pair(p, e)] = w / N;
  }
}

console.log("win rate of ROW (acts first) vs COLUMN");
console.log(["".padEnd(10), ...CLASS_IDS.map((c) => c.padEnd(10))].join(""));
for (const p of CLASS_IDS) {
  console.log(
    [
      p.padEnd(10),
      ...CLASS_IDS.map((e) =>
        `${(wins[pair(p, e)] * 100).toFixed(0)}%`.padEnd(10),
      ),
    ].join(""),
  );
}
console.log("\noverall (avg of acting first and second):");
for (const c of CLASS_IDS) {
  const avg =
    CLASS_IDS.reduce(
      (s, o) => s + (wins[pair(c, o)] + (1 - wins[pair(o, c)])) / 2,
      0,
    ) / CLASS_IDS.length;
  console.log(`${c.padEnd(10)}${(avg * 100).toFixed(1)}%`);
}
console.log(
  `\navg rounds: ${(turnsTotal / (N * 16)).toFixed(1)} · prompts: ${(promptsTotal / (N * 16)).toFixed(1)}`,
);
