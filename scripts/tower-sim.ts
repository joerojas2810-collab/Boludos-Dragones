// Tower / room-round climb simulation (autoPolicy bot). Usage:
//   npx tsx scripts/tower-sim.ts [runs=60] [mode=nivelado|coleccion] [rank=f] [stars=3]
// nivelado: normalized hero. coleccion: hero of `rank` with `stars` at its level cap.
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter } from "../src/lib/game/characters";
import { levelCap } from "../src/lib/game/heroLevel";
import { normalizeHero } from "../src/lib/game/nivelado";
import { scaleStats, type RarityId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { heroSkill } from "../src/lib/game/skills";
import { applyTowerAction, startTower } from "../src/lib/game/tower";

const n = Number(process.argv[2] ?? 60);
const mode = process.argv[3] ?? "nivelado";
const rank = (process.argv[4] ?? "f") as RarityId;
const stars = Number(process.argv[5] ?? 3);
const room = process.argv[6] === "room"; // room round: difficulty = `rank` offset, stop at floor 10

const floors: number[] = [];
for (let i = 0; i < n; i++) {
  const rng = createRng(hashSeed(i, 77));
  const c = generateCharacter(rng, rng.pick(CLASS_IDS), rank);
  const level = levelCap(stars);
  const owned = {
    ...c,
    rarity: rank,
    stars,
    level,
    skill: heroSkill(c.classId),
    stats: scaleStats(c.stats, rank, stars, level),
  };
  const hero = normalizeHero(owned, mode === "nivelado" ? "nivelado" : "completo");
  let s = startTower(hashSeed(i, 5), hero, room ? rank : null);
  for (let k = 0; k < 20000 && s.climb.status === "active" && !(room && s.climb.floor > 10); k++) {
    const b = s.rs.battle;
    if (s.rs.settled) {
      const n2 = applyTowerAction(s, { t: "fin" });
      if (!n2) break;
      s = n2;
    } else if (b) {
      const p = autoPolicy(b);
      const n2 = applyTowerAction(s, { t: "act", a: p.action, target: p.target });
      if (!n2) break;
      s = n2;
    }
  }
  floors.push(s.climb.floor - 1);
}
floors.sort((a, b) => a - b);
const q = (p: number) => floors[Math.min(n - 1, Math.floor(p * n))];
console.log(
  `${mode} ${rank.toUpperCase()} ${stars}★ n=${n}: p10 ${q(0.1)} median ${q(0.5)} p90 ${q(0.9)} max ${floors[n - 1]}`,
);
