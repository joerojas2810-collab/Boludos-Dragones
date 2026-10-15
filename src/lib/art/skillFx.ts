// Presentation map of every combat action: which existing hero animation and VFX it plays, which
// painted skill icon it borrows, and the labeled fallback shown while its own art does not exist.
// Only assets that already exist are referenced (hero actions: heroes.ts, vfx: effects.generated.ts,
// icons: artIds.json, plus a few passive/relic/weapon icons). Anything missing is listed in MISSING_SKILL_ART for the art brief.
import { iconFor } from "../art";
import type { HeroAction } from "./heroes";
import type { ClassId } from "@/lib/game/characters";
import type { MoveKey, CombatEvent } from "@/lib/game/combat";
import { skillEffects } from "@/lib/game/explain";
import { isSkillId, RESOURCE_NAME, SKILLS, type SkillId } from "@/lib/game/skills";

export interface SkillFx {
  /** Full icon name for <Icon name=...> (skill_*, passive_*, relic_*, part_*). Existing files only. */
  icon: string;
  /** Existing hero animation. */
  hero: HeroAction;
  /** Existing one-row vfx id; "hit" = the element hit sheet of the actor. */
  vfx: "hit" | "shield" | "regeneration" | "perfect_guard" | "dodge" | null;
  /** Shape glyph shown next to the consequence text (never colour alone). */
  glyph: string;
  /** Tailwind classes of the shield overlay: geometry and material tell the shield skills apart. */
  look?: string;
}

const sk = (k: string) => iconFor("skill", k) as string;

export const SKILL_FX: Record<MoveKey | "defend", SkillFx> = {
  attack1: { icon: "part_sword", hero: "attack_1", vfx: "hit", glyph: "⚔" },
  attack2: { icon: sk("caballero.attack2"), hero: "attack_2", vfx: "hit", glyph: "⚠" },
  defend: { icon: sk("defend"), hero: "defend", vfx: "shield", glyph: "◧" },
  knight_advance: { icon: sk("caballero.attack1"), hero: "attack_1", vfx: "hit", glyph: "⚔" },
  knight_breaker: { icon: sk("caballero.attack2"), hero: "attack_2", vfx: "hit", glyph: "⛨" },
  // Physical bulwark: planted stance, wide low plate in steel tones.
  knight_bastion: { icon: "skill_knight_bastion", hero: "defend", vfx: "shield", glyph: "▣", look: "top-[18%] w-44 saturate-50 brightness-110" },
  knight_sweep: { icon: sk("barrido"), hero: "attack_3", vfx: "hit", glyph: "≋" },
  mage_inscribe: { icon: sk("mago.attack1"), hero: "attack_1", vfx: "hit", glyph: "✎" },
  mage_detonate: { icon: sk("mago.attack2"), hero: "attack_3", vfx: "hit", glyph: "✹" },
  // Arcane ward: cast gesture, tall violet dome.
  mage_barrier: { icon: sk("arcane_shield"), hero: "attack_1", vfx: "shield", glyph: "◈", look: "top-[-22%] w-28 hue-rotate-[230deg]" },
  mage_seal: { icon: sk("mage_seal"), hero: "attack_2", vfx: "hit", glyph: "✦" },
  rogue_feint: { icon: sk("picaro.attack1"), hero: "attack_1", vfx: "hit", glyph: "⚔" },
  rogue_finish: { icon: sk("picaro.attack2"), hero: "attack_3", vfx: "hit", glyph: "✹" },
  // Step aside: dodge pose plus a faint half-shield, because it only mitigates the next hit.
  rogue_step: { icon: "skill_rogue_step", hero: "dodge", vfx: "shield", glyph: "↷", look: "top-[24%] w-24 opacity-60 hue-rotate-[120deg]" },
  rogue_sabotage: { icon: "skill_rogue_sabotage", hero: "attack_2", vfx: "hit", glyph: "✦" },
  cleric_judgment: { icon: sk("clerigo.attack1"), hero: "attack_1", vfx: "hit", glyph: "⚔" },
  cleric_consecrate: { icon: sk("castigo"), hero: "attack_3", vfx: "hit", glyph: "✹" },
  cleric_restore: { icon: "skill_cleric_restore", hero: "defend", vfx: "regeneration", glyph: "✚" },
  // The cleanse effect is NOT played by the cast: it comes from the statusRemoved event (eventVfx).
  cleric_cleanse: { icon: sk("cleric_cleanse"), hero: "defend", vfx: null, glyph: "✧" },
  berserker_charge: { icon: sk("berserker_charge"), hero: "attack_1", vfx: "hit", glyph: "⚔" },
  berserker_release: { icon: sk("berserker_release"), hero: "attack_3", vfx: "hit", glyph: "✹" },
  berserker_recover: { icon: sk("berserker_recover"), hero: "attack_2", vfx: "regeneration", glyph: "✚" },
  berserker_shatter: { icon: sk("berserker_shatter"), hero: "attack_3", vfx: "hit", glyph: "⛨" },
};

