// Rooms flow (0005) executable checks. Run from repo root:
//   npm i --no-save @electric-sql/pglite && node supabase/tests/pglite/rooms.mjs
import { db, setup, as, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p, msg, label) => { try { const r = await p; fail++; console.log("FAIL (no error):", label || msg, JSON.stringify(r)); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", label || msg, "got", e.message); } } };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const names = ["ana", "beto", "carla", "dani", "eli", "fede", "gus", "hugo"];
for (let i = 1; i <= 8; i++) {
  await db.exec(`insert into auth.users(id,email) values ('${U(i)}','${names[i - 1]}@players.invalid')`);
  await rpc("create_player", { p_user: U(i), p_name: names[i - 1], p_name_key: names[i - 1], p_is_admin: i == 1 });
}
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const T = (s) => new Date(Date.UTC(2026, 0, 1, 20, 0, s)).toISOString(); // test clock
const chips = async (R) => Object.fromEntries((await q(`select player_id,chips from public.room_players where room_id='${R}'`)).map((x) => [x.player_id, x.chips]));
const conserved = async (R, label) => {
  const l = (await one(`select coalesce(sum(delta),0)::int s from public.chip_ledger where room_id='${R}'`)).s;
  const c = (await one(`select sum(chips)::int s from public.room_players where room_id='${R}'`)).s;
  ok(l === c, `ledger == chips (${label}) ${l} vs ${c}`);
};
const st = (R) => one(`select * from public.room_state where room_id='${R}'`);

// ----------------------------------------------------------- room + lobby
const room = await rpc("create_room", { p_player: U(1), p_code: "ROOM" });
const R = room.room_id;
let s = await st(R);
ok(s.phase === "lobby" && s.phase_seq === 0 && s.round === 0 && s.mode === "nivelado", "room_state auto-created");
await err(rpc("start_round", { p_player: U(1), p_room: R, p_seed: 5 }), "not_enough_players");
for (let i = 2; i <= 4; i++) ok((await rpc("join_room", { p_player: U(i), p_code: "ROOM" })).ok, "join " + i);
await err(rpc("set_room_mode", { p_player: U(2), p_room: R, p_mode: "completo" }), "forbidden");
await err(rpc("set_room_mode", { p_player: U(1), p_room: R, p_mode: "hax" }), "invalid_args");
await rpc("set_room_mode", { p_player: U(1), p_room: R, p_mode: "completo" });
await rpc("set_room_mode", { p_player: U(1), p_room: R, p_mode: "nivelado" });
await rpc("choose_hero", { p_player: U(2), p_room: R, p_hero_key: "c-mago-fuego-comun" });
await err(rpc("choose_hero", { p_player: U(8), p_room: R, p_hero_key: "x" }), "not_member");
await err(rpc("start_round", { p_player: U(2), p_room: R, p_seed: 5 }), "forbidden");
await err(rpc("start_round", { p_player: U(1), p_room: R, p_seed: -1 }), "invalid_args");
await err(rpc("start_round", { p_player: U(1), p_room: R, p_seed: 4294967296 }), "invalid_args");
await err(rpc("advance_phase", { p_room: R, p_expected_seq: 0, p_to_phase: "doors", p_deadline: T(60), p_now: T(0) }), "invalid_transition", "lobby cannot advance");
s = await rpc("start_round", { p_player: U(1), p_room: R, p_seed: 4242, p_now: T(0) });
ok(s.phase === "round_setup" && s.phase_seq === 1 && s.round === 1 && s.round_seed === 4242, "start_round " + JSON.stringify(s));
await err(rpc("set_room_mode", { p_player: U(1), p_room: R, p_mode: "completo" }), "wrong_phase");
await err(rpc("start_round", { p_player: U(1), p_room: R, p_seed: 1 }), "wrong_phase", "double start");

// ---------------------------------------------------------- advance: CAS
let a = await rpc("advance_phase", { p_room: R, p_expected_seq: 1, p_to_phase: "floor_intro", p_deadline: T(33), p_now: T(5) });
ok(a.advanced === false && a.reason === "not_due", "not due " + JSON.stringify(a));
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 1, p_to_phase: "floor_intro", p_deadline: T(33), p_now: T(31) });
ok(a.advanced === true && a.state.phase === "floor_intro" && a.state.floor === 1 && a.state.phase_seq === 2, "to floor_intro " + JSON.stringify(a));
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 1, p_to_phase: "floor_intro", p_deadline: T(33), p_now: T(99) });
ok(a.advanced === false && a.reason === "stale" && a.state.phase_seq === 2, "duplicate advance is stale");
await err(rpc("advance_phase", { p_room: R, p_expected_seq: 2, p_to_phase: "fighting", p_deadline: T(99), p_now: T(99) }), "invalid_transition");
await err(rpc("choose_door", { p_player: U(1), p_room: R, p_floor: 1, p_door_kind: "easy" }), "wrong_phase");
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 2, p_to_phase: "doors", p_deadline: T(50), p_now: T(34) });
ok(a.advanced && a.state.phase === "doors", "to doors");
// doors
await err(rpc("choose_door", { p_player: U(1), p_room: R, p_floor: 2, p_door_kind: "easy" }), "wrong_floor");
await err(rpc("choose_door", { p_player: U(8), p_room: R, p_floor: 1, p_door_kind: "easy" }), "not_member");
await err(rpc("choose_door", { p_player: U(1), p_room: R, p_floor: 1, p_door_kind: "lava" }), "invalid_args");
let d = await rpc("choose_door", { p_player: U(1), p_room: R, p_floor: 1, p_door_kind: "hard" });
ok(d.door_kind === "hard" && d.replayed === false, "door");
d = await rpc("choose_door", { p_player: U(1), p_room: R, p_floor: 1, p_door_kind: "hard" });
ok(d.replayed === true, "door replay");
await err(rpc("choose_door", { p_player: U(1), p_room: R, p_floor: 1, p_door_kind: "easy" }), "door_locked");
await rpc("choose_door", { p_player: U(4), p_room: R, p_floor: 1, p_door_kind: "chest" });
// late join mid-floor (U5): plays from next floor
ok((await rpc("join_room", { p_player: U(5), p_code: "ROOM" })).ok, "late join");
ok((await one(`select active_from_floor a, chips c from public.room_players where room_id='${R}' and player_id='${U(5)}'`)).a === 2, "late joiner active from floor 2");
await err(rpc("choose_door", { p_player: U(5), p_room: R, p_floor: 1, p_door_kind: "easy" }), "not_active");
// eliminated cannot choose
await db.exec(`update public.room_players set eliminated=true where room_id='${R}' and player_id='${U(4)}'`);
await err(rpc("choose_door", { p_player: U(4), p_room: R, p_floor: 1, p_door_kind: "easy" }), "not_active", "eliminated");
await db.exec(`update public.room_players set eliminated=false where room_id='${R}' and player_id='${U(4)}'`);
// doors -> betting: fighters 1,2,3 (U3 default door easy, U4 took a chest)
ok((await rpc("advance_phase", { p_room: R, p_expected_seq: 3, p_to_phase: "betting", p_deadline: T(70), p_now: T(40) })).reason === "not_due", "doors not due yet");
await err(rpc("advance_phase", { p_room: R, p_expected_seq: 3, p_to_phase: "betting", p_deadline: T(70), p_now: T(60) }), "invalid_args", "fighters required");
const fighters = [
  { player: U(1), door_kind: "hard", fight_seed: 11 },
  { player: U(2), door_kind: "easy", fight_seed: 12 },
  { player: U(3), door_kind: "easy", fight_seed: 13 },
];
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 3, p_to_phase: "betting", p_deadline: T(75), p_now: T(60), p_fighters: fighters });
ok(a.advanced && a.state.phase === "betting", "to betting");
const key = (n) => `r1f1:${U(n)}`;
ok((await q(`select * from public.room_battles where room_id='${R}'`)).length === 3, "3 battles opened");
ok((await one(`select door_kind,fight_seed from public.room_floor where room_id='${R}' and player_id='${U(1)}'`)).fight_seed == 11, "room_floor fight_seed");
// bets & interference
await rpc("place_bet", { p_room: R, p_bettor: U(4), p_battle_key: key(1), p_prediction: "lose", p_stake: 40 });
await rpc("place_bet", { p_room: R, p_bettor: U(5), p_battle_key: key(1), p_prediction: "win", p_stake: 20 });
await rpc("place_bet", { p_room: R, p_bettor: U(2), p_battle_key: key(1), p_prediction: "win", p_stake: 10 }); // fighters may bet on others
await rpc("place_bet", { p_room: R, p_bettor: U(4), p_battle_key: key(2), p_prediction: "win", p_stake: 30 }); // only winners -> void
await rpc("place_bet", { p_room: R, p_bettor: U(1), p_battle_key: key(3), p_prediction: "lose", p_stake: 25 });
await rpc("place_bet", { p_room: R, p_bettor: U(5), p_battle_key: key(3), p_prediction: "win", p_stake: 25 });
const ip = await rpc("place_interference", { p_room: R, p_from: U(4), p_battle_key: key(1), p_kind: "stronger_enemy" });
ok(ip.cost === 30, "interference");
await err(rpc("interfere", { p_room: R, p_from: U(5), p_battle_key: key(1), p_kind: "adverse_element" }), "already_interfered");
await rpc("interfere", { p_room: R, p_from: U(5), p_battle_key: key(2), p_kind: "adverse_element" });
await rpc("interfere", { p_room: R, p_from: U(1), p_battle_key: key(3), p_kind: "stronger_enemy" }); // U3 will flee
ok((await one(`select interfered from public.room_battles where room_id='${R}' and battle_key='${key(1)}'`)).interfered === true, "interfered flag");
// secrecy of interference identity
ok((await as("authenticated", U(2), () => db.query(`select * from public.interferences where room_id='${R}'`))).rows.length === 0, "interference hidden from others before reveal");
ok((await as("authenticated", U(4), () => db.query(`select * from public.interferences where room_id='${R}'`))).rows.length === 1, "interferer sees own");
ok((await as("authenticated", U(2), () => db.query(`select * from public.chip_ledger where room_id='${R}' and reason='interfere'`))).rows.length === 0, "ledger hides interfere rows");
ok((await as("authenticated", U(4), () => db.query(`select * from public.chip_ledger where room_id='${R}' and reason='interfere'`))).rows.length === 1, "own interfere ledger visible");
await conserved(R, "betting");
// betting -> fighting: U3 dropped (not kept) -> void no_fight incl. interference refund (U1 paid 30)
const before = await chips(R);
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 4, p_to_phase: "fighting", p_deadline: T(150), p_now: T(75), p_fighters: [U(1), U(2)] });
ok(a.advanced && a.state.phase === "fighting", "to fighting");
ok((await one(`select status,outcome,void_reason from public.room_battles where room_id='${R}' and battle_key='${key(3)}'`)).void_reason === "no_fight", "dropped fighter voided");
const after = await chips(R);
ok(after[U(1)] === before[U(1)] + 25 + 30 && after[U(5)] === before[U(5)] + 25, "refunds incl interference (no_fight): " + JSON.stringify([before[U(1)], after[U(1)]]));
await err(rpc("place_bet", { p_room: R, p_bettor: U(3), p_battle_key: key(1), p_prediction: "win", p_stake: 10 }), "battle_locked");
// submit results
await err(rpc("submit_floor_result", { p_player: U(4), p_room: R, p_floor: 1, p_outcome: "won" }), "not_fighting", "non-fighter");
await err(rpc("submit_floor_result", { p_player: U(1), p_room: R, p_floor: 1, p_outcome: "cheat" }), "invalid_args");
await err(rpc("submit_floor_result", { p_player: U(1), p_room: R, p_floor: 2, p_outcome: "won" }), "wrong_phase");
let sr = await rpc("submit_floor_result", { p_player: U(1), p_room: R, p_floor: 1, p_outcome: "won", p_actions: [{ t: "act", a: "attack1" }], p_run_after: { floor: 2 } });
ok(sr.outcome === "won" && sr.replayed === false, "submit");
sr = await rpc("submit_floor_result", { p_player: U(1), p_room: R, p_floor: 1, p_outcome: "lost" });
ok(sr.outcome === "won" && sr.replayed === true, "submit idempotent keeps first result");
// U2 never submits -> timeout (lose)
const pre = await chips(R);
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 5, p_to_phase: "reveal", p_deadline: T(170), p_now: T(100), p_early: true });
ok(a.advanced && a.state.phase === "reveal", "early advance to reveal");
const post = await chips(R);
// battle1: U1 won. bets: U4 lose 40, U5 win 20, U2 win 10. Winners split 40: U5 gets 20+floor(20*40/30)=46, U2 10+floor(10*40/30)=23 ; dust 1. Comp 15 to U1.
ok(post[U(5)] - pre[U(5)] === 46 && post[U(2)] - pre[U(2)] === 23, "pool payout " + JSON.stringify([post[U(5)] - pre[U(5)], post[U(2)] - pre[U(2)]]));
ok(post[U(1)] - pre[U(1)] === 15, "15-chip comp to target who won despite interference");
ok(post[U(4)] === pre[U(4)] + 30, "U4: only the void bet on U2 refunded (30), interference cost kept & stake lost: " + (post[U(4)] - pre[U(4)]));
ok((await one(`select outcome from public.room_floor where room_id='${R}' and player_id='${U(2)}'`)).outcome === "timeout", "no submission -> timeout");
ok((await one(`select outcome,void_reason from public.room_battles where room_id='${R}' and battle_key='${key(2)}'`)).outcome === "lose", "U2 lost");
// battle2: only 'win' bet by U4 -> no losing side -> voided pool, refund 30 (already counted), interference by U5 kept
ok((await one(`select status from public.bets where room_id='${R}' and battle_key='${key(2)}'`)).status === "void", "one-sided pool void");
await conserved(R, "reveal");
// total supply identity: 5 players * 100 - interference kept (U4 30 + U5 30 (key2 lost)) + comp 15 - dust 1 ... compute from ledger above
const supply = (await one(`select sum(chips)::int s from public.room_players where room_id='${R}'`)).s;
ok(supply === 500 - 30 - 30 + 15 - 1 || supply === 500 - 30 - 30 + 15 - 1 + 0, "supply = issued - kept interference + comp - dust: " + supply);
// re-settle is idempotent
const sf = await rpc("settle_floor", { p_room: R, p_floor: 1 });
ok(sf.battles.length === 0, "settle_floor idempotent");
await err(rpc("settle_battle", { p_room: R, p_battle_key: key(1), p_outcome: "win" }), "battle_settled");
// interference revealed after settle
ok((await as("authenticated", U(2), () => db.query(`select * from public.interferences where room_id='${R}' and battle_key='${key(1)}'`))).rows.length === 1, "interference revealed after settle");
// state readable by members only
ok((await as("authenticated", U(2), () => db.query(`select * from public.room_state`))).rows.length === 1, "member reads room_state");
ok((await as("authenticated", U(8), () => db.query(`select * from public.room_state`))).rows.length === 0, "non-member no room_state");
ok((await as("authenticated", U(8), () => db.query(`select player_id,outcome from public.room_floor`))).rows.length === 0, "non-member no room_floor");
ok((await as("authenticated", U(2), () => db.query(`select player_id,outcome,door_kind from public.room_floor`))).rows.length >= 3, "member reads room_floor public cols");
await err(as("authenticated", U(2), () => db.query(`select actions from public.room_floor`)), "permission denied", "actions column hidden");
await err(as("authenticated", U(2), () => db.query(`select run_after from public.room_floor`)), "permission denied", "run_after hidden");
await err(as("authenticated", U(2), () => db.query(`select * from public.room_floor`)), "permission denied", "select * on room_floor");
await err(as("authenticated", U(1), () => db.query(`update public.room_state set phase='closed'`)), "permission denied", "client write room_state");
await err(as("authenticated", U(1), () => db.query(`update public.room_players set chips=999999`)), "permission denied", "client write chips");
await err(as("authenticated", U(1), () => db.query(`select public.advance_phase('${R}',6,'floor_intro',now())`)), "permission denied", "client rpc");
await err(as("anon", null, () => db.query(`select * from public.room_state`)), "permission denied", "anon room_state");

