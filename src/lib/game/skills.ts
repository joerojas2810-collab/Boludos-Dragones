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
  extraCharge?: boolean; // Inscribir / Sello: one extra elemental charge (max 2 per target)
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
    id: "knight_advance", classId: "caballero", name: "Avance", unlock: 0, cost: 0, gen: 2, cooldown: 0,
    target: "single", power: 0.85, aguante: 0.25, consume: false,
    description: "Golpe firme (85 % del básico). Genera 2 de Resolución.",
  }),
  knight_breaker: S({
    id: "knight_breaker", classId: "caballero", name: "Rompeguardia", unlock: 0, cost: 2, gen: 0, cooldown: 0,
    target: "single", power: 1.25, aguante: 1.25, consume: true, cancels: "break",
    description: "Daño del 125 % del básico; daña Aguante por el 125 % del daño de vida causado. Si provoca Quiebre, cancela una Carga. Consume el estado elemental.",
  }),
  knight_bastion: S({
    id: "knight_bastion", classId: "caballero", name: "Bastión", unlock: 5, cost: 2, gen: 0, cooldown: 1,
    target: "self", power: 0, aguante: 0, consume: false, shield: 0.10,
    description: "Protección pura: escudo del 10 % de tu vida máxima (tope). No ataca ni consume estados.",
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
    id: "mage_barrier", classId: "mago", name: "Barrera", unlock: 5, cost: 1, gen: 0, cooldown: 1,
    target: "single", power: 0.5, aguante: 0.25, consume: false, shield: 0.06,
    description: "Golpe del 50 % que aplica una carga elemental y te da un escudo del 6 % de tu vida máxima. No consume estados.",
  }),
  mage_seal: S({
    id: "mage_seal", classId: "mago", name: "Sello", unlock: 12, cost: 1, gen: 0, cooldown: 1,
    target: "single", power: 0.5, aguante: 0.25, consume: false, extraCharge: true, cancels: "interruptible",
    description: "Golpe del 50 % que aplica hasta 2 cargas elementales e interrumpe un ritual anunciado si hace daño. No consume estados.",
  }),
  rogue_feint: S({
    id: "rogue_feint", classId: "picaro", name: "Finta", unlock: 0, cost: 0, gen: 2, cooldown: 0,
    target: "single", power: 0.8, aguante: 0.25, consume: false,
    description: "Golpe del 80 %. Genera 2 de Apertura.",
  }),
  rogue_finish: S({
    id: "rogue_finish", classId: "picaro", name: "Remate", unlock: 0, cost: 2, gen: 0, cooldown: 0,
    target: "single", power: 1.8, exposedPower: 2.15, aguante: 0.25, consume: true,
    description: "Golpe del 180 % (215 % si el objetivo está Expuesto). Consume el estado elemental.",
  }),
  rogue_step: S({
    id: "rogue_step", classId: "picaro", name: "Paso evasivo", unlock: 5, cost: 1, gen: 0, cooldown: 1,
    target: "single", power: 0.65, aguante: 0.25, consume: false, reduceNextHit: 0.4,
    description: "Golpe del 65 % sin consumir estados. El próximo impacto recibido hace un 40 % menos hasta tu siguiente turno. No es una esquiva garantizada.",
  }),
  rogue_sabotage: S({
    id: "rogue_sabotage", classId: "picaro", name: "Sabotaje", unlock: 12, cost: 1, gen: 0, cooldown: 1,
    target: "single", power: 0.75, aguante: 1.0, consume: false, cancels: "interruptible",
    description: "Golpe del 75 %; daña Aguante por el 100 % del daño de vida causado. Interrumpe un ritual anunciado si hace daño. No cancela Cargas ni consume estados.",
  }),
  cleric_judgment: S({
    id: "cleric_judgment", classId: "clerigo", name: "Juicio", unlock: 0, cost: 0, gen: 2, cooldown: 0,
    target: "single", power: 0.75, aguante: 0.25, consume: false,
    description: "Golpe del 75 %. Sacrifica daño inmediato para generar 2 de Bendición.",
  }),
  cleric_restore: S({
    id: "cleric_restore", classId: "clerigo", name: "Restaurar", unlock: 0, cost: 2, gen: 0, cooldown: 1,
    target: "self", power: 0, aguante: 0, consume: false, heal: 0.06,
    description: "Cura el 6 % de la vida máxima del receptor.",
  }),
  cleric_consecrate: S({
    id: "cleric_consecrate", classId: "clerigo", name: "Consagrar", unlock: 5, cost: 2, gen: 0, cooldown: 0,
    target: "single", power: 1.65, aguante: 0.25, consume: true,
    description: "Golpe del 165 %. Consume el estado elemental. No cura.",
  }),
  cleric_cleanse: S({
    id: "cleric_cleanse", classId: "clerigo", name: "Purificar", unlock: 12, cost: 1, gen: 0, cooldown: 1,
    target: "self", power: 0, aguante: 0, consume: false, cleanse: true, shield: 0.03,
    description: "Retira el estado negativo más antiguo y da un escudo del 3 %.",
  }),
  berserker_charge: S({
    id: "berserker_charge", classId: "berserker", name: "Embestida", unlock: 0, cost: 0, gen: 2, cooldown: 0,
    target: "single", power: 1.0, aguante: 0.25, consume: false, selfDamage: 0.02,
    description: "Golpe del 100 % que te cuesta el 2 % de tu vida (no letal). Genera 2 de Furia.",
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
    description: "Daño del 100 % del básico; daña Aguante por el 150 % del daño de vida causado. Si provoca Quiebre, cancela una Carga. Consume el estado elemental.",
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

/** Short, additive roles for preparation; derived from the same catalogue as combat. */
export function skillRoles(def: SkillDef): string[] {
  return [
    def.gen ? "Genera recurso" : null,
    def.consume ? "Consume estados" : null,
    def.extraCharge ? "Prepara elemento" : null,
    def.shield || def.reduceNextHit ? "Protege" : null,
    def.heal || def.healIfDamage ? "Cura" : null,
    def.cleanse ? "Purifica" : null,
    def.cancels === "interruptible" ? "Interrumpe ritual" : null,
    def.aguante >= 1 ? "Rompe Aguante" : null,
    def.target === "all" ? "Área" : null,
  ].filter((role): role is string => role !== null);
}

/** Non-blocking consequences of an equipped pair; every legal pair remains playable. */
export function loadoutHints(loadout: Loadout): string[] {
  const defs = loadout.map((id) => SKILLS[id]);
  return [
    !defs.some((s) => s.gen) ? "Sin generador equipado: el Básico da 1 de recurso si hace daño; Defender ante una amenaza fuerte también da 1." : null,
    !defs.some((s) => s.consume) ? "Sin consumidor equipado: conservas los efectos de tus cargas, pero estas habilidades no pueden detonarlas, retrasar, adelantar ni preparar penetración por consumo." : null,
  ].filter((hint): hint is string => hint !== null);
}
