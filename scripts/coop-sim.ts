// Calibrates the co-op boss with fixed levelled heroes and the current combat bot.
// Usage: npx tsx scripts/coop-sim.ts [rooms=200] [rank=f] [--quick] [--workers=N] [--seed=1000]
// --quick: 20 rooms; workers split room seeds deterministically.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, type ClassId } from "../src/lib/game/characters";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import {
  bossUnit,
  coopNode,
  damageDealt,
  startCoop,
} from "../src/lib/game/coop";
import { niveladoHero } from "../src/lib/game/niveladoHero";
import type { RarityId } from "../src/lib/game/rarity";
import { step } from "../src/lib/game/combat";
import { newClimb } from "../src/lib/game/floorFights";

const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const QUICK = args.has("quick");
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const ROOMS = Number(args.get("rooms") ?? positional[0] ?? (QUICK ? 20 : 200));
const RANK = (positional[1] === "null" ? null : positional[1] ?? "f") as RarityId | null;
const BASE_SEED = Number(args.get("seed") ?? 1000);
const WORKERS = Math.max(1, Math.min(8, Math.floor(Number(args.get("workers") ?? Math.max(1, cpus().length - 1)))));
const SHARD = (args.get("shard") ?? "0/1").split("/").map(Number);
const PARTIAL = args.get("partial") ?? "";
const POOLS = (process.env.POOLS ?? "0.8,1,1.2,1.4,1.7,2").split(",").map(Number);
if (!Number.isInteger(ROOMS) || ROOMS < 1 || !Number.isInteger(BASE_SEED) || BASE_SEED < 0) throw new Error("Invalid rooms or seed.");

function fight(seed: number, who: number): number {
  const hero = niveladoHero(
    CLASS_IDS[(who + seed) % CLASS_IDS.length] as ClassId,
    ELEMENTS[(who * 2 + seed) % ELEMENTS.length] as Element,
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
  return damageDealt(b) / bossUnit(seed, RANK);
}

type Sample = { seed: number; damage: number[][] };
const samples: Sample[] = [];
for (let r = 0; r < ROOMS; r++) {
  if (WORKERS > 1 || r % SHARD[1] !== SHARD[0]) continue;
  const seed = BASE_SEED + r;
  const damage = Array.from({ length: 6 }, (_, index) => {
    const n = index + 2;
    return Array.from({ length: n }, (_, who) => fight(seed, who));
  });
  samples.push({ seed, damage });
}
if (PARTIAL) {
  writeFileSync(PARTIAL, JSON.stringify(samples));
  process.exit(0);
}
if (WORKERS > 1) {
  const dir = mkdtempSync(join(tmpdir(), "coop-sim-"));
  const files = Array.from({ length: WORKERS }, (_, i) => join(dir, `part-${i}.json`));
  const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const commands = files.map((file, i) => [process.execPath, ...process.execArgv, process.argv[1], ...process.argv.slice(2).filter((x) => !x.startsWith("--workers") && !x.startsWith("--shard") && !x.startsWith("--partial")), `--workers=1`, `--shard=${i}/${WORKERS}`, `--partial=${file}`].map(quote).join(" ") + " &");
  const result = spawnSync("sh", ["-c", `${commands.join("\n")}\nwait`], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("A co-op simulation worker failed.");
  samples.push(...files.flatMap((file) => {
    if (!existsSync(file)) throw new Error(`Missing worker result: ${file}`);
    return JSON.parse(readFileSync(file, "utf8")) as Sample[];
  }));
}
samples.sort((a, b) => a.seed - b.seed);
console.log(`rank=${RANK ?? "none"} rooms=${ROOMS} seed=${BASE_SEED} preset=D 0★ Lv1 policy=auto workers=${WORKERS}`);
for (let n = 2; n <= 7; n++) {
  const dmg = samples.map((sample) => sample.damage[n - 2]);
  const perPlayer = dmg.flat().reduce((sum, value) => sum + value, 0) / (dmg.length * n);
  const row = POOLS.map((pool) => {
    const wins = dmg.filter((party) => party.reduce((sum, value) => sum + value, 0) >= pool * n).length;
    return `${pool}:${((100 * wins) / ROOMS).toFixed(0)}%`;
  });
  console.log(`N=${n} avg dmg/player=${perPlayer.toFixed(2)} boss units | win by poolPerPlayer ${row.join("  ")}`);
}