// ---- finish floor 1 -> floor 2 -> new late joiner can play; round end; round 2
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 6, p_to_phase: "floor_intro", p_deadline: T(180), p_now: T(175) });
ok(a.advanced && a.state.floor === 2, "next floor");
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 7, p_to_phase: "doors", p_deadline: T(200), p_now: T(181) });
d = await rpc("choose_door", { p_player: U(5), p_room: R, p_floor: 2, p_door_kind: "rest" });
ok(d.door_kind === "rest", "late joiner plays next floor");
// no fighters: doors -> reveal -> round_end
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 8, p_to_phase: "reveal", p_deadline: T(230), p_now: T(201) });
ok(a.advanced, "doors -> reveal when nobody fights");
await err(rpc("advance_phase", { p_room: R, p_expected_seq: 9, p_to_phase: "floor_intro", p_deadline: T(240), p_now: T(231), p_floor: 5 }), "invalid_args", "floor must be floor+1");
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 9, p_to_phase: "round_end", p_deadline: T(400), p_now: T(231) });
ok(a.advanced && a.state.phase === "round_end", "round_end");
await err(rpc("advance_phase", { p_room: R, p_expected_seq: 10, p_to_phase: "round_setup", p_deadline: T(450), p_now: T(401) }), "invalid_args", "seed required");
a = await rpc("advance_phase", { p_room: R, p_expected_seq: 10, p_to_phase: "round_setup", p_deadline: T(450), p_now: T(401), p_seed: 777 });
ok(a.advanced && a.state.round === 2 && a.state.floor === 0 && a.state.round_seed === 777, "round 2");
ok((await one(`select count(*)::int c from public.room_players where room_id='${R}' and active_from_floor>0`)).c === 0, "active_from reset on new round");

