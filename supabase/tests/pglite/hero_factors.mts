// 0054 hero factor persistence and copy transfer.
// Run: npx tsx supabase/tests/pglite/hero_factors.mts
import { db, setup, rpc } from "./harness.mjs";

await setup();
let pass = 0, fail = 0;
const ok = (condition: unknown, label: string) => {
  if (condition) pass++;
  else { fail++; console.log("FAIL:", label); }
};
const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
for (const [id, name] of [[A, "ana"], [B, "beto"]] as const) {
  await db.exec(`insert into auth.users(id,email) values ('${id}','${name}@players.invalid')`);
  await rpc("create_player", { p_user: id, p_name: name, p_name_key: name, p_is_admin: false });
}
const q = async (sql: string) => (await db.query(sql)).rows as Record<string, unknown>[];
const col = await q(`select data_type from information_schema.columns where table_schema='public' and table_name='characters' and column_name='copies'`);
ok(col[0]?.data_type === "jsonb", "characters.copies uses jsonb");
const factors = { hp: 1.04, atk: 0.98, def: 1.02, crit: 0.91, speed: 1.05 };
const spareFactors = { hp: 0.96, atk: 1.03, def: 0.97, crit: 1.08, speed: 1.01 };
const overCap = { hp: 1.15, atk: 1.15, def: 1.15, crit: 1.15, speed: 1.15 };
const item = (trait: string, f: typeof factors) => ({
  class: "mago", element: "fuego", rarity: "f",
  data: { name: "Mago", stats: { hp: 100, atk: 100, def: 100, crit: 5, accuracy: 0, speed: 10, critDmg: 1.5, resist: 0, regen: 0, lifesteal: 0 }, traits: [trait], factors: f },
});
const state = async (id: string) => Number((await q(`select version from public.player_state where player_id='${id}'`))[0].version);
ok(await rpc("hero_factors_valid", { p_factors: factors }), "valid factor vector passes the SQL contract");
ok(!(await rpc("hero_factors_valid", { p_factors: null })), "missing factor vector fails the SQL contract");
ok(!(await rpc("hero_factors_valid", { p_factors: [1, 1, 1, 1, 1] })), "non-object factor vector fails the SQL contract");
ok(!(await rpc("hero_factors_valid", { p_factors: overCap })), "combined power above 10% fails the SQL contract");
const rejectedPull = await rpc("apply_pull", {
  p_player: B, p_version: await state(B), p_idem: "bad-factor-001", p_banner: "character", p_cost: 250,
  p_pity: 0, p_pity_ssr: 0, p_seed: 1, p_daily: false, p_items: [item("terco", overCap)],
}).then(() => false, (e: Error) => e.message.includes("invalid_items"));
ok(rejectedPull, "pull import rejects an out-of-cap profile");
const rejectedStarter = await rpc("grant_starter", {
  p_player: B, p_class: "mago", p_element: "fuego",
  p_data: { name: "Mago", traits: ["terco"], factors: overCap },
  p_type: "baston", p_name: "Bastón", p_roll: 1, p_lines: null,
}).then(() => false, (e: Error) => e.message.includes("invalid_items"));
ok(rejectedStarter, "starter import rejects an out-of-cap profile");
const missingStarterFactors = await rpc("grant_starter", {
  p_player: B, p_class: "mago", p_element: "fuego",
  p_data: { name: "Mago", traits: ["terco"] },
  p_type: "baston", p_name: "Bastón", p_roll: 1, p_lines: null,
}).then(() => false, (e: Error) => e.message.includes("invalid_items"));
ok(missingStarterFactors, "starter import rejects a missing factor profile");
const rejectedChange = await rpc("apply_hero_change", {
  p_player: B, p_version: await state(B), p_coins: 0,
  p_upsert: [{ class: "mago", element: "fuego", rarity: "f", stars: 0, level: 1, xp: 0, skill: null, legacy: false, copies: [], data: { name: "Mago", traits: ["terco"], factors: overCap } }],
  p_delete: "{}", p_equip: [],
}).then(() => false, (e: Error) => e.message.includes("invalid_args"));
ok(rejectedChange, "hero change rejects an out-of-cap profile");
const missingChangeFactors = await rpc("apply_hero_change", {
  p_player: B, p_version: await state(B), p_coins: 0,
  p_upsert: [{ class: "mago", element: "fuego", rarity: "f", stars: 0, level: 1, xp: 0, skill: null, legacy: false, copies: [], data: { name: "Mago", traits: ["terco"] } }],
  p_delete: "{}", p_equip: [],
}).then(() => false, (e: Error) => e.message.includes("invalid_args"));
ok(missingChangeFactors, "hero change rejects a missing factor profile");
const pull = async (id: string, key: string, trait: string, f: typeof factors) => rpc("apply_pull", {
  p_player: id, p_version: await state(id), p_idem: key, p_banner: "character", p_cost: 250,
  p_pity: 0, p_pity_ssr: 0, p_seed: 1, p_daily: false, p_items: [item(trait, f)],
});
await pull(A, "hero-factor-001", "terco", factors);
await pull(A, "hero-factor-002", "curioso", spareFactors);
const profile = await rpc("get_profile", { p_player: A });
const hero = (profile.characters as { data: Record<string, unknown> }[])[0].data;
const copies = hero.copies as { trait: string; factors: typeof factors }[];
ok(JSON.stringify(hero.factors) === JSON.stringify(factors), "get_profile returns main factors");
ok(copies.length === 1 && copies[0].trait === "curioso" && JSON.stringify(copies[0].factors) === JSON.stringify(spareFactors), "duplicate pull stores a complete profile");
await rpc("market_move", { p_from: A, p_to: B, p_kind: "character", p_key: "c-mago-fuego-f" });
const movedProfile = await rpc("get_profile", { p_player: B });
const moved = (movedProfile.characters as { data: Record<string, unknown> }[])[0].data;
ok(JSON.stringify(moved.factors) === JSON.stringify(spareFactors) && JSON.stringify(moved.traits) === JSON.stringify(["curioso"]), "market transfer gives the copy its own full profile");
console.log(`hero_factors: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
