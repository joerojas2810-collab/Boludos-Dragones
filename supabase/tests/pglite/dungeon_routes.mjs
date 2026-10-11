// SQL contract checks for the 9-route / 42-step dungeon model.
// Run with: node supabase/tests/pglite/dungeon_routes.mjs
import { db, setup, rpc } from "./harness.mjs";
await setup();
// The SQL Editor can rerun the generated bundle against an already migrated database.
await setup();
let pass = 0, fail = 0;
const ok = (condition, label) => { if (condition) pass++; else { fail++; console.log("FAIL:", label); } };
const err = async (promise, expected, label) => {
  try { await promise; fail++; console.log("FAIL (no error):", label); }
  catch (e) { if (String(e.message).includes(expected)) pass++; else { fail++; console.log("FAIL:", label, "got", e.message); } }
};
const P = "00000000-0000-0000-0000-000000000061";
await db.exec(`insert into auth.users(id,email) values ('${P}','route-test@players.invalid')`);
await rpc("create_player", { p_user: P, p_name: "route-test", p_name_key: "route-test", p_is_admin: false });
const profile = await rpc("get_profile", { p_player: P });
if (JSON.stringify(profile.dungeonProgress) !== JSON.stringify({ steps: {}, routes: {} })) {
  throw new Error("get_profile must expose empty {steps,routes} progress");
}
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const diffs = ["f", "e", "d", "c", "b", "a", "s"];
const routes = ["lord_of_flies", "ash_king", "eternal_watcher", "hollow_colossus", "thunder_king", "mother_hydra", "withered_queen", "faceless_one", "great_devourer"];
const levelCount = Number((await q("select public.level_count() as n"))[0].n);
ok(levelCount === 4, "all routes have four levels");
ok((await q("select to_regclass('public.dungeon_progress') as old"))[0].old === null, "old rank progress table is removed");
ok((await q("select to_regclass('public.step_clears') as t"))[0].t !== null, "step_clears exists");
ok((await q("select to_regclass('public.route_progress') as t"))[0].t !== null, "route_progress exists");

// Traverse every one of the 42 nodes using the previous clear as the only unlock.
let visited = 0;
for (const [ri, difficulty] of diffs.entries()) {
  for (let asc = 0; asc <= 5; asc++) {
    const actual = (await q("select public.step_unlocked($1,$2,$3) as ok", [P, difficulty, asc]))[0].ok;
    ok(actual === true, `step ${difficulty}+${asc} unlocks after its predecessor`);
    if (actual) visited++;
    await db.query("insert into public.step_clears(player_id,difficulty,ascension) values ($1,$2,$3)", [P, difficulty, asc]);
    if (asc < 5) {
      ok((await q("select public.step_unlocked($1,$2,$3) as ok", [P, difficulty, asc + 1]))[0].ok === true,
        `clearing ${difficulty}+${asc} opens its next ascent`);
    } else if (ri < diffs.length - 1) {
      ok((await q("select public.step_unlocked($1,$2,0) as ok", [P, diffs[ri + 1]]))[0].ok === true,
        `clearing ${difficulty}+5 opens ${diffs[ri + 1]}+0`);
    }
  }
}
ok(visited === 42, "all 42 steps were traversed");

