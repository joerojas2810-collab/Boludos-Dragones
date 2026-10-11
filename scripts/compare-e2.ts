// E2a gate: compare speed-only progress scheduling with ENGINE 13's seeded queue.
// Usage: npx tsx scripts/compare-e2.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLASSES, CLASS_IDS } from "../src/lib/game/characters";
import {
  actionCounts,
  buildQueue,
  type EnemySlot,
  type Slot,
} from "../src/lib/game/combat";
import { createRng, hashSeed } from "../src/lib/game/rng";
import { nextActivations } from "../src/lib/game/progressEngine";

const CASES = 10_000;
const modifiers = [0.7, 0.8, 0.9, 1, 1.08, 1.16, 1.24] as const;
const baseline = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/baseline/motor13.json"), "utf8"),
) as { runsPerLevel?: number; rows?: unknown[] };
if ((baseline.runsPerLevel ?? 0) < 10 || baseline.rows?.length !== 225)
  throw new Error("E2a requires the 225-row ENGINE 13 baseline with at least 10 runs per level");

const sideLabels = (slots: Slot[]) =>
  slots.map((slot) => (slot === "player" ? "player" : "enemy"));
let exactOrderMatches = 0;
let actionCountMatches = 0;
let minSpeed = Number.POSITIVE_INFINITY;
let maxSpeed = 0;
let minRatio = Number.POSITIVE_INFINITY;
let maxRatio = 0;
const mismatchBySpeedRatio = { under1_1: 0, under1_5: 0, under2: 0, under3: 0, threePlus: 0 };
const examples: {
  playerClass: string;
  enemyClass: string;
  playerSpeed: number;
  enemySpeed: number;
  engine13: string[];
  progress: string[];
}[] = [];

for (let index = 0; index < CASES; index++) {
  const playerClass = CLASS_IDS[Math.floor(index / 400) % CLASS_IDS.length];
  const enemyClass = CLASS_IDS[index % CLASS_IDS.length];
  const variation = createRng(hashSeed(13013, index));
  const playerSpeed =
    CLASSES[playerClass].stats.speed *
    (0.85 + variation.next() * 0.3) *
    modifiers[variation.int(0, modifiers.length - 1)];
  const enemySpeed =
    CLASSES[enemyClass].stats.speed *
    (0.85 + variation.next() * 0.3) *
    modifiers[variation.int(0, modifiers.length - 1)];
  minSpeed = Math.min(minSpeed, playerSpeed, enemySpeed);
  maxSpeed = Math.max(maxSpeed, playerSpeed, enemySpeed);
  const ratio = Math.max(playerSpeed, enemySpeed) / Math.min(playerSpeed, enemySpeed);
  minRatio = Math.min(minRatio, ratio);
  maxRatio = Math.max(maxRatio, ratio);

  const counts = actionCounts(playerSpeed, enemySpeed, 0);
  const initiative = createRng(hashSeed(13013, index, 91));
  // planRound consumes one intent roll for each announced enemy action first.
  for (let n = 0; n < counts.enemy; n++) initiative.next();
  const enemyRoll = enemySpeed * (0.7 + 0.6 * initiative.next());
  const playerRoll = playerSpeed * (0.7 + 0.6 * initiative.next());
  const lead = enemyRoll > playerRoll ? 1 : 0;
  const enemySlots: EnemySlot[] = Array.from({ length: counts.enemy }, (_, n) => ({
    e: 0,
    n,
    intent: "attack1",
  }));
  const reference = sideLabels(
    buildQueue(Math.max(1, counts.player), enemySlots, lead),
  );
  const candidate = nextActivations([
    { id: "player", speed: playerSpeed, progress: 0 },
    { id: "enemy", speed: enemySpeed, progress: 0 },
  ]).order;
  const countsMatch =
    candidate.filter((id) => id === "player").length === Math.max(1, counts.player) &&
    candidate.filter((id) => id === "enemy").length === counts.enemy;
  if (countsMatch) actionCountMatches++;
  if (candidate.join(",") === reference.join(",")) exactOrderMatches++;
  else {
    if (examples.length < 5)
      examples.push({
        playerClass,
        enemyClass,
        playerSpeed: Number(playerSpeed.toFixed(3)),
        enemySpeed: Number(enemySpeed.toFixed(3)),
        engine13: reference,
        progress: candidate,
      });
    if (ratio < 1.1) mismatchBySpeedRatio.under1_1++;
    else if (ratio < 1.5) mismatchBySpeedRatio.under1_5++;
    else if (ratio < 2) mismatchBySpeedRatio.under2++;
    else if (ratio < 3) mismatchBySpeedRatio.under3++;
    else mismatchBySpeedRatio.threePlus++;
  }
}

