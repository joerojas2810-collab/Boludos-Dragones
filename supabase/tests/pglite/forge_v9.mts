/* eslint-disable @typescript-eslint/no-explicit-any */
// 0041 Forja v9: part_stock conversion, Escamas/Dado in bank_level, apply_ascend, apply_upgrade, prizes.
// Run: npx tsx supabase/tests/pglite/forge_v9.mts
import fs from "fs";
import { db, setup, rpc, as } from "./harness.mjs";
import { levelEscamas } from "../../../src/lib/game/levelLoot";
import { levelDecay } from "../../../src/lib/game/levelPay";
import { generateCharacter } from "../../../src/lib/game/characters";
import { createRng } from "../../../src/lib/game/rng";
import { heroRow } from "../../../src/lib/server/testkit";

await setup();
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p: Promise<unknown>, msg: string, label?: string) => {
  try { const r = await p; fail++; console.log("FAIL (no error):", label || msg, JSON.stringify(r).slice(0, 120)); }
  catch (e) { if (String((e as Error).message).includes(msg)) pass++; else { fail++; console.log("FAIL:", label || msg, "got", (e as Error).message.slice(0, 150)); } }
};
const U = "00000000-0000-0000-0000-000000000001";
const q = async (sql: string) => (await db.query(sql)).rows as Record<string, any>[];
await db.exec(`insert into auth.users(id,email) values ('${U}','ana@players.invalid')`);
await rpc("create_player", { p_user: U, p_name: "ana", p_name_key: "ana", p_is_admin: false });
const st = async () => (await q(`select * from public.player_state where player_id='${U}'`))[0];

// 1. part_stock -> value, once. 3 S parts, 2 SS, 1 SSR = 3 + 4 + 4 = 11 Escamas; 2 F + 1 A + 1 C = 10 + 60 + 20 = 90 coins; 3 cores = 3 dice.
await db.exec(`update public.player_state set coins = 100 where player_id='${U}'`);
await db.exec(`insert into public.part_stock(player_id,key,qty) values
  ('${U}','p-espada-s',3),('${U}','p-casco-ss',2),('${U}','p-peto-ssr',1),
  ('${U}','p-daga-f',2),('${U}','p-maza-a',1),('${U}','p-libro-c',1),
  ('${U}','core-agua',2),('${U}','core-rayo',1)`);
await db.exec(`delete from public.migration_flags where key='0041_forge_v9'`);
const reapply = async () => { for (const f of ["0041_forge_v9.sql", "0042_forge_v9_fixes.sql"]) await db.exec(fs.readFileSync(new URL("../../migrations/" + f, import.meta.url), "utf8")); };
await reapply();
const s = await st();
ok(s.escamas === 11 && s.dados === 3 && s.coins === 190, "conversion " + JSON.stringify(s));
ok((await q(`select count(*)::int c from public.part_stock`))[0].c === 0, "part_stock emptied");
await reapply();
ok((await st()).escamas === 11, "the conversion runs only once");
const prof = await rpc("get_profile", { p_player: U });
ok(prof.escamas === 11 && prof.dados === 3 && prof.parts === undefined, "get_profile exposes escamas/dados, no parts");

// 2. level_escamas == levelEscamas (TS) for every case that can happen, first clears and repeats
let bad = 0;
for (const r of ["f", "a", "s", "ss", "ssr"] as const)
  for (let asc = 0; asc <= 5; asc++)
    for (const rep of [false, true])
      for (const n of [1, 15, 25, 50, 100]) {
        const m = rep ? levelDecay(n) : 1;
        const sql = (await q(`select public.level_escamas('${r}', ${asc}, ${rep}, ${m}) v`))[0].v;
        if (sql !== levelEscamas(r, asc, rep, m)) { bad++; console.log("parity", r, asc, rep, m, sql, levelEscamas(r, asc, rep, m)); }
      }
ok(bad === 0, "level_escamas parity with levelEscamas");
ok((await q(`select public.level_escamas('ssr', 5, true, 0.1) v`))[0].v === 0, "decayed repeats reach 0 (no farm)");

