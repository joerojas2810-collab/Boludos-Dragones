// Run v2 SQL + services against PGlite: bank_level, start_level, burn, retired hero skill, pulls/forge with rolls,
// tower rounds, exposure, and attack attempts. Run: npx tsx supabase/tests/pglite/levels.mts
import { db, setup, as, rpc } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { generateCharacter } from "../../../src/lib/game/characters";
import { createRng } from "../../../src/lib/game/rng";
import { ROUTE_IDS, levelsOf, type RouteId } from "../../../src/lib/game/levels";
import { levelFights } from "../../../src/lib/game/stage";
import { levelLoot } from "../../../src/lib/game/levelLoot";
import { heroFromOwned, lootOptions, migrate } from "../../../src/lib/game/profile";
import { heroRow, playLevelBot } from "../../../src/lib/server/testkit";
import {
  doPull, finishLevelService, loadMe, startLevelService,
} from "../../../src/lib/server/services";
import type { Deps } from "../../../src/lib/server/rpc";

await setup();
// setup.sql tracks the shipped snapshot; keep the final tower migration exercised too.
await db.exec(readFileSync(new URL("../../migrations/0055_tower_identity.sql", import.meta.url), "utf8"));
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p: Promise<unknown>, msg: string, label?: string) => {
  try { const r = await p; fail++; console.log("FAIL (no error):", label || msg, JSON.stringify(r).slice(0, 120)); }
  catch (e) { if (String((e as Error).message).includes(msg) || (e as { code?: string }).code === msg) pass++; else { fail++; console.log("FAIL:", label || msg, "got", (e as Error).message.slice(0, 150)); } }
};
const U = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
for (const [i, n] of ["ana", "beto"].entries()) {
  await db.exec(`insert into auth.users(id,email) values ('${U(i + 1)}','${n}@players.invalid')`);
  await rpc("create_player", { p_user: U(i + 1), p_name: n, p_name_key: n, p_is_admin: false });
}
const q = async (sql: string) => (await db.query(sql)).rows as Record<string, any>[];
const P = U(1);
const initialProgress = (await rpc("get_profile", { p_player: P })) as any;
ok(initialProgress.dungeonProgress && initialProgress.dungeonProgress.steps && initialProgress.dungeonProgress.routes,
  "get_profile exposes the new {steps,routes} shape");
const coins = async () => Number((await q(`select coins from public.player_state where player_id='${P}'`))[0].coins);
const setCoins = (n: number) => db.exec(`update public.player_state set coins=${n} where player_id='${P}'`);
const ROUTE: RouteId = ROUTE_IDS[0];

// hero rows
const h0 = generateCharacter(createRng(11), "caballero");
const strong = heroRow(h0, "f", 40);
const insHero = async (r: any, extra = "") =>
  db.exec(`insert into public.characters(player_id,class,element,rarity,stars,data) values ('${P}','${r.a}','${r.element}','${r.rarity}',${r.stars},'${JSON.stringify(r.data)}')${extra}`);
await insHero(strong);
const HERO = strong.key;
const hero2 = generateCharacter(createRng(12), "mago");
const second = heroRow(hero2, "c", 1);
await insHero(second);

// 1. migration shape: new rows are not legacy, columns exist
const rowc = (await q(`select level,xp,skill,legacy from public.characters where key='${HERO}'`))[0];
ok(rowc.level === 1 && rowc.xp === 0 && rowc.skill === null && rowc.legacy === false, "new hero defaults");

const startRaw = (over: Record<string, unknown> = {}) =>
  rpc("start_level", { p_player: P, p_character_id: HERO, p_seed: 7, p_hero: { x: 1 }, p_route: ROUTE, p_difficulty: "f", p_level: 0, p_asc: 0, ...over });
