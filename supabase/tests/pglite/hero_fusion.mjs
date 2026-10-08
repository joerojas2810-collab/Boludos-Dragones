// 0038: burn at 4% and fuse_heroes. Run from repo root:  node supabase/tests/pglite/hero_fusion.mjs
import { db, setup, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p, msg) => { try { await p; fail++; console.log("FAIL (no error):", msg); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", msg, "got", e.message); } } };
// the harness JSON-encodes objects; text[] needs a Postgres array literal
const arr = (a) => "{" + a.map((x) => `"${x}"`).join(",") + "}";
const fuse = (a) => rpc("fuse_heroes", { ...a, p_materials: arr(a.p_materials) });
const U = "00000000-0000-0000-0000-000000000001";
await db.exec(`insert into auth.users(id,email) values ('${U}','ana@players.invalid')`);
await rpc("create_player", { p_user: U, p_name: "ana", p_name_key: "ana", p_is_admin: false });
const state = async () => (await db.query(`select coins, version from public.player_state where player_id='${U}'`)).rows[0];
const keys = async () => (await db.query(`select key from public.characters where player_id='${U}' order by key`)).rows.map((r) => r.key);
const give = (cls, el, rar, extra = "", stars = 0) => db.exec(`insert into public.characters(player_id,class,element,rarity,stars,data${extra ? ",level,xp,skill" : ""}) values ('${U}','${cls}','${el}','${rar}',${stars},'{"name":"h"}'${extra})`);
await db.exec(`update public.player_state set coins = 5000 where player_id='${U}'`);
await db.exec(`delete from public.characters where player_id='${U}'`);
// base + 2 materials of rank f (ratio 3)
await give("mago", "fuego", "f", ",7,30,null", 4);
await give("mago", "agua", "f");
await give("caballero", "rayo", "f");
await db.exec(`insert into public.weapons(player_id,type,element,rarity) values ('${U}','baston','fuego','f')`);
await db.exec(`insert into public.equipment(player_id,character_key,weapon_key,slot) values ('${U}','c-mago-fuego-f','w-baston-fuego-f','arma')`);
let s = await state();
const args = { p_player: U, p_version: s.version, p_base: "c-mago-fuego-f", p_materials: ["c-mago-agua-f", "c-caballero-rayo-f"], p_coins: 20, p_data: { name: "Nuevo", traits: [] }, p_level: 7, p_xp: 30, p_stars: 1 };
await err(fuse({ ...args, p_version: s.version + 9 }), "conflict");
await err(fuse({ ...args, p_materials: ["c-mago-agua-f", "c-mago-agua-f"] }), "invalid_args");
await err(fuse({ ...args, p_materials: ["c-mago-agua-f", "c-mago-fuego-f"] }), "invalid_args");
await err(fuse({ ...args, p_coins: 999999 }), "invalid_args");
await err(fuse({ ...args, p_materials: ["c-mago-agua-f", "c-nada-nada-f"] }), "not_owned");
await give("mago", "viento", "e");
await err(fuse({ ...args, p_materials: ["c-mago-agua-f", "c-mago-viento-e"] }), "rank_mismatch");
await db.exec(`delete from public.characters where player_id='${U}' and key='c-mago-viento-e'`);
await give("mago", "tierra", "f"); // a base under 3 stars is refused
await err(fuse({ ...args, p_base: "c-mago-tierra-f", p_materials: ["c-mago-agua-f", "c-caballero-rayo-f"] }), "invalid_args");
await db.exec(`delete from public.characters where player_id='${U}' and key='c-mago-tierra-f'`);
const r = await fuse(args);
ok(r.key === "c-mago-fuego-e", "new key " + JSON.stringify(r));
ok(JSON.stringify(await keys()) === JSON.stringify(["c-mago-fuego-e"]), "only the new hero remains: " + (await keys()));
const h = (await db.query(`select level, xp, stars, rarity, legacy, data from public.characters where player_id='${U}'`)).rows[0];
ok(h.level === 7 && h.xp === 30 && h.stars === 1 && h.rarity === "e" && h.legacy === false && h.data.name === "Nuevo", "hero row " + JSON.stringify(h));
ok((await db.query(`select character_key from public.equipment where player_id='${U}'`)).rows[0]?.character_key === "c-mago-fuego-e", "gear followed the base");
s = await state();
ok(s.coins === 4980, "coins spent " + s.coins);
// star path: the target rank already owned
await give("caballero", "agua", "f", "", 3); await give("caballero", "fuego", "f"); await give("caballero", "tierra", "f");
await give("caballero", "agua", "e");
const before = await state();
await fuse({ p_player: U, p_version: before.version, p_base: "c-caballero-agua-f", p_materials: ["c-caballero-fuego-f", "c-caballero-tierra-f"], p_coins: 20, p_data: {}, p_level: 1, p_xp: 0 });
ok((await db.query(`select stars from public.characters where player_id='${U}' and key='c-caballero-agua-e'`)).rows[0].stars === 1, "duplicate got +1 star");
// burn is 4% now: F trade value 830 -> 33
const b = await state();
await give("clerigo", "agua", "f");
const burnt = await rpc("burn_hero", { p_player: U, p_version: b.version, p_key: "c-clerigo-agua-f" });
ok(burnt.gained === 33, "burn 4%: " + JSON.stringify(burnt));
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