// ---------------------------------------------------- leave / kick / transfer
const R2 = (await rpc("create_room", { p_player: U(6), p_code: "TWOP" })).room_id; // 2-player room
await rpc("join_room", { p_player: U(7), p_code: "TWOP" });
await rpc("start_round", { p_player: U(6), p_room: R2, p_seed: 1, p_now: T(0) });
await rpc("advance_phase", { p_room: R2, p_expected_seq: 1, p_to_phase: "floor_intro", p_deadline: T(33), p_now: T(0), p_early: true });
await rpc("advance_phase", { p_room: R2, p_expected_seq: 2, p_to_phase: "doors", p_deadline: T(50), p_now: T(0), p_early: true });
await rpc("advance_phase", { p_room: R2, p_expected_seq: 3, p_to_phase: "betting", p_deadline: T(70), p_now: T(0), p_early: true,
  p_fighters: [{ player: U(6), door_kind: "easy" }, { player: U(7), door_kind: "easy" }] });
const k6 = `r1f1:${U(6)}`, k7 = `r1f1:${U(7)}`;
await rpc("place_bet", { p_room: R2, p_bettor: U(7), p_battle_key: k6, p_prediction: "lose", p_stake: 50 });
await rpc("place_bet", { p_room: R2, p_bettor: U(6), p_battle_key: k7, p_prediction: "win", p_stake: 20 });
await rpc("interfere", { p_room: R2, p_from: U(7), p_battle_key: k6, p_kind: "adverse_element" });
await rpc("advance_phase", { p_room: R2, p_expected_seq: 4, p_to_phase: "fighting", p_deadline: T(150), p_now: T(0), p_early: true });
// U6 leaves mid-fight: battle voided as fled (bets refunded, interference kept)
await rpc("leave_room", { p_player: U(6), p_room: R2 });
ok((await one(`select void_reason,status from public.room_battles where room_id='${R2}' and battle_key='${k6}'`)).void_reason === "fled", "leave mid-fight = fled");
ok((await one(`select host_id from public.rooms where id='${R2}'`)).host_id === U(7), "host moved to U7");
ok((await one(`select present from public.room_players where room_id='${R2}' and player_id='${U(6)}'`)).present === false, "left -> absent");
await rpc("submit_floor_result", { p_player: U(7), p_room: R2, p_floor: 1, p_outcome: "lost" });
await rpc("advance_phase", { p_room: R2, p_expected_seq: 5, p_to_phase: "reveal", p_deadline: T(170), p_now: T(0), p_early: true });
let c2 = await chips(R2);
// U7 lost: bet by U6 (win, 20) on U7 is one-sided -> refund; U7's bet on U6 refunded (void fled); interference 30 kept
ok(c2[U(6)] === 100 && c2[U(7)] === 70, "2-player edge chips " + JSON.stringify(c2));
await conserved(R2, "2p");
// rejoin keeps chips, plays next floor
await rpc("join_room", { p_player: U(6), p_code: "TWOP" });
ok((await one(`select active_from_floor a, chips c from public.room_players where room_id='${R2}' and player_id='${U(6)}'`)).a === 2, "rejoin spectates this floor");
// kick + transfer + close with open battles
await err(rpc("kick_player", { p_host: U(6), p_room: R2, p_target: U(7) }), "forbidden");
await err(rpc("kick_player", { p_host: U(7), p_room: R2, p_target: U(7) }), "invalid_args");
await err(rpc("transfer_host", { p_host: U(6), p_room: R2, p_to: U(7) }), "forbidden");
const th = await rpc("transfer_host", { p_host: U(7), p_room: R2, p_to: U(6) });
ok(th.host_id === U(6), "transfer_host");
await err(rpc("transfer_host", { p_host: U(6), p_room: R2, p_to: U(8) }), "not_member");
await rpc("kick_player", { p_host: U(6), p_room: R2, p_target: U(7) });
ok((await as("authenticated", U(7), () => db.query(`select * from public.room_state`))).rows.length === 0, "kicked loses visibility");
await rpc("join_room", { p_player: U(7), p_code: "TWOP" });

