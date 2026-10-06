// Forge economy check. Usage: npx tsx scripts/forge-sim.ts
// Coins an SSR piece costs by pure fusion (3 SSR parts + craft) in runs of dungeons,
// using the average coins per run measured with
//   DUNGEON=<rank> HERO_STARS=3 npx tsx scripts/run-sim.ts 150 smart
import { COMBINE, CRAFT_PARTS, craftCoins } from "../src/lib/game/forge";
import { RARITY_IDS, type RarityId } from "../src/lib/game/rarity";

// Average coins per dungeon run (smart bot, rank-matched hero with 3 stars).
const RUN_COINS: Record<RarityId, number> = {
  f: 492,
  e: 588,
  d: 721,
  c: 890,
  b: 927,
  a: 992,
  s: 781,
  ss: 539,
  ssr: 244,
};
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
const runs = total / 700;
console.log(
  `\nSSR piece by pure fusion: ${Math.round(total)} coins ~ ${Math.round(runs)} runs ~ ${(runs / RUNS_PER_DAY / 7).toFixed(1)} weeks at ${RUNS_PER_DAY} runs/day (coins only; parts come from the dungeons).`,
);
