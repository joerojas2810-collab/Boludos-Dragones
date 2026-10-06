import "./fx.css";

// Few, cheap CSS particles per world: 0 Pantano leaves, 1 Cumbres ash,
// 2 Cañón dust, 3 Cavernas dust, 4 Tormenta rain + lightning.
const KIND = ["leaf", "ash", "dust", "dust", "rain"] as const;
const COUNT = 8;

export function AmbientFx({ world }: { world: number }) {
  const kind = KIND[world] ?? "dust";
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {Array.from({ length: COUNT }, (_, i) => (
        <i
          key={i}
          className={`amb amb-${kind}`}
          style={{
            ["--x" as string]: `${(i * 37 + 8) % 96}%`,
            ["--y" as string]: `${15 + ((i * 23) % 60)}%`,
            ["--d" as string]: `${kind === "rain" ? 1.1 + (i % 3) * 0.2 : 6 + (i % 4)}s`,
            ["--w" as string]: `${-(i * 0.9)}s`,
            ["--s" as string]: `${3 + (i % 3)}px`,
          }}
        />
      ))}
      {kind === "rain" && <div className="amb-flash" />}
    </div>
  );
}