let REPEAT = false; // level 0 on the selected route is a repeat once it was cleared
const bankArgs = (run: string, over: Record<string, unknown> = {}) => ({
  p_player: P, p_run_id: run, p_hero_id: HERO, p_route: ROUTE, p_difficulty: "f", p_level: 0, p_asc: 0, p_status: "cleared",
  p_xp: 500, p_dados: 0, p_pieces: [], p_repeat: REPEAT, ...over,
});
const bank = (run: string, over: Record<string, unknown> = {}) => rpc("bank_level", bankArgs(run, over));
const reset = () => db.exec(`delete from public.runs`);

// 2. unlock rules at start_level
await err(startRaw({ p_level: 1 }), "level_locked", "skip level order");
await err(startRaw({ p_difficulty: "e" }), "step_locked", "locked difficulty");
await err(startRaw({ p_asc: 1 }), "step_locked", "locked ascent step");
await err(startRaw({ p_asc: 9 }), "level_locked", "asc out of range");
await err(startRaw({ p_character_id: "c-no-existe" }), "character_not_found");
await err(as("authenticated", P, () => db.query(`select public.start_level('${P}','${HERO}',1,'{}','${ROUTE}','f',0,0)`)), "permission denied", "client cannot call start_level");
await err(as("authenticated", P, () => db.query(`select public.bank_level('${P}','${U(9)}','x','${ROUTE}','f',0,0,'cleared',0,0,'[]',false)`)), "permission denied", "client cannot call bank_level");
let run = (await startRaw()).run_id;
await err(startRaw(), "run_open", "one open attempt");

// 3. first clear pays flat coins, writes progress, grants parts+piece and EXP
const lootPiece = { type: "espada", element: "agua", rarity: "f", name: "Espada de Agua", roll: 1.1 };
const c0 = await coins();
let b = await bank(run, { p_xp: 400, p_pieces: [lootPiece] });
ok(b.cleared && !b.repeat && b.coins === 60 && b.chest === 0, "first level keeps the F coin value " + JSON.stringify(b));
ok((await coins()) === c0 + b.coins, "coins credited");
ok((await q(`select levels as cleared from public.route_progress where player_id='${P}' and route='${ROUTE}' and difficulty='f' and ascension=0`))[0].cleared === 1, "progress 1");
ok(b.escamas === 0 && b.dados === 0, "no Escamas in a dungeon F");
ok((await q(`select roll from public.weapons where player_id='${P}' and key='w-espada-agua-f'`))[0].roll == 1.1, "piece roll stored");
ok(b.xp === 400, "xp reported");
const heroNow = (await q(`select level,xp from public.characters where key='${HERO}'`))[0];
ok(heroNow.level === 5 && heroNow.xp === 100, "400 EXP = levels 1..5 (10+40+90+160) + 100: " + JSON.stringify(heroNow));
REPEAT = true;
// attack: same attempt twice
await err(bank(run), "duplicate_run", "replayed attempt");
ok((await coins()) === c0 + b.coins, "no double credit");

// 4. EXP: gap multiplier, level-up, cap by stars, lost keeps EXP
await reset(); run = (await startRaw()).run_id;
b = await bank(run, { p_status: "lost", p_xp: 300 });
ok(!b.cleared && b.coins === 0 && b.xp === 300, "lost level keeps EXP and pays nothing " + JSON.stringify(b));
await db.exec(`update public.characters set level=1,xp=0 where key='${HERO}'`);
await reset(); run = (await startRaw()).run_id;
b = await bank(run, { p_status: "lost", p_xp: 1500 });
// cost: L1->2 10, 2->3 40, 3->4 90, 4->5 160, 5->6 250, 6->7 360, 7->8 490 (sum to 8 = 1400)
ok(b.newLevel === 8 && b.levelsGained === 7, "level-up chain " + JSON.stringify(b));
// catch-up x3: hero2 (level 1) vs hero at 30+
await db.exec(`update public.characters set level=31,xp=0,stars=3 where key='${HERO}'`);
await reset(); run = (await startRaw({ p_character_id: second.key })).run_id;
b = await rpc("bank_level", bankArgs(run, { p_hero_id: second.key, p_status: "lost", p_xp: 100 }));
ok(b.xp === 300, "x3 catch-up for a hero 30 levels behind " + JSON.stringify(b));
// cap: F hero with 0 stars stops at level 20
await db.exec(`update public.characters set level=20,xp=0,stars=0 where key='${HERO}'`);
await reset(); run = (await startRaw()).run_id;
b = await bank(run, { p_status: "lost", p_xp: 900 });
ok(b.newLevel === 20 && (await q(`select xp from public.characters where key='${HERO}'`))[0].xp === 0, "level cap by stars");
await db.exec(`update public.characters set level=1,xp=0,stars=0 where key='${HERO}'`);