// close with an open battle: everything refunded incl. interference
const R3 = (await rpc("create_room", { p_player: U(8), p_code: "CLOS" })).room_id;
await rpc("join_room", { p_player: U(2), p_code: "CLOS" });
await rpc("start_round", { p_player: U(8), p_room: R3, p_seed: 3, p_now: T(0) });
for (const [seq, to] of [[1, "floor_intro"], [2, "doors"]]) await rpc("advance_phase", { p_room: R3, p_expected_seq: seq, p_to_phase: to, p_deadline: T(99), p_now: T(0), p_early: true });
await rpc("advance_phase", { p_room: R3, p_expected_seq: 3, p_to_phase: "betting", p_deadline: T(99), p_now: T(0), p_early: true, p_fighters: [{ player: U(8), door_kind: "easy" }] });
await rpc("place_bet", { p_room: R3, p_bettor: U(2), p_battle_key: `r1f1:${U(8)}`, p_prediction: "win", p_stake: 60 });
await rpc("interfere", { p_room: R3, p_from: U(2), p_battle_key: `r1f1:${U(8)}`, p_kind: "stronger_enemy" });
await err(rpc("close_room", { p_player: U(2), p_room: R3 }), "forbidden");
await rpc("close_room", { p_player: U(8), p_room: R3 });
c2 = await chips(R3);
ok(c2[U(2)] === 100 && c2[U(8)] === 100, "close_room refunds bets and interference " + JSON.stringify(c2));
ok((await st(R3)).phase === "closed", "room_state closed");
await err(rpc("advance_phase", { p_room: R3, p_expected_seq: 5, p_to_phase: "reveal", p_deadline: T(1), p_now: T(0) }), "room_closed");
await conserved(R3, "closed");