// 3. bank_level in an S dungeon: Escamas on every clear, Dado only on the last level, 2 per day
const h0 = generateCharacter(createRng(11), "caballero");
const hr = heroRow(h0, "s", 40);
await db.exec(`insert into public.characters(player_id,class,element,rarity,stars,data) values ('${U}','${hr.a}','${hr.element}','${hr.rarity}',${hr.stars},'${JSON.stringify(hr.data)}')`);
const HERO = hr.key;
const prog = (rank: string, n: number) => db.exec(`insert into public.dungeon_progress values ('${U}','${rank}',0,${n}) on conflict (player_id,rank,ascension) do update set cleared=${n}`);
for (const [r, n] of [["f", 6], ["e", 6], ["d", 7], ["c", 8], ["b", 8], ["a", 9]] as const) await prog(r, n);
const start = async (level: number) => (await db.exec(`delete from public.runs`), await rpc("start_level", { p_player: U, p_character_id: HERO, p_seed: 7, p_hero: { x: 1 }, p_rank: "s", p_level: level, p_asc: 0 })).run_id;
const bank = async (level: number, over: Record<string, unknown> = {}) => {
  const run = await start(level);
  const done = (await q(`select cleared from public.dungeon_progress where player_id='${U}' and rank='s' and ascension=0`))[0]?.cleared ?? 0;
  return rpc("bank_level", { p_player: U, p_run_id: run, p_hero_id: HERO, p_rank: "s", p_level: level, p_asc: 0, p_status: "cleared", p_xp: 10, p_dados: 0, p_pieces: [], p_repeat: level < done, ...over });
};
let e0 = (await st()).escamas;
let b = await bank(0);
ok(b.escamas === 2 && (await st()).escamas === e0 + 2, "first S level pays 2 Escamas " + JSON.stringify(b));
await err(bank(1, { p_dados: 1 }), "invalid_items", "Dado on a level that is not the last");
for (let l = 1; l <= 8; l++) await bank(l);
b = await bank(9, { p_dados: 1 });
ok(b.dados === 1 && (await st()).dados === 4, "last level pays the die " + JSON.stringify(b));
b = await bank(9, { p_dados: 1 });
ok(b.dados === 1 && (await st()).dados === 5, "repeat of the last level also pays it (2nd of the day)");
b = await bank(9, { p_dados: 1 });
ok(b.dados === 0 && (await st()).dados === 5, "3rd die of the day is dropped by SQL");
e0 = (await st()).escamas;
b = await bank(3);
ok(b.repeat && b.escamas === levelEscamas("s", 0, true, levelDecay(3)) && (await st()).escamas === e0 + b.escamas, "repeat Escamas follow the daily decay " + JSON.stringify(b));
await db.exec(`update public.player_state set dado_day = dado_day - 1 where player_id='${U}'`);
b = await bank(9, { p_dados: 1 });
ok(b.dados === 1, "the cap resets on a new game day");
await err(rpc("bank_level", { p_player: U, p_run_id: await start(0), p_hero_id: HERO, p_rank: "s", p_level: 0, p_asc: 0, p_status: "lost", p_xp: 0, p_dados: 1, p_pieces: [], p_repeat: true }), "invalid_args", "die on a lost level");

// 4. apply_ascend
const give = (type: string, el: string, rank: string, stars = 0) =>
  db.exec(`insert into public.weapons(player_id,type,element,rarity,stars,roll,data) values ('${U}','${type}','${el}','${rank}',${stars},1,'{"name":"${type}"}')`);
