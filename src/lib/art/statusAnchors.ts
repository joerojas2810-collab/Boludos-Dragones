// Where an elemental envelope sits on a combatant. All values are normalised to the overlay's box
// (the sprite's visible box: the hero's body box, or an enemy's slot), never screen pixels.
//   anchorX/anchorY   point of the box where the layer's own anchor (manifest: 0.5, 0.84, the base) lands
//   widthScale        layer side = max(widthScale * box width, heightScale * box height): uniform scale,
//   heightScale       so wide sprites grow the layer by width and tall ones by height
//   offsetX/offsetY   fine adjustment added to the anchor (fractions of the box)
//   clip              safe area as [top, right, bottom, left] insets of the box; negative = may spill outside
// Flyers hover: their base is the floating shadow line, so anchorY sits higher and the layer never reaches the ground.
export interface StatusAnchor {
  anchorX: number;
  anchorY: number;
  widthScale: number;
  heightScale: number;
  offsetX: number;
  offsetY: number;
  clip: readonly [number, number, number, number];
}

export type StatusAnchorFamily = "hero" | "foe" | "boss" | "wide" | "flying";
type Pair = { painted: StatusAnchor; pixel: StatusAnchor };

const a = (
  anchorY: number, widthScale: number, heightScale: number,
  clip: StatusAnchor["clip"] = [-0.25, -0.2, -0.04, -0.2],
  offsetX = 0, offsetY = 0, anchorX = 0.5,
): StatusAnchor => ({ anchorX, anchorY, widthScale, heightScale, offsetX, offsetY, clip });

// Neighbouring foes share a row: keep each envelope inside its own slot sideways.
const FOE_CLIP: StatusAnchor["clip"] = [-0.3, -0.05, -0.04, -0.05];

export const STATUS_ANCHORS: Record<StatusAnchorFamily, Pair> = {
  hero: { painted: a(0.97, 1.6, 1.45, [-0.25, -0.35, -0.1, -0.35]), pixel: a(0.95, 1.0, 1.0, [-0.1, -0.3, -0.12, -0.3]) },
  foe: { painted: a(0.9, 0.95, 0.95, FOE_CLIP), pixel: a(0.9, 0.95, 0.95, FOE_CLIP) },
  boss: { painted: a(0.9, 0.95, 0.95, FOE_CLIP), pixel: a(0.9, 0.95, 0.95, FOE_CLIP) },
  // Documented exceptions: broad golems (wider layer, a touch flatter) and hovering harpies/specters.
  wide: { painted: a(0.92, 1.1, 0.95), pixel: a(0.92, 1.1, 0.95) },
  flying: { painted: a(0.8, 0.95, 0.95), pixel: a(0.8, 0.95, 0.95) },
};
