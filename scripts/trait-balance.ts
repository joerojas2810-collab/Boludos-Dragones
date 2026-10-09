import {
  CLASS_IDS,
  CLASSES,
  generateCharacter,
  type Character,
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
import { TRAIT_IDS, type TraitId } from "../src/lib/game/traits";

const N = Number(process.argv[2] ?? 40000);
const rng = createRng(2024);

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
function fight(p: Character, e: Character): boolean {
  let b = startBattle(p, e, rng);
  for (let t = 0; t < 300 && b.status === "ongoing"; t++)
    b = step(b, choose(b), rng);
  return b.status === "won";
}

const wins = new Map<TraitId, [number, number]>();
let total = 0,
  won = 0;
const hps: number[] = [];
for (let i = 0; i < N; i++) {
  const classId = CLASS_IDS[i % 4];
  const p = generateCharacter(rng, classId);
  const e = generateCharacter(rng, CLASS_IDS[Math.floor(rng.next() * 4)]);
  const w = fight(p, e);
  total++;
  won += w ? 1 : 0;
  if (classId === "mago") hps.push(p.stats.hp);
  for (const t of p.traits) {
    const c = wins.get(t) ?? [0, 0];
    c[0] += w ? 1 : 0;
    c[1]++;
    wins.set(t, c);
  }
}
const base = won / total;
console.log(`baseline win rate ${(base * 100).toFixed(1)}%`);
const rows = TRAIT_IDS.map((t) => {
  const [w, n] = wins.get(t)!;
  return { t, d: (w / n - base) * 100, n };
}).sort((a, b) => b.d - a.d);
for (const r of rows)
  console.log(
    `${r.t.padEnd(12)} ${r.d >= 0 ? "+" : ""}${r.d.toFixed(1)} pts  (n=${r.n})`,
  );
hps.sort((a, b) => a - b);
console.log(
  `mago hp min/p10/median/p90/max: ${hps[0]} / ${hps[Math.floor(hps.length * 0.1)]} / ${hps[Math.floor(hps.length / 2)]} / ${hps[Math.floor(hps.length * 0.9)]} / ${hps[hps.length - 1]}`,
);
