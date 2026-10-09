// Each element beats only the next one in this circular list and loses to the previous one.
export const ELEMENTS = ["agua", "fuego", "viento", "tierra", "rayo"] as const;
export type Element = (typeof ELEMENTS)[number];

export const ELEMENT_LABEL: Record<Element, string> = {
  agua: "Agua",
  fuego: "Fuego",
  viento: "Viento",
  tierra: "Tierra",
  rayo: "Rayo",
};

export const ADVANTAGE_BONUS = 0.25;

function beats(a: Element, b: Element): boolean {
  const i = ELEMENTS.indexOf(a);
  return b === ELEMENTS[(i + 1) % 5];
}

export function elementMultiplier(
  attacker: Element,
  defender: Element,
): number {
  if (beats(attacker, defender)) return 1 + ADVANTAGE_BONUS;
  if (beats(defender, attacker)) return 1 - ADVANTAGE_BONUS;
  return 1;
}
