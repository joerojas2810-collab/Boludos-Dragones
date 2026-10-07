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
const clear = async (seed, clearObj, runCoins = 0) => {
  const r = await rpc("start_run", { p_player: U, p_character_id: null, p_seed: seed, p_hero: {} }).catch(() =>
    rpc("start_run", { p_player: U, p_character_id: "c-mago-fuego-f", p_seed: seed, p_hero: {} }));
  return rpc("bank_run", { p_player: U, p_run_id: r.run_id, p_coins: runCoins, p_max_floor: 8, p_clear: clearObj });
};
// first clear of F at ascension 0: 4 x 30 = 120
let c0 = await coins();
let b = await clear(1, { rank: "f", lives: 3, asc: 0 }, 100);
ok(b.coinsAdded === 100 + 120, "first clear F: " + JSON.stringify(b));
// repeat clear of F: no bonus
b = await clear(2, { rank: "f", lives: 3, asc: 0 }, 100);
ok(b.coinsAdded === 100, "repeat F no bonus: " + JSON.stringify(b));
// new ascension level 1 in F: 2 x 2 x 30 = 120
b = await clear(3, { rank: "f", lives: 3, asc: 1 }, 0);
ok(b.coinsAdded === 120, "first asc 1: " + JSON.stringify(b));
b = await clear(4, { rank: "f", lives: 3, asc: 1 }, 0);
ok(b.coinsAdded === 0, "asc 1 again: " + JSON.stringify(b));
// first clear of S at ascension 2: 350 x (4 + 2x3) = 3500
b = await clear(5, { rank: "s", lives: 2, asc: 2 }, 0);
ok(b.coinsAdded === 3500, "S asc2 first: " + JSON.stringify(b));
ok((await coins()) === c0 + 100 + 120 + 100 + 120 + 3500, "coins total");
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