// ------------------------------------------------------- presence / sweep
await db.exec(`update public.room_players set last_seen_at = '${T(0)}' where room_id='${R}'`);
await rpc("mark_presence", { p_player: U(2), p_room: R, p_present: true });
await db.exec(`update public.room_players set last_seen_at = now() where room_id='${R}' and player_id='${U(2)}'`);
let sw = await rpc("sweep_presence", { p_room: R, p_stale_seconds: 10, p_host_grace_seconds: 60, p_now: new Date(Date.now() + 5_000).toISOString() });
ok(!sw.absent.includes(U(2)) && sw.absent.includes(U(1)) && sw.host_transferred === true && sw.host_id === U(2), "sweep: stale marked absent, host moves to oldest present " + JSON.stringify(sw));
ok((await one(`select host_id from public.rooms where id='${R}'`)).host_id === U(2), "host persisted");
await rpc("mark_presence", { p_player: U(1), p_room: R });
ok((await one(`select present from public.room_players where room_id='${R}' and player_id='${U(1)}'`)).present === true, "heartbeat restores presence");
await err(rpc("mark_presence", { p_player: U(8), p_room: R }), "not_member");

// ---------------------------------------------------------- night summary
const ns = await rpc("night_summary", { p_room: R });
ok(ns.players.length === 5 && Object.keys(ns.players[0]).sort().join() === "bet_net,chips,interferences,losses,max_floor,name,player_id,wins", "summary columns " + JSON.stringify(Object.keys(ns.players[0])));
const u1 = ns.players.find((p) => p.player_id === U(1));
ok(u1.wins === 1 && u1.max_floor === 1, "summary wins/max_floor");
ok(ns.awards.gafe === U(2) && ns.awards.saboteador !== null, "awards " + JSON.stringify(ns.awards));
// max floor uses round offset: floor 2 in round 2 => 2 + 3
await db.exec(`insert into public.room_floor(room_id,round,floor,player_id,status,outcome) values ('${R}',2,2,'${U(3)}','fought','won')`);
ok((await rpc("night_summary", { p_room: R })).players.find((p) => p.player_id === U(3)).max_floor === 5, "offset in max_floor");

