// Presentation map of every combat action: which existing hero animation and VFX it plays, which
// painted skill icon it borrows, and the labeled fallback shown while its own art does not exist.
// Only assets that already exist are referenced (hero actions: heroes.ts, vfx: effects.generated.ts,
// icons: artIds.json). Anything missing is listed in MISSING_SKILL_ART for the art brief.
import type { HeroAction } from "./heroes";
import type { MoveKey } from "@/lib/game/combat";
import type { SkillId } from "@/lib/game/skills";

export interface SkillFx {
  /** Key of artIds.json `skill` (use with iconFor("skill", key)). */
  icon: string;
  /** Existing hero animation. */
  hero: HeroAction;
  /** Existing one-row vfx id; "hit" = the element hit sheet of the actor. */
  vfx: "hit" | "shield" | "regeneration" | "perfect_guard" | "dodge" | null;
  /** Labeled fallback: the consequence in words, shown with a shape glyph while no own art exists. */
  tag: string;
  glyph: string;
}

export const SKILL_FX: Record<MoveKey | "defend", SkillFx> = {
  attack1: { icon: "caballero.attack1", hero: "attack_1", vfx: "hit", tag: "Golpe", glyph: "⚔" },
  attack2: { icon: "caballero.attack2", hero: "attack_2", vfx: "hit", tag: "Golpe fuerte", glyph: "⚠" },
  defend: { icon: "defend", hero: "defend", vfx: "shield", tag: "En guardia", glyph: "◧" },
  knight_advance: { icon: "caballero.attack1", hero: "attack_1", vfx: "hit", tag: "+1 Resolución", glyph: "⚔" },
  knight_breaker: { icon: "caballero.attack2", hero: "attack_2", vfx: "hit", tag: "Quiebra el Aguante", glyph: "⛨" },
  knight_bastion: { icon: "santuario", hero: "defend", vfx: "shield", tag: "Escudo", glyph: "◈" },
  knight_sweep: { icon: "barrido", hero: "attack_3", vfx: "hit", tag: "Golpea a todos", glyph: "≋" },
  mage_inscribe: { icon: "mago.attack1", hero: "attack_1", vfx: "hit", tag: "Carga extra +1 Foco", glyph: "✎" },
  mage_detonate: { icon: "mago.attack2", hero: "attack_3", vfx: "hit", tag: "Detona el estado", glyph: "✹" },
  mage_barrier: { icon: "santuario", hero: "defend", vfx: "shield", tag: "Escudo", glyph: "◈" },
  mage_seal: { icon: "ejecutar", hero: "attack_2", vfx: "hit", tag: "Interrumpe", glyph: "✦" },
  rogue_feint: { icon: "picaro.attack1", hero: "attack_1", vfx: "hit", tag: "+2 Apertura", glyph: "⚔" },
  rogue_finish: { icon: "picaro.attack2", hero: "attack_3", vfx: "hit", tag: "Remate", glyph: "✹" },
  rogue_step: { icon: "contraataque", hero: "dodge", vfx: "dodge", tag: "Golpe recibido −40 %", glyph: "↷" },
  rogue_sabotage: { icon: "picaro.attack2", hero: "attack_2", vfx: "hit", tag: "Interrumpe", glyph: "✦" },
  cleric_judgment: { icon: "clerigo.attack1", hero: "attack_1", vfx: "hit", tag: "+1 Bendición", glyph: "⚔" },
  cleric_consecrate: { icon: "castigo", hero: "attack_3", vfx: "hit", tag: "Consagra el estado", glyph: "✹" },
  cleric_restore: { icon: "clerigo.attack2", hero: "defend", vfx: "regeneration", tag: "Cura", glyph: "✚" },
  cleric_cleanse: { icon: "santuario", hero: "defend", vfx: "regeneration", tag: "Purifica", glyph: "✧" },
  berserker_charge: { icon: "golpeDoble", hero: "attack_1", vfx: "hit", tag: "+1 Furia (te cuesta PV)", glyph: "⚔" },
  berserker_release: { icon: "ejecutar", hero: "attack_3", vfx: "hit", tag: "Descarga", glyph: "✹" },
  berserker_recover: { icon: "castigo", hero: "attack_2", vfx: "regeneration", tag: "Sed de sangre", glyph: "✚" },
  berserker_shatter: { icon: "tormenta", hero: "attack_3", vfx: "hit", tag: "Rompe el Aguante", glyph: "⛨" },
};

export const skillFx = (m: MoveKey | "defend"): SkillFx => SKILL_FX[m];

export const heroActionFor = (m: MoveKey | "defend"): HeroAction => SKILL_FX[m]?.hero ?? "attack_2";

export interface MissingArt {
  id: SkillId | string;
  missing: string;
}

/** For the art brief: assets the presentation borrows or fakes with text/glyphs for now. */
export const MISSING_SKILL_ART: readonly MissingArt[] = [
  { id: "knight_bastion", missing: "icono y VFX propio de escudo de Caballero (comparte santuario/shield)" },
  { id: "mage_barrier", missing: "icono y VFX de barrera arcana (comparte santuario/shield)" },
  { id: "mage_seal", missing: "icono de sello e VFX de interrupción (usa ejecutar)" },
  { id: "rogue_sabotage", missing: "icono e VFX de sabotaje/interrupción" },
  { id: "rogue_step", missing: "icono de paso evasivo (usa contraataque) y estela de esquiva" },
  { id: "cleric_restore", missing: "icono de cura propio (usa oración) y VFX de cura dirigida" },
  { id: "cleric_cleanse", missing: "icono y VFX de purificación" },
  { id: "berserker_*", missing: "los 4 iconos de Berserker (todos prestados de otras clases)" },
  { id: "attack_3 por clase", missing: "revisar que attack_3 se vea distinto de attack_2 para las 5 clases" },
  { id: "staggerBroken", missing: "VFX de Quiebre (hoy solo texto + forma de rombo en el HUD)" },
  { id: "statusConsumed", missing: "VFX de consumo de estado por elemento (hoy solo texto)" },
  { id: "telegraphCancelled", missing: "VFX de amenaza cancelada (hoy solo texto)" },
  { id: "progressChanged", missing: "VFX de turno adelantado/retrasado (hoy solo texto y cola)" },
  { id: "exposed", missing: "marca Expuesto sobre el enemigo (hoy solo ficha con forma)" },
  { id: "aguante", missing: "icono propio de Aguante y de cada estado elemental con silueta distinta" },
];
