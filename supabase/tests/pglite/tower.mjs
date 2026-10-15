// Weekly tower (0022). Run from repo root:  node supabase/tests/pglite/tower.mjs
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

// record: best floor only, bounded, per mode; identity follows the best score.
const rec = (player, mode, floor, rounds, cls = "mago", element = "agua") =>
  rpc("tower_record", { p_player: U(player), p_mode: mode, p_floor: floor, p_rounds: rounds, p_class: cls, p_element: element });
const oldRec = (player, mode, floor, rounds) => rec(player, mode, floor, rounds);
await err(rec(1, "hax", 5, 10), "invalid_args");
await err(rec(1, "nivelado", 501, 10), "invalid_args");
await err(rec(1, "nivelado", 3, 10, "hacker", "agua"), "invalid_args");
await err(rec(1, "nivelado", 3, 10, "mago", "metal"), "invalid_args");
await rec(1, "nivelado", 12, 30, "mago", "agua");
await rec(1, "nivelado", 7, 30, "berserker", "rayo");
ok((await rec(1, "nivelado", 9, 30)).nodes === 12, "keeps the best floor");
await rec(2, "nivelado", 15, 30, "picaro", "fuego");
await rec(1, "coleccion", 20, 30, "clerigo", "tierra");
await db.exec(`insert into public.tower_scores (week, mode, player_id, max_floor, updated_at) values
  (public.game_week() - 7, 'nivelado', '${U(1)}', 30, now() - interval '3 days'),
  (public.game_week() - 7, 'nivelado', '${U(2)}', 30, now() - interval '2 days'),
  (public.game_week() - 7, 'nivelado', '${U(3)}', 12, now()),
  (public.game_week() - 7, 'nivelado', '${U(4)}', 7, now()),
  (public.game_week() - 7, 'coleccion', '${U(4)}', 5, now())`);
// daily king (0030): the first request after 00:00 UTC pays the #1 of each ranking once
await db.exec(`delete from public.tower_daily`); // the early records settled the day with partial standings
const cores = async (i) => (await one(`select dados n from public.player_state where player_id='${U(i)}'`)).n;
const kb = [0, await coins(1), await coins(2)];
ok((await rpc("tower_settle_daily", {})) === 2, "daily king settles both modes");
ok((await rpc("tower_settle_daily", {})) === 0, "daily king settles once per day and mode");
ok((await coins(2)) === kb[2] + 350 && (await coins(1)) === kb[1] + 350, "kings get 350 coins");
const kings = await q(`select mode, player_id, floor from public.tower_daily order by mode`);
ok(kings.length === 2 && kings[0].mode === "coleccion" && kings[0].player_id === U(1) && kings[1].player_id === U(2), "king = #1 of each mode");
const cb = [0, await cores(1), await cores(2), await cores(3)];
const c = [0, await coins(1), await coins(2), await coins(3), await coins(4)];
let s = await rpc("tower_state", { p_player: U(1) }); // settles last week lazily
ok(s.modes.nivelado.top[0].name === "pl2" && s.modes.nivelado.top[0].floor === 15, "top is the best floor");
ok(s.modes.nivelado.top[0].class === "picaro" && s.modes.nivelado.top[0].element === "fuego", "ranking returns the record identity");
ok(s.modes.nivelado.mine.place === 2 && s.modes.nivelado.mine.floor === 12, "my place");
ok(s.modes.nivelado.mine.class === "mago" && s.modes.nivelado.mine.element === "agua", "mine returns the record identity");
ok(s.modes.coleccion.top.length === 1 && s.modes.coleccion.mine.place === 1, "modes are separate rankings");
ok(s.modes.nivelado.top.length === 2, "only players who climbed appear");

// settle: only finished weeks, top 3 with >= 10 nodes (the first boss), once
const wk = (await one("select public.game_week() w")).w.toISOString().slice(0, 10);
ok((await rpc("tower_settle", { p_week: wk })).settled === 0, "current week is not settled");
ok((await coins(1)) === c[1] + 300, "1st (tie broken by who got there first) gets 300");
ok((await coins(2)) === c[2] + 200, "2nd gets 200");
ok((await coins(3)) === c[3] + 100, "3rd gets 100");
ok((await coins(4)) === c[4], "below 10 nodes gets nothing");
ok((await cores(1)) === cb[1] + 1 && (await cores(2)) === cb[2] + 1 && (await cores(3)) === cb[3] + 1, "1 Dado cargado each for the top 3");
ok(s.last.nivelado.map((r) => r.name).join() === "pl1,pl2,pl3", "last week's podium is shown");
ok(s.last.coleccion.length === 0, "a mode with nobody over the minimum has no podium");
await rpc("tower_state", { p_player: U(2) });
ok((await coins(1)) === c[1] + 300, "settling twice never pays twice");

// node payouts live in tower_node_paid / tower_run_commit (tower_expedition.mjs): a plain score pays nothing
const cc = await coins(3);
await err(rec(3, "coleccion", 9999, 1), "invalid_args");
await err(rec(3, "coleccion", -1, 1), "invalid_args");
await rec(3, "coleccion", 12, 5);
ok((await coins(3)) === cc, "recording a score pays nothing by itself");
s = await rpc("tower_state", { p_player: U(2) });
ok(s.king.nivelado.name === "pl2" && s.king.nivelado.me === true && s.king.coleccion.name === "pl1" && s.modes.coleccion.mine === null, "state shows the daily kings");

// weekly tiebreak by fewer rounds (0030), even if the slower climb got there first
await db.exec(`insert into public.tower_scores (week, mode, player_id, max_floor, rounds, updated_at) values
  (public.game_week() - 21, 'coleccion', '${U(1)}', 20, 90, now() - interval '3 days'),
  (public.game_week() - 21, 'coleccion', '${U(2)}', 20, 40, now())`);
await rpc("tower_settle", { p_week: (await one("select (public.game_week() - 21) w")).w.toISOString().slice(0, 10) });
const win = (await one(`select winners from public.tower_settled where mode='coleccion' and week = public.game_week() - 21`)).winners;
ok(win[0].player === U(2) && win[1].player === U(1), "fewer rounds wins the weekly tie");

// locked down
for (const [role, uid] of [["authenticated", U(1)], ["anon", null]])
  await as(role, uid, async () => {
    for (const f of ["tower_record('" + U(1) + "','nivelado',3,10,'mago','agua')", "tower_settle(current_date)", "tower_settle_daily()", "best_cleared_rank('"+U(1)+"')", "tower_state('" + U(1) + "')"]) {
      try { await db.query(`select public.${f}`); fail++; console.log("FAIL:", role, "can call", f); } catch { pass++; }
    }
  });
console.log(`tower: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
