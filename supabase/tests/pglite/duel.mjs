// Duel persistence (0043). Run from repo root:  node supabase/tests/pglite/duel.mjs
import { db, setup, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p, msg) => { try { await p; fail++; console.log("FAIL (no error):", msg); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", msg, "got", e.message); } } };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const one = async (sql) => (await db.query(sql)).rows[0];
for (let i = 1; i <= 3; i++) {
  await db.exec(`insert into auth.users(id,email) values ('${U(i)}','p${i}@players.invalid')`);
  await rpc("create_player", { p_user: U(i), p_name: "pl" + i, p_name_key: "pl" + i, p_is_admin: i == 1 });
}
const R = (await rpc("create_room", { p_player: U(1), p_code: "DUEL" })).room_id;
await rpc("join_room", { p_player: U(2), p_code: "DUEL" });
await rpc("join_room", { p_player: U(3), p_code: "DUEL" });
const chips = async (u) => (await one(`select chips from public.room_players where room_id='${R}' and player_id='${U(u)}'`)).chips;
const st = async () => await one(`select phase, phase_seq from public.room_state where room_id='${R}'`);
const c0 = await chips(3);
const seq0 = (await st()).phase_seq;

// First write must expect version 0; a wrong version conflicts.
await err(rpc("duel_save", { p_room: R, p_expected_version: 5, p_state: { a: 1 } }), "conflict");
let r = await rpc("duel_save", {
  p_room: R, p_expected_version: 0, p_state: { a: 1 },
  p_deltas: [{ player: U(3), delta: -40, reason: "duel_stake" }],
  p_phase: "duel_setup", p_expected_seq: seq0, p_deadline: null, p_reset_ready: true,
});
ok(r.version === 1, "first write is version 1");
ok((await chips(3)) === c0 - 40, "stake debited");
const s1 = await st();
ok(s1.phase === "duel_setup" && s1.phase_seq === seq0 + 1, "phase moved, seq bumped");
ok((await one(`select count(*)::int n from public.chip_ledger where room_id='${R}' and reason='duel_stake'`)).n === 1, "ledger row");

// Stale versions / seqs and bad input are refused and change nothing.
await err(rpc("duel_save", { p_room: R, p_expected_version: 0, p_state: { a: 2 } }), "conflict");
await err(rpc("duel_save", { p_room: R, p_expected_version: 1, p_state: { a: 2 }, p_phase: "duel_betting", p_expected_seq: seq0 }), "stale");
await err(rpc("duel_save", { p_room: R, p_expected_version: 1, p_state: { a: 2 }, p_deltas: [{ player: U(3), delta: -9999, reason: "duel_stake" }] }), "insufficient_chips");
await err(rpc("duel_save", { p_room: R, p_expected_version: 1, p_state: { a: 2 }, p_deltas: [{ player: U(3), delta: 5, reason: "bet_win" }] }), "invalid_args");
await err(rpc("duel_save", { p_room: R, p_expected_version: 1, p_state: { a: 2 }, p_deltas: [{ player: U(3), delta: 1e9, reason: "duel_payout" }] }), "invalid_args");
ok((await one(`select version from public.room_duel where room_id='${R}'`)).version === 1, "failed calls left the version alone");
ok((await chips(3)) === c0 - 40, "failed calls left chips alone");

// Payout + return to the lobby; closed rooms refuse a phase move.
r = await rpc("duel_save", {
  p_room: R, p_expected_version: 1, p_state: { a: 3 },
  p_deltas: [{ player: U(3), delta: 70, reason: "duel_payout" }],
  p_phase: "lobby", p_expected_seq: (await st()).phase_seq, p_deadline: null,
});
ok(r.version === 2 && (await chips(3)) === c0 + 30 && (await st()).phase === "lobby", "payout and back to lobby");
await db.exec(`update public.room_state set phase='closed' where room_id='${R}'`);
await err(rpc("duel_save", { p_room: R, p_expected_version: 2, p_state: { a: 4 }, p_phase: "lobby", p_expected_seq: (await st()).phase_seq }), "room_closed");

// Missions: credited best effort; a bad key is refused, nothing else changes.
await err(rpc("duel_save", { p_room: R, p_expected_version: 2, p_state: { a: 5 }, p_missions: [{ player: U(1), key: "hax" }] }), "invalid_args");
await db.exec(`update public.room_state set phase='lobby' where room_id='${R}'`);
await rpc("duel_save", { p_room: R, p_expected_version: 2, p_state: { a: 5 }, p_missions: [{ player: U(1), key: "duel_win" }, { player: U(3), key: "bet_win" }] });
ok((await one(`select (progress->>'duel_win')::int n from public.mission_state where player_id='${U(1)}' and scope='daily'`)).n === 1, "duel_win credited");
ok((await one(`select (progress->>'bet_win')::int n from public.mission_state where player_id='${U(3)}' and scope='daily'`)).n === 1, "bet_win credited");

// Server-only: no client role can touch the table or call the function.
await db.exec("set role authenticated");
try { await db.query("select * from public.room_duel"); fail++; console.log("FAIL: authenticated can read room_duel"); } catch { pass++; }
try { await db.query("select public.duel_save('00000000-0000-0000-0000-000000000001', 0, '{}'::jsonb)"); fail++; console.log("FAIL: authenticated can call duel_save"); } catch { pass++; }
await db.exec("reset role");
console.log(`duel.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
