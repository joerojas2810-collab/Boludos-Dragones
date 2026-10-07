import { Vfx } from "@/components/fx/Vfx";
import { HeroSprite } from "@/components/HeroSprite";
import { Icon } from "@/components/Icon";
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
    <div className="relative mb-4 flex items-end justify-center gap-2">
      <Vfx
        id="podium"
        delay={0.9}
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 w-[min(100%,24rem)] -translate-x-1/2 -translate-y-1/2 opacity-70"
      />
      {order.map((i) => {
        const p = top[i];
        const s = STEP[i];
        return (
          <div key={p.id} className="flex w-28 flex-col items-center sm:w-32">
            <div
              className="b-podium-who flex flex-col items-center text-center"
              style={{ animationDelay: `${s.delay + 0.5}s` }}
            >
              {p.hero && (
                <HeroSprite
                  classId={p.hero.classId}
                  element={p.hero.element}
                  traits={p.hero.traits}
                  className="w-28 sm:w-32"
                  crop
                />
              )}
              <b className="max-w-full truncate text-sm">{p.name}</b>
              <span className="flex items-center gap-1 text-sm text-yellow-300"><Icon name="system_token" className="h-5" />{p.chips}</span>
              {titles && (
                <span className="text-[10px] leading-tight opacity-80">
                  {titles[p.id]}
                </span>
              )}
            </div>
            <div
              className="b-podium-step flex w-full items-start justify-center rounded-t-md pt-1 text-2xl font-bold text-black shadow-[inset_0_0_0_3px_rgb(0_0_0/0.35),inset_0_8px_0_rgb(255_255_255/0.25)]"
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
