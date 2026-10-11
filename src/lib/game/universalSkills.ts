import type { Attack } from "./characters";

export type UniversalSkillId =
  | "golpe"
  | "barrido"
  | "quebrar"
  | "interrumpir"
  | "explotar";

export interface UniversalSkillDefinition {
  id: UniversalSkillId;
  name: string;
  cooldown: number;
  attack: Attack;
  enabled: boolean;
  disabledReason?: string;
  target: "single" | "all";
}

export const UNIVERSAL_COOLDOWN_CONVERSION = 0.85;

export const UNIVERSAL_SKILLS: Record<UniversalSkillId, UniversalSkillDefinition> = {
  golpe: {
    id: "golpe",
    name: "Golpe",
    cooldown: 2,
    attack: { name: "Golpe", power: 1.8, accuracy: 0.9, cooldown: 2, heal: 0 },
    enabled: true,
    target: "single",
  },
  barrido: {
    id: "barrido",
    name: "Barrido",
    cooldown: 2,
    attack: { name: "Barrido", power: 0.9, accuracy: 0.9, cooldown: 2, heal: 0 },
    enabled: true,
    target: "all",
  },
  quebrar: {
    id: "quebrar",
    name: "Quebrar Aguante",
    cooldown: 1,
    attack: { name: "Quebrar Aguante", power: 0.9, accuracy: 1, cooldown: 1, heal: 0 },
    enabled: true,
    target: "single",
  },
  interrumpir: {
    id: "interrumpir",
    name: "Interrumpir",
    cooldown: 1,
    attack: { name: "Interrumpir", power: 0.55, accuracy: 1, cooldown: 1, heal: 0 },
    enabled: true,
    target: "single",
  },
  explotar: {
    id: "explotar",
    name: "Explotar estado",
    cooldown: 1,
    attack: { name: "Explotar estado", power: 0.4, accuracy: 1, cooldown: 1, heal: 0 },
    enabled: true,
    target: "single",
  },
};

export const ENABLED_UNIVERSAL_SKILLS: UniversalSkillId[] = ["golpe", "barrido", "quebrar", "interrumpir", "explotar"];

/** Internal timer is fractional; the interface rounds remaining activations up. */
export const universalCooldownLabel = (remaining: number): number =>
  Math.ceil(Math.max(0, remaining - 1e-9));