// Basic attack = the equipped weapon. Weapon icons never suggest a resource cost or a heal.
const WEAPON_ICON: Record<string, string> = {
  espada: "part_sword", hacha: "part_axe", arco: "part_bow", baston: "part_staff", varita: "part_wand",
  daga: "part_dagger", maza: "part_mace", libro: "part_book", mandoble: "part_axe", martillo: "part_axe",
};
const CLASS_BASIC_ICON: Record<ClassId, string> = {
  caballero: "part_sword", mago: "part_staff", picaro: "part_dagger", clerigo: "part_mace", berserker: "part_axe",
};
/** Icon of the Básico button: by weapon type, else by class. */
export const basicIcon = (classId: ClassId, weapon?: string): string =>
  (weapon && WEAPON_ICON[weapon]) || CLASS_BASIC_ICON[classId];

const FIXED_TAG: Record<string, string> = { attack1: "Golpe", attack2: "Golpe fuerte", defend: "En guardia" };
/** Consequence in words, derived from the SkillDef so it cannot drift from the rules. */
export function skillTag(m: MoveKey | "defend"): string {
  if (!isSkillId(m)) return FIXED_TAG[m] ?? "";
  const def = SKILLS[m];
  return [
    def.gen ? `+${def.gen} ${RESOURCE_NAME[def.classId]}` : null,
    def.target === "all" ? "Golpea a todos" : null,
    ...skillEffects(def),
  ].filter(Boolean).slice(0, 2).join(" · ");
}

// Semantic combat events -> one-shot overlay (docs/ideal/ART_FALTANTES.md). Never inferred from the log.
const CONSUME_VFX: Record<string, string> = {
  quemadura: "consume_fire", escarcha: "consume_water", impulso: "consume_wind",
  ruptura: "consume_earth", sobrecarga: "consume_lightning",
};
/** Overlay to play on combatant `at` (0 = player, k = enemies[k-1]) for a structured event, if any. */
export function eventVfx(ev: Pick<CombatEvent, "type" | "actor" | "target" | "detail">): { id: string; at: number } | null {
  if (ev.type === "statusConsumed") {
    const id = CONSUME_VFX[ev.detail ?? ""];
    // Impulso is spent on the actor itself; the other consumptions land on the target.
    return id ? { id, at: ev.detail === "impulso" ? ev.actor : (ev.target ?? ev.actor) } : null;
  }
  if (ev.type === "staggerBroken") return { id: "stagger_break", at: ev.target ?? ev.actor };
  // Cleanse: only when a negative status really went (the engine emits nothing otherwise).
  if (ev.type === "statusRemoved") return { id: "ritual_interrupt", at: ev.target ?? ev.actor };
  if (ev.type === "telegraphCancelled" && ev.detail === "channeling") return { id: "ritual_interrupt", at: ev.actor };
  if (ev.type === "bossPhaseChanged" && ev.detail === "armadura") return { id: "armor_rebuild", at: ev.actor };
  return null;
}

