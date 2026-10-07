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

// record: best floor only, bounded, per mode
await err(rpc("tower_record", { p_player: U(1), p_mode: "hax", p_floor: 5 }), "invalid_args");
await err(rpc("tower_record", { p_player: U(1), p_mode: "nivelado", p_floor: 501 }), "invalid_args");
await rpc("tower_record", { p_player: U(1), p_mode: "nivelado", p_floor: 12 });
await rpc("tower_record", { p_player: U(1), p_mode: "nivelado", p_floor: 7 });
ok((await rpc("tower_record", { p_player: U(1), p_mode: "nivelado", p_floor: 9 })).max_floor === 12, "keeps the best floor");
await rpc("tower_record", { p_player: U(2), p_mode: "nivelado", p_floor: 15 });
await rpc("tower_record", { p_player: U(1), p_mode: "coleccion", p_floor: 20 });
await db.exec(`insert into public.tower_scores (week, mode, player_id, max_floor, updated_at) values
  (public.game_week() - 7, 'nivelado', '${U(1)}', 30, now() - interval '3 days'),
  (public.game_week() - 7, 'nivelado', '${U(2)}', 30, now() - interval '2 days'),
  (public.game_week() - 7, 'nivelado', '${U(3)}', 12, now()),
  (public.game_week() - 7, 'nivelado', '${U(4)}', 7, now()),
  (public.game_week() - 7, 'coleccion', '${U(4)}', 5, now())`);
const c = [0, await coins(1), await coins(2), await coins(3), await coins(4)];
let s = await rpc("tower_state", { p_player: U(1) }); // settles last week lazily
ok(s.modes.nivelado.top[0].name === "pl2" && s.modes.nivelado.top[0].floor === 15, "top is the best floor");
ok(s.modes.nivelado.mine.place === 2 && s.modes.nivelado.mine.floor === 12, "my place");
ok(s.modes.coleccion.top.length === 1 && s.modes.coleccion.mine.place === 1, "modes are separate rankings");
ok(s.modes.nivelado.top.length === 2, "only players who climbed appear");

// settle: only finished weeks, top 3 with >= 8 floors, once
const wk = (await one("select public.game_week() w")).w.toISOString().slice(0, 10);
ok((await rpc("tower_settle", { p_week: wk })).settled === 0, "current week is not settled");
ok((await coins(1)) === c[1] + 300, "1st (tie broken by who got there first) gets 300");
ok((await coins(2)) === c[2] + 200, "2nd gets 200");
ok((await coins(3)) === c[3] + 100, "3rd gets 100");
ok((await coins(4)) === c[4], "below 8 floors gets nothing");
const cores = async (i) => (await one(`select coalesce(sum(qty),0)::int n from public.part_stock where player_id='${U(i)}' and key like 'core-%'`)).n;
ok((await cores(1)) === 2 && (await cores(2)) === 1 && (await cores(3)) === 1, "cores 2/1/1");
ok(s.last.nivelado.map((r) => r.name).join() === "pl1,pl2,pl3", "last week's podium is shown");
ok(s.last.coleccion.length === 0, "a mode with nobody over the minimum has no podium");
await rpc("tower_state", { p_player: U(2) });
ok((await coins(1)) === c[1] + 300, "settling twice never pays twice");

// locked down
for (const [role, uid] of [["authenticated", U(1)], ["anon", null]])
  await as(role, uid, async () => {
    for (const f of ["tower_record('" + U(1) + "','nivelado',3)", "tower_settle(current_date)", "tower_state('" + U(1) + "')"]) {
      try { await db.query(`select public.${f}`); fail++; console.log("FAIL:", role, "can call", f); } catch { pass++; }
    }
  });
console.log(`tower: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
