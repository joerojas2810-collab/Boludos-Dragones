// Berserker SQL: class and weapon-type checks and function lists accept the new ids.
// Run: npx tsx supabase/tests/pglite/berserker.mts
import { db, setup, rpc } from "./harness.mjs";

await setup();
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const P = "00000000-0000-0000-0000-000000000001";
await db.exec(`insert into auth.users(id,email) values ('${P}','ana@players.invalid')`);
await rpc("create_player", { p_user: P, p_name: "ana", p_name_key: "ana", p_is_admin: false });
await db.exec(`insert into public.characters (player_id, class, element, rarity) values ('${P}','berserker','fuego','f')`);
await db.exec(`insert into public.weapons (player_id, type, element, rarity) values ('${P}','mandoble','fuego','f'),('${P}','martillo','agua','f')`);
const n = (await db.query(`select count(*)::int as n from public.characters where class='berserker'`)).rows[0] as { n: number };
ok(n.n === 1, "berserker row stored");
const defs = (await db.query(
  `select string_agg(pg_get_functiondef(p.oid), '') as d from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prokind = 'f'`,
)).rows[0] as { d: string };
ok(!/array\['caballero', 'mago', 'picaro', 'clerigo'\]/.test(defs.d), "no function still lists only 4 classes");
ok(!/'varita', 'libro',(?! 'mandoble')/.test(defs.d), "no function still lists only 8 hand types");
console.log(`berserker: pass ${pass} fail ${fail}`);
