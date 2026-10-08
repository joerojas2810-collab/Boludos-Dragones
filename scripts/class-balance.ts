// Class balance on REAL data: loads every account's profile (read-only get_profile RPC with the
// service key), takes each SSR hero as it is (stars, level, gear) and plays the SSR dungeon with
// autoPolicy. Usage: npx tsx --env-file=.env.local scripts/class-balance.ts [runs=30] [asc=0]
import { createClient } from "@supabase/supabase-js";
import { autoPolicy } from "../src/lib/game/auto";
import { CLASS_IDS, type ClassId } from "../src/lib/game/characters";
import { step } from "../src/lib/game/combat";
import { levelsOf } from "../src/lib/game/levels";
import { hashSeed } from "../src/lib/game/rng";
import { heroFromOwned, heroPower } from "../src/lib/game/profile";
import { createStage, finishFight, levelFights, startFight } from "../src/lib/game/stage";
import { toMe } from "../src/lib/server/services";

const N = Number(process.argv[2] ?? 30);
const ASC = Number(process.argv[3] ?? 0);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Row = { who: string; name: string; classId: ClassId; stars: number; level: number; power: number; clear: number[]; avg: number };
const rows: Row[] = [];

async function main() {
const { data: players, error } = await sb.from("players").select("id,name");
if (error) throw error;
for (const pl of players ?? []) {
  const raw = await sb.rpc("get_profile", { p_player: pl.id });
  if (raw.error) { console.error("skip", pl.name, raw.error.message); continue; }
  const me = toMe(raw.data);
  for (const c of me.profile.characters.filter((x) => x.rarity === "ssr")) {
    const hero = heroFromOwned(me.profile, c.id);
    if (!hero) continue;
    const clear = levelsOf("ssr").map((spec) => {
      let ok = 0;
      for (let i = 0; i < N; i++) {
        let st = createStage(hashSeed(i, spec.index, 77), hero, levelFights(spec, ASC), ASC);
        while (st.status === "playing") {
          const f = startFight(st);
          let b = f.battle;
          for (let k = 0; k < 400 && b.status === "ongoing"; k++) {
            const p = autoPolicy(b);
            b = step(b, p.action, f.rng, p.target);
          }
          st = finishFight(st, b);
        }
        if (st.status === "cleared") ok++;
      }
      return ok / N;
    });
    rows.push({ who: pl.name, name: c.name, classId: c.classId, stars: c.stars, level: c.level, power: heroPower(me.profile, c.id), clear, avg: clear.reduce((a, b) => a + b, 0) / clear.length });
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(`\nSSR heroes: ${rows.length} | runs/level ${N} | ascension ${ASC}\n`);
for (const r of rows.sort((a, b) => a.classId.localeCompare(b.classId) || b.power - a.power))
  console.log(`${r.classId.padEnd(9)} ${r.who.padEnd(10)} ${r.name.padEnd(12)} ${r.stars}★ Nv${String(r.level).padEnd(2)} poder ${String(Math.round(r.power)).padEnd(5)} clear ${pct(r.avg).padStart(4)}  [${r.clear.map(pct).join(" ")}]`);
console.log("\nPor clase:");
for (const k of CLASS_IDS) {
  const rs = rows.filter((r) => r.classId === k);
  if (!rs.length) { console.log(`${k.padEnd(9)} sin SSR`); continue; }
  const m = (f: (r: Row) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
  console.log(`${k.padEnd(9)} n=${rs.length} poder ${Math.round(m((r) => r.power))} clear ${pct(m((r) => r.avg))}  clear/poder ${(m((r) => r.avg) / m((r) => r.power) * 1000).toFixed(2)}`);
}
}
void main();
