// Elemental status envelopes: pure mapping from a Combatant to the static layers drawn over its sprite.
// Nothing here is stored: every call derives the layers from the combatant being rendered.
import type { Combatant, CombatEvent } from "@/lib/game/combat";
import { MAX_ELEMENT_CHARGES, STATUS_DATA, stacksOf, type StatusId } from "@/lib/game/statuses";
import { IMPACT_S } from "@/components/fx/timing";

export type StatusLayerKind = "frost" | "burn" | "wind" | "fracture" | "charge";

/** Paint order, bottom to top. */
export const LAYER_KINDS: readonly StatusLayerKind[] = ["frost", "fracture", "burn", "wind", "charge"];

const STATUS_KIND: Record<StatusId, StatusLayerKind> = {
  escarcha: "frost",
  quemadura: "burn",
  impulso: "wind",
  ruptura: "fracture",
};

/** Highest intensity that has art (Quemadura stops at 2). */
export const LAYER_MAX: Record<StatusLayerKind, number> = {
  frost: STATUS_DATA.escarcha.max,
  burn: STATUS_DATA.quemadura.max,
  wind: STATUS_DATA.impulso.max,
  fracture: STATUS_DATA.ruptura.max,
  charge: MAX_ELEMENT_CHARGES,
};

export interface StatusLayer {
  kind: StatusLayerKind;
  stacks: number;
  id: string; // art id, e.g. status_frost_2
}

// Replaced files must bypass the long-lived static-art cache.
export const STATUS_ART_V = 1;
export const statusLayerSrc = (id: string, pixel: boolean) =>
  pixel ? `/art/status-px/${id}.png?v=${STATUS_ART_V}` : `/art/status/${id}.webp?v=${STATUS_ART_V}`;

/** Every file of one style, for preloading. */
export const allStatusLayerIds: readonly string[] = LAYER_KINDS.flatMap((k) =>
  Array.from({ length: LAYER_MAX[k] }, (_, i) => `status_${k}_${i + 1}`),
);

const warned = new Set<string>();
function clampStacks(kind: StatusLayerKind, raw: number): number {
  if (!(raw >= 1)) return 0; // 0, negative, NaN
  const max = LAYER_MAX[kind];
  if (raw > max && process.env.NODE_ENV !== "production" && !warned.has(`${kind}${raw}`)) {
    warned.add(`${kind}${raw}`);
    console.warn(`status layer ${kind}: ${raw} stacks exceeds the maximum ${max}; drawing ${max}`);
  }
  return Math.min(max, Math.floor(raw));
}

/**
 * Layers to draw for a combatant, in paint order. Escarcha/Quemadura/Impulso/Ruptura come from
 * `statuses`; Sobrecarga is `charge` (never the class resource `res` nor an enemy's `chargePending`).
 * A dead combatant shows nothing; an out-of-range value is clamped for display only.
 */
export function statusLayers(c: Pick<Combatant, "hp" | "statuses" | "charge">): StatusLayer[] {
  if (c.hp <= 0) return [];
  const raw: Record<StatusLayerKind, number> = { frost: 0, burn: 0, wind: 0, fracture: 0, charge: c.charge ?? 0 };
  for (const id of Object.keys(STATUS_KIND) as StatusId[]) raw[STATUS_KIND[id]] = stacksOf(c.statuses, id);
  return LAYER_KINDS.flatMap((kind) => {
    const stacks = clampStacks(kind, raw[kind]);
    return stacks ? [{ kind, stacks, id: `status_${kind}_${stacks}` }] : [];
  });
}

/** What changed between two renders of the same combatant (a changed intensity leaves and enters). */
export function diffLayers(prev: readonly StatusLayer[], next: readonly StatusLayer[]) {
  const had = new Map(prev.map((l) => [l.kind, l.id]));
  const has = new Map(next.map((l) => [l.kind, l.id]));
  return {
    leaving: prev.filter((l) => has.get(l.kind) !== l.id),
    entering: next.filter((l) => had.get(l.kind) !== l.id),
  };
}

/**
 * Opacity per layer: three or more coexisting states keep every shape but the secondary ones
 * recede; the dominant one (most stacks, then paint order) stays at full presence.
 */
export function layerOpacities(layers: readonly StatusLayer[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (layers.length < 3) {
    for (const l of layers) out[l.kind] = 1;
    return out;
  }
  const top = layers.reduce((a, b) => (b.stacks > a.stacks ? b : a));
  for (const l of layers) out[l.kind] = l === top ? 1 : layers.length >= 4 ? 0.65 : 0.78;
  return out;
}

/** Combatant (0 player, k = enemies[k-1]) that loses or gains a layer because of a structured event. */
export function eventCarrier(ev: Pick<CombatEvent, "type" | "actor" | "target" | "detail">): number | null {
  if (ev.type === "statusConsumed") {
    // Impulso and Sobrecarga are spent by their bearer; the others leave the target.
    return ev.detail === "impulso" || ev.detail === "sobrecarga" ? ev.actor : (ev.target ?? ev.actor);
  }
  if (ev.type === "statusApplied" || ev.type === "statusRemoved") return ev.target ?? ev.actor;
  return null;
}

/** Wait (ms) before a layer change of combatant `id` shows, so it lands with the impact that causes it. */
export function layerChangeDelayMs(cev: readonly CombatEvent[], id: number): number {
  return cev.some((ev) => eventCarrier(ev) === id) ? Math.round(IMPACT_S * 1000) : 0;
}
