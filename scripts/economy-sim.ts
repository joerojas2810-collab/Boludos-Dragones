// Run v2 economy simulation (scenarios A = v7.0 today, B = proposal). Run: npx tsx scripts/economy-sim.ts
type Cfg = { levelsPerDay: number; repeat: number; unlockDay: number[]; freePull: number; start: number; P: number[]; CHEST: number[]; missionsDay: number; torre: number };
const LENS = [6,6,7,8,8,9,10,11,12];
const RANKS = ["F","E","D","C","B","A","S","SS","SSR"];
const decay = (n: number) => (n <= 20 ? 1 : n <= 40 ? 0.5 : n <= 80 ? 0.2 : 0.1);
function sim(c: Cfg, days = 42) {
  const done = LENS.map(() => 0); let cum = c.start; const rows: { d: number; first: number; chest: number; rep: number; fixed: number; total: number; cum: number; dun: string }[] = [];
  for (let d = 1; d <= days; d++) {
    let slots = c.levelsPerDay, first = 0, chest = 0, rep = 0, repN = 0;
    for (let i = 0; i < 9 && slots > 0; i++) {
      if (d < c.unlockDay[i] || done[i] >= LENS[i]) continue;
      const n = Math.min(slots, LENS[i] - done[i]);
      first += n * c.P[i]; done[i] += n; slots -= n;
      if (done[i] >= LENS[i]) chest += c.CHEST[i];
    }
    let best = -1; for (let i = 0; i < 9; i++) if (done[i] > 0) best = i;
    for (let k = 0; k < slots && best >= 0; k++) { repN++; rep += c.repeat * c.P[best] * decay(repN); }
    const fixed = c.missionsDay + c.freePull + c.torre;
    const total = first + chest + rep + fixed; cum += total;
    rows.push({ d, first, chest, rep, fixed, total, cum, dun: RANKS[Math.max(0, best)] });
  }
  return rows;
}
const base = { levelsPerDay: 30, repeat: 0.6, unlockDay: [1,1,1,2,4,7,11,16,22], freePull: 250, start: 500 };
const scen: Record<string, Cfg> = {
  "A) hoy: pago x1.35 por rango, misiones actuales": { ...base, P: [20,27,36,49,66,89,120,162,219], CHEST: [1000,1600,2500,3500,5000,7000,10000,14000,20000], missionsDay: 500+1250/7+1000/7, torre: 100 },
  "B) propuesta: pago casi plano, cofres chicos tras D, misiones -45%": { ...base, P: [60,75,95,120,150,180,210,240,270], CHEST: [1000,1600,2500,1200,1500,2000,2500,3000,4000], missionsDay: (275+700/7+550/7), torre: 50 },
};
for (const [name, c] of Object.entries(scen)) {
  const rows = sim(c);
  const steady = rows.slice(28, 42).reduce((s, r) => s + r.rep + r.fixed, 0) / 14;
  const wk = (a: number, b: number) => rows.slice(a, b).reduce((s, r) => s + r.total, 0);
  console.log("\n" + name);
  console.log(` dia 1: ${Math.round(rows[0].total)} monedas (+500 inicio) = ${((rows[0].total + 500) / 225).toFixed(1)} tiradas`);
  console.log(` dias 2-7 total: ${Math.round(wk(1, 7))} = ${(wk(1, 7) / 225).toFixed(0)} tiradas (${(wk(1,7)/225/6).toFixed(1)}/dia)`);
  console.log(` regimen (sem 5-6, sin cofres ni primeras): ${Math.round(steady)}/dia = ${(steady / 250).toFixed(1)} tiradas/dia = ${(steady*7/250).toFixed(0)}/semana`);
  console.log(` acumulado dia 14: ${(rows[13].cum/225).toFixed(0)} tiradas, dia 30: ${(rows[29].cum/225).toFixed(0)}, dia 42: ${(rows[41].cum/225).toFixed(0)}`);
  console.log(` mejor dungeon al dia 42: ${rows[41].dun}`);
}
