// 0038/0050: burn at 4%, hero copies (apply_pull, apply_hero_change, market_move). Run from repo root:  node supabase/tests/pglite/hero_fusion.mjs
import { db, setup, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p, msg) => { try { await p; fail++; console.log("FAIL (no error):", msg); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", msg, "got", e.message); } } };
// the harness JSON-encodes objects; text[] needs a Postgres array literal
const arr = (a) => "{" + a.map((x) => `"${x}"`).join(",") + "}";
const change = (a) => rpc("apply_hero_change", { p_coins: 0, p_equip: [], ...a, p_delete: arr(a.p_delete ?? []) });
const U = "00000000-0000-0000-0000-000000000001";
await db.exec(`insert into auth.users(id,email) values ('${U}','ana@players.invalid')`);
await rpc("create_player", { p_user: U, p_name: "ana", p_name_key: "ana", p_is_admin: false });
const state = async () => (await db.query(`select coins, version from public.player_state where player_id='${U}'`)).rows[0];
const keys = async () => (await db.query(`select key from public.characters where player_id='${U}' order by key`)).rows.map((r) => r.key);
const give = (cls, el, rar, extra = "", stars = 0, copies = []) => db.exec(`insert into public.characters(player_id,class,element,rarity,stars,copies,data${extra ? ",level,xp,skill" : ""}) values ('${U}','${cls}','${el}','${rar}',${stars},'${arr(copies)}','{"name":"h","traits":["terco"]}'${extra})`);
const row = async (key) => (await db.query(`select * from public.characters where player_id='${U}' and key='${key}'`)).rows[0];
const hero = (cls, el, rar, o = {}) => ({ class: cls, element: el, rarity: rar, stars: 0, level: 1, xp: 0, skill: null, legacy: false, copies: [], data: { name: "Nuevo", traits: ["terco"] }, ...o });
await db.exec(`update public.player_state set coins = 5000 where player_id='${U}'`);
await db.exec(`delete from public.characters where player_id='${U}'`);
// rank-up F -> E: the base becomes the new hero, two materials go, the gear follows, coins are spent
await give("mago", "fuego", "f", ",7,30,null", 4, ["glotón", "terco"]);
await give("mago", "agua", "f");
await give("caballero", "rayo", "f");
await db.exec(`insert into public.weapons(player_id,type,element,rarity) values ('${U}','baston','fuego','f')`);
await db.exec(`insert into public.equipment(player_id,character_key,weapon_key,slot) values ('${U}','c-mago-fuego-f','w-baston-fuego-f','arma')`);
let s = await state();
const args = {
  p_player: U, p_version: s.version, p_coins: 20,
  p_upsert: [hero("mago", "fuego", "e", { stars: 2, level: 7, xp: 30, copies: ["glotón"] })],
  p_delete: ["c-mago-fuego-f", "c-mago-agua-f", "c-caballero-rayo-f"],
  p_equip: [{ weapon: "w-baston-fuego-f", to: "c-mago-fuego-e" }],
};
await err(change({ ...args, p_version: s.version + 9 }), "conflict");
await err(change({ ...args, p_coins: 999999 }), "invalid_args");
await err(change({ ...args, p_delete: ["c-mago-fuego-e"] }), "invalid_args"); // upserted and deleted
await err(change({ ...args, p_delete: ["c-mago-agua-f", "c-nada-nada-f"] }), "not_owned");
await err(change({ ...args, p_upsert: [hero("mago", "fuego", "ss")] }), "invalid_args");
await err(change({ ...args, p_upsert: [hero("mago", "fuego", "e", { stars: 6 })] }), "invalid_args");
await err(change({ ...args, p_upsert: [hero("mago", "fuego", "e", { copies: Array(51).fill("terco") })] }), "invalid_args");
await err(change({ ...args, p_coins: 6000 }), "insufficient_coins");
ok(JSON.stringify(await keys()) === JSON.stringify(["c-caballero-rayo-f", "c-mago-agua-f", "c-mago-fuego-f"]), "failed calls change nothing");
await change(args);
ok(JSON.stringify(await keys()) === JSON.stringify(["c-mago-fuego-e"]), "only the new hero remains: " + (await keys()));
const h = await row("c-mago-fuego-e");
ok(h.level === 7 && h.xp === 30 && h.stars === 2 && h.legacy === false && h.data.name === "Nuevo" && h.copies.join() === "glotón", "hero row " + JSON.stringify(h));
ok((await db.query(`select character_key from public.equipment where player_id='${U}'`)).rows[0]?.character_key === "c-mago-fuego-e", "gear followed the base");
s = await state();
ok(s.coins === 4980, "coins spent " + s.coins);
// split: the base row is rewritten in place as a hero of the old rank; its gear is unequipped
await give("picaro", "agua", "c", ",12,0,null", 3, ["terco", "glotón"]);
await db.exec(`insert into public.weapons(player_id,type,element,rarity) values ('${U}','daga','agua','c')`);
await db.exec(`insert into public.equipment(player_id,character_key,weapon_key,slot) values ('${U}','c-picaro-agua-c','w-daga-agua-c','arma')`);
await change({
  p_player: U, p_version: s.version, p_coins: 0,
  p_upsert: [hero("picaro", "agua", "b", { stars: 1, level: 12 }), hero("picaro", "agua", "c", { copies: ["glotón"], data: { name: "h", traits: ["terco"] } })],
  p_delete: [],
  p_equip: [{ weapon: "w-daga-agua-c", to: "c-picaro-agua-b" }],
});
ok((await row("c-picaro-agua-c")).stars === 0 && (await row("c-picaro-agua-c")).level === 1, "split hero rewritten");
ok((await db.query(`select character_key from public.equipment where weapon_key='w-daga-agua-c'`)).rows[0].character_key === "c-picaro-agua-b", "gear moved to the new rank");
// unequip (merge): the weapon row is dropped
await db.exec(`insert into public.weapons(player_id,type,element,rarity) values ('${U}','hacha','fuego','f')`);
await db.exec(`insert into public.equipment(player_id,character_key,weapon_key,slot) values ('${U}','c-picaro-agua-c','w-hacha-fuego-f','arma')`);
await change({ p_player: U, p_version: (await state()).version, p_coins: 0, p_upsert: [hero("picaro", "agua", "c", { copies: ["glotón"] })], p_equip: [{ weapon: "w-hacha-fuego-f", to: null }] });
ok((await db.query(`select count(*)::int c from public.equipment where weapon_key='w-hacha-fuego-f'`)).rows[0].c === 0, "unequipped");

// apply_pull: a repeated hero is a spare copy with its own trait; stars do not move; refund at 50 copies
await give("clerigo", "tierra", "d", "", 1, ["terco"]);
const pullDup = async (idem) => {
  const v = (await state()).version;
  return rpc("apply_pull", { p_player: U, p_version: v, p_idem: idem, p_banner: "character", p_cost: 250, p_pity: 0, p_pity_ssr: 0, p_seed: 1, p_daily: false, p_items: [{ class: "clerigo", element: "tierra", rarity: "d", data: { name: "x", traits: ["fanfarron"] } }] });
};
const pr = await pullDup("dup-aaaaaaaa");
ok(pr.results[0].status === "copy" && pr.results[0].stars === 1, "dup status " + JSON.stringify(pr.results[0]));
const dup = await row("c-clerigo-tierra-d");
ok(dup.stars === 1 && dup.copies.join() === "terco,fanfarron", "copy stored with its trait " + dup.copies);
await db.exec(`update public.characters set copies = array_fill('terco'::text, array[50]) where player_id='${U}' and key='c-clerigo-tierra-d'`);
const rf = await pullDup("dup-bbbbbbbb");
ok(rf.results[0].status === "refund" && rf.results[0].refund === 125 && (await row("c-clerigo-tierra-d")).copies.length === 50, "refund at 50 copies " + JSON.stringify(rf.results[0]));
const prof = await rpc("get_profile", { p_player: U });
ok(Array.isArray(prof.characters.find((c) => c.id === "c-clerigo-tierra-d").data.copies), "get_profile returns the copies");

// market_move: the seller's last copy goes (with its trait); a new owner gets the hero with that trait
const V = "00000000-0000-0000-0000-000000000002";
await db.exec(`insert into auth.users(id,email) values ('${V}','bea@players.invalid')`);
await rpc("create_player", { p_user: V, p_name: "bea", p_name_key: "bea", p_is_admin: false });
await db.exec(`update public.characters set copies = '{terco,fanfarron}' where player_id='${U}' and key='c-clerigo-tierra-d'`);
await rpc("market_move", { p_from: U, p_to: V, p_kind: "character", p_key: "c-clerigo-tierra-d" });
const got = (await db.query(`select data, copies, stars from public.characters where player_id='${V}'`)).rows[0];
ok(got.data.traits.join() === "fanfarron" && got.stars === 0 && got.copies.length === 0, "new owner got the copy's trait " + JSON.stringify(got));
ok((await row("c-clerigo-tierra-d")).copies.join() === "terco", "seller lost that copy");
await rpc("market_move", { p_from: U, p_to: V, p_kind: "character", p_key: "c-clerigo-tierra-d" });
ok((await db.query(`select copies from public.characters where player_id='${V}'`)).rows[0].copies.join() === "terco", "owner got a copy added");
await err(rpc("market_move", { p_from: U, p_to: V, p_kind: "character", p_key: "c-clerigo-tierra-d" }), "not_owned");
// heroes are not burned any more (0050): the function is gone
await err(rpc("burn_hero", { p_player: U, p_version: (await state()).version, p_key: "c-clerigo-tierra-d" }), "burn_hero");
// 0039: leftover fragments are paid once as coins (40 each) and removed; spend_fragments is gone
import fs from "fs";
const c0 = (await state()).coins;
await db.exec(`insert into public.fragments(player_id,class,rarity,qty) values ('${U}','mago','f',2),('${U}','picaro','c',3)`);
await db.exec(`delete from public.migration_flags where key='0039_fragments_to_coins'`);
await db.exec(fs.readFileSync(new URL("../../migrations/0039_no_fragments.sql", import.meta.url), "utf8"));
ok((await state()).coins === c0 + 5 * 40, "fragments paid as coins");
ok((await db.query(`select count(*)::int c from public.fragments`)).rows[0].c === 0, "fragments removed");
await db.exec(fs.readFileSync(new URL("../../migrations/0039_no_fragments.sql", import.meta.url), "utf8"));
ok((await state()).coins === c0 + 5 * 40, "second run pays nothing");
console.log("pass", pass, "fail", fail);
process.exit(fail ? 1 : 0);
