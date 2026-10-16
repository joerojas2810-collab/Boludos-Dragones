import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArenaBackground } from "@/components/ArenaBackground";
import { ScreenBg } from "@/components/ScreenBg";
import {SecondaryPanel} from "@/components/SecondaryPanel";
import {ResultPresentation} from "@/components/ResultPresentation";
import {Podium} from "@/components/room/Podium";
import { bgSrc, combatScene } from "@/lib/art/backgrounds";
import { paintedBackground } from "@/lib/art/painted-backgrounds";
import { isPixel, setPixel } from "@/lib/art/pixel";

const previousPixel = isPixel();
afterEach(() => setPixel(previousPixel));
// Expose mounting independently from the real effect's delayed reveal timer.
vi.mock("@/components/fx/Vfx", () => ({Vfx: ({id}:{id:string}) => <span data-effect={id}/>}));

describe("painted background rendering integration", () => {
  it("gives recent result and service screens both compositions without a viewport-dependent render", () => {
    setPixel(false);
    for (const html of [
      renderToStaticMarkup(<SecondaryPanel scene="menu" title="Misiones">Contenido</SecondaryPanel>),
      renderToStaticMarkup(<ResultPresentation title="Victoria" tone="victory" scene="menu" hero={{classId:"caballero",element:"fuego",name:"Héroe",level:1}}>Contenido</ResultPresentation>),
    ]) {
      expect(html).toContain(paintedBackground("menu")!.src);
      expect(html).toContain(paintedBackground("menu",true)!.src);
      expect(html).not.toContain("url(undefined)");
    }
    setPixel(true);
    expect(renderToStaticMarkup(<SecondaryPanel title="Misiones">Contenido</SecondaryPanel>)).not.toContain("backgrounds-painted-v2");
  });

  it("does not mount the obsolete painted podium effect, but preserves the Pixel effect", () => {
    setPixel(false);
    expect(renderToStaticMarkup(<Podium ranked={[]} titles={null}/>)).not.toContain('data-effect="podium"');
    setPixel(true);
    expect(renderToStaticMarkup(<Podium ranked={[]} titles={null}/>)).toContain('data-effect="podium"');
  });

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
