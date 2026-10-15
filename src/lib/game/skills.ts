// Skill catalog of the "estado ideal" contract (docs/ideal/01 §5): four skills per class,
// two equipped at a time. Pure data; combat.ts resolves them. IDs are stable and shared by
// client, server and replays: the client only ever sends an id, never an effect.
import type { ClassId } from "./characters";

export type SkillId =
  | "knight_advance" | "knight_breaker" | "knight_bastion" | "knight_sweep"
  | "mage_inscribe" | "mage_detonate" | "mage_barrier" | "mage_seal"
  | "rogue_feint" | "rogue_finish" | "rogue_step" | "rogue_sabotage"
  | "cleric_judgment" | "cleric_consecrate" | "cleric_restore" | "cleric_cleanse"
  | "berserker_charge" | "berserker_release" | "berserker_recover" | "berserker_shatter";

export type SkillTarget = "single" | "all" | "self";

export interface SkillDef {
  id: SkillId;
  classId: ClassId;
  name: string;
  /** Class mastery (highest level reached with the class) that unlocks it. */
  unlock: 0 | 5 | 12;
  cost: 0 | 1 | 2 | 3; // class resource spent
  gen: 0 | 1 | 2; // class resource generated (once per use)
  cooldown: 0 | 1; // own turns blocked after use (docs/ideal/01 §3.2)
  target: SkillTarget;
  power: number; // P: multiple of the actor's basic damage against the same target (0 = no attack)
  aguante: number; // A: damage to Aguante as a fraction of the effective life damage
  consume: boolean; // consume the hero's elemental state after the normal impact
  extraCharge?: boolean; // Inscribir: one extra elemental charge (max 2 per use)
  exposedPower?: number; // Remate: P against an Expuesto target
  shield?: number; // fraction of max hp, capped at SHIELD_CAP
  heal?: number; // fraction of the receiver's max hp
  healIfDamage?: number; // Sed de sangre: self heal only if damage was dealt
  selfDamage?: number; // Embestida: non-lethal fraction of max hp
  cleanse?: boolean; // remove the first negative status
  reduceNextHit?: number; // Paso evasivo
  cancels?: "interruptible" | "break"; // threat tags it can cancel
  description: string;
}

export const SHIELD_CAP = 0.1; // active shield, accumulated, fraction of max hp
export const ACTIVE_HEAL_CAP = 0.06; // active heal per own turn, fraction of max hp
export const RESOURCE_MAX = 3;

const S = (d: SkillDef): SkillDef => d;

