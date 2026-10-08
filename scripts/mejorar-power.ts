// Clear rate of a synthetic hero (as stage-tune.ts) with its 6 gear pieces scaled by "Mejorar" +0/+5/+10.
//   RANKS=s,ss,ssr ASC=5 STARS=5 npx tsx scripts/mejorar-power.ts [heroes=100]
// Piece bonuses are scaled before the GEAR_CAP clamp; also prints cap saturation (share of cap reached).
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, generateCharacter } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { applyGear, gearBonus, GEAR_CAP, NO_GEAR, rollGear, type GearBonus } from "../src/lib/game/gear";
import { levelsOf } from "../src/lib/game/levels";
import { scaleStats, type RarityId } from "../src/lib/game/rarity";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { heroSkill } from "../src/lib/game/skills";
import { createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { CLASS_WEAPONS, GEAR_TYPES, weaponAtk } from "../src/lib/game/weapons";

const N = Number(process.argv[2] ?? 100);
const STARS = Number(process.env.STARS ?? 5);
const LEVEL = Number(process.env.LEVEL ?? 20);
const ASC = Number(process.env.ASC ?? 0);
const RANKS = (process.env.RANKS ?? "s,ss,ssr").split(",") as RarityId[];
const KEYS = Object.keys(NO_GEAR) as (keyof GearBonus)[];
let sat = 0, satN = 0;

function hero(rank: RarityId, seed: number, mult: number) {
  const rng = createRng(seed);
  const c = generateCharacter(rng, rng.pick(CLASS_IDS), rank);
  const sum = { ...NO_GEAR };
  for (const type of GEAR_TYPES) {
    const b = gearBonus([{ type, rarity: rank, stars: STARS, element: c.element, ...rollGear(rng, type, rank) }]);
    for (const k of KEYS) sum[k] += b[k] * mult;
  }
  const g = { ...sum };
  for (const k of KEYS) { g[k] = Math.min(sum[k], GEAR_CAP[k]); if (k === "atk" || k === "hp" || k === "def") { sat += g[k] / GEAR_CAP[k]; satN++; } }
  const s = applyGear(scaleStats(c.stats, rank, STARS, LEVEL), g);
  return { ...c, rarity: rank, stars: STARS, level: LEVEL, skill: heroSkill(c.classId, rank, STARS), stats: { ...s, atk: Math.round((s.atk + weaponAtk(rank, STARS, CLASS_WEAPONS[c.classId][0])) * 10) / 10 } };
}

function rate(rank: RarityId, mult: number): number {
  let total = 0;
  const levels = levelsOf(rank);
  for (const spec of levels) {
    let ok = 0;
    for (let i = 0; i < N; i++) {
      let st = createStage(hashSeed(i, spec.index, 5), hero(rank, hashSeed(i, 31), mult), levelFights(spec, ASC), ASC);
      while (st.status === "playing") {
        const f = startFight(st);
        let b = f.battle;
        for (let k = 0; k < 400 && b.status === "ongoing"; k++) { const p = autoPolicy(b); b = step(b, p.action, f.rng, p.target); }
        st = finishFight(st, b);
      }
      if (st.status === "cleared") ok++;
    }
    total += ok / N;
  }
  return total / levels.length;
}

console.log(`${STARS}★ Nv${LEVEL}, ${N} heroes; clear % at +0 / +5 / +10 (cap use of atk,hp,def)`);
for (const r of RANKS) {
  const row = [0, 0.2, 0.4].map((m) => { sat = satN = 0; const x = rate(r, 1 + m); return `${Math.round(x * 100)}% (cap ${Math.round((sat / satN) * 100)}%)`; });
  console.log(r.toUpperCase().padEnd(4), row.join("  "));
}
