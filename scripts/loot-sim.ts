// What the dungeons drop: pieces per rank and their market value, per level and per full
// dungeon clear (first clear and repeats). Compares against the gacha (a piece is worth what
// its rank costs in pulls, TRADE_VALUE) and against the coins the level pays.
//   npx tsx scripts/loot-sim.ts [seeds=200]
import { levelLoot } from "../src/lib/game/levelLoot";
import { levelsOf } from "../src/lib/game/levels";
import { levelCoins } from "../src/lib/game/levelPay";
import { TRADE_VALUE } from "../src/lib/game/market";
import { RARITY_IDS } from "../src/lib/game/rarity";

const N = Number(process.argv[2] ?? 200);
const GACHA_PULL = 250;
const asc = Number(process.env.ASC ?? 0);

console.log(`asc ${asc}, ${N} seeds. value = TRADE_VALUE (coins); pulls = value / ${GACHA_PULL}`);
console.log("dungeon  lvls  pieces/level  top-rank%  >=S/level   value/level   pulls/level   coins/level   value:coins");
for (const rank of RARITY_IDS) {
  const levels = levelsOf(rank);
  let pieces = 0, top = 0, hi = 0, value = 0, coins = 0;
  const byRank: Record<string, number> = {};
  for (const spec of levels)
    for (let i = 0; i < N; i++) {
      const l = levelLoot(spec, asc, "caballero", i * 7919 + spec.index, { repeat: false });
      for (const p of l.pieces) {
        pieces++;
        value += TRADE_VALUE[p.rarity];
        if (p.rarity === rank) top++;
        if (RARITY_IDS.indexOf(p.rarity) >= RARITY_IDS.indexOf("s")) hi++;
        byRank[p.rarity] = (byRank[p.rarity] ?? 0) + 1;
      }
      coins += levelCoins(rank, asc, false);
    }
  const n = levels.length * N;
  const mix = RARITY_IDS.filter((r) => byRank[r]).map((r) => `${r}:${Math.round((100 * byRank[r]) / pieces)}%`).join(" ");
  console.log(
    `${rank.padEnd(7)}  ${String(levels.length).padStart(4)}  ${(pieces / n).toFixed(1).padStart(12)}  ${(100 * top / pieces).toFixed(0).padStart(8)}%  ${(hi / n).toFixed(2).padStart(9)}  ${Math.round(value / n).toString().padStart(11)}  ${(value / n / GACHA_PULL).toFixed(1).padStart(12)}  ${Math.round(coins / n).toString().padStart(11)}  ${(value / coins).toFixed(0).padStart(10)}x   [${mix}]`,
  );
}
