// Elemental status effects (pure data + helpers; combat.ts applies them).
// Agua -> Escarcha, Fuego -> Quemadura, Viento -> Impulso, Tierra -> Ruptura.
// Rayo has no status: every OVERLOAD_EVERY-th Rayo hit of the attacker hits harder.
import type { Element } from "./elements";

export type StatusId = "escarcha" | "quemadura" | "impulso" | "ruptura";

export interface StatusEffect {
  id: StatusId;
  stacks: number;
  turns: number; // rounds left
  amount?: number; // quemadura: damage per stack per round
}

export const STATUS_OF_ELEMENT: Partial<Record<Element, StatusId>> = {
  agua: "escarcha",
  fuego: "quemadura",
  viento: "impulso",
  tierra: "ruptura",
};

// per: escarcha = speed lost per stack, impulso = speed gained per stack (own),
// ruptura = DEF lost per stack, quemadura = share of the hit dealt each round.
export const STATUS_DATA: Record<
  StatusId,
  { label: string; max: number; turns: number; per: number; negative: boolean }
> = {
  escarcha: { label: "Escarcha", max: 3, turns: 3, per: 0.1, negative: true },
  quemadura: { label: "Quemadura", max: 2, turns: 3, per: 0.2, negative: true },
  impulso: { label: "Impulso", max: 3, turns: 3, per: 0.08, negative: false },
  ruptura: { label: "Ruptura", max: 3, turns: 3, per: 0.08, negative: true },
};

// Only the class special (Ataque 2) applies statuses, CLASS_STACKS per use.
export const CLASS_STACKS = 2;
export const OVERLOAD_EVERY = 3; // Rayo: every 3rd own hit
export const OVERLOAD_BONUS = 0.4;
export const BURN_CAP = 0.06; // a burn never takes more than this share of max hp per round

type List = readonly StatusEffect[] | undefined;

export const stacksOf = (list: List, id: StatusId): number =>
  list?.find((s) => s.id === id)?.stacks ?? 0;

// Adds stacks (up to the cap) and renews the duration.
export function addStatus(
  list: List,
  id: StatusId,
  stacks: number,
  amount?: number,
  resist = 0, // target's resistance: shortens the duration of negative statuses
): StatusEffect[] {
  const d = STATUS_DATA[id];
  const turns = d.negative ? Math.max(1, Math.round(d.turns * (1 - resist))) : d.turns;
  const cur = list?.find((s) => s.id === id);
  const next: StatusEffect = {
    id,
    stacks: Math.min(d.max, (cur?.stacks ?? 0) + stacks),
    turns,
    ...(amount !== undefined && { amount }),
  };
  return [...(list ?? []).filter((s) => s.id !== id), next];
}

// Removes the first negative status (Clérigo guard).
export function cleanse(list: List): StatusEffect[] {
  const out = [...(list ?? [])];
  const i = out.findIndex((s) => STATUS_DATA[s.id].negative);
  if (i >= 0) out.splice(i, 1);
  return out;
}

// End of round: one round less on every status, expired ones drop.
export const tickStatuses = (list: List): StatusEffect[] =>
  (list ?? []).flatMap((s) => (s.turns > 1 ? [{ ...s, turns: s.turns - 1 }] : []));

// Damage of the burn this round (before the hp cap).
export const burnDamage = (list: List): number => {
  const b = list?.find((s) => s.id === "quemadura");
  return b ? Math.round((b.amount ?? 0) * b.stacks) : 0;
};

// Speed multiplier from Escarcha (−) and Impulso (+).
export const speedMult = (list: List): number =>
  Math.max(
    0.1,
    1 -
      STATUS_DATA.escarcha.per * stacksOf(list, "escarcha") +
      STATUS_DATA.impulso.per * stacksOf(list, "impulso"),
  );

// DEF multiplier from Ruptura.
export const defMult = (list: List): number =>
  1 - STATUS_DATA.ruptura.per * stacksOf(list, "ruptura");