/** Effects a fight can show by event: preloaded (normal and reduced) before the first blow. */
export const EVENT_VFX_IDS: readonly string[] = [
  ...Object.values(CONSUME_VFX), "stagger_break", "ritual_interrupt", "armor_rebuild",
];

export interface StepNumber<K> {
  target: K;
  kind: "dmg" | "heal" | "self";
  value: number;
  /** Attacker of the first hit (dmg only), for the elemental mark. */
  actor: K | null;
}
/**
 * Separate floating numbers from event amounts and causes, in order of first appearance:
 * damage per target (hit events), healing per receiver (healed), self-damage (selfDamaged).
 * Never a net HP difference, so a heal and a hit in one step both show.
 */
export function stepNumbers<K extends string | number>(
  events: readonly { type: string; actor: K | null; target?: K | null; value?: number }[],
): StepNumber<K>[] {
  const out: StepNumber<K>[] = [];
  const kinds: Record<string, StepNumber<K>["kind"]> = { hit: "dmg", healed: "heal", selfDamaged: "self" };
  for (const e of events) {
    const kind = kinds[e.type];
    const target = e.target ?? e.actor;
    if (!kind || target === null || (e.value ?? 0) <= 0) continue;
    const row = out.find((n) => n.target === target && n.kind === kind);
    if (row) row.value += e.value!;
    else out.push({ target, kind, value: e.value!, actor: e.actor });
  }
  return out;
}

export interface Callout {
  glyph: string;
  text: string;
  /** 0 = Quiebre / cancelled threat / boss phase; 1 = state spent or removed; 2 = what you did; 3 = tempo and previews. */
  prio: number;
}
/** At most `max` callouts, most important first kind kept (then chronological), with a count of what was cut. */
export function pickCallouts(list: readonly Callout[], max = 4): Callout[] {
  const keep = list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.prio - b.c.prio || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.c);
  const cut = list.length - keep.length;
  return cut > 0 ? [...keep, { glyph: "…", text: `y ${cut} más (ver el registro)`, prio: 4 }] : keep;
}

export const skillFx = (m: MoveKey | "defend"): SkillFx => SKILL_FX[m];

export const heroActionFor = (m: MoveKey | "defend"): HeroAction => SKILL_FX[m]?.hero ?? "attack_2";

export interface MissingArt {
  id: SkillId | string;
  missing: string;
}

/** For the art brief: assets the presentation borrows or fakes with text/glyphs for now. */
export const MISSING_SKILL_ART: readonly MissingArt[] = [
  { id: "knight_bastion", missing: "VFX propio de escudo físico (hoy shield con otra geometría y material)" },
  { id: "mage_barrier", missing: "VFX de barrera arcana (hoy shield teñido, con otra geometría)" },
  { id: "mage_seal", missing: "VFX propio de sello (comparte ritual_interrupt/golpe)" },
  { id: "rogue_sabotage", missing: "VFX de sabotaje/interrupción propio (icono pintado propio ya integrado)" },
  { id: "rogue_step", missing: "estela de desplazamiento (hoy pose de esquiva + media barrera)" },
  { id: "cleric_restore", missing: "VFX de cura dirigida (icono pintado propio ya integrado)" },
  { id: "cleric_cleanse", missing: "VFX de purificación propio (hoy reutiliza ritual_interrupt al retirar el estado)" },
  { id: "attack_3 por clase", missing: "revisar que attack_3 se vea distinto de attack_2 para las 5 clases" },
  { id: "telegraphCancelled", missing: "VFX de amenaza no ritual cancelada (Carga: solo texto; ritual_interrupt cubre el ritual)" },
  { id: "progressChanged", missing: "VFX de turno adelantado/retrasado (hoy solo texto y cola)" },
  { id: "exposed", missing: "marca Expuesto sobre el enemigo (hoy escudo fracturado en SVG)" },
  { id: "aguante", missing: "icono propio de Aguante y de cada estado elemental con silueta distinta" },
];