await db.exec(`delete from public.weapons where player_id='${U}'`);
await db.exec(`update public.player_state set coins = 5000 where player_id='${U}'`);
await give("espada", "fuego", "s"); await give("hacha", "agua", "s"); await give("casco", "rayo", "s");
await give("peto", "tierra", "ss"); // wrong rank for materials
const v = async () => (await st()).version;
const newp = { type: "espada", element: "fuego", rarity: "ss", name: "Espada", roll: 1.05 };
const asc = async (over: Record<string, unknown> = {}) => rpc("apply_ascend", { p_player: U, p_version: await v(), p_base: "w-espada-fuego-s", p_materials: ["w-hacha-agua-s", "w-casco-rayo-s"], p_new: newp, ...over });
await err(asc({ p_version: 999 }), "conflict");
await err(asc({ p_materials: ["w-hacha-agua-s"] }), "invalid_args", "too few materials");
await err(asc({ p_materials: ["w-hacha-agua-s", "w-hacha-agua-s"] }), "invalid_args", "repeated material");
await err(asc({ p_materials: ["w-hacha-agua-s", "w-espada-fuego-s"] }), "invalid_args", "base as material");
await err(asc({ p_materials: ["w-hacha-agua-s", "w-peto-tierra-ss"] }), "rank_mismatch");
await err(asc({ p_materials: ["w-hacha-agua-s", "w-nada-nada-s"] }), "not_owned");
await err(asc({ p_new: { ...newp, rarity: "ssr" } }), "invalid_items", "wrong target rank");
await err(asc({ p_new: { ...newp, type: "hacha" } }), "invalid_items", "wrong type");
await err(asc({ p_new: { ...newp, roll: 9 } }), "invalid_items", "forged roll");
await db.exec(`update public.player_state set coins = 100 where player_id='${U}'`);
await err(asc(), "insufficient_coins");
await db.exec(`update public.player_state set coins = 5000 where player_id='${U}'`);
// worn material is refused; a worn base keeps its slot
await db.exec(`insert into public.characters(player_id,class,element,rarity,stars,data) values ('${U}','mago','agua','f',0,'{}')`);
await db.exec(`insert into public.equipment(player_id,character_key,weapon_key,slot) values ('${U}','c-mago-agua-f','w-casco-rayo-s','casco')`);
await err(asc(), "equipped", "worn material");
await db.exec(`delete from public.equipment where player_id='${U}'`);
await db.exec(`insert into public.equipment(player_id,character_key,weapon_key,slot) values ('${U}','c-mago-agua-f','w-espada-fuego-s','arma')`);
const c1 = (await st()).coins;
const r = await asc();
ok(r.key === "w-espada-fuego-ss" && r.status === "new", "ascended " + JSON.stringify(r));
ok((await st()).coins === c1 - 1280, "S -> SS costs 1280");
ok((await q(`select key from public.weapons where player_id='${U}' order by key`)).map((x) => x.key).join() === "w-espada-fuego-ss,w-peto-tierra-ss", "base + materials consumed");
ok((await q(`select weapon_key from public.equipment where player_id='${U}'`))[0]?.weapon_key === "w-espada-fuego-ss", "worn base keeps its slot under the new key");
const nw = (await q(`select stars, plus, roll from public.weapons where key='w-espada-fuego-ss'`))[0];
ok(nw.stars === 0 && nw.plus === 0 && Number(nw.roll) === 1.05, "new piece: 0 stars, +0, server roll");
// collision: the target already exists -> +1 star, unless it is at max stars
await give("espada", "agua", "f"); await give("hacha", "agua", "f"); await give("daga", "agua", "f"); await give("arco", "agua", "f"); await give("maza", "agua", "f"); await give("libro", "agua", "f");
await give("espada", "agua", "e", 2);
const f = async () => rpc("apply_ascend", { p_player: U, p_version: await v(), p_base: "w-espada-agua-f", p_materials: ["w-hacha-agua-f", "w-daga-agua-f", "w-arco-agua-f", "w-maza-agua-f"], p_new: { type: "espada", element: "agua", rarity: "e", name: "E", roll: 1 } });
// F needs 6 pieces total (base + 5)
await err(f(), "invalid_args", "F needs 5 materials");
const r2 = await rpc("apply_ascend", { p_player: U, p_version: await v(), p_base: "w-espada-agua-f", p_materials: ["w-hacha-agua-f", "w-daga-agua-f", "w-arco-agua-f", "w-maza-agua-f", "w-libro-agua-f"], p_new: { type: "espada", element: "agua", rarity: "e", name: "E", roll: 1 } });
ok(r2.status === "star" && (await q(`select stars from public.weapons where key='w-espada-agua-e'`))[0].stars === 3, "existing target gets +1 star");
await err(rpc("apply_ascend", { p_player: U, p_version: await v(), p_base: "w-espada-fuego-ss", p_materials: ["w-peto-tierra-ss"], p_new: { type: "espada", element: "fuego", rarity: "ssr", name: "x", roll: 1 } }), "invalid_args", "SS needs 3 pieces");

// 5. apply_upgrade
await db.exec(`delete from public.weapons where player_id='${U}'`);
await give("casco", "fuego", "s", 5); await give("peto", "fuego", "a", 5); await give("daga", "fuego", "s", 4);
await db.exec(`update public.player_state set escamas = 12, dados = 1 where player_id='${U}'`);
const up = async (key: string, dado: boolean, success: boolean, over: Record<string, unknown> = {}) => rpc("apply_upgrade", { p_player: U, p_version: await v(), p_key: key, p_use_dado: dado, p_success: success, ...over });
await err(up("w-casco-fuego-s", false, true, { p_version: 1 }), "conflict");
await err(up("w-peto-fuego-a", false, true), "invalid_args", "rank A cannot be upgraded");
await err(up("w-daga-fuego-s", false, true), "invalid_args", "needs 5 stars");
await err(up("w-nada-fuego-s", false, true), "not_owned");
let u = await up("w-casco-fuego-s", false, true); // +0 -> +1 costs 1
ok(u.plus === 1 && u.plusStreak === 0 && u.escamas === 11, "+1 " + JSON.stringify(u));
u = await up("w-casco-fuego-s", false, false); // to +2 costs 2, fails
ok(u.plus === 1 && u.plusStreak === 1 && u.escamas === 9, "failure keeps the piece, loses the Escamas, adds a streak " + JSON.stringify(u));
u = await up("w-casco-fuego-s", true, false); // costs 2 + a die
ok(u.plusStreak === 2 && u.escamas === 7 && u.dados === 0, "a failed attempt with a die loses both");
await err(up("w-casco-fuego-s", true, true), "insufficient_dados");
u = await up("w-casco-fuego-s", false, true);
ok(u.plus === 2 && u.plusStreak === 0 && u.escamas === 5, "success resets the streak");
await db.exec(`update public.weapons set plus = 10 where key='w-casco-fuego-s'`);
await err(up("w-casco-fuego-s", false, true), "invalid_args", "already +10");
await db.exec(`update public.weapons set plus = 4 where key='w-casco-fuego-s'`);
await db.exec(`update public.player_state set escamas = 4 where player_id='${U}'`);
await err(up("w-casco-fuego-s", false, true), "insufficient_escamas"); // +5 costs 5
await db.exec(`update public.player_state set escamas = 5 where player_id='${U}'`);
u = await up("w-casco-fuego-s", false, true);
ok(u.plus === 5 && u.escamas === 0, "+5 costs 5 Escamas " + JSON.stringify(u));

