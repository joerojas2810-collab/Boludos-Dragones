// Tutorial + starter hero (0031). Run from repo root:  node supabase/tests/pglite/tutorial.mjs
import { db, setup, rpc } from "./harness.mjs";
await setup();
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL:", m); } };
const U = "00000000-0000-0000-0000-000000000001";
await db.exec(`insert into auth.users(id,email) values ('${U}','p1@players.invalid')`);
await rpc("create_player", { p_user: U, p_name: "pl1", p_name_key: "pl1", p_is_admin: false });
const star = { p_player: U, p_class: "mago", p_element: "fuego", p_data: { name: "X", stats: {}, traits: [], catchphrase: "" },
  p_type: "baston", p_name: "Inicial", p_roll: 1, p_lines: null };
ok((await rpc("sync_tutorial", { p_player: U })) === null, "starts null");
ok((await rpc("grant_starter", star)) === true, "grants to an empty account");
ok((await rpc("grant_starter", star)) === false, "only once");
ok((await rpc("sync_tutorial", { p_player: U, p_init: 4 })) === 1, "init does not overwrite");
ok((await rpc("sync_tutorial", { p_player: U, p_step: 3 })) === 3, "advances");
ok((await rpc("sync_tutorial", { p_player: U, p_step: 2 })) === 3, "never goes back");
ok((await rpc("sync_tutorial", { p_player: U, p_step: 99 })) === 7, "capped at 7");
const n = async (t) => (await db.query(`select count(*)::int n from public.${t} where player_id='${U}'`)).rows[0].n;
ok((await n("characters")) === 1 && (await n("weapons")) === 1, "one hero and one weapon");
console.log(fail ? `${fail} FAILED` : "tutorial ok");
process.exit(fail ? 1 : 0);