// 5. attacks on bank_level
await reset(); run = (await startRaw()).run_id;
await err(bank(run, { p_level: 1 }), "invalid_args", "pay a different level than started");
await err(bank(run, { p_difficulty: "e" }), "invalid_args", "pay a different rank");
await err(bank(run, { p_asc: 1 }), "invalid_args", "pay a different ascension");
await err(bank(run, { p_hero_id: second.key }), "invalid_args", "pay with another hero");
await err(bank(run, { p_repeat: false }), "conflict", "loot rolled for the wrong repeat flag");
await err(bank(run, { p_status: "lost", p_pieces: [lootPiece] }), "invalid_args", "loot on a lost level");
await err(bank(run, { p_pieces: [{ ...lootPiece, rarity: "c" }] }), "invalid_items", "piece 3 ranks above the dungeon");
await err(bank(run, { p_pieces: [{ ...lootPiece, roll: 2 }] }), "invalid_items", "roll out of range");
await err(bank(run, { p_pieces: [{ ...lootPiece, lines: [{ stat: "atk", roll: 1 }] }] }), "invalid_items", "lines on a hand weapon");
await err(bank(run, { p_pieces: [{ type: "casco", element: "agua", rarity: "f", name: "x", roll: 1, lines: [{ stat: "crit", roll: 1 }] }] }), "invalid_items", "more lines than the rank allows");
await err(bank(run, { p_pieces: Array(31).fill(lootPiece) }), "invalid_items", "too many pieces");
await err(bank(run, { p_dados: 1 }), "invalid_items", "Dado cargado in a dungeon F");
await err(bank(run, { p_dados: 2 }), "invalid_args", "two dice");
await err(bank(run, { p_status: "lost", p_dados: 1 }), "invalid_args", "die on a lost level");
await err(bank(run, { p_status: "won" }), "invalid_args", "bad status");
await err(rpc("bank_level", bankArgs(U(5))), "run_not_found", "someone else's run id");
const before = await coins();
b = await bank(run, { p_xp: 999999 });
ok(b.capped === true && b.xp === 1500 || b.xp === 1500, "inflated EXP is clamped to 1500 " + JSON.stringify(b));
ok((await q(`select count(*)::int c from public.audit_log where event='level_capped'`))[0].c === 1, "audit level_capped");
ok((await coins()) === before + b.coins + b.chest + (b.refund ?? 0), "balance matches");
await db.exec(`update public.characters set level=1,xp=0 where key='${HERO}'`);
// rejected pays nothing (too fast)
await reset(); run = (await startRaw()).run_id;
const c1 = await coins();
b = await bank(run, { p_verdict: "rejected", p_reason: "too_fast", p_xp: 500, p_pieces: [lootPiece] });
ok(b.verdict === "rejected" && b.coins === 0 && (await coins()) === c1, "rejected attempt pays nothing");
ok((await q(`select count(*)::int c from public.audit_log where event='level_rejected'`))[0].c === 1, "audit level_rejected");
// a tower/old run row cannot be banked as a level
const tr = await rpc("start_run", { p_player: P, p_character_id: HERO, p_seed: 1, p_hero: { tower: "nivelado" } });
await err(bank(tr.run_id), "invalid_args", "tower run banked as a level");
await reset();

