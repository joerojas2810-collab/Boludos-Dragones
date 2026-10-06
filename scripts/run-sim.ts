// Usage: npx tsx scripts/run-sim.ts [runsPerStrategy=1000] [strategy|all] [--hist]
import { CLASS_IDS, generateCharacter } from "../src/lib/game/characters";
import {
  autoBlockReason,
  autoPolicy,
  autoResolve,
  type AutoPick,
} from "../src/lib/game/auto";
import {
  estimateDamage,
  hitChance,
  livingEnemies,
  step,
  type Battle,
} from "../src/lib/game/combat";
import { SKILLS_BY_CLASS, type SkillId } from "../src/lib/game/skills";
import { FLOOR_SCALE } from "../src/lib/game/progression";
import { RELICS, relicTotals, type RelicId } from "../src/lib/game/relics";
import {
  applyBattleResult,
  BOSS_EVERY,
  buyItem,
  chooseDoor,
  chooseRelic,
  chooseSkill,
  createRun,
  getFloor,
  leaveNode,
  effectiveHero,
  ENEMY_HP_MULT,
  maxHp,
  nextFloor,
  pickUpgrade,
  resolveEvent,
  startFight,
  upgradeOffer,
  type DoorKind,
  type Run,
} from "../src/lib/game/run";
import { createRng } from "../src/lib/game/rng";

const MAX_FLOOR = 80; // alive runs are cut here (counted as 80)
const N = Number(process.argv[2] ?? 1000);
const ONLY =
  process.argv[3] && !process.argv[3].startsWith("--")
    ? process.argv[3]
    : "all";
const TRACE = process.argv.includes("--trace");
const SEED = Number(
  process.argv.find((a) => a.startsWith("--seed="))?.slice(7) ?? 0,
);
const BUILDS = process.argv.includes("--builds");
const HIST = process.argv.includes("--hist");
const AUTO = process.argv.includes("--auto"); // bots use "Resolver rápido" when allowed

type Strategy = "pelea" | "esquiva" | "mixto" | "smart";
const STRATEGIES: Strategy[] = ["pelea", "esquiva", "mixto", "smart"];

// ---- heuristics ----
// Rough "how well does this hero fight a typical enemy of the current depth".
// Used to choose relics and upgrades by what they add, like a decent human.
function power(run: Run): number {
  const s = effectiveHero(run).stats;
  const t = relicTotals(run.relics);
  const k = FLOOR_SCALE ** (run.floor + 3) * 0.4;
  const eAtk = 14 * k;
  const eDef = 6 * k;
  const dmg =
    Math.max(1, s.atk * 1.2 - 0.5 * eDef) *
    (1 + s.crit * (0.5 + t.critDamage)) *
    t.dmgMult;
  const incoming =
    Math.max(1, eAtk * 1.2 - 0.5 * s.def) *
    (1 - t.dmgReduction) *
    (1 - s.dodge);
  const life =
    s.hp * (1 + t.startShield) +
    10 * (t.regen * s.hp + t.lifesteal * dmg) +
    t.freeHits * incoming;
  // Penalize stalemates (enrage kicks in at turn 40) and one-shot risk.
  const kill = (90 * k * ENEMY_HP_MULT) / dmg;
  const stall = kill > 20 ? (20 / kill) ** 2 : 1;
  const burst =
    Math.max(1, eAtk * 2.4 * 1.25 - 0.5 * s.def) * (1 - t.dmgReduction);
  const risk = Math.min(1, s.hp / burst / 2.5);
  return ((dmg * life) / incoming) * stall * risk;
}

function pickDoor(run: Run, strat: Strategy, lost: Set<string>): number {
  const doors = getFloor(run).doors;
  const kinds = doors.map((d) => d.kind);
  const f = run.hp / maxHp(run);
  const order = ((): DoorKind[] => {
    switch (strat) {
      case "pelea":
        return f < 0.35
          ? ["rest", "easy", "hard", "merchant", "chest", "event", "boss"]
          : f < 0.6
            ? ["boss", "easy", "hard", "chest", "event", "merchant", "rest"]
            : ["boss", "hard", "easy", "chest", "event", "merchant", "rest"];
      case "esquiva":
        return ["rest", "chest", "event", "merchant", "easy", "hard", "boss"];
      case "mixto":
        return f > 0.6
          ? ["boss", "hard", "easy", "chest", "event", "merchant", "rest"]
          : ["rest", "merchant", "easy", "event", "chest", "hard", "boss"];
      case "smart":
        return f > 0.8
          ? ["boss", "hard", "easy", "chest", "event", "merchant", "rest"]
          : f > 0.5
            ? ["boss", "easy", "hard", "merchant", "rest", "event", "chest"]
            : ["rest", "merchant", "easy", "event", "chest", "hard", "boss"];
    }
  })();
  // Never retry the kind of fight that already beat us on this floor.
  const rank = (k: DoorKind) =>
    order.indexOf(k) +
    (lost.has(`${run.floor}${k}`) && strat !== "esquiva" ? 100 : 0) +
    (strat === "smart" &&
    (run.floor + 1) % BOSS_EVERY === 0 &&
    f < 0.95 &&
    k === "rest"
      ? -100
      : 0);
  let best = 0;
  kinds.forEach((k, i) => {
    if (rank(k) < rank(kinds[best])) best = i;
  });
  return best;
}

