// `color` is kept for API compatibility; the painted fill picks health / health_low by itself.
type Props = { hp: number; max: number; color?: string };

export function HealthBar({ hp, max }: Props) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <div className="bar-track h-7">
      <div
        className="bar-fill h-full"
        data-fill={pct <= 30 ? "health_low" : "health"}
        style={{ width: `${pct}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold [text-shadow:0_1px_2px_#000]">
        {Math.round(hp)} / {Math.round(max)}
      </span>
    </div>
  );
}
