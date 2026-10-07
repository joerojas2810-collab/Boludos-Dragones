// Prints env vars for run-sim.ts describing a full build: 5 armor pieces + weapon of the
// given rank/stars, plus an optional 4-piece set. Usage:
//   npx tsx scripts/build-env.ts <rank> [stars=3] [set=none|plain|affinity]
import { activeSets, combineGear, gearBonus, NO_GEAR, setBonus } from "../src/lib/game/gear";
import { isRarity, type RarityId } from "../src/lib/game/rarity";
import { weaponAtk } from "../src/lib/game/weapons";

const rank = process.argv[2];
if (!isRarity(rank)) throw new Error("rank f..ssr");
const stars = Number(process.argv[3] ?? 3);
const set = process.argv[4] ?? "none";
const T = ["casco", "peto", "piernas", "zapatos", "collar"] as const;
let g = gearBonus(T.map((t) => ({ type: t, rarity: rank as RarityId, stars })));
if (set !== "none") {
  // 4 fire pieces; "affinity" = the hero is fire too (x1.5)
  const sets = activeSets(["fuego", "fuego", "fuego", "fuego"], set === "affinity" ? "fuego" : "agua");
  g = combineGear(g, setBonus(sets));
}
g = combineGear(g, NO_GEAR);
console.log(
  `GEAR_HP=${g.hp} GEAR_DEF=${g.def} GEAR_ATK=${g.atk} GEAR_SPEED=${g.speed} GEAR_CRIT=${g.crit} GEAR_DODGE=${g.dodge} WEAPON_ATK=${weaponAtk(rank as RarityId, stars, "espada")}`,
);