// 7. start rate limits (200/hour for fights; sweeps do not count)
await reset();
await db.exec(`insert into public.runs(player_id,seed,hero,status,finished_at) select '${P}',1,'{"kind":"level","sweep":true}','closed',now() from generate_series(1,250)`);
const sw = await startRaw();
ok(!!sw.run_id, "250 sweeps in the hour do not block a fight");
await reset();
await db.exec(`insert into public.runs(player_id,seed,hero,status,finished_at) select '${P}',1,'{"kind":"level"}','closed',now() from generate_series(1,200)`);
await err(startRaw(), "rate_limited", "200 starts/hour");
await reset();

// 6b. random loot drops many pieces at once: the bank must accept the submitted list
{
  await reset();
  const done0 = (await q(`select levels as cleared from public.route_progress where player_id='${P}' and route='${ROUTE}' and difficulty='f' and ascension=0`))[0]?.cleared ?? 0;
  const prevRepeat = REPEAT;
  REPEAT = done0 > 0;
  const many = Array.from({ length: 12 }, (_, i) => ({ type: "casco", element: ["agua", "fuego", "viento", "tierra", "rayo"][i % 5], rarity: i < 5 ? "f" : "e", name: "Casco", roll: 1 }));
  const rid = (await startRaw()).run_id;
  const bm2 = await bank(rid, { p_pieces: many });
  ok(bm2.cleared, "12 dropped pieces are banked: " + JSON.stringify(bm2));
  REPEAT = prevRepeat;
  if (done0 === 0) await db.exec(`delete from public.route_progress where player_id='${P}' and route='${ROUTE}' and difficulty='f' and ascension=0`);
  await reset();
}
// 8. nothing is burned any more (0050 heroes, 0053 pieces)
const v0 = Number((await q(`select version from public.player_state where player_id='${P}'`))[0].version);
await err(rpc("burn_hero", { p_player: P, p_version: v0, p_key: second.key }), "burn_hero", "heroes are not burned any more (0050)");
await err(rpc("burn_item", { p_player: P, p_version: v0, p_key: "w-espada-agua-f" }), "burn_item", "pieces are not burned any more (0053)");
await err(rpc("burn_many", { p_player: P, p_version: v0, p_keys: '{"w-hacha-agua-f"}' }), "burn_many", "burn_many is gone");
ok((await q(`select public.trade_value('c-mago-fuego-s') v`))[0].v === 8330, "trade_value s 8330");

// 9. pulls and forge carry rolls
let ver = Number((await q(`select version from public.player_state where player_id='${P}'`))[0].version);
await setCoins(10000);
const pullW = async (items: unknown[], over: Record<string, unknown> = {}) => {
  const r = await rpc("apply_pull", { p_player: P, p_version: ver, p_idem: "k" + Math.random().toString(36).slice(2, 12), p_banner: "weapon", p_cost: 250 * items.length, p_pity: 0, p_pity_ssr: 0, p_seed: 1, p_daily: false, p_items: items, ...over });
  ver = r.version; return r;
};
const cas = (roll: number, lines?: unknown) => ({ type: "casco", element: "fuego", rarity: "c", data: { name: "Casco" }, roll, ...(lines ? { lines } : {}) });
await pullW([cas(0.9, [{ stat: "crit", roll: 1.05 }])]);
await pullW([cas(1.1, [{ stat: "def", roll: 1.1 }])]);
let w = (await q(`select stars,roll,lines from public.weapons where player_id='${P}' and key='w-casco-fuego-c'`))[0];
ok(w.stars === 0 && Number(w.roll) === 0.9 && w.lines[0].stat === "crit", "the main roll stays: a duplicate is a copy, not +1 star");
await pullW([cas(0.86, [{ stat: "accuracy", roll: 0.9 }])]);
const cp = (await q(`select copies from public.weapons where key='w-casco-fuego-c'`))[0].copies;
ok(cp.length === 2 && cp[0].roll === 1.1 && cp[0].lines[0].stat === "def" && cp[1].roll === 0.86, "each duplicate keeps its own roll and lines as a copy");
await err(pullW([cas(1.3)]), "invalid_items", "roll 1.3");
await err(pullW([{ ...cas(1), roll: undefined }]), "invalid_items", "piece without roll");
await err(pullW([cas(1, [{ stat: "hp", roll: 1 }])]), "invalid_items", "stat outside the pool");
await err(pullW([cas(1, [{ stat: "crit", roll: 1 }, { stat: "def", roll: 1 }])]), "invalid_items", "2 lines on a C piece");
// grants (the piece path Ascender and the drops share)
const forge = async (grant: any[]) => { const g = grant[0]; return rpc("grant_piece", { p_player: P, p_type: g.type, p_element: g.element, p_rank: g.rarity, p_name: g.name, p_roll: g.roll, p_lines: g.lines ?? null, p_refund_on_max: false }); };
await forge([{ type: "peto", element: "agua", rarity: "a", name: "Peto", roll: 1.02, lines: [{ stat: "hp", roll: 1 }, { stat: "regen", roll: 1.1 }] }]);
ok((await q(`select count(*)::int c from public.weapons where key='w-peto-agua-a' and lines is not null`))[0].c === 1, "granted piece with lines");
await err(forge([{ type: "peto", element: "agua", rarity: "a", name: "P", roll: 1, lines: [{ stat: "hp", roll: 1 }, { stat: "hp", roll: 1 }] }]), "invalid_items", "duplicate stat");
await db.exec(`update public.weapons set copies = (select jsonb_agg(jsonb_build_object('roll', 1, 'lines', null)) from generate_series(1,50)) where key='w-peto-agua-a'`);
await err(forge([{ type: "peto", element: "agua", rarity: "a", name: "P", roll: 1, lines: [] }]), "max_copies", "grant over 50 copies");