export const SKILLS: Record<SkillId, SkillDef> = {
  knight_advance: S({
    id: "knight_advance", classId: "caballero", name: "Avance", unlock: 0, cost: 0, gen: 1, cooldown: 0,
    target: "single", power: 0.85, aguante: 0.25, consume: false,
    description: "Golpe firme (85 % del básico). Genera 1 Resolución.",
  }),
  knight_breaker: S({
    id: "knight_breaker", classId: "caballero", name: "Rompeguardia", unlock: 0, cost: 2, gen: 0, cooldown: 0,
    target: "single", power: 1.35, aguante: 1.25, consume: true, cancels: "break",
    description: "Golpe pesado que castiga el Aguante; si provoca Quiebre cancela una Carga. Consume el estado elemental.",
  }),
  knight_bastion: S({
    id: "knight_bastion", classId: "caballero", name: "Bastión", unlock: 5, cost: 2, gen: 0, cooldown: 1,
    target: "self", power: 0, aguante: 0, consume: false, shield: 0.08,
    description: "Escudo del 8 % de tu vida máxima. Conserva los estados elementales.",
  }),
  knight_sweep: S({
    id: "knight_sweep", classId: "caballero", name: "Corte amplio", unlock: 12, cost: 2, gen: 0, cooldown: 1,
    target: "all", power: 0.65, aguante: 0.25, consume: true,
    description: "Golpea a todos los enemigos (65 %). Consume el estado elemental de cada objetivo.",
  }),
  mage_inscribe: S({
    id: "mage_inscribe", classId: "mago", name: "Inscribir", unlock: 0, cost: 0, gen: 1, cooldown: 0,
    target: "single", power: 0.7, aguante: 0.25, consume: false, extraCharge: true,
    description: "Golpe del 70 % que deja una carga elemental extra (máx. 2 por uso). Genera 1 Foco.",
  }),
  mage_detonate: S({
    id: "mage_detonate", classId: "mago", name: "Detonar", unlock: 0, cost: 2, gen: 0, cooldown: 0,
    target: "single", power: 1.0, aguante: 0.25, consume: true,
    description: "Golpe del 100 % que detona el estado elemental (efecto +25 % por tu clase).",
  }),
  mage_barrier: S({
    id: "mage_barrier", classId: "mago", name: "Barrera", unlock: 5, cost: 2, gen: 0, cooldown: 1,
    target: "self", power: 0, aguante: 0, consume: false, shield: 0.08,
    description: "Escudo del 8 % de tu vida máxima. Conserva las cargas elementales.",
  }),
  mage_seal: S({
    id: "mage_seal", classId: "mago", name: "Sello", unlock: 12, cost: 1, gen: 0, cooldown: 1,
    target: "single", power: 0.5, aguante: 0.25, consume: false, cancels: "interruptible",
    description: "Golpe del 50 % que cancela una amenaza interrumpible ya anunciada.",
  }),
  rogue_feint: S({
    id: "rogue_feint", classId: "picaro", name: "Finta", unlock: 0, cost: 0, gen: 2, cooldown: 0,
    target: "single", power: 0.65, aguante: 0.25, consume: false,
    description: "Golpe del 65 %. Genera 2 de Apertura.",
  }),
  rogue_finish: S({
    id: "rogue_finish", classId: "picaro", name: "Remate", unlock: 0, cost: 2, gen: 0, cooldown: 0,
    target: "single", power: 1.45, exposedPower: 1.75, aguante: 0.25, consume: true,
    description: "Golpe del 145 % (175 % si el objetivo está Expuesto). Consume el estado elemental.",
  }),
  rogue_step: S({
    id: "rogue_step", classId: "picaro", name: "Paso evasivo", unlock: 5, cost: 1, gen: 0, cooldown: 1,
    target: "self", power: 0, aguante: 0, consume: false, reduceNextHit: 0.4,
    description: "El próximo impacto que recibas hace 40 % menos hasta tu siguiente turno.",
  }),
  rogue_sabotage: S({
    id: "rogue_sabotage", classId: "picaro", name: "Sabotaje", unlock: 12, cost: 1, gen: 0, cooldown: 1,
    target: "single", power: 0.5, aguante: 0.25, consume: false, cancels: "interruptible",
    description: "Golpe del 50 % que cancela una amenaza interrumpible ya anunciada.",
  }),
  cleric_judgment: S({
    id: "cleric_judgment", classId: "clerigo", name: "Juicio", unlock: 0, cost: 0, gen: 1, cooldown: 0,
    target: "single", power: 0.85, aguante: 0.25, consume: false,
    description: "Golpe del 85 %. Genera 1 Bendición.",
  }),
  cleric_consecrate: S({
    id: "cleric_consecrate", classId: "clerigo", name: "Consagrar", unlock: 0, cost: 2, gen: 0, cooldown: 0,
    target: "single", power: 1.3, aguante: 0.25, consume: true,
    description: "Golpe del 130 %. Consume el estado elemental. No cura.",
  }),
  cleric_restore: S({
    id: "cleric_restore", classId: "clerigo", name: "Restaurar", unlock: 5, cost: 2, gen: 0, cooldown: 1,
    target: "self", power: 0, aguante: 0, consume: false, heal: 0.06,
    description: "Cura el 6 % de la vida máxima del receptor.",
  }),
  cleric_cleanse: S({
    id: "cleric_cleanse", classId: "clerigo", name: "Purificar", unlock: 12, cost: 1, gen: 0, cooldown: 1,
    target: "self", power: 0, aguante: 0, consume: false, cleanse: true, shield: 0.03,
    description: "Retira el estado negativo más antiguo y da un escudo del 3 %.",
  }),
  berserker_charge: S({
    id: "berserker_charge", classId: "berserker", name: "Embestida", unlock: 0, cost: 0, gen: 1, cooldown: 0,
    target: "single", power: 1.0, aguante: 0.25, consume: false, selfDamage: 0.02,
    description: "Golpe del 100 % que te cuesta el 2 % de tu vida (no letal). Genera 1 Furia.",
  }),
  berserker_release: S({
    id: "berserker_release", classId: "berserker", name: "Descarga", unlock: 0, cost: 2, gen: 0, cooldown: 0,
    target: "single", power: 1.55, aguante: 0.25, consume: true,
    description: "Golpe del 155 %. Consume el estado elemental.",
  }),
  berserker_recover: S({
    id: "berserker_recover", classId: "berserker", name: "Sed de sangre", unlock: 5, cost: 2, gen: 0, cooldown: 1,
    target: "single", power: 0.65, aguante: 0.25, consume: false, healIfDamage: 0.04,
    description: "Golpe del 65 % que te cura el 4 % si causa daño.",
  }),
  berserker_shatter: S({
    id: "berserker_shatter", classId: "berserker", name: "Rompemuro", unlock: 12, cost: 2, gen: 0, cooldown: 1,
    target: "single", power: 1.0, aguante: 1.5, consume: true, cancels: "break",
    description: "Golpe del 100 % contra el Aguante; si provoca Quiebre cancela una Carga. Consume el estado elemental.",
  }),
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const isSkillId = (v: unknown): v is SkillId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(SKILLS, v);

export const RESOURCE_NAME: Record<ClassId, string> = {
  caballero: "Resolución",
  mago: "Foco",
  picaro: "Apertura",
  clerigo: "Bendición",
  berserker: "Furia",
};

export const skillsOfClass = (classId: ClassId): SkillDef[] =>
  SKILL_IDS.filter((id) => SKILLS[id].classId === classId).map((id) => SKILLS[id]);

/** Unlock levels checked by the profile (class mastery) and by the server. */
export type ClassMastery = Record<ClassId, number>;
export const EMPTY_MASTERY: ClassMastery = {
  caballero: 0, mago: 0, picaro: 0, clerigo: 0, berserker: 0,
};

/** Two skills equipped in the two action slots (A, B). */
export type Loadout = readonly [SkillId, SkillId];

export const defaultLoadout = (classId: ClassId): Loadout => {
  const [a, b] = skillsOfClass(classId).filter((s) => s.unlock === 0);
  return [a.id, b.id];
};

/** mastery === null means leveled mode: all four candidates are available. */
export const isSkillUnlocked = (id: SkillId, mastery: number | null): boolean =>
  mastery === null || mastery >= SKILLS[id].unlock;

export function loadoutError(
  classId: ClassId,
  loadout: readonly string[] | undefined,
  mastery: number | null,
): string | null {
  if (!loadout || loadout.length !== 2) return "Elige exactamente dos habilidades.";
  const [a, b] = loadout;
  if (!isSkillId(a) || !isSkillId(b)) return "Habilidad desconocida.";
  if (a === b) return "Las dos habilidades deben ser distintas.";
  if (SKILLS[a].classId !== classId || SKILLS[b].classId !== classId)
    return "Habilidad de otra clase.";
  if (!isSkillUnlocked(a, mastery) || !isSkillUnlocked(b, mastery))
    return "Habilidad todavía bloqueada.";
  return null;
}

/** Valid loadout or the class default. */
export function sanitizeLoadout(
  classId: ClassId,
  loadout: readonly string[] | undefined,
  mastery: number | null,
): Loadout {
  return loadoutError(classId, loadout, mastery) === null
    ? ([loadout![0], loadout![1]] as unknown as Loadout)
    : defaultLoadout(classId);
}

/** Skills whose unlock was just crossed by going from `from` to `to` mastery. */
export const newlyUnlocked = (classId: ClassId, from: number, to: number): SkillDef[] =>
  skillsOfClass(classId).filter((s) => s.unlock > from && s.unlock <= to);
