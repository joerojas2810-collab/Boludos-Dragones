// Levelled duel audit across every class × element matchup.
// Usage: npx tsx scripts/duel-sim.ts [--quick] [--runs=100] [--seed=61013] [--workers=N]
// --quick uses 20 duels per ordered matchup. Results are deterministic and worker-count independent.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { CLASS_IDS, type ClassId } from "../src/lib/game/characters";
import { duelRound, canAct, startDuel, type Duel } from "../src/lib/game/duel";
import { ELEMENTS, type Element } from "../src/lib/game/elements";
import { niveladoHero } from "../src/lib/game/niveladoHero";
import { createRng, hashSeed, type Rng } from "../src/lib/game/rng";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=")];
}));
const QUICK = args.has("quick");
const RUNS = Number(args.get("runs") ?? (QUICK ? 20 : 100));
const SEED = Number(args.get("seed") ?? 61013);
const WORKERS = Math.max(1, Math.min(8, Math.floor(Number(args.get("workers") ?? Math.max(1, cpus().length - 1)))));
const SHARD = (args.get("shard") ?? "0/1").split("/").map(Number);
const PARTIAL = args.get("partial") ?? "";
if (!Number.isInteger(RUNS) || RUNS < 1 || !Number.isInteger(SEED) || SEED < 0) throw new Error("Use --runs>=1 and a nonnegative --seed.");

type Policy = (duel: Duel, side: "a" | "b", rng: Rng) => "attack1" | "golpe" | "barrido" | "defend";
// Duel combat currently supports Golpe and Barrido as universal skills. Quebrar is
// unavailable without Aguante; Interrumpir/Explotar lack their combat effects in duelRound.
const policy: Policy = (duel, side, rng) => {
  const fighter = duel[side];
  const roll = rng.next();
  if (roll < 0.12) return "defend";
  if (roll < 0.52 && canAct(fighter, "golpe")) return "golpe";
  if (roll < 0.72 && canAct(fighter, "barrido")) return "barrido";
  return "attack1";
};

type Cell = { ai: number; bi: number; wins: number; draws: number; timeouts: number; rounds: number };
const cells: Cell[] = [];
let cellIndex = -1;
for (const aClass of CLASS_IDS) for (const aElement of ELEMENTS)
  for (const bClass of CLASS_IDS) for (const bElement of ELEMENTS) {
    cellIndex++;
    if (cellIndex % SHARD[1] !== SHARD[0]) continue;
    let wins = 0; let draws = 0; let timeouts = 0; let rounds = 0;
    const ai = CLASS_IDS.indexOf(aClass) * ELEMENTS.length + ELEMENTS.indexOf(aElement);
    const bi = CLASS_IDS.indexOf(bClass) * ELEMENTS.length + ELEMENTS.indexOf(bElement);
    for (let run = 0; run < RUNS; run++) {
      const rng = createRng(hashSeed(SEED, ai, bi, run));
      let duel = startDuel(niveladoHero(aClass as ClassId, aElement as Element), niveladoHero(bClass as ClassId, bElement as Element));
      while (duel.status === "ongoing" && duel.turn <= 65) {
        duel = duelRound(duel, policy(duel, "a", rng), policy(duel, "b", rng), rng);
      }
      rounds += duel.turn - 1;
      if (duel.status === "a") wins++;
      else if (duel.status === "draw") draws++;
      else if (duel.status === "ongoing") timeouts++;
    }
    cells.push({ ai, bi, wins, draws, timeouts, rounds });
  }
if (PARTIAL) {
  writeFileSync(PARTIAL, JSON.stringify(cells));
  process.exit(0);
}
if (WORKERS > 1) {
  const dir = mkdtempSync(join(tmpdir(), "duel-sim-"));
  const files = Array.from({ length: WORKERS }, (_, i) => join(dir, `part-${i}.json`));
  const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const commands = files.map((file, i) => [process.execPath, ...process.execArgv, process.argv[1], ...process.argv.slice(2).filter((x) => !x.startsWith("--workers") && !x.startsWith("--shard") && !x.startsWith("--partial")), `--workers=1`, `--shard=${i}/${WORKERS}`, `--partial=${file}`].map(quote).join(" ") + " &");
  const result = spawnSync("sh", ["-c", `${commands.join("\n")}\nwait`], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("A duel simulation worker failed.");
  const merged = files.flatMap((file) => {
    if (!existsSync(file)) throw new Error(`Missing worker result: ${file}`);
    return JSON.parse(readFileSync(file, "utf8")) as Cell[];
  });
  const output = merged.sort((a, b) => a.ai - b.ai || a.bi - b.bi);
  print(output);
  process.exit(0);
}
print(cells);

function print(rows: Cell[]): void {
  const labels = CLASS_IDS.flatMap((c) => ELEMENTS.map((e) => `${c}/${e}`));
  const ordered = rows.sort((a, b) => a.ai - b.ai || a.bi - b.bi);
  const indexed = new Map(ordered.map((row) => [`${row.ai}:${row.bi}`, row]));
  console.log(`seed=${SEED} duels/matchup=${RUNS} preset=D 0★ Lv1 policy=universal-supported workers=${WORKERS}`);
  console.log("ROW wins % / draws % / timeouts % / mean rounds; rows act as side A");
  const totalDuels = RUNS * labels.length * labels.length;
  console.log(`overall draws=${(100 * ordered.reduce((sum, cell) => sum + cell.draws, 0) / totalDuels).toFixed(2)}%, timeouts=${(100 * ordered.reduce((sum, cell) => sum + cell.timeouts, 0) / totalDuels).toFixed(2)}%, mean rounds=${(ordered.reduce((sum, cell) => sum + cell.rounds, 0) / totalDuels).toFixed(2)}`);
  console.log(`\t${labels.join("\t")}`);
  for (let ai = 0; ai < labels.length; ai++) {
    const result = labels.map((_, bi) => {
      const cell = indexed.get(`${ai}:${bi}`)!;
      return `${(100 * (cell.wins + cell.draws / 2) / RUNS).toFixed(0)}/${(100 * cell.draws / RUNS).toFixed(0)}/${(100 * cell.timeouts / RUNS).toFixed(0)}/${(cell.rounds / RUNS).toFixed(1)}`;
    });
    console.log(`${labels[ai]}\t${result.join("\t")}`);
  }
  const pairs = [];
  for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) {
    const ab = indexed.get(`${a}:${b}`)!; const ba = indexed.get(`${b}:${a}`)!;
    const decided = 2 * RUNS - ab.timeouts - ba.timeouts;
    const rate = decided > 0
      ? (ab.wins + RUNS - ba.wins - ba.draws - ba.timeouts + (ab.draws + ba.draws) / 2) / decided
      : 0.5;
    pairs.push({ a: labels[a], b: labels[b], aWin: 100 * rate, gap: Math.abs(50 - 100 * rate) * 2,
      draws: 100 * (ab.draws + ba.draws) / (2 * RUNS),
      timeouts: 100 * (ab.timeouts + ba.timeouts) / (2 * RUNS),
      rounds: (ab.rounds + ba.rounds) / (2 * RUNS) });
  }
  pairs.sort((a, b) => b.gap - a.gap || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  console.log("\nTop 5 más desparejos (par simétrico, A win rate; empate cuenta 0,5):");
  for (const p of pairs.slice(0, 5)) console.log(`${p.a} vs ${p.b}: ${p.aWin.toFixed(1)}% / ${(100 - p.aWin).toFixed(1)}%, draws=${p.draws.toFixed(1)}%, timeouts=${p.timeouts.toFixed(1)}%, avg rounds=${p.rounds.toFixed(1)}`);
}