// 11. tower rounds tiebreak
await rpc("tower_record", { p_player: P, p_mode: "nivelado", p_floor: 9, p_rounds: 50, p_class: "caballero", p_element: "agua" });
await rpc("tower_record", { p_player: U(2), p_mode: "nivelado", p_floor: 9, p_rounds: 30, p_class: "mago", p_element: "rayo" });
let t = (await rpc("tower_state", { p_player: P })) as any;
ok(t.modes.nivelado.top[0].name === "beto" && t.modes.nivelado.mine.place === 2, "fewer rounds wins at equal floors");
await rpc("tower_record", { p_player: P, p_mode: "nivelado", p_floor: 9, p_rounds: 20, p_class: "caballero", p_element: "agua" });
t = await rpc("tower_state", { p_player: P });
ok(t.modes.nivelado.mine.place === 1 && t.modes.nivelado.mine.rounds === 20 && t.modes.nivelado.mine.class === "caballero" && t.modes.nivelado.mine.element === "agua", "better result keeps its chosen identity");
await rpc("tower_record", { p_player: P, p_mode: "nivelado", p_floor: 9, p_rounds: 99, p_class: "picaro", p_element: "viento" });
ok((await q(`select rounds from public.tower_scores where player_id='${P}'`))[0].rounds === 20, "worse rounds ignored");
await err(rpc("tower_record", { p_player: P, p_mode: "nivelado", p_floor: 9 } as any), "does not exist", "old 3-arg signature is gone");