const report = {
  cases: CASES,
  speedRange: [Number(minSpeed.toFixed(3)), Number(maxSpeed.toFixed(3))],
  ratioRange: [Number(minRatio.toFixed(3)), Number(maxRatio.toFixed(3))],
  actionCountMatches,
  actionCountMatchPercent: Number(((actionCountMatches / CASES) * 100).toFixed(2)),
  exactOrderMatches,
  exactOrderMatchPercent: Number(((exactOrderMatches / CASES) * 100).toFixed(2)),
  exactOrderMismatches: CASES - exactOrderMatches,
  mismatchBySpeedRatio,
  examples,
  baselineRunsPerLevel: baseline.runsPerLevel,
  baselineRows: baseline.rows?.length,
};
const markdown = `# E2 — Resultado de la puerta de viabilidad\n\n` +
  `## E2a: orden de activaciones\n\n` +
  `Se compararon ${report.cases.toLocaleString("es-AR")} muestras deterministas (semillas derivadas de 13013). ` +
  `Se recorrieron por igual las 25 parejas ordenadas de clases, con velocidades base de sus plantillas, ` +
  `factor de atributo (0,85–1,15) y multiplicadores de estado actuales (0,70–1,24). En cada caso se usaron ` +
  `actionCounts(carry=0) y buildQueue con el orden de tiradas real: una tirada de intención por acción enemiga, ` +
  `luego iniciativa del enemigo y del jugador. El prototipo recibió solo velocidad y progreso, según su contrato. ` +
  `La línea base motor 13 presente tiene ${report.baselineRows} filas y ${report.baselineRunsPerLevel} corridas por nivel.\n\n` +
  `| Medida | Resultado |\n|---|---:|\n` +
  `| Velocidad muestreada | ${report.speedRange[0]}–${report.speedRange[1]} |\n` +
  `| Razón entre velocidades | ${report.ratioRange[0]}–${report.ratioRange[1]} |\n` +
  `| Cantidad de activaciones coincide | ${report.actionCountMatches}/${report.cases} (${report.actionCountMatchPercent} %) |\n` +
  `| Orden exacto coincide | ${report.exactOrderMatches}/${report.cases} (${report.exactOrderMatchPercent} %) |\n` +
  `| Órdenes distintas | ${report.exactOrderMismatches}/${report.cases} (${(100 - report.exactOrderMatchPercent).toFixed(2)} %) |\n\n` +
  `### Desacuerdos por razón de velocidades\n\n` +
  `| Razón | Casos con orden distinto |\n|---|---:|\n` +
  `| < 1,10 | ${report.mismatchBySpeedRatio.under1_1} |\n` +
  `| 1,10–<1,50 | ${report.mismatchBySpeedRatio.under1_5} |\n` +
  `| 1,50–<2,00 | ${report.mismatchBySpeedRatio.under2} |\n` +
  `| 2,00–<3,00 | ${report.mismatchBySpeedRatio.under3} |\n` +
  `| ≥ 3,00 | ${report.mismatchBySpeedRatio.threePlus} |\n\n` +
  `### Ejemplos reproducibles de orden distinto\n\n` +
  `| PJ (VEL) | Enemigo (VEL) | Motor 13 | Progreso |\n|---|---|---|---|\n` +
  report.examples.map((row) =>
    `| ${row.playerClass} (${row.playerSpeed}) | ${row.enemyClass} (${row.enemySpeed}) | ${row.engine13.join(" → ")} | ${row.progress.join(" → ")} |`,
  ).join("\n") + `\n\n` +
  `## Recomendación: abortar E2 en esta forma\n\n` +
  `El contrato exige equivalencia exacta de orden en E2a. El planificador por umbrales conserva la cantidad de ` +
  `activaciones, pero no puede reproducir la iniciativa aleatoria del motor 13: su API solo recibe velocidad y ` +
  `progreso, sin la tirada de iniciativa. La diferencia observada excede el criterio de puerta, así que no se ` +
  `calibró E2b ni se ejecutó una comparación de victorias o duraciones. No conectar este prototipo al juego. ` +
  `Para continuar, revisar el contrato para decidir si la iniciativa aleatoria debe formar parte de la API y ` +
  `del modelo de progreso, o si se acepta formalmente un orden distinto.\n`;

writeFileSync(resolve(process.cwd(), "docs/E2_RESULTADO.md"), markdown, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log("Wrote docs/E2_RESULTADO.md");
