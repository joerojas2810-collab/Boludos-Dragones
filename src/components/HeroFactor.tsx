import { factorLabel, type HeroFactors } from "@/lib/game/characters";

export function HeroFactor({ factors, compact = false }: { factors: HeroFactors; compact?: boolean }) {
  const { perStat, summary } = factorLabel(factors);
  const values = [perStat.hp, perStat.atk, perStat.def, perStat.crit, perStat.speed];
  return (
    <div className="min-w-0 text-xs" aria-label={`Factor ${summary}`}>
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <b className="text-amber-200">Factor {summary}</b>
        {!compact && values.map((value) => <span key={value} className="rounded bg-white/10 px-1.5 py-0.5">{value}</span>)}
      </div>
      {compact && <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[#d9d2ca]">{values.map((value) => <span key={value}>{value}</span>)}</div>}
    </div>
  );
}
