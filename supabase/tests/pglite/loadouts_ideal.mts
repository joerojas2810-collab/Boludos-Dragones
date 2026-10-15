// 0058 class mastery + loadouts, upgrade_from_0057 and supabase/reset_progress_ideal.sql.
// Run: npx tsx supabase/tests/pglite/loadouts_ideal.mts
import fs from "fs";
import { db, rpc, as } from "./harness.mjs";
import { SKILLS, SKILL_IDS } from "../../../src/lib/game/skills";

const root = decodeURIComponent(new URL("../../", import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c: unknown, label: string) => { if (c) pass++; else { fail++; console.log("FAIL:", label); } };
const q = async (sql: string) => (await db.query(sql)).rows as Record<string, any>[];
const throws = (p: Promise<unknown>, code: string) => p.then(() => false, (e: Error) => e.message.includes(code));

// ---- a database at 0057 (every migration but 0058, lockdown last) ----
const dir = root + "migrations/";
const all = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const LAST = "0018_lockdown_functions.sql";
const old = [...all.filter((f) => f !== LAST && !f.startsWith("0058") && !f.startsWith("0059")), LAST];
await db.exec(old.map((f) => fs.readFileSync(dir + f, "utf8")).join("\n"));
ok(!(await q(`select 1 from pg_tables where tablename='class_mastery'`)).length, "0057 database has no class_mastery");

const A = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b2";
for (const [id, n] of [[A, "ana"], [B, "beto"]] as const) {
  await db.exec(`insert into auth.users(id,email) values ('${id}','${n}@players.invalid')`);
  await rpc("create_player", { p_user: id, p_name: n, p_name_key: n, p_is_admin: false });
}
const hero = (id: string, cls: string, el: string, lvl: number) =>
  db.exec(`insert into public.characters(player_id,class,element,rarity,stars,level,data) values ('${id}','${cls}','${el}','f',0,${lvl},'{}')`);
await hero(A, "mago", "fuego", 6);
await hero(A, "mago", "agua", 3);
await hero(A, "caballero", "tierra", 1);

// ---- upgrade_from_0057 over that database (twice: re-runnable) ----
await db.exec(fs.readFileSync(root + "upgrade_from_0057.sql", "utf8"));
await db.exec(fs.readFileSync(root + "upgrade_from_0057.sql", "utf8"));
const mast = async (id: string) =>
  Object.fromEntries((await q(`select class, level from public.class_mastery where player_id='${id}'`)).map((r) => [r.class, r.level]));
let m = await mast(A);
ok(m.mago === 6 && m.caballero === 1 && !("picaro" in m), "backfill takes the highest hero level per class");

// ---- trigger: monotonic, follows level updates and inserts ----
await db.exec(`update public.characters set level=9 where player_id='${A}' and element='agua'`);
ok((await mast(A)).mago === 9, "mastery rises with a hero level up");
await db.exec(`update public.characters set level=2 where player_id='${A}' and element='agua'`);
ok((await mast(A)).mago === 9, "mastery never goes down");
await hero(B, "berserker", "rayo", 12);
ok((await mast(B)).berserker === 12, "a new hero seeds its class mastery");
ok(await throws(db.exec(`insert into public.class_mastery values ('${B}','mago',-1)`), "violates"), "negative mastery is rejected");

// ---- set_loadout ----
const set = (id: string, scope: string, key: string, skills: unknown) =>
  rpc("set_loadout", { p_player: id, p_scope: scope, p_key: key, p_skills: skills });
const mageKey = "c-mago-fuego-f";
ok((await set(A, "hero", mageKey, ["mage_inscribe", "mage_barrier"])).skills[1] === "mage_barrier", "mastery 9 unlocks the tier-5 skill");
ok(await throws(set(A, "hero", mageKey, ["mage_inscribe", "mage_seal"]), "skill_locked"), "tier-12 skill is locked at mastery 9");
ok(await throws(set(A, "hero", "c-caballero-tierra-f", ["knight_advance", "knight_bastion"]), "skill_locked"), "caballero level 1 cannot equip tier 5");
ok(await throws(set(A, "hero", mageKey, ["mage_inscribe", "knight_advance"]), "invalid_skill"), "other-class skill rejected");
ok(await throws(set(A, "hero", mageKey, ["mage_inscribe", "mage_inscribe"]), "invalid_skill"), "duplicate skill rejected");
ok(await throws(set(A, "hero", mageKey, ["mage_inscribe", "fireball"]), "invalid_skill"), "unknown skill rejected");
ok(await throws(set(A, "hero", mageKey, ["mage_inscribe"]), "invalid_args"), "wrong length rejected");
ok(await throws(set(A, "hero", mageKey, { a: 1 }), "invalid_args"), "non-array rejected");
ok(await throws(set(A, "hero", "c-mago-rayo-f", ["mage_inscribe", "mage_detonate"]), "character_not_found"), "unowned hero rejected");
ok(await throws(set(B, "hero", mageKey, ["mage_inscribe", "mage_detonate"]), "character_not_found"), "another player's hero rejected");
ok(await throws(set(A, "weird", mageKey, ["mage_inscribe", "mage_detonate"]), "invalid_args"), "unknown scope rejected");
ok((await set(A, "level", "mago", ["mage_seal", "mage_barrier"])).key === "mago", "nivelado selection: all four skills available");
ok(await throws(set(A, "level", "mago", ["knight_advance", "knight_sweep"]), "invalid_skill"), "nivelado selection must match the class key");
await set(A, "hero", mageKey, ["mage_detonate", "mage_inscribe"]); // overwrite

// ---- get_profile ----
const prof = await rpc("get_profile", { p_player: A });
ok(prof.classMastery.mago === 9 && prof.classMastery.caballero === 1, "get_profile exposes classMastery");
ok(JSON.stringify(prof.loadouts[mageKey]) === JSON.stringify(["mage_detonate", "mage_inscribe"]), "get_profile exposes hero loadouts");
ok(JSON.stringify(prof.levelLoadouts.mago) === JSON.stringify(["mage_seal", "mage_barrier"]), "get_profile exposes levelLoadouts");
const profB = await rpc("get_profile", { p_player: B });
ok(Object.keys(profB.loadouts).length === 0 && Object.keys(profB.levelLoadouts).length === 0, "loadouts are per player");
ok(prof.characters.length === 3 && prof.coins !== undefined, "rest of get_profile intact");

// ---- SQL catalogue mirrors skills.ts ----
let sync = true;
for (const id of SKILL_IDS) {
  const cls = (await rpc("skill_class", { p_skill: id })) as string;
  const unlock = (await rpc("skill_unlock", { p_skill: id })) as number;
  if (cls !== SKILLS[id].classId || unlock !== SKILLS[id].unlock) { sync = false; console.log("  mismatch", id, cls, unlock); }
}
ok(sync, "skill_class / skill_unlock match src/lib/game/skills.ts for all 20 skills");

// ---- lockdown & RLS ----
for (const t of ["class_mastery", "skill_loadouts"]) {
  ok((await q(`select relrowsecurity from pg_class where relname='${t}'`))[0].relrowsecurity, `${t} has RLS`);
  ok(await as("authenticated", A, () => throws(db.query(`select * from public.${t}`), "permission denied")), `${t} closed to authenticated`);
  ok(await as("anon", null, () => throws(db.query(`select * from public.${t}`), "permission denied")), `${t} closed to anon`);
}
ok(await as("authenticated", A, () => throws(db.query(`select public.set_loadout('${A}','level','mago','["mage_seal","mage_barrier"]'::jsonb)`), "permission denied")), "set_loadout closed to authenticated");
ok(await as("anon", null, () => throws(db.query(`select public.get_profile('${A}')`), "permission denied")), "get_profile closed to anon");

// ---- reset_progress_ideal.sql ----
// populate progress everywhere the reset claims to wipe
await db.exec(`
insert into public.weapons(player_id,type,element,rarity,stars,data) values ('${A}','baston','fuego','f',0,'{}');
insert into public.fragments(player_id,class,rarity,qty) values ('${A}','mago','f',3);
insert into public.part_stock(player_id,key,qty) values ('${A}','p-casco-f',2);
insert into public.route_progress(player_id,route,difficulty,ascension,levels) values ('${A}','ash_king','f',0,2);
insert into public.step_clears(player_id,difficulty,ascension) values ('${A}','f',0);
insert into public.tower_scores(week,mode,player_id,max_floor,rounds) values (public.game_week(),'nivelado','${A}',9,100);
insert into public.tower_runs(player_id,mode,week,deadline,seed,engine_version,catalog_version,status,state,nodes)
  values ('${A}','nivelado',public.game_week(),public.game_week_end(public.game_week()),1,1,1,'active','{}'::jsonb,3);
insert into public.tower_node_paid(player_id,mode,week,node,kind,coins) values ('${A}','nivelado',public.game_week(),1,'normal',5);
insert into public.tower_codex(player_id,relics) values ('${A}','{bear_heart}');
update public.player_state set coins=12345, escamas=7, dados=2, tutorial=7 where player_id='${A}';
update public.players set best_floor=5, is_admin=true where id='${A}';
insert into public.rooms(code,host_id) values ('ABCD','${A}');
insert into public.room_players(room_id,player_id,chips) select id,host_id,50 from public.rooms;
insert into public.audit_log(actor,event) values ('${A}','keep_me');
insert into public.auth_attempts(key,fails) values ('name:ana',2);
`);
const before = {
  users: (await q(`select count(*)::int n from auth.users`))[0].n,
  players: JSON.stringify(await q(`select id,name,name_key,is_admin from public.players order by id`)),
  consts: JSON.stringify(await q(`select * from public.game_constants order by key`)),
};
await db.exec(fs.readFileSync(root + "reset_progress_ideal.sql", "utf8"));
const count = async (t: string) => (await q(`select count(*)::int n from public.${t}`))[0].n;
for (const t of ["characters", "weapons", "equipment", "fragments", "part_stock", "route_progress", "step_clears", "tower_scores", "tower_runs", "tower_node_paid", "tower_codex",
  "class_mastery", "skill_loadouts", "rooms", "room_players", "chip_ledger", "runs", "pulls", "mission_state", "market_offers"])
  ok((await count(t)) === 0, `reset wiped ${t}`);
const st = (await q(`select * from public.player_state where player_id='${A}'`))[0];
ok(st.coins === 500 && st.escamas === 0 && st.dados === 0 && st.tutorial === null, "player_state back to a fresh account");
ok((await q(`select best_floor from public.players where id='${A}'`))[0].best_floor === 0, "best_floor reset");
ok((await q(`select count(*)::int n from auth.users`))[0].n === before.users, "auth.users preserved");
ok(JSON.stringify(await q(`select id,name,name_key,is_admin from public.players order by id`)) === before.players, "players (names, admin flag) preserved");
ok(JSON.stringify(await q(`select * from public.game_constants order by key`)) === before.consts, "game_constants preserved");
ok((await count("audit_log")) >= 1 && (await count("auth_attempts")) === 1, "audit_log and auth_attempts preserved");
ok((await count("migration_flags")) >= 1, "migration_flags preserved");
const fresh = await rpc("get_profile", { p_player: A });
ok(fresh.characters.length === 0 && Object.keys(fresh.classMastery).length === 0, "profile is empty after the reset");
await db.exec(fs.readFileSync(root + "reset_progress_ideal.sql", "utf8"));
ok(true, "reset is re-runnable");

// ---- generated files are current ----
ok(fs.readFileSync(root + "setup.sql", "utf8").includes("0058_class_mastery_loadouts"), "setup.sql contains 0058");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
