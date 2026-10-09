// Barter market (0009) attack checks. Run from repo root: node supabase/tests/pglite/market.mjs
import { db, setup, as, rpc } from "./harness.mjs";
await setup();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const err = async (p, msg, label) => { try { const r = await p; fail++; console.log("FAIL (no error):", label || msg, JSON.stringify(r)); } catch (e) { if (String(e.message).includes(msg)) pass++; else { fail++; console.log("FAIL:", label || msg, "got", e.message); } } };
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const names = ["ana", "beto", "carla"];
for (let i = 1; i <= 3; i++) {
  await db.exec(`insert into auth.users(id,email) values ('${U(i)}','${names[i - 1]}@players.invalid')`);
  await rpc("create_player", { p_user: U(i), p_name: names[i - 1], p_name_key: names[i - 1], p_is_admin: false });
}
const q = async (sql) => (await db.query(sql)).rows;
const stars = async (u, key) => (await q(`select stars from public.characters where player_id='${U(u)}' and key='${key}'`))[0]?.stars ?? null;
const total = async (key) => Number((await q(`select coalesce(sum(stars+1),0) s from public.characters where key='${key}'`))[0].s);
const A = "c-mago-fuego-c", B = "c-picaro-agua-f", W = "w-espada-rayo-a";
const ins = (u, cls, el, rar, st) => db.exec(`insert into public.characters(player_id,class,element,rarity,stars,data) values ('${U(u)}','${cls}','${el}','${rar}',${st},'{"name":"x"}')`);
await ins(1, "mago", "fuego", "c", 2);       // ana: 1 spare... 2 stars
await ins(1, "picaro", "agua", "f", 0);     // ana: single copy
await ins(2, "picaro", "agua", "f", 1);     // beto: spare
await ins(3, "mago", "fuego", "c", 5);       // carla: maxed
await db.exec(`insert into public.weapons(player_id,type,element,rarity,stars,data) values ('${U(1)}','espada','rayo','a',1,'{}')`);
await db.exec(`insert into public.equipment(player_id,character_key,weapon_key) values ('${U(1)}','${A}','${W}')`);

await db.exec(`update public.player_state set coins = 100000`);
const coinsOf = async (u) => Number((await q(`select coins from public.player_state where player_id='${U(u)}'`))[0].coins);

// creation guards
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A }), "unfair_trade", "gift is not equivalent");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A, p_want: B }), "unfair_trade", "C for F with no coins");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A, p_want: B, p_coins: 400 }), "unfair_trade", "coins below the 25% band");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A, p_coins: 1559 }), "unfair_trade", "sale 1 coin under the band");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: B , p_coins: 830 }), "not_owned", "give single copy (0 stars)");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: "c-mago-fuego-s" , p_coins: 5000 }), "not_owned", "give piece I do not have");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: "c-dragon-fuego-c" }), "invalid_args", "nonexistent class");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A, p_want: "c-mago-fuego-mitico" }), "invalid_args", "nonexistent want");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A, p_want: W }), "invalid_args", "kind mismatch");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A, p_want: A }), "invalid_args", "swap with itself");
await err(rpc("market_create", { p_player: U(1), p_kind: "coins", p_give: A }), "invalid_args", "bad kind");
await err(rpc("market_create", { p_player: U(9), p_kind: "character", p_give: A , p_coins: 2080 }), "player_not_found");
const o1 = await rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A, p_want: B , p_coins: 1250 });
ok(!!o1.id, "offer created");
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A , p_coins: 2080 }), "already_offered", "second open offer, same piece");
ok((await rpc("market_list", {})).length === 1, "list shows one");

// attack surface: clients cannot touch anything
for (const role of ["anon", "authenticated"]) {
  await err(as(role, U(2), () => db.query(`select * from public.market_offers`)), "permission denied", role + " select table");
  await err(as(role, U(2), () => db.query(`update public.market_offers set seller_id='${U(2)}'`)), "permission denied", role + " update table");
  await err(as(role, U(2), () => db.query(`select public.market_accept('${U(2)}','${o1.id}')`)), "permission denied", role + " rpc accept");
  await err(as(role, U(2), () => db.query(`select public.market_move('${U(1)}','${U(2)}','character','${A}')`)), "permission denied", role + " rpc move");
}

// theft / self-accept
await err(rpc("market_accept", { p_player: U(1), p_offer: o1.id }), "own_offer", "accept own offer");
await err(rpc("market_cancel", { p_player: U(2), p_offer: o1.id }), "forbidden", "cancel someone else's");
await err(rpc("market_accept", { p_player: U(2), p_offer: "11111111-1111-1111-1111-111111111111" }), "offer_not_found");
// carla cannot give B (does not own it): not_owned; and nothing changed
await err(rpc("market_accept", { p_player: U(3), p_offer: o1.id }), "max_stars", "carla maxed on A (and lacks B)");
ok((await stars(1, A)) === 2 && (await stars(3, A)) === 5, "state untouched after failed accept");

