// TS <-> SQL parity: constants that live in both places must agree. Run from repo root:
//   npx tsx supabase/tests/pglite/parity.mts
import { db, setup } from "./harness.mjs";
import { LEVEL_COINS, FIRST_CLEAR_CHEST, levelDecay } from "../../../src/lib/game/levelPay";
import { MARKET_MAX_OPEN, MARKET_TTL_DAYS, TRADE_VALUE } from "../../../src/lib/game/market";
import { STREAK_BONUS } from "../../../src/lib/game/streak";
import { towerFloorReward } from "../../../src/lib/game/tower";
import {
  DUPLICATE_REFUND,
  MULTI_PULL,
  MULTI_PULL_DISCOUNT,
  PULL_COST_CHARACTER,
  PULL_COST_WEAPON,
} from "../../../src/lib/game/profile";
import { DIFFICULTIES, RARITY_IDS } from "../../../src/lib/game/rarity";

await setup();
let pass = 0, fail = 0;
const same = (a: unknown, b: unknown, what: string) => {
  if (a === b) pass++;
  else { fail++; console.log(`FAIL ${what}: TS ${a} vs SQL ${b}`); }
};
const one = async (sql: string) => Object.values((await db.query(sql)).rows[0] as Record<string, unknown>)[0];

// game_constants <-> profile.ts
const gc = async (k: string) => Number(await one(`select public.game_const('${k}')`));
same(PULL_COST_CHARACTER, await gc("pull_cost_character"), "pull_cost_character");
same(PULL_COST_WEAPON, await gc("pull_cost_weapon"), "pull_cost_weapon");
same(MULTI_PULL, await gc("multi_pull"), "multi_pull");
same(Math.round(MULTI_PULL_DISCOUNT * 100), await gc("multi_discount_pct"), "multi_discount_pct");
same(Math.round(DUPLICATE_REFUND * 100), await gc("duplicate_refund_pct"), "duplicate_refund_pct");
same(MARKET_MAX_OPEN, await gc("market_max_open"), "market_max_open");
same(MARKET_TTL_DAYS, await gc("market_ttl_days"), "market_ttl_days");
same(STREAK_BONUS[3], await gc("streak_bonus_3"), "streak_bonus_3");
same(STREAK_BONUS[7], await gc("streak_bonus_7"), "streak_bonus_7");

// dungeon pay
for (const r of DIFFICULTIES) {
  same(LEVEL_COINS[r], Number(await one(`select public.difficulty_level_coins('${r}')`)), `difficulty_level_coins ${r}`);
  same(FIRST_CLEAR_CHEST[r], Number(await one(`select public.difficulty_level_chest('${r}')`)), `difficulty_level_chest ${r}`);
}
for (const n of [1, 20, 21, 60, 61, 140, 141, 500])
  same(levelDecay(n), Number(await one(`select public.level_decay(${n})`)), `level_decay ${n}`);

// market values (F..S; SS and SSR are not tradeable ranks any more)
for (const r of RARITY_IDS)
  if (r in TRADE_VALUE)
    same(TRADE_VALUE[r], Number(await one(`select public.trade_value('w-espada-fuego-${r}')`)), `trade_value ${r}`);

// tower floor prizes: the first two 10-floor cycles
for (let f = 1; f <= 20; f++)
  same(towerFloorReward(f).coins, Number(await one(`select public.tower_floor_coins(${f})`)), `tower_floor_coins ${f}`);

console.log(`parity: pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
