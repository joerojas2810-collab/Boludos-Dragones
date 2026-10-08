// 0024: first-clear bonus chest and the one-time dungeon reset. Run from repo root:
//   node supabase/tests/pglite/economy_v2.mjs
import { db, setup, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const U = "00000000-0000-0000-0000-000000000001";
await db.exec(`insert into auth.users(id,email) values ('${U}','ana@players.invalid')`);
await rpc("create_player", { p_user: U, p_name: "ana", p_name_key: "ana", p_is_admin: false });
const coins = async () => (await db.query(`select coins from public.player_state where player_id='${U}'`)).rows[0].coins;
const start = (seed) => rpc("start_run", { p_player: U, p_character_id: null, p_seed: seed, p_hero: {} }).catch(() =>
  rpc("start_run", { p_player: U, p_character_id: "c-mago-fuego-f", p_seed: seed, p_hero: {} }));
const err = async (p, msg) => { try { await p; fail++; console.log("FAIL (no error):", msg); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", msg, "got", e.message); } } };
// bank_run (0030) only pays coins: clears, loot and parts are refused (levels use bank_level)
const r1 = await start(1);
const base = { p_player: U, p_run_id: r1.run_id, p_coins: 0, p_max_floor: 8 };
await err(rpc("bank_run", { ...base, p_clear: { rank: "f", lives: 3, asc: 0 } }), "invalid_args");
await err(rpc("bank_run", { ...base, p_loot: [{ type: "espada", element: "fuego", rarity: "ssr" }] }), "invalid_args");
await err(rpc("bank_run", { ...base, p_parts: { "core-agua": 5 } }), "invalid_args");
const c0 = await coins();
let b = await rpc("bank_run", { ...base, p_coins: 100 });
ok(b.coinsAdded === 100 && (await coins()) === c0 + 100, "plain coins still pay: " + JSON.stringify(b));
ok((await db.query(`select count(*)::int c from public.part_stock where player_id='${U}'`)).rows[0].c === 0 && (await db.query(`select count(*)::int c from public.weapons where player_id='${U}'`)).rows[0].c === 0, "no loot");
await db.exec(`insert into public.dungeon_clears (player_id, rank, best_lives, best_asc) values ('${U}','f',3,1),('${U}','s',2,2)`);
// reset: flag set, guarded
ok((await db.query(`select count(*)::int c from public.migration_flags where key='0024_reset_dungeons'`)).rows[0].c === 1, "flag");
await db.exec(`insert into public.characters(player_id,key,class,element,rarity,stars,data) values ('${U}','keepme','mago','fuego','f',0,'{}')`).catch(() => {});
// re-run the reset block: nothing happens (flag exists)
await db.exec(`do $$ begin if not exists (select 1 from public.migration_flags where key='0024_reset_dungeons') then delete from public.dungeon_clears; end if; end $$;`);
ok((await db.query(`select count(*)::int c from public.dungeon_clears`)).rows[0].c === 2, "re-run does not reset again");
// running setup.sql again must not wipe progress either
import fs from "fs";
await db.exec(fs.readFileSync(new URL("../../setup.sql", import.meta.url), "utf8"));
ok((await db.query(`select count(*)::int c from public.dungeon_clears`)).rows[0].c === 2, "setup.sql re-run keeps clears");
// simulate "production before 0024": drop the flag, re-run the migration -> clears wiped, rest kept
const chars = (await db.query(`select count(*)::int c from public.characters where player_id='${U}'`)).rows[0].c;
const coinsBefore = await coins();
await db.exec(`delete from public.migration_flags`);
await db.exec(fs.readFileSync(new URL("../../migrations/0024_economy_v2.sql", import.meta.url), "utf8"));
ok((await db.query(`select count(*)::int c from public.dungeon_clears`)).rows[0].c === 0, "reset wipes dungeon_clears");
ok((await db.query(`select count(*)::int c from public.characters where player_id='${U}'`)).rows[0].c === chars, "characters kept");
ok((await coins()) === coinsBefore, "coins kept");
console.log("pass", pass, "fail", fail);
process.exit(fail ? 1 : 0);