// happy swap + conservation
const tA = await total(A), tB = await total(B);
const c1 = await coinsOf(1), c2 = await coinsOf(2);
ok((await rpc("market_accept", { p_player: U(2), p_offer: o1.id })).ok, "accept swap");
ok((await coinsOf(2)) === c2 - 1250 && (await coinsOf(1)) === c1 + 1250, "acceptor pays the coins of the offer");
ok((await stars(1, A)) === 1 && (await stars(2, A)) === 0, "A: ana 1 star, beto new at 0");
ok((await stars(1, B)) === 1 && (await stars(2, B)) === 0, "B: ana +1, beto -1");
ok((await total(A)) === tA && (await total(B)) === tB, "copies conserved");
await err(rpc("market_accept", { p_player: U(3), p_offer: o1.id }), "offer_closed", "double accept");
await err(rpc("market_cancel", { p_player: U(1), p_offer: o1.id }), "offer_closed", "cancel after done");
ok((await q(`select count(*)::int n from public.equipment`))[0].n === 1, "equipment untouched");
ok((await rpc("market_list", {})).length === 0, "list empty after trade");

// gift; receiver maxed out cannot take it
const g = await rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A , p_coins: 2080 });
await err(rpc("market_accept", { p_player: U(3), p_offer: g.id }), "max_stars", "receiver at 5 stars");
ok((await stars(1, A)) === 1 && (await stars(3, A)) === 5, "no change after max_stars");
ok((await rpc("market_accept", { p_player: U(2), p_offer: g.id })).ok, "gift accepted");
ok((await stars(1, A)) === 0 && (await stars(2, A)) === 1, "gift moved one star");
// seller no longer has a spare copy: new offer refused
await err(rpc("market_create", { p_player: U(1), p_kind: "character", p_give: A , p_coins: 2080 }), "not_owned", "no spare left");

// stale offer: seller spent the spare star elsewhere -> accept fails, nothing moves
const s1 = await rpc("market_create", { p_player: U(2), p_kind: "character", p_give: A , p_coins: 2080 });
await db.exec(`update public.characters set stars=0 where player_id='${U(2)}' and key='${A}'`);
await err(rpc("market_accept", { p_player: U(1), p_offer: s1.id }), "not_owned", "seller lost the spare star");
await rpc("market_cancel", { p_player: U(2), p_offer: s1.id });
ok((await q(`select status from public.market_offers where id='${s1.id}'`))[0].status === "cancelled", "owner cancels");
// piece can be offered again after cancel
await db.exec(`update public.characters set stars=1 where player_id='${U(2)}' and key='${A}'`);
const s2 = await rpc("market_create", { p_player: U(2), p_kind: "character", p_give: A , p_coins: 2080 });

// expiry
await db.exec(`update public.market_offers set expires_at = now() - interval '1 minute' where id='${s2.id}'`);
await err(rpc("market_accept", { p_player: U(1), p_offer: s2.id }), "offer_closed", "expired offer");
ok((await rpc("market_list", {})).length === 0, "expired not listed");
const s3 = await rpc("market_create", { p_player: U(2), p_kind: "character", p_give: A , p_coins: 2080 });
ok(!!s3.id, "expired row swept, piece can be re-offered");

// weapons + per-player open limit
await db.exec(`update public.weapons set stars=1 where player_id='${U(1)}'`);
const w = await rpc("market_create", { p_player: U(1), p_kind: "weapon", p_give: W , p_coins: 4170 });
ok((await rpc("market_accept", { p_player: U(3), p_offer: w.id })).ok, "weapon gift");
ok((await q(`select stars from public.weapons where player_id='${U(1)}'`))[0].stars === 0, "giver keeps weapon at 0 stars");
ok((await q(`select count(*)::int n from public.weapons where player_id='${U(3)}'`))[0].n === 1, "receiver got weapon");
const types = ["espada","hacha","lanza","arco","baston","daga"];
for (const t of types) await db.exec(`insert into public.weapons(player_id,type,element,rarity,stars,data) values ('${U(3)}','${t}','agua','f',1,'{}')`);
let made = 0;
for (const t of types) { try { await rpc("market_create", { p_player: U(3), p_kind: "weapon", p_give: `w-${t}-agua-f`, p_coins: 830 }); made++; } catch (e) { ok(String(e.message).includes("too_many_offers"), "limit error " + e.message); } }
ok(made === 5, "max 5 open offers per player, got " + made);
console.log(`market: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
