import { useMemo } from "react";
import {
  GROUND_H,
  GROUND_TOP_PCT,
  SCENE_W,
  SKY_H,
  buildScene,
  type Rect,
} from "@/sprites/backgrounds";
import { AmbientFx } from "@/components/fx/AmbientFx";
import { BG_LAYERS, BG_PARALLAX, bgSrc, combatScene } from "@/lib/art/backgrounds";
import "./arena.css";
import "./bg.css";

export { GROUND_TOP_PCT };

type Props = {
  world: number;
  boss?: boolean;
  rank?: string | null; // dungeon rank: picks its own scene (A-SSR have deeper variants)
  legacy?: boolean; // the old code-drawn SVG scenery
  className?: string;
};

function Layer({ rects }: { rects: Rect[] }) {
  return rects.map(([x, y, w, h, fill, layer], i) => (
    <rect
      key={i}
      x={x}
      y={y}
      width={w}
      height={h}
      fill={fill}
      className={layer ? `arena-l-${layer}` : undefined}
    />
  ));
}

export function ArenaBackground({
  world,
  boss = false,
  rank,
  legacy = false,
  className = "",
}: Props) {
  if (legacy) return <SvgBackground world={world} boss={boss} className={className} />;
  const id = combatScene(world, boss, rank);
  return (
    <div
      aria-hidden
      className={`arena-bg pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {BG_LAYERS.map((l) => (
        <picture key={l}>
          <source media="(max-width: 767px)" srcSet={bgSrc(id, l, true)} />
          <img
            src={bgSrc(id, l)}
            alt=""
            className="bg-layer"
            style={{ ["--p" as string]: BG_PARALLAX[l] }}
          />
        </picture>
      ))}
      <AmbientFx world={world} />
      {boss && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(0,0,0,0.6) 100%)",
          }}
        />
      )}
    </div>
  );
}

// Old pixel-art scenery drawn from code; kept as a fallback.
export function SvgBackground({
  world,
  boss = false,
  className = "",
}: Omit<Props, "rank" | "legacy">) {
  const scene = useMemo(() => buildScene(world, boss), [world, boss]);
  return (
    <div
      aria-hidden
      className={`arena-bg pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: `${GROUND_TOP_PCT}%` }}
      >
        <svg
          viewBox={`0 0 ${SCENE_W} ${SKY_H}`}
          preserveAspectRatio="xMidYMax slice"
          shapeRendering="crispEdges"
        >
          <Layer rects={scene.sky} />
        </svg>
      </div>
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: `${100 - GROUND_TOP_PCT}%` }}
      >
        <svg
          viewBox={`0 0 ${SCENE_W} ${GROUND_H}`}
          preserveAspectRatio="xMidYMin slice"
          shapeRendering="crispEdges"
        >
          <Layer rects={scene.ground} />
        </svg>
      </div>
      <AmbientFx world={world} />
      {boss && (
        <>
          <div
            className="arena-boss-glow absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 38% 46% at 76% 58%, rgba(255,40,30,0.38), transparent 70%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 55%, transparent 52%, rgba(0,0,0,0.7) 100%)",
            }}
          />
        </>
      )}
    </div>
  );
}
