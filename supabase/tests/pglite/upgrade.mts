// Upgrade path check: a v7.0 database (old setup.sql) with a hero wearing a weapon AND
// gear must survive re-running the full setup.sql (the 0012 re-run bug) and the
// incremental upgrade_from_0025.sql, twice. Needs /tmp/old_setup.sql (git show v7.0:supabase/setup.sql).
import fs from "fs";
import { db } from "./harness.mjs";

const root = decodeURIComponent(new URL("../../", import.meta.url).pathname);
await db.exec(fs.readFileSync("/tmp/old_setup.sql", "utf8"));
const cols = async (t: string) =>
  (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='${t}'`)).rows.map((r: any) => r.column_name);
const uid = "9b307199-21c3-42c7-aa12-80251d676396";
await db.exec(`insert into auth.users(id,email) values ('${uid}','a@b.c')`);
await db.exec(`
insert into public.players(id,name,name_key) values ('${uid}','Joe','joe');
insert into public.characters(player_id,class,element,rarity,stars,data) values ('${uid}','mago','agua','c',1,'{}');
insert into public.weapons(player_id,type,element,rarity,stars,data) values
 ('${uid}','baston','agua','c',0,'{}'),('${uid}','casco','agua','c',0,'{}'),('${uid}','peto','agua','c',0,'{}');
`);
const ck = ((await db.query(`select key from public.characters`)).rows[0] as { key: string }).key;
const wk = (await db.query(`select type,key from public.weapons`)).rows as { type: string; key: string }[];
for (const w of wk)
  await db.exec(`insert into public.equipment(player_id,character_key,weapon_key,slot) values ('${uid}','${ck}','${w.key}','${w.type === "baston" ? "arma" : w.type}')`);
const count = async () => ((await db.query(`select count(*)::int n from public.equipment`)).rows[0] as { n: number }).n;
console.log("equipment before:", await count());
await db.exec(fs.readFileSync(root + "setup.sql", "utf8"));
console.log("after full setup.sql re-run:", await count());
await db.exec(fs.readFileSync(root + "setup.sql", "utf8"));
console.log("after second re-run:", await count());
await db.exec(fs.readFileSync(root + "upgrade_from_0025.sql", "utf8"));
console.log("after upgrade file:", await count());
const slots = (await db.query(`select slot from public.equipment order by slot`)).rows.map((r: any) => r.slot);
console.log("slots:", slots.join(","));
// Control: the OLD setup.sql re-run on a DB with several slots reproduces the reported error.
try {
  await db.exec(fs.readFileSync("/tmp/old_setup.sql", "utf8"));
  console.log("control: old setup re-run did NOT fail");
} catch (e) {
  console.log("control: old setup re-run fails as reported ->", (e as Error).message.slice(0, 80));
}
