// Forge v9 "Mejorar" check. Usage: npx tsx scripts/mejorar-sim.ts [trials] [dadoStep] [firstLevelIdx]
// Expected Escamas and Dados cargados to take one piece from +0 to +10.
const TRIALS = Number(process.argv[2] ?? 20000);
const COST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Escamas per attempt, +1..+10 (flat: equals the target level)
const BASE = [100, 90, 80, 70, 60, 50, 45, 40, 35, 30]; // success %
const PITY_STEP = 5; // extra % per consecutive failure
const DADO_STEP = Number(process.argv[3] ?? 10); // extra % per Dado cargado
const FROM = Number(process.argv[4] ?? 5); // first level index (0 = +1) where Dados are used
const MAX_DADOS = 2;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function climb(dados: number, rnd: () => number) {
  let escamas = 0, used = 0, fails = 0, tries = 0;
  for (let lv = 0; lv < 10; lv++) {
    let streak = 0;
    for (;;) {
      const d = lv >= FROM ? dados : 0;
      const p = Math.min(100, BASE[lv] + streak * PITY_STEP + d * DADO_STEP);
      escamas += COST[lv]; used += d; tries++;
      if (rnd() * 100 < p) break;
      streak++; fails++;
    }
  }
  return { escamas, used, fails, tries };
}

console.log("dados/try  escamas  dados  fails  tries   (mean per piece +0 -> +10)");
for (let dados = 0; dados <= MAX_DADOS; dados++) {
  const rnd = mulberry32(7 + dados);
  const t = { escamas: 0, used: 0, fails: 0, tries: 0 };
  for (let i = 0; i < TRIALS; i++) {
    const r = climb(dados, rnd);
    t.escamas += r.escamas; t.used += r.used; t.fails += r.fails; t.tries += r.tries;
  }
  const f = (n: number) => (n / TRIALS).toFixed(1).padStart(7);
  console.log(`${String(dados).padStart(9)}  ${f(t.escamas)}  ${f(t.used)}  ${f(t.fails)}  ${f(t.tries)}`);
}
console.log(`cost with no failures: ${COST.reduce((a, b) => a + b, 0)} Escamas`);
