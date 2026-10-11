import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ArenaBackground } from "@/components/ArenaBackground";
import { ScreenBg } from "@/components/ScreenBg";
import { bgSrc, combatScene } from "@/lib/art/backgrounds";
import { paintedBackground } from "@/lib/art/painted-backgrounds";
import { isPixel, setPixel } from "@/lib/art/pixel";

const previousPixel = isPixel();
afterEach(() => setPixel(previousPixel));

describe("painted background rendering integration", () => {
  it("renders a painted screen with its mobile source and catalog fallback", () => {
    setPixel(false);
    const html = renderToStaticMarkup(<ScreenBg scene="menu" />);
    const desktop = paintedBackground("menu")!;
    const mobile = paintedBackground("menu", true)!;

    expect(html).toContain(`src="${desktop.src}"`);
    expect(html).toContain(`srcSet="${mobile.src}"`);
    expect(html).toContain("bg-painted-scene");
  });

  it("keeps Pixel screen rendering on pixel assets and its responsive source", () => {
    setPixel(true);
    const html = renderToStaticMarkup(<ScreenBg scene="menu" />);

    expect(html).toContain(`src="${bgSrc("menu", "composite")}"`);
    expect(html).toContain(`srcSet="${bgSrc("menu", "composite", true)}"`);
    expect(html).not.toContain("bg-painted-scene");
  });

  it("renders painted combat scenes for world bosses and every dungeon rank", () => {
    setPixel(false);
    const worlds = Array.from({ length: 5 }, (_, world) =>
      [false, true].map((boss) => ({ world, rank: undefined, boss, scene: combatScene(world, boss) })),
    ).flat();
    const ranks = ["f", "e", "d", "c", "b", "a", "s", "ss", "ssr"].flatMap((rank) =>
      [false, true].map((boss) => ({ world: 0, rank, boss, scene: combatScene(0, boss, rank) })),
    );

    for (const { world, rank, boss, scene } of [...worlds, ...ranks]) {
      const html = renderToStaticMarkup(
        <ArenaBackground world={world} rank={rank} boss={boss} />,
      );
      expect(html, scene).toContain(`src="${paintedBackground(scene)!.src}"`);
      expect(html, scene).toContain(`srcSet="${paintedBackground(scene, true)!.src}"`);
      expect(html, scene).toContain("bg-painted-scene");
    }
  });

  it("preserves the legacy code-drawn arena when explicitly requested", () => {
    setPixel(false);
    const html = renderToStaticMarkup(<ArenaBackground world={0} boss legacy />);

    expect(html).toContain("<svg");
    expect(html).not.toContain("bg-painted-scene");
  });

  it("keeps Pixel combat on its original layered backgrounds", () => {
    setPixel(true);
    const scene = combatScene(1, true);
    const html = renderToStaticMarkup(<ArenaBackground world={1} boss />);
    for (const layer of ["sky", "far", "mid", "ground", "foreground"]) {
      expect(html).toContain(`src="${bgSrc(scene, layer)}"`);
    }
    expect(html).not.toContain("bg-painted-scene");
    expect(html).not.toContain("backgrounds-painted-v2");
  });
});