// 12. exposure (check_exposure.sql logic)
const leaks = await q(`select p.proname f, r.rolname r from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' join pg_roles r on r.rolname in ('anon','authenticated') where p.prokind='f' and has_function_privilege(r.oid,p.oid,'execute') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`);
ok(leaks.length === 0, "function exposure " + JSON.stringify(leaks));
const nors = await q(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' where c.relkind='r' and not c.relrowsecurity`);
ok(nors.length === 0, "tables without RLS " + JSON.stringify(nors));
const wr = await q(`select c.relname, r.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' join pg_roles r on r.rolname in ('anon','authenticated') where c.relkind in ('r','p','v') and (has_table_privilege(r.oid,c.oid,'insert') or has_table_privilege(r.oid,c.oid,'update') or has_table_privilege(r.oid,c.oid,'delete'))`);
ok(wr.length === 0, "client write privileges " + JSON.stringify(wr));
for (const t2 of ["route_progress", "step_clears", "tower_scores_archive", "migration_flags"])
  await err(as("authenticated", P, () => db.query(`select * from public.${t2}`)), "permission denied", t2 + " hidden");
ok((await q(`select count(*)::int c from public.migration_flags where key in ('0025_mark_legacy','0026_run_v2_reset')`))[0].c === 2, "one-time flags set");

// 13. services end to end on this database (strong hero clears level 1 of F)
const deps: Deps = {
  rpc: async (name, args) => { try { return { data: await rpc(name, args as any), error: null }; } catch (e) { return { data: null, error: { message: String((e as Error).message) } }; } },
  randomSeed: () => 4242,
  openRunId: async (p) => (await q(`select id from public.runs where player_id='${p}' and status='open' limit 1`))[0]?.id ?? null,
  getRun: async (p, id) => { const r = (await q(`select seed,hero,status,started_at from public.runs where player_id='${p}' and id='${id}'`))[0]; return r ? { seed: Number(r.seed), hero: r.hero, status: r.status, startedAt: Date.parse(r.started_at) } : null; },
  runsToday: async () => 0,
};
await reset(); await db.exec(`delete from public.rate_limit_hits`);
await db.exec(`update public.characters set level=1,xp=0 where key='${HERO}'`);
await err(startLevelService(deps, P, { characterId: HERO, route: ROUTE, difficulty: "f", level: 2, ascension: 0 }), "level_locked", "service: out of order");
const info = await startLevelService(deps, P, { characterId: HERO, route: ROUTE, difficulty: "f", level: 0, ascension: 0 });
const wins = levelFights(levelsOf(ROUTE, "f")[0], 0).length;
await db.exec(`update public.runs set started_at = now() - interval '10 minutes' where id='${info.runId}'`);
const profileBeforeFinish = (await loadMe(deps.rpc, P)).profile;
const finishOpts = lootOptions(profileBeforeFinish, ROUTE, "f", 0, 0);
const expectedCoins = finishOpts.repeat ? Math.round(60 * 0.6 * finishOpts.payMult) : 60;
const coinsBefore = await coins();
const done = await finishLevelService(deps, P, { runId: info.runId, wins });
ok(done.status === "cleared" && done.bank.cleared && done.bank.repeat === finishOpts.repeat && done.bank.coins === expectedCoins,
  "service finish matches the prior route progress and repeat coin formula " + JSON.stringify({ expectedCoins, repeat: finishOpts.repeat, bank: done.bank }));
ok((await coins()) === coinsBefore + expectedCoins, "service credited the expected level coins");
const exp = levelLoot(levelsOf(ROUTE, "f")[0], 0, "caballero", info.seed, finishOpts);
ok(JSON.stringify(done.loot.pieces) === JSON.stringify(exp.pieces), "service loot = engine loot for the server seed");
ok(done.profile.dungeons.routes[`${ROUTE}:f:0`] === 1, "profile shows route progress");
await err(finishLevelService(deps, P, { runId: info.runId, wins }), "duplicate_run", "service: replay twice");
const me = await loadMe(deps.rpc, P);
ok(me.profile.characters.every((c) => c.legacy === undefined && !("skill" in c)), "db rows are current and retired skill picks are ignored");
ok(heroFromOwned(me.profile, HERO)!.level >= 1, "hero rebuilt from rows");
ok(migrate({ characters: [] }).characters.length === 0, "migrate ok");
// Universal combat actions are validated by replay; retired per-class picks are ignored.
await setCoins(5000);
const pr = await doPull(deps, P, { banner: "weapon", count: 10, idempotencyKey: crypto.randomUUID() });
ok(pr.results!.length === 10, "service weapon pull x10");
ok((await q(`select count(*)::int c from public.weapons where roll is not null`))[0].c > 0, "pulled pieces have rolls in the DB");

console.log(`levels: pass ${pass} fail ${fail}`);
if (fail) process.exit(1);