// --------------------------------------------------- settle_battle void API
const R4 = (await rpc("create_room", { p_player: U(3), p_code: "VOID" })).room_id;
await rpc("join_room", { p_player: U(4), p_code: "VOID" });
await rpc("open_battle", { p_room: R4, p_fighter: U(3), p_battle_key: "x1" });
await rpc("place_bet", { p_room: R4, p_bettor: U(4), p_battle_key: "x1", p_prediction: "win", p_stake: 40 });
await err(rpc("settle_battle", { p_room: R4, p_battle_key: "x1", p_outcome: "void" }), "invalid_args", "void needs reason");
await err(rpc("settle_battle", { p_room: R4, p_battle_key: "x1", p_outcome: "draw" }), "invalid_args");
const sv = await rpc("settle_battle", { p_room: R4, p_battle_key: "x1", p_outcome: "void", p_void_reason: "fled" });
ok(sv.voided === true && (await chips(R4))[U(4)] === 100, "void refunds");
await conserved(R4, "void");

// ------------------------------------------------------ function hygiene
const bad = (await q(`select proname from pg_proc where pronamespace='public'::regnamespace and (proconfig is null or not proconfig::text like '%search_path%')`));
ok(bad.length === 0, "search_path set everywhere " + JSON.stringify(bad));
const leaks = (await q(`select proname from pg_proc where pronamespace='public'::regnamespace and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute')) and proname not in ('is_room_member','is_room_topic_member')`));
ok(leaks.length === 0, "function leaks " + JSON.stringify(leaks));
for (const t of ["room_state", "room_floor"]) {
  ok((await one(`select relrowsecurity r from pg_class where oid='public.${t}'::regclass`)).r === true, "RLS on " + t);
  for (const role of ["anon", "authenticated"]) for (const pv of ["insert", "update", "delete"])
    ok((await one(`select has_table_privilege('${role}','public.${t}','${pv}') h`)).h === false, `${role} ${pv} ${t}`);
}
// realtime: non-member cannot receive; member can (topic is the existing room:<uuid>)
await db.exec(`insert into realtime.messages(topic,extension,payload) values ('room:${R}','broadcast','{}')`);
const rt = (uid) => as("authenticated", uid, async () => { await db.exec(`select set_config('realtime.topic','room:${R}',false)`); return (await db.query(`select * from realtime.messages`)).rows.length; });
ok((await rt(U(2))) >= 1, "member receives room topic");
ok((await rt(U(8))) === 0, "non-member cannot read room topic");
await err(as("authenticated", U(8), async () => { await db.exec(`select set_config('realtime.topic','room:${R}',false)`); await db.query(`insert into realtime.messages(topic,extension,payload) values ('room:${R}','broadcast','{}')`); }), "row-level security", "non-member send");
// constraints
await err(db.exec(`update public.room_state set phase='nope' where room_id='${R}'`), "violates check", "phase enum");
await err(db.exec(`update public.room_state set round=6 where room_id='${R}'`), "violates check", "round range");
await err(db.exec(`insert into public.room_floor(room_id,round,floor,player_id,outcome) values ('${R}',1,3,'${U(1)}','cheated')`), "violates check", "outcome enum");
await err(db.exec(`insert into public.chip_ledger(room_id,player_id,delta,reason) values ('${R}','${U(1)}',1,'free_money')`), "violates check", "ledger reason enum");
// ---------------------------------------- randomized chip conservation (SQL)
{
  let seed = 12345;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (const r of await q(`select id, host_id from public.rooms where status='open'`)) await rpc("close_room", { p_player: r.host_id, p_room: r.id });
  let settledTotal = 0, compTotal = 0;
  for (let it = 0; it < 30; it++) {
    const code = "Q" + String.fromCharCode(65 + (it % 26)) + String.fromCharCode(65 + Math.floor(it / 26)) + "Z";
    const ids = [1, 2, 3, 4, 5].slice(0, 2 + Math.floor(rnd() * 4)).map(U);
    const RR = (await rpc("create_room", { p_player: ids[0], p_code: code })).room_id;
    for (const id of ids.slice(1)) await rpc("join_room", { p_player: id, p_code: code });
    await rpc("start_round", { p_player: ids[0], p_room: RR, p_seed: it, p_now: T(0) });
    const adv = (seq, to, extra = {}) => rpc("advance_phase", { p_room: RR, p_expected_seq: seq, p_to_phase: to, p_deadline: T(999), p_now: T(0), p_early: true, ...extra });
    await adv(1, "floor_intro"); await adv(2, "doors");
    const fighters = ids.filter(() => rnd() < 0.7);
    if (fighters.length === 0) fighters.push(ids[0]);
    await adv(3, "betting", { p_fighters: fighters.map((p) => ({ player: p, door_kind: "easy" })) });
    for (const f of fighters) for (const b of ids) {
      const k = `r1f1:${f}`;
      if (b !== f && rnd() < 0.6) await rpc("place_bet", { p_room: RR, p_bettor: b, p_battle_key: k, p_prediction: pick(["win", "lose"]), p_stake: 10 + Math.floor(rnd() * 60) }).catch(() => {});
      if (b !== f && rnd() < 0.2) await rpc("interfere", { p_room: RR, p_from: b, p_battle_key: k, p_kind: "stronger_enemy" }).catch(() => {});
    }
    await conserved(RR, "rand betting " + it);
    const keep = fighters.filter(() => rnd() < 0.85);
    await adv(4, keep.length ? "fighting" : "reveal", keep.length ? { p_fighters: keep } : {});
    if (keep.length) {
      for (const f of keep) { const o = pick(["won", "lost", "fled", null]); if (o) await rpc("submit_floor_result", { p_player: f, p_room: RR, p_floor: 1, p_outcome: o }); }
      if (rnd() < 0.3) await rpc("leave_room", { p_player: pick(keep), p_room: RR }).catch(() => {});
      await adv(5, "reveal").catch((e) => { if (!String(e.message).includes("room_closed")) throw e; }); // leaving host may close the room
    }
    await conserved(RR, "rand reveal " + it);
    settledTotal += (await one(`select count(*)::int c from public.room_battles where room_id='${RR}' and status='settled'`)).c;
    compTotal += (await one(`select count(*)::int c from public.chip_ledger where room_id='${RR}' and reason='interfere_comp'`)).c;
    const host = (await one(`select host_id from public.rooms where id='${RR}'`)).host_id;
    if ((await one(`select status from public.rooms where id='${RR}'`)).status === "open") await rpc("close_room", { p_player: host, p_room: RR });
    await conserved(RR, "rand closed " + it);
    ok((await one(`select count(*)::int c from public.room_battles where room_id='${RR}' and status<>'settled'`)).c === 0, "no stranded battles after close " + it);
  }
  ok(settledTotal > 20, "random run settled battles: " + settledTotal);
  console.log("random SQL chip run: battles settled", settledTotal, "comp payouts", compTotal);
}
console.log(`rooms flow: pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
