// Forge economy check. Usage: npx tsx scripts/forge-sim.ts
// Coins an SSR piece costs by pure fusion (3 SSR parts + craft) in runs of dungeons,
// using the average coins per run measured with
//   DUNGEON=<rank> HERO_STARS=3 npx tsx scripts/run-sim.ts 150 smart
import { COMBINE, CRAFT_PARTS, craftCoins } from "../src/lib/game/forge";
import { RARITY_IDS, type RarityId } from "../src/lib/game/rarity";

// Average coins per dungeon run (smart bot, rank-matched hero with 3 stars).
const RUN_COINS: Record<RarityId, number> = {
  f: 190,
  e: 270,
  d: 320,
  c: 371,
  b: 380,
  a: 445,
  s: 353,
  ss: 205,
  ssr: 78,
};
// Mission income per day (missions.ts): daily 500 + weekly 1250/7 + Friday event 1000/7.
const MISSION_COINS_PER_DAY = 500 + 1250 / 7 + 1000 / 7;
const AVG_RUN_COINS = 600; // geared runs (full build, 3 stars) pay ~860-930 at A-SS
const RUNS_PER_DAY = 3;

// coins to make ONE part of each rank from F parts (merges only)
const chain: Partial<Record<RarityId, number>> = { f: 0 };
RARITY_IDS.slice(1).forEach((r, i) => {
  const prev = RARITY_IDS[i];
  const rule = COMBINE[prev]!;
  chain[r] = rule.coins + rule.ratio * (chain[prev] ?? 0);
});

console.log(
  "rank  merge-coins  chain(1 part from F)  runs of the previous dungeon",
);
RARITY_IDS.forEach((r, i) => {
  const prev = RARITY_IDS[i - 1];
  const rule = prev ? COMBINE[prev] : undefined;
  console.log(
    `${r.padEnd(4)}  ${String(rule?.coins ?? "-").padStart(10)}  ${String(Math.round(chain[r] ?? 0)).padStart(20)}  ${prev && rule ? (rule.coins / RUN_COINS[prev]).toFixed(2) : "-"}`,
  );
});
const total = CRAFT_PARTS * (chain.ssr ?? 0) + craftCoins("ssr");
const runs = total / AVG_RUN_COINS;
const perDay = RUNS_PER_DAY * AVG_RUN_COINS;
console.log(
  `\nSSR piece by pure fusion: ${Math.round(total)} coins (gacha SSR copy = 50000).`,
);
console.log(
  `~${(total / perDay / 7).toFixed(1)} weeks from runs alone, ~${(total / (perDay + MISSION_COINS_PER_DAY) / 7).toFixed(1)} weeks with missions (${RUNS_PER_DAY} runs/day; coins only, parts come from the dungeons).`,
);
