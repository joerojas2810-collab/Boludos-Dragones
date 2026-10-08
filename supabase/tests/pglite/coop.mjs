// Coop boss prizes (0020/0021). Run from repo root:  node supabase/tests/pglite/coop.mjs
import { db, setup, as, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p, msg) => { try { await p; fail++; console.log("FAIL (no error):", msg); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", msg, "got", e.message); } } };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
for (let i = 1; i <= 3; i++) {
  await db.exec(`insert into auth.users(id,email) values ('${U(i)}','p${i}@players.invalid')`);
  await rpc("create_player", { p_user: U(i), p_name: "pl" + i, p_name_key: "pl" + i, p_is_admin: i == 1 });
}
const room = await rpc("create_room", { p_player: U(1), p_code: "COOP" });
const R = room.room_id;
await rpc("join_room", { p_player: U(2), p_code: "COOP" });
await rpc("join_room", { p_player: U(3), p_code: "COOP" });
for (const u of [1, 2, 3])
  await db.exec(`insert into public.room_coop (room_id, player_id, damage, finished) values ('${R}','${U(u)}', ${100 * u}, true)`);
const rows = [
  { player: U(1), coins: 150, chips: 50, dados: 2 },
  { player: U(2), coins: 150, chips: 50, dados: 1 },
  { player: U(3), coins: 30, chips: 10, dados: 0 },
];
// Not before the boss phase is over.
await db.exec(`update public.room_state set phase='coop_boss' where room_id='${R}'`);
await err(rpc("coop_pay", { p_room: R, p_rows: rows }), "wrong_phase");
await db.exec(`update public.room_state set phase='night_summary' where room_id='${R}'`);
// Bounds are enforced even though the caller is the server.
await err(rpc("coop_pay", { p_room: R, p_rows: [{ ...rows[0], coins: 5000 }] }), "invalid_args");
await err(rpc("coop_pay", { p_room: R, p_rows: [{ ...rows[0], dados: 9 }] }), "invalid_args");
const c0 = (await one(`select coins from public.player_state where player_id='${U(1)}'`)).coins;
const h0 = (await one(`select chips from public.room_players where room_id='${R}' and player_id='${U(1)}'`)).chips;
ok((await rpc("coop_pay", { p_room: R, p_rows: rows })).paid === 3, "pays 3 players");
ok((await one(`select coins from public.player_state where player_id='${U(1)}'`)).coins === c0 + 150, "coins credited");
ok((await one(`select dados from public.player_state where player_id='${U(1)}'`)).dados === 2, "dice credited");
ok((await one(`select chips from public.room_players where room_id='${R}' and player_id='${U(1)}'`)).chips === h0 + 50, "chips credited");
ok((await one(`select count(*)::int n from public.chip_ledger where room_id='${R}' and reason='coop_prize'`)).n === 3, "ledger rows");
// Idempotent: a second call pays nobody.
ok((await rpc("coop_pay", { p_room: R, p_rows: rows })).paid === 0, "second call pays nothing");
ok((await one(`select coins from public.player_state where player_id='${U(1)}'`)).coins === c0 + 150, "no double coins");
// Daily account limit: after 3 account payouts within 24 h (the first room above counts) the next one pays chips only.
const rooms = [];
for (let k = 0; k < 4; k++) {
  const id = (await one(`insert into public.rooms (code, host_id, status) values ('${"AAAA".replace(/A/g, () => "ABCD"[k])}', '${U(2)}', 'closed') returning id`)).id;
  rooms.push(id);
  await db.exec(`insert into public.room_state (room_id, phase) values ('${id}', 'night_summary') on conflict (room_id) do update set phase='night_summary'`);
  await db.exec(`insert into public.room_players (room_id, player_id, chips) values ('${id}', '${U(1)}', 100)`);
  await db.exec(`insert into public.room_coop (room_id, player_id, damage, finished) values ('${id}', '${U(1)}', 10, true)`);
}
const coinsOf = async () => (await one(`select coins from public.player_state where player_id='${U(1)}'`)).coins;
for (let k = 0; k < 2; k++) {
  const b0 = await coinsOf();
  await rpc("coop_pay", { p_room: rooms[k], p_rows: [{ player: U(1), coins: 150, chips: 10, dados: 0 }] });
  ok((await coinsOf()) === b0 + 150, `room ${k + 1} pays coins`);
}
const b4 = await coinsOf();
await rpc("coop_pay", { p_room: rooms[2], p_rows: [{ player: U(1), coins: 150, chips: 10, dados: 1 }] });
ok((await coinsOf()) === b4, "3rd extra room within 24 h pays no coins");
ok((await one(`select dados from public.player_state where player_id='${U(1)}'`)).dados === 2, "...and no dice either");
ok((await one(`select chips from public.room_players where room_id='${rooms[2]}' and player_id='${U(1)}'`)).chips === 110, "...but still pays chips");
// Locked down: anon / authenticated cannot call it.
await as("authenticated", U(1), async () => { try { await db.query(`select public.coop_pay('${R}', '[]'::jsonb)`); fail++; console.log("FAIL: authenticated can call coop_pay"); } catch { pass++; } });
await as("anon", null, async () => { try { await db.query(`select public.coop_pay('${R}', '[]'::jsonb)`); fail++; console.log("FAIL: anon can call coop_pay"); } catch { pass++; } });
console.log(`coop: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
