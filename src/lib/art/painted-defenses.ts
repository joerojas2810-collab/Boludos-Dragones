export const PAINTED_DEFENSES = {
  bastion: {src:"/art/effects-painted-v2/bastion-v1.webp",className:"bottom-[8%] w-[90%]"},
  barrier: {src:"/art/effects-painted-v2/barrier-v1.webp",className:"bottom-[8%] w-[160%]"},
} as const;
export type PaintedDefenseId = keyof typeof PAINTED_DEFENSES;

// Only these two active skills opt in. Plain shield gains and Pixel keep the existing sheet.
export function paintedDefenseFor(skill: string | undefined, pixel: boolean): PaintedDefenseId | null {
  if (pixel) return null;
  return skill === "knight_bastion" ? "bastion" : skill === "mage_barrier" ? "barrier" : null;
}
