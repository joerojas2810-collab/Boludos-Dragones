import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { BossIntro } from "./BattleFx";
import { DUNGEON_THEMES } from "@/lib/game/levels";
import { isPixel, setPixel } from "@/lib/art/pixel";

const initialPixel = isPixel();
afterEach(() => setPixel(initialPixel));

it("uses approved combat art and a visible name for all nine painted boss splashes", () => {
  setPixel(false);
  for (const [rank, theme] of Object.entries(DUNGEON_THEMES)) {
    const html = renderToStaticMarkup(<BossIntro name={theme.bossName} finalRank={rank} />);
    expect(html).toContain("painted-enemies");
    expect(html).toContain(theme.bossName);
    expect(html).not.toContain("boss_entrance_");
    expect(html).not.toContain("sr-only");
  }
});

it("preserves the pixel splash and lets the gallery preview painted art independently", () => {
  setPixel(true);
  const pixel = renderToStaticMarkup(<BossIntro name="Gran Devorador" finalRank="ssr" />);
  expect(pixel).toContain("effects-px/reduced/boss_entrance_ssr.png");
  const painted = renderToStaticMarkup(<BossIntro name="Gran Devorador" finalRank="ssr" artStyle="painted" />);
  expect(painted).toContain("painted-enemies");
  expect(isPixel()).toBe(true);
});

it("keeps the generic entrance for family bosses without a final rank", () => {
  setPixel(false);
  const html = renderToStaticMarkup(<BossIntro name="Gólem" />);
  expect(html).toContain("effects/reduced/boss_entrance.webp");
  expect(html).toContain("Gólem");
});