// Which of the two class skills the bots learn at level 5.
const SKILL_PICK: Record<string, SkillId> = {
  caballero: SKILLS_BY_CLASS.caballero[0],
  mago: SKILLS_BY_CLASS.mago[0],
  picaro: SKILLS_BY_CLASS.picaro[1],
  clerigo: SKILLS_BY_CLASS.clerigo[1],
};

function fightAction(
  b: Battle,
  run: Run,
  strat: Strategy,
  boss: boolean,
  fledHere: boolean,
): AutoPick {
  const { player } = b;
  if (strat === "smart") {
    const alive = livingEnemies(b).map((i) => b.enemies[i]);
    const mine = Math.max(
      ...alive.map(
        (e) =>
          hitChance(player, e, "attack1") *
          estimateDamage(player, e, "attack1"),
      ),
    );
    const theirs = alive.reduce(
      (s, e) =>
        s +
        hitChance(e, player, "attack1") * estimateDamage(e, player, "attack1"),
      0,
    );
    const ttk = alive.reduce((s, e) => s + e.hp, 0) / Math.max(1, mine);
    const ttd = player.hp / Math.max(1, theirs);
    // Flee when clearly losing and hp is low (never the boss: it blocks the floor).
    if (
      !boss &&
      !fledHere &&
      b.turn >= 2 &&
      player.hp < player.char.stats.hp * 0.35 &&
      ttd < ttk * 0.7 &&
      run.lives >= 1
    )
      return { action: "flee" };
  }
  return autoPolicy(b, { guard: strat === "smart" });
}

export interface Result {
  floor: number;
  fights: number;
  turns: number; // player prompts (one per player action)
  rounds: number;
  nodes: number; // non-fight nodes + picks
  lives: number;
  relics: RelicId[];
  level: number;
  coins: number;
  classId: string;
}

function play(seed: number, strat: Strategy): Result {
  const lost = new Set<string>();
  const fled = new Set<number>(); // floors where the smart bot already fled
  const rng = createRng(seed);
  let run = createRun(seed, generateCharacter(rng, rng.pick(CLASS_IDS)));
  const res: Result = {
    floor: 1,
    fights: 0,
    turns: 0,
    rounds: 0,
    nodes: 0,
    lives: 0,
    relics: [],
    level: 1,
    coins: 0,
    classId: run.hero.classId,
  };
  for (
    let guard = 0;
    guard < 6000 && run.status === "active" && run.floor < MAX_FLOOR;
    guard++
  ) {
    if (run.pendingSkill) {
      res.nodes++;
      run = chooseSkill(run, SKILL_PICK[run.hero.classId]);
    }
    while (run.pendingPicks > 0) {
      res.nodes++;
      const cur = run;
      const best = upgradeOffer(cur)
        .map((id) => [power(pickUpgrade(cur, id)), id] as const)
        .sort((x, y) => y[0] - x[0])[0][1];
      run = pickUpgrade(run, best);
    }
    if (run.floorCleared) run = nextFloor(run);
    if (run.pendingRelic) {
      res.nodes++;
      const cur = run;
      const best = [...cur.pendingRelic!]
        .map((id) => [power(chooseRelic(cur, id)), id] as const)
        .sort((x, y) => y[0] - x[0])[0][1];
      run = chooseRelic(run, best);
    }
    const open = chooseDoor(run, pickDoor(run, strat, lost));
    if (!open) throw new Error("door refused");
    run = open.run;
    const node = open.node;
    if (node.type === "fight") {
      const started = startFight(run);
      if (!started) throw new Error("fight refused");
      run = started.run;
      let b = started.battle;
      res.fights++;
      if (AUTO && node.kind === "easy" && !autoBlockReason(b, node.kind)) {
        b = autoResolve(b, started.rng);
        res.turns++;
      }
      for (let t = 0; t < 400 && b.status === "ongoing"; t++) {
        const pick = fightAction(
          b,
          run,
          strat,
          node.kind === "boss",
          fled.has(run.floor),
        );
        b = step(b, pick.action, started.rng, pick.target);
        res.turns++;
      }
      res.rounds += b.turn;
      if (b.status === "ongoing") b = { ...b, status: "lost" };
      const before = run;
      run = applyBattleResult(run, b, node);
      if (b.status === "fled") fled.add(before.floor);
      if (b.status !== "won") lost.add(`${before.floor}${node.kind}`);
      if (TRACE)
        console.log(
          `F${before.floor} ${node.kind} ${b.status} t${b.turn} | hero L${before.hero.level} cls=${before.hero.classId} hp ${before.hp}/${maxHp(before)} atk ${effectiveHero(before).stats.atk} def ${effectiveHero(before).stats.def} | enemies ${node.enemies.map((e) => `${e.stats.hp}/${e.stats.atk}/${e.stats.def}`).join(" ")} | lives ${before.lives} coins ${before.coins} relics ${before.relics.join(",")}`,
        );
      continue;
    }
    res.nodes++;
    if (node.type === "shop") {
      const buyOrder = [...node.items].sort((a, b) => {
        const w = (k: string) => (k === "life" ? 0 : k === "heal" ? 1 : 2);
        return w(a.kind) - w(b.kind);
      });
      for (const it of buyOrder) {
        if (it.kind === "reroll") continue;
        if (it.kind === "heal" && run.hp > maxHp(run) * 0.6) continue;
        if (strat === "esquiva" && it.kind === "life") continue;
        run = buyItem(run, it.id) ?? run;
      }
    } else if (node.type === "event") {
      // Prefer the first affordable choice (all current events are safe-ish).
      for (let c = 0; c < node.event.choices.length; c++) {
        const r = resolveEvent(run, c);
        if (r) {
          run = r.run;
          break;
        }
      }
    }
    run = leaveNode(run);
  }
  res.floor = run.maxFloor;
  res.lives = run.lives;
  res.relics = run.relics;
  res.level = run.hero.level;
  res.coins = run.coins;
  return res;
}

