import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import metadata from "./pixel-ui.generated.json";

const root = process.cwd();
const imageRoot = join(root, "public/art/ui-px");

describe("Acero y Oro UI delivery", () => {
  it("provides the exact 130 existing UI names as native PNGs", () => {
    const expected = readdirSync(join(root, "public/art/ui"))
      .filter((file) => file.endsWith(".webp")).map((file) => file.replace(/\.webp$/, ".png")).sort();
    expect(metadata.map((entry) => entry.file).sort()).toEqual(expected);
    expect(metadata).toHaveLength(130);
    for (const entry of metadata) {
      const bytes = readFileSync(join(imageRoot, entry.file));
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([entry.width, entry.height]);
    }
  });

  it("keeps display geometry independent of the HD image size", () => {
    for (const [file, size] of [
      ["panel_default.png", [64, 64]], ["button_primary_normal.png", [64, 24]],
      ["slot_selected.png", [32, 32]], ["bar_track.png", [64, 12]],
      ["glyph_check.png", [16, 16]], ["favicon_512.png", [512, 512]],
    ] as const) {
      const entry = metadata.find((asset) => asset.file === file)!;
      expect([entry.width * entry.display_scale, entry.height * entry.display_scale]).toEqual(size);
    }
  });

  it("publishes all 80 source cuts used by stretchable borders", () => {
    const css = readFileSync(join(root, "src/lib/art/pixel-ui.generated.css"), "utf8");
    const entries = metadata.filter((entry) => "nine_slice" in entry);
    expect(entries).toHaveLength(80);
    for (const entry of entries) {
      const cuts = entry.nine_slice!;
      expect(cuts.left + cuts.right).toBeLessThan(entry.width);
      expect(cuts.top + cuts.bottom).toBeLessThan(entry.height);
      expect(css).toContain(`--px-slice-${entry.file.slice(0, -4).replaceAll("_", "-")}: ${cuts.top} ${cuts.right} ${cuts.bottom} ${cuts.left};`);
    }
    const panel = entries.find((entry) => entry.file === "panel_default.png")!;
    expect(panel.nine_slice).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    expect(panel.nine_slice!.top * panel.display_scale).toBe(8);
  });
});