// 6. the plus level reaches the profile; clients cannot call the new functions
const p2 = await rpc("get_profile", { p_player: U });
ok(p2.weapons.find((w: any) => w.id === "w-casco-fuego-s").data.plus === 5, "get_profile carries plus");
for (const f of ["apply_ascend", "apply_upgrade"])
  await as("authenticated", U, async () => { try { await db.query(`select public.${f}(null,null,null,null,null)`); fail++; console.log("FAIL: authenticated can call", f); } catch (e) { if (String((e as Error).message).includes("permission denied")) pass++; else { fail++; console.log("FAIL: ", f, (e as Error).message.slice(0, 100)); } } });
await err(rpc("apply_forge", {}), "function", "apply_forge is gone");

// 7. 0042 fixes
// materials with +N are refused; a worn base... (rank S needs 3 pieces in total)
await db.exec(`delete from public.weapons where player_id='${U}'`);
await db.exec(`update public.player_state set coins = 5000 where player_id='${U}'`);
await give("espada", "fuego", "s"); await give("hacha", "agua", "s"); await give("casco", "rayo", "s");
await db.exec(`update public.weapons set plus = 1 where key='w-hacha-agua-s'`);
await err(asc(), "material_upgraded");
await db.exec(`update public.weapons set plus = 0 where key='w-hacha-agua-s'`);
// target at max stars: grant_piece says refund/max_stars and NOTHING is consumed
await give("espada", "fuego", "ss", 5);
const before = (await q(`select count(*)::int c from public.weapons where player_id='${U}'`))[0].c;
await err(asc(), "max_stars");
ok((await q(`select count(*)::int c from public.weapons where player_id='${U}'`))[0].c === before, "failed ascend consumes nothing");
// lanza is gone from grant_piece
await err(rpc("grant_piece", { p_player: U, p_type: "lanza", p_element: "agua", p_rank: "f", p_name: "x", p_roll: 1, p_lines: null, p_refund_on_max: false }), "invalid_items", "no lanza");
// coop dice share the daily cap of 2 with the level drops
const H = "00000000-0000-0000-0000-000000000002";
await db.exec(`insert into auth.users(id,email) values ('${H}','host@players.invalid')`);
await rpc("create_player", { p_user: H, p_name: "host", p_name_key: "host", p_is_admin: true });
const room = await rpc("create_room", { p_player: H, p_code: "CAPA" });
await rpc("join_room", { p_player: U, p_code: "CAPA" });
await db.exec(`update public.player_state set dados = 0, dado_day = null, dado_n = 0 where player_id='${U}'`);
await db.exec(`update public.room_state set phase='night_summary' where room_id='${room.room_id}'`);
await db.exec(`insert into public.room_coop (room_id, player_id, damage, finished) values ('${room.room_id}','${U}', 10, true)`);
await db.exec(`update public.player_state set dado_day = public.game_day(), dado_n = 1 where player_id='${U}'`);
await rpc("coop_pay", { p_room: room.room_id, p_rows: [{ player: U, coins: 0, chips: 0, dados: 2 }] });
const sc = await st();
ok(sc.dados === 1 && sc.dado_n === 2, "coop pays only what fits in the daily cap " + JSON.stringify({ d: sc.dados, n: sc.dado_n }));
ok((await rpc("grant_dado_capped", { p_player: U, p_n: 1 })) === 0, "capped: nothing more today");
// mission rewards stay outside the cap (Viernes event, tier 3)
await db.exec(`insert into public.mission_state (player_id, scope, period, progress, claimed) values ('${U}','event',public.game_week(),'{}',0) on conflict do nothing`);
const mr = await rpc("mission_claim", { p_player: U, p_scope: "event", p_reached: 3 });
ok(mr.dados === 1 && (await st()).dados === 2 && (await st()).dado_n === 2, "mission Dado ignores the cap " + JSON.stringify(mr));

console.log(`forge_v9: pass ${pass} fail ${fail}`);
if (fail) process.exit(1);