const SEC_TURN = 5;
const SEC_NODE = 10;
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;

function report(strat: Strategy) {
  const rs: Result[] = [];
  if (SEED) {
    play(SEED, strat);
    return;
  }
  for (let i = 0; i < N; i++) rs.push(play(1000 + i, strat));
  if (process.argv.includes("--early"))
    console.log(
      "early seeds:",
      rs
        .map((r, i) => [r.floor, 1000 + i])
        .filter(([f]) => f <= 4)
        .slice(0, 12)
        .map(([f, s]) => `${s}(F${f})`)
        .join(" "),
    );
  const floors = rs.map((r) => r.floor).sort((a, b) => a - b);
  const q = (p: number) => floors[Math.min(N - 1, Math.floor(p * N))];
  const hist: Record<number, number> = {};
  for (const f of floors) hist[f] = (hist[f] ?? 0) + 1;
  const top = Object.entries(hist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([f, c]) => `${f}:${pct(c, N)}`)
    .join(" ");
  const boss = floors.filter((f) => f % BOSS_EVERY === 0).length;
  const early = floors.filter((f) => f <= 4).length;
  const fights = rs.reduce((s, r) => s + r.fights, 0);
  const turns = rs.reduce((s, r) => s + r.turns, 0);
  const rounds = rs.reduce((s, r) => s + r.rounds, 0);
  const nodes = rs.reduce((s, r) => s + r.nodes, 0);
  const mins = (turns * SEC_TURN + nodes * SEC_NODE) / N / 60;
  const maxBoss = Math.max(
    ...Object.entries(hist)
      .filter(([f]) => Number(f) % BOSS_EVERY === 0)
      .map(([, c]) => c),
  );
  const avg = (f: (r: Result) => number) =>
    (rs.reduce((s, r) => s + f(r), 0) / N).toFixed(1);
  console.log(
    `${strat.padEnd(8)} lvl ${avg((r) => r.level)} rel ${avg((r) => r.relics.length)} | med ${q(0.5)} p10 ${q(0.1)} p90 ${q(0.9)} p99 ${q(0.99)} max ${floors[N - 1]} | <=4: ${pct(early, N)} boss-deaths: ${pct(boss, N)} (max single boss ${pct(maxBoss, N)}) | fights/run ${(fights / N).toFixed(1)} prompts/fight ${(turns / fights).toFixed(1)} rounds/fight ${(rounds / fights).toFixed(1)} | ~${mins.toFixed(1)} min | worst: ${top}`,
  );
  if (BUILDS) {
    const med = (xs: number[]) =>
      xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const by = (key: (r: Result) => string) => {
      const g: Record<string, number[]> = {};
      for (const r of rs) (g[key(r)] ??= []).push(r.floor);
      return Object.entries(g)
        .sort()
        .map(([k, v]) => `${k}: med ${med(v)} (n=${v.length})`)
        .join(" | ");
    };
    console.log(
      "  by legendaries:",
      by((r) =>
        String(
          Math.min(
            3,
            r.relics.filter((id) => RELICS[id].rarity === "legendaria").length,
          ),
        ),
      ),
    );
    console.log(
      "  by class:",
      by((r) => r.classId),
    );
  }
  if (HIST) {
    for (const [f, c] of Object.entries(hist))
      console.log(
        `${f.padStart(3)} ${"#".repeat(Math.round((c / N) * 200))} ${c}`,
      );
  }
}

for (const s of STRATEGIES) if (ONLY === "all" || ONLY === s) report(s);
