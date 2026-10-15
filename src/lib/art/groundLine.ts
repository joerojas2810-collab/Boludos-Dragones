// Where fighters stand on a combat scene. Every painted scene (16:9 and 1:1 variants) and every pixel scene
// keeps the same composition: the floor plane runs from `top` down to the image bottom, and `feet` is the
// line (fraction of the image height, from its top) where bodies should rest. Measured on all 18 scenes.
export const GROUND = {
  wide: { top: 0.7, feet: 0.84 },
  square: { top: 0.64, feet: 0.8 },
} as const;

/** Minimum distance between the feet line and the bottom edge of the stage, in px. */
export const FEET_PAD = 10;

export const groundFor = (aspect: number) => (aspect > 1.5 ? GROUND.wide : GROUND.square);

/**
 * Height (px above the stage bottom) of the line the feet should rest on.
 * The scene image is `object-fit: cover` and bottom aligned inside `box` (its container), so its displayed
 * height is max(box.h, box.w / aspect). `gap` is how far the stage bottom sits above the container bottom
 * (the command bar covers that strip). The feet never go below the stage and never above 60 % of it.
 */
export function feetLift(box: { w: number; h: number }, aspect: number, gap: number, stageH: number): number {
  const imgH = Math.max(box.h, box.w / aspect);
  const ideal = (1 - groundFor(aspect).feet) * imgH - gap;
  return Math.round(Math.min(Math.max(ideal, FEET_PAD), Math.max(FEET_PAD, stageH * 0.6)));
}
