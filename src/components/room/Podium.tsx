import { Sprite } from "@/components/Sprite";
import type { PlayerView } from "@/lib/roomui/types";
import "@/components/fx.css";

const STEP = [
  { h: 96, bg: "#c9b037", delay: 0.9 }, // 1st (center)
  { h: 68, bg: "#b0b0b8", delay: 0.4 }, // 2nd
  { h: 48, bg: "#a8703a", delay: 0 }, // 3rd
];

// Animated top-3 podium; `ranked` is already sorted best first.
export function Podium({
  ranked,
  titles,
}: {
  ranked: PlayerView[];
  titles: Record<string, string> | null;
}) {
  const top = ranked.slice(0, 3);
  // visual order: 2nd, 1st, 3rd
  const order = [1, 0, 2].filter((i) => top[i]);
  return (
    <div className="mb-4 flex items-end justify-center gap-2">
      {order.map((i) => {
        const p = top[i];
        const s = STEP[i];
        return (
          <div key={p.id} className="flex w-24 flex-col items-center sm:w-28">
            <div
              className="b-podium-who flex flex-col items-center text-center"
              style={{ animationDelay: `${s.delay + 0.5}s` }}
            >
              {p.hero && (
                <Sprite
                  classId={p.hero.classId}
                  element={p.hero.element}
                  traits={p.hero.traits}
                  className="w-14"
                />
              )}
              <b className="max-w-full truncate text-sm">{p.name}</b>
              <span className="text-xs text-yellow-300">{p.chips} fichas</span>
              {titles && (
                <span className="text-[10px] leading-tight opacity-80">
                  {titles[p.id]}
                </span>
              )}
            </div>
            <div
              className="b-podium-step flex w-full items-start justify-center border-2 border-[var(--edge)] pt-1 text-xl font-bold text-black"
              style={{
                height: s.h,
                background: s.bg,
                animationDelay: `${s.delay}s`,
              }}
            >
              {i + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}
