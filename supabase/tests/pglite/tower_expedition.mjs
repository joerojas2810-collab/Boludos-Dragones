// Tower expeditions (0059): runs, atomic payouts, ranking, week close, lockdown.
// Run from repo root: node supabase/tests/pglite/tower_expedition.mjs
import fs from "fs";
import { db, setup, as, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p, msg) => { try { await p; fail++; console.log("FAIL (no error):", msg); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", msg, "got", e.message); } } };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
for (let i = 1; i <= 4; i++) {
  await db.exec(`insert into auth.users(id,email) values ('${U(i)}','p${i}@players.invalid')`);
  await rpc("create_player", { p_user: U(i), p_name: "pl" + i, p_name_key: "pl" + i, p_is_admin: i == 1 });
}
const coins = async (i) => (await one(`select coins from public.player_state where player_id='${U(i)}'`)).coins;
// The daily king (existing 21:00 ART prize) is not under test here: mark yesterday as already paid.
await db.exec(`insert into public.tower_daily (day, mode, player_id, floor) values
  ((now() at time zone 'utc')::date - 1, 'nivelado', '${U(4)}', 1), ((now() at time zone 'utc')::date - 1, 'coleccion', '${U(4)}', 1)`);
const week = (await one("select public.game_week() w")).w.toISOString().slice(0, 10);

// A state as the TypeScript reducer would store it (only what the SQL reads).
const st = (o = {}) => ({
  v: 1, mode: "nivelado", seed: 99, weekKey: week, engineVersion: 26, catalogVersion: 1, revision: 0,
  phase: "route", nodes: 0, turns: 0, combats: 0, ledger: [], relics: [], seen: { relics: [], events: [] },
  hero: { classId: "mago", element: "agua", name: "Heroe" }, ...o,
});
const create = (p, mode = "nivelado", state = st({ mode }), w = week, heroId = null) =>
  rpc("tower_run_create", { p_player: U(p), p_mode: mode, p_week: w, p_seed: 99, p_engine: 26, p_catalog: 1, p_state: state, p_hero_id: heroId });
const commit = (run, p, rev, state, paid = [], added = 1, batch = null) =>
  rpc("tower_run_commit", { p_run: run, p_player: U(p), p_revision: rev, p_state: state, p_paid: paid, p_added: added, p_batch: batch });
const N = (node, kind = "normal") => ({ node, kind });

// ---- create: one open run per player and mode
await err(create(1, "hax"), "invalid_args");
await err(create(1, "nivelado", st({ mode: "coleccion" })), "invalid_args");
await err(create(1, "nivelado", st({ revision: 3 })), "invalid_args");
await err(create(1, "nivelado", st({ weekKey: "2020-01-06" }), "2020-01-06"), "week_changed");
let c = await create(1);
ok(c.created === true && c.run.status === "active" && c.run.revision === 0 && c.run.week === week, "run created, frozen to the current week");
ok(new Date(c.run.deadline) > new Date() && (await one(`select (deadline = public.game_week_end(week)) b from public.tower_runs`)).b, "deadline = first instant of the next week");
const run1 = c.run.id;
c = await create(1);
ok(c.created === false && c.run.id === run1, "start returns the existing open run");
const other = await create(1, "coleccion");
ok(other.created === true && other.run.id !== run1, "the other mode has its own run");
await err(db.query(`insert into public.tower_runs(player_id,mode,week,deadline,seed,engine_version,catalog_version,status,state)
  values ('${U(1)}','nivelado',public.game_week(),now(),1,1,1,'suspended','{}')`), "tower_runs_one_open");
ok((await rpc("tower_run_current", { p_player: U(1), p_mode: "nivelado" })).run.id === run1, "current returns it");
ok((await rpc("tower_run_current", { p_player: U(2), p_mode: "nivelado" })).run === null, "other players have none");
await err(rpc("tower_run_current", { p_player: U(1), p_mode: "x" }), "invalid_args");

// ---- commit: atomic payouts + score + codex, idempotent
await err(commit(run1, 2, 0, st({ revision: 1 })), "run_not_found"); // ownership
await err(commit(run1, 1, 5, st({ revision: 6 })), "conflict"); // stale revision
await err(commit(run1, 1, 0, st({ revision: 0 })), "invalid_args"); // revision must advance
await err(commit(run1, 1, 0, st({ revision: 1, mode: "coleccion" })), "invalid_args");
await err(commit(run1, 1, 0, st({ revision: 1, seed: 100 })), "invalid_args");
await err(commit(run1, 1, 0, st({ revision: 1, weekKey: "2020-01-06" })), "invalid_args");
const c0 = await coins(1);
let r = await commit(run1, 1, 0, st({ revision: 1, nodes: 3, turns: 20, seen: { relics: ["bear_heart"], events: ["altar"] } }),
  [N(1), N(2), N(3)], 3, { first: "a1", last: "a3", count: 3 });
ok(r.season === false && r.revision === 1 && r.prize.coins === 15 && r.prize.nodes === 3 && (await coins(1)) === c0 + 15, "3 normal nodes pay 5 each");
ok((await one(`select nodes, turns, actions, revision, last_batch from public.tower_runs where id='${run1}'`)).actions === 3, "action budget counted");
const lb = (await one(`select last_batch b from public.tower_runs where id='${run1}'`)).b;
ok(lb.first === "a1" && lb.last === "a3" && lb.count === 3, "last batch stored");
let sc = await one(`select max_floor, rounds, hero_class from public.tower_scores where player_id='${U(1)}' and mode='nivelado'`);
ok(sc.max_floor === 3 && sc.rounds === 20 && sc.hero_class === "mago", "score = validated nodes and turns");
// paying the same nodes again (retry / another run in the same week) pays nothing
r = await commit(run1, 1, 1, st({ revision: 2, nodes: 4, turns: 25 }), [N(1), N(2), N(3), N(4)], 1);
ok(r.prize.coins === 5 && r.prize.nodes === 1 && (await coins(1)) === c0 + 20, "only the new node pays");
r = await commit(run1, 1, 2, st({ revision: 3, nodes: 10, turns: 70 }), [N(5, "elite"), N(10, "boss"), N(31), N(15, "elite"), N(7, "weird")], 6);
ok(r.prize.coins === 150 + 300 + 150 && (await coins(1)) === c0 + 20 + 600, "elite 150, boss 300, node 31 and unknown kinds pay 0: " + JSON.stringify(r.prize));
ok((await one(`select count(*)::int n from public.tower_node_paid where player_id='${U(1)}'`)).n === 7, "one ledger row per paid node (31 is not stored)");
const cod = await rpc("tower_codex_get", { p_player: U(1), p_mode: null });
ok(cod.relics.includes("bear_heart") && cod.events.includes("altar") && cod.best.nodes === 10 && cod.best.turns === 70, "codex merges discoveries; best record");

// ---- a failing step rolls the whole commit back (payout + score + state)
const cb = await coins(1);
await err(commit(run1, 1, 3, st({ revision: 4, nodes: 11, turns: 80, hero: { classId: "hacker", element: "agua" } }), [N(11)], 1), "invalid_args");
const after = await one(`select revision, nodes from public.tower_runs where id='${run1}'`);
ok(after.revision === 3 && after.nodes === 10 && (await coins(1)) === cb
  && (await one(`select count(*)::int n from public.tower_node_paid where node=11`)).n === 0, "failed commit leaves no partial payout");

// ---- weekly cap per mode: a second run of the same week pays no node twice, another mode pays its own
let r2 = await commit(run1, 1, 3, st({ revision: 4, nodes: 10, turns: 70, phase: "ended", end: { reason: "death", node: 10, killer: ["Ogro"] } }), [], 1);
ok(r2.status === "ended", "death ends the run");
await err(commit(run1, 1, 4, st({ revision: 5, nodes: 10 })), "run_ended");
c = await create(1);
ok(c.created === true && c.run.id !== run1, "after the end a new run can start");
r = await commit(c.run.id, 1, 0, st({ revision: 1, nodes: 5, turns: 30 }), [N(1), N(2), N(3), N(4), N(5, "elite")], 5);
ok(r.prize.coins === 0 && r.prize.nodes === 0, "the same weekly nodes never pay twice, even in a new run");
const col = await rpc("tower_run_current", { p_player: U(1), p_mode: "coleccion" });
await db.exec(`insert into public.characters(player_id,class,element,rarity,stars,level,data) values ('${U(1)}','mago','agua','f',0,1,'{}')`);
const colRun = (await create(2, "coleccion", st({ mode: "coleccion" }), week, "c-mago-agua-f")).run;
await db.exec(`insert into public.characters(player_id,class,element,rarity,stars,level,data) values ('${U(2)}','mago','agua','f',0,1,'{}')`);
const x0 = (await one(`select xp, level from public.characters where player_id='${U(2)}' and key='c-mago-agua-f'`));
r = await commit(colRun.id, 2, 0, st({ mode: "coleccion", revision: 1, nodes: 2, turns: 9 }), [N(1), N(2)], 2);
const x1 = (await one(`select xp, level from public.characters where player_id='${U(2)}' and key='c-mago-agua-f'`));
ok(r.prize.xp === 50 && (x1.xp + 10 * x1.level * x1.level * (x1.level - 1)) !== undefined && x1.xp > x0.xp - 1, "collection mode grants 25% EXP once per node: " + JSON.stringify(r.prize));
ok((await one(`select sum(xp)::int s from public.tower_node_paid where player_id='${U(1)}'`)).s === 0, "nivelado never grants EXP");
ok(col.run !== null && col.run.mode === "coleccion", "modes are isolated");

// ---- ranking: nodes desc, turns asc, server time of the milestone, player id
await commit(colRun.id, 2, 1, st({ mode: "coleccion", revision: 2, nodes: 12, turns: 60 }), [], 1);
for (const [p, nodes, turns] of [[3, 12, 60], [4, 12, 55]]) {
  const rr = (await create(p, "coleccion", st({ mode: "coleccion", hero: { classId: "picaro", element: "rayo" } }), week, null)).run;
  await commit(rr.id, p, 0, st({ mode: "coleccion", revision: 1, nodes, turns, hero: { classId: "picaro", element: "rayo" } }), [], 1);
}
await db.exec(`update public.tower_scores set updated_at = now() - interval '2 hours' where player_id='${U(3)}'`);
let s = await rpc("tower_state", { p_player: U(2) });
const names = s.modes.coleccion.top.map((t) => t.name).join();
ok(names === "pl4,pl3,pl2", "fewer turns first, then earlier server time: " + names);
ok(s.modes.coleccion.top[0].eligible === true && s.modes.coleccion.top[0].nodes === 12 && s.modes.coleccion.top[0].turns === 55 && s.modes.coleccion.top[0].at, "row exposes nodes, turns, server time and eligibility");
ok(s.modes.coleccion.mine.place === 3 && s.modes.coleccion.mine.pending === false, "my place; not pending");
ok(s.activeByMode.coleccion.nodes === 12 && s.activeByMode.coleccion.status === "active" && s.weekKey === week && s.deadline, "state lists my active run and the week");
ok(s.modes.nivelado.top[0].name === "pl1" && s.modes.nivelado.top[0].nodes === 10, "modes are separate rankings (pl1: 10 nodes)");
// equal nodes and turns: the earlier milestone wins, then the lower player id
await db.exec(`update public.tower_scores set rounds = 55, updated_at = '2026-01-01' where player_id in ('${U(2)}','${U(3)}') and mode='coleccion'`);
await db.exec(`update public.tower_scores set updated_at = '2026-01-02' where player_id='${U(4)}' and mode='coleccion'`);
s = await rpc("tower_state", { p_player: U(2) });
ok(s.modes.coleccion.top.map((t) => t.name).join() === "pl2,pl3,pl4", "equal nodes/turns/time: lowest player id first");
// a score never goes down; a faster run at the same node replaces it (with a new server timestamp)
const r3 = (await rpc("tower_run_current", { p_player: U(3), p_mode: "coleccion" })).run;
await commit(r3.id, 3, r3.revision, st({ mode: "coleccion", revision: r3.revision + 1, nodes: 12, turns: 70, phase: "ended", end: { reason: "retired", node: 12 } }), [], 1);
ok((await one(`select rounds from public.tower_scores where player_id='${U(3)}' and mode='coleccion'`)).rounds === 55, "a slower run at the same node does not replace the score");
const r3b = (await create(3, "coleccion", st({ mode: "coleccion" }))).run;
await commit(r3b.id, 3, 0, st({ mode: "coleccion", revision: 1, nodes: 12, turns: 40 }), [], 1);
const sc3 = await one(`select rounds, updated_at > '2026-01-02' as fresh from public.tower_scores where player_id='${U(3)}' and mode='coleccion'`);
ok(sc3.rounds === 40 && sc3.fresh, "a faster run at the same node replaces it and stamps the server time");
await commit(r3b.id, 3, 1, st({ mode: "coleccion", revision: 2, nodes: 2, turns: 1 }), [], 1).catch(() => 0);
ok((await one(`select max_floor m from public.tower_scores where player_id='${U(3)}' and mode='coleccion'`)).m === 12, "a lower node count never lowers the score");

// ---- pending: the open run is ahead of the validated score
await db.exec(`update public.tower_runs set nodes = 40 where player_id='${U(2)}' and mode='coleccion' and status='active'`);
s = await rpc("tower_state", { p_player: U(2) });
ok(s.modes.coleccion.mine.pending === true, "pending validation flag");

// ---- week close: nothing new validates after the deadline; the run ends as 'season'
const sr = (await create(4, "nivelado")).run;
await commit(sr.id, 4, 0, st({ revision: 1, nodes: 2, turns: 7 }), [N(1), N(2)], 2);
const cs = await coins(4);
await db.exec(`update public.tower_runs set deadline = now() - interval '1 second' where id='${sr.id}'`);
r = await commit(sr.id, 4, 1, st({ revision: 2, nodes: 9, turns: 30 }), [N(3), N(4), N(5, "elite")], 3);
const ended = await one(`select status, end_reason, nodes, revision, state from public.tower_runs where id='${sr.id}'`);
ok(r.season === true && ended.status === "ended" && ended.end_reason === "season" && ended.nodes === 2 && ended.state.phase === "ended" && ended.state.end.reason === "season",
  "late progress is not validated: the run ends as season keeping confirmed nodes");
ok((await coins(4)) === cs && (await one(`select max_floor m from public.tower_scores where player_id='${U(4)}' and mode='nivelado'`)).m === 2, "no payout or score after the deadline");
// a run left open from an old week is closed by current and never lands in the new week
const old = (await create(3, "nivelado")).run;
await db.exec(`update public.tower_runs set week = week - 7, deadline = now() - interval '1 day', state = state || '{"weekKey":"2020-01-06"}' where id='${old.id}'`);
const cur = await rpc("tower_run_current", { p_player: U(3), p_mode: "nivelado" });
ok(cur.run === null && cur.closed.endReason === "season" && cur.closed.state.end.reason === "season", "an old-week run is closed as season on load");
ok((await rpc("tower_run_end", { p_player: U(3), p_run: old.id, p_reason: "season" })).status === "ended", "ending twice is idempotent");
await err(rpc("tower_run_end", { p_player: U(3), p_run: old.id, p_reason: "death" }), "invalid_args");
await err(rpc("tower_run_end", { p_player: U(1), p_run: old.id, p_reason: "season" }), "run_not_found");
const eng = (await create(3, "nivelado")).run;
const ee = await rpc("tower_run_end", { p_player: U(3), p_run: eng.id, p_reason: "engine" });
ok(ee.endReason === "engine" && ee.state.phase === "ended" && ee.revision === 1, "old-engine run ends with reason engine");

// ---- history
const h = await rpc("tower_codex_get", { p_player: U(1), p_mode: "nivelado" });
ok(h.history.length >= 1 && h.history[0].reason === "death" && h.history[0].killer[0] === "Ogro" && h.history[0].weekKey === week, "history lists ended runs with cause and killer");

// ---- weekly top 3 now needs node 10
await db.exec(`delete from public.tower_settled where week = public.game_week() - 7`); // earlier state calls settled it empty
await db.exec(`insert into public.tower_scores (week, mode, player_id, max_floor, rounds, updated_at) values
  (public.game_week() - 7, 'nivelado', '${U(1)}', 9, 10, now()),
  (public.game_week() - 7, 'nivelado', '${U(2)}', 10, 99, now()),
  (public.game_week() - 7, 'nivelado', '${U(3)}', 25, 99, now())`);
const b = [0, await coins(1), await coins(2), await coins(3)];
await rpc("tower_state", { p_player: U(1) });
ok((await coins(3)) === b[3] + 300 && (await coins(2)) === b[2] + 200 && (await coins(1)) === b[1], "9 nodes is not enough; 10 and 25 are paid 300/200");

// ---- locked down
for (const [role, uid] of [["authenticated", U(1)], ["anon", null]])
  await as(role, uid, async () => {
    for (const f of ["tower_run_current('" + U(1) + "','nivelado')", "tower_codex_get('" + U(1) + "')", "game_week_of(now())", "tower_node_coins(1,'normal')"]) {
      try { await db.query(`select public.${f}`); fail++; console.log("FAIL:", role, "can call", f); } catch { pass++; }
    }
    for (const t of ["tower_runs", "tower_node_paid", "tower_codex"]) {
      try { await db.query(`select * from public.${t}`); fail++; console.log("FAIL:", role, "reads", t); } catch { pass++; }
    }
  });

// ---- the reset script wipes the new tables
await db.exec(fs.readFileSync(new URL("../../reset_progress_ideal.sql", import.meta.url), "utf8"));
for (const t of ["tower_runs", "tower_node_paid", "tower_codex", "tower_scores"])
  ok((await one(`select count(*)::int n from public.${t}`)).n === 0, `reset wipes ${t}`);

console.log(`tower_expedition: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
