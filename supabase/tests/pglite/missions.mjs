// Missions (0023). Run from repo root:  node supabase/tests/pglite/missions.mjs
import { db, setup, as, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p, msg) => { try { await p; fail++; console.log("FAIL (no error):", msg); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", msg, "got", e.message); } } };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const one = async (sql) => (await db.query(sql)).rows[0];
await db.exec(`insert into auth.users(id,email) values ('${U(1)}','p1@players.invalid')`);
await rpc("create_player", { p_user: U(1), p_name: "pl1", p_name_key: "pl1", p_is_admin: false });
const coins = async () => (await one(`select coins from public.player_state where player_id='${U(1)}'`)).coins;

// validation
await err(rpc("mission_add", { p_player: U(1), p_events: { "Bad Key": 1 } }), "invalid_args");
await err(rpc("mission_claim", { p_player: U(1), p_scope: "daily", p_reached: 1 }), "nothing_to_claim");
await err(rpc("mission_claim", { p_player: U(1), p_scope: "hax", p_reached: 1 }), "invalid_args");
// counting: daily + weekly always, event only Fri/Sat
await rpc("mission_add", { p_player: U(1), p_events: { fight_win: 3, "element_win:fuego": 2 } });
await rpc("mission_add", { p_player: U(1), p_events: { fight_win: 2 } });
let g = await rpc("mission_get", { p_player: U(1) });
ok(g.daily.progress.fight_win === 5 && g.weekly.progress.fight_win === 5, "counters add up in daily and weekly");
ok(g.daily.progress["element_win:fuego"] === 2, "param counters");
// claim pays from SQL constants (SCOPE_TIERS), once, and only the new tiers
const dados = async () => (await one(`select dados n from public.player_state where player_id='${U(1)}'`)).n;
const piece = (o = {}) => ({ type: "casco", element: "fuego", rarity: "f", name: "Casco", roll: 1, lines: [], ...o });
const c0 = await coins();
// attacks: wrong amounts / ranks / forged pieces, then nothing was paid or marked
await err(rpc("mission_claim", { p_player: U(1), p_scope: "daily", p_reached: 2, p_pieces: [piece()] }), "invalid_items"); // daily promises no piece
await err(rpc("mission_claim", { p_player: U(1), p_scope: "daily", p_reached: 4 }), "invalid_args");
await err(rpc("mission_claim", { p_player: U(1), p_scope: "daily", p_reached: 2, p_parts: { "p-espada-f": 2 } }), "function"); // the old signature is gone
ok((await coins()) === c0 && (await dados()) === 0, "failed claims pay nothing");
await rpc("mission_claim", { p_player: U(1), p_scope: "daily", p_reached: 2 });
ok((await coins()) === c0 + 400 && (await dados()) === 0, "daily tiers 1+2: 150 + 250 coins");
await err(rpc("mission_claim", { p_player: U(1), p_scope: "daily", p_reached: 2 }), "nothing_to_claim"); // claim twice
await err(rpc("mission_claim", { p_player: U(1), p_scope: "daily", p_reached: 1 }), "nothing_to_claim"); // lower tier
const r = await rpc("mission_claim", { p_player: U(1), p_scope: "daily", p_reached: 3 });
ok(r.coins === 700 && (await coins()) === c0 + 1100, "tier 3 pays 700");
// weekly: 500, 800 + 1 piece, 1500 + 1 Dado cargado; the piece goes through grant_piece
await err(rpc("mission_claim", { p_player: U(1), p_scope: "weekly", p_reached: 2 }), "invalid_items"); // piece missing
await err(rpc("mission_claim", { p_player: U(1), p_scope: "weekly", p_reached: 2, p_pieces: [piece({ rarity: "c", roll: 1, lines: [] })] }), "invalid_items"); // rank above best
await err(rpc("mission_claim", { p_player: U(1), p_scope: "weekly", p_reached: 2, p_pieces: [piece({ roll: 9 })] }), "invalid_items"); // forged roll
await err(rpc("mission_claim", { p_player: U(1), p_scope: "weekly", p_reached: 2, p_pieces: [piece({ type: "vara" })] }), "invalid_items");
await rpc("mission_claim", { p_player: U(1), p_scope: "weekly", p_reached: 2, p_pieces: [piece()] });
ok((await coins()) === c0 + 1100 + 1300, "weekly tiers 1+2 pay 1300");
ok((await one(`select count(*)::int n from public.weapons where player_id='${U(1)}' and type='casco'`)).n === 1, "the piece was granted");
await rpc("mission_claim", { p_player: U(1), p_scope: "weekly", p_reached: 3 });
ok((await coins()) === c0 + 1100 + 1300 + 1500 && (await dados()) === 1, "tier 3: 1500 + 1 Dado cargado");
// a higher best cleared rank allows higher parts: clear all of E at ascension 0
ok((await rpc("best_cleared_rank", { p_player: U(1) })) === "f", "best cleared rank defaults to F");
await db.exec(`insert into public.dungeon_progress (player_id, rank, ascension, cleared) values ('${U(1)}','f',0,6),('${U(1)}','e',0,6),('${U(1)}','d',0,3)`);
ok((await rpc("best_cleared_rank", { p_player: U(1) })) === "e", "best cleared rank = highest fully cleared dungeon");
// reroll once
await rpc("mission_reroll", { p_player: U(1), p_scope: "weekly", p_slot: 1 });
await err(rpc("mission_reroll", { p_player: U(1), p_scope: "weekly", p_slot: 0 }), "already_rerolled");
await err(rpc("mission_reroll", { p_player: U(1), p_scope: "event", p_slot: 0 }), "invalid_args");
// clients cannot call any of it
for (const f of ["mission_add", "mission_claim", "mission_get", "mission_bump"]) {
  const denied = await as("authenticated", U(1), async () => { try { await db.query(`select public.${f}('${U(1)}'${f==="mission_add"?",'{}'::jsonb":f==="mission_claim"?",'daily',1":f==="mission_bump"?",'x',1":""})`); return false; } catch { return true; } });
  ok(denied, f + " is closed to clients");
}
console.log(`missions: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