// Route progress is sequential and independent by route; a step clear is shared globally.
await db.exec(`delete from public.step_clears where player_id='${P}'`);
await db.exec(`delete from public.route_progress where player_id='${P}'`);
ok((await q("select public.step_unlocked($1,'f',0) as ok", [P]))[0].ok, "F+0 is initially open");
ok((await q("select public.level_lock_reason($1,$2,'f',0,0) as reason", [P, routes[0]]))[0].reason === null, "route first level opens");
ok((await q("select public.level_lock_reason($1,$2,'f',1,0) as reason", [P, routes[0]]))[0].reason === "level_locked", "cannot skip route level");
await db.query("insert into public.route_progress(player_id,route,difficulty,ascension,levels) values ($1,$2,'f',0,1)", [P, routes[0]]);
ok((await q("select public.level_lock_reason($1,$2,'f',1,0) as reason", [P, routes[0]]))[0].reason === null, "next route level opens after clear");
ok((await q("select public.level_lock_reason($1,$2,'f',2,0) as reason", [P, routes[0]]))[0].reason === "level_locked", "route order blocks the later level");
ok((await q("select public.route_cleared($1,$2,'f',0) as n", [P, routes[0]]))[0].n === 1, "route clear is scoped to that route");
ok((await q("select public.route_cleared($1,$2,'f',0) as n", [P, routes[1]]))[0].n === 0, "another route has independent level progress");
await db.query("insert into public.step_clears(player_id,difficulty,ascension) values ($1,'f',0)", [P]);
ok((await q("select public.level_lock_reason($1,$2,'f',0,1) as reason", [P, routes[1]]))[0].reason === null, "shared step clear opens the same step on every route");
ok((await q("select public.level_lock_reason($1,$2,'e',0,0) as reason", [P, routes[2]]))[0].reason === null, "F+0 clear unlocks E+0 for every route");

// CHECK constraints and lock validation reject the removed dungeon difficulties.
for (const bad of ["ss", "ssr"]) {
  await err(db.query("insert into public.step_clears(player_id,difficulty,ascension) values ($1,$2,0)", [P, bad]), "violates check", `step_clears rejects ${bad}`);
  await err(db.query("insert into public.route_progress(player_id,route,difficulty,ascension,levels) values ($1,$2,$3,0,0)", [P, routes[0], bad]), "violates check", `route_progress rejects ${bad}`);
  ok((await q("select public.level_lock_reason($1,$2,$3,0,0) as reason", [P, routes[0], bad]))[0].reason === "level_locked", `lock validator rejects ${bad}`);
}
// End-to-end: the fourth level of one route records the shared step clear.
const P2 = "00000000-0000-0000-0000-000000000062";
await db.exec(`insert into auth.users(id,email) values ('${P2}','route-bank@players.invalid')`);
await rpc("create_player", { p_user: P2, p_name: "route-bank", p_name_key: "route-bank", p_is_admin: false });
await db.exec(`insert into public.characters(player_id,class,element,rarity,stars,data) values ('${P2}','caballero','agua','f',0,'{}')`);
const HERO = "c-caballero-agua-f";
for (let level = 0; level < 4; level++) {
  const started = await rpc("start_level", { p_player: P2, p_character_id: HERO, p_seed: 100 + level, p_hero: {},
    p_route: routes[4], p_difficulty: "f", p_level: level, p_asc: 0 });
  await rpc("bank_level", { p_player: P2, p_run_id: started.run_id, p_hero_id: HERO, p_route: routes[4],
    p_difficulty: "f", p_level: level, p_asc: 0, p_status: "cleared", p_xp: 0, p_dados: 0,
    p_pieces: [], p_repeat: false });
}
ok((await q("select levels from public.route_progress where player_id=$1 and route=$2 and difficulty='f' and ascension=0", [P2, routes[4]]))[0].levels === 4, "bank_level persists all four levels in route order");
ok((await q("select count(*)::int as n from public.step_clears where player_id=$1 and difficulty='f' and ascension=0", [P2]))[0].n === 1, "bank_level marks the step after route completion");
ok((await q("select public.level_lock_reason($1,$2,'f',0,1) as reason", [P2, routes[1]]))[0].reason === null, "banked route completion unlocks the next ascent on every route");

const sigs = (await q(`select proname, proargnames from pg_proc where pronamespace='public'::regnamespace and proname in ('start_level','bank_level')`));
const start = sigs.find(x => x.proname === "start_level")?.proargnames;
const bank = sigs.find(x => x.proname === "bank_level")?.proargnames;
ok(start?.slice(4, 6).join(",") === "p_route,p_difficulty", "start_level exposes the required parameter names/order");
ok(bank?.slice(3, 5).join(",") === "p_route,p_difficulty", "bank_level exposes the required parameter names/order");
console.log(`dungeon routes: pass ${pass} fail ${fail}`);
await db.close();
if (fail) process.exit(1);
