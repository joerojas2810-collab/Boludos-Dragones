type Props = { hp: number; max: number; color: string };

export function HealthBar({ hp, max, color }: Props) {
  return (
    <div className="relative h-6 border-[3px] border-[var(--edge)] bg-black/50">
      <div
        className="h-full transition-[width]"
        style={{
          width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%`,
          background: color,
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold [text-shadow:1px_1px_0_#000,-1px_1px_0_#000]">
        PV {Math.round(hp)}/{Math.round(max)}
      </span>
    </div>
  );
}
