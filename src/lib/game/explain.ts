// Pure tooltip text. Every number comes from the real constants or from the
// character's real stats, so the UI can never drift from the rules.
import {
  CLASS_PASSIVE_ADVANTAGE_BONUS,
  CLASS_PASSIVE_MAGE_CRIT,
  CLASS_PASSIVE_MAGE_REDUCTION,
  CLASS_PASSIVE_CRIT_MULT,
  CLASS_PASSIVE_DMG_REDUCTION,
  CLASS_PASSIVE_REGEN,
  CLASSES,
  type Character,
  type ClassId,
  type Stats,
} from "./characters";
import {
  attackElementMultiplier,
  critMultiplier,
  DEF_K,
  DEF_CAP,
  defReduction,
  DEFEND_FACTOR,
  DOUBLE_ATTACK_FACTOR,
  ELEMENT_SHIFT_EVERY,
  estimateDamage,
  FROST_DELAY,
  intentType,
  MAGE_CONSUME_MULT,
  isStrongIntent,
  RATE_MAX,
  RATE_MIN,
  RUPTURE_BYPASS_PER_CHARGE,
  skillBlockReason,
  TURN_CAP,
  TURN_WARN,
  WIND_ADVANCE,
  REGEN_FRACTION,
  SHIELD_FRACTION,
  livingEnemies,
  pendingIntents,
  PERFECT_GUARD_FACTOR,
  strongPending,
  type Battle,
  type Combatant,
  type EnemyMod,
  type Intent,
  type MoveKey,
  TRAIT_CAPS,
  attackOf,
} from "./combat";
import { isSkillId, RESOURCE_NAME, SKILLS, type SkillDef, type SkillId } from "./skills";
import { AUTO_STOP_HP } from "./auto";
import { WEAPON_TYPE_DATA } from "./weapons";
import {
  extraLines,
  GEAR_CAP,
  ROLL_SPREAD,
} from "./gear";
import {
  GAP_BANDS,
  LEVEL_BASE_CAP,
  LEVEL_CAP_PER_STAR,
  LEVEL_POWER_STEP,
  XP_COST_FACTOR,
  levelCap,
  xpToNextLevel,
} from "./heroLevel";
import {
  ADVANTAGE_BONUS,
  ELEMENTS,
  ELEMENT_LABEL,
  elementMultiplier,
  type Element,
} from "./elements";
import { MODIFIER_FLOORS } from "./floorFights";
import { CLEAR_XP_BONUS, FIGHT_XP, GAFE_LOSS_XP, SEDIENTO_HEAL } from "./stage";
import { BURN_CAP, STATUS_DATA, type StatusEffect, type StatusId } from "./statuses";
import {
  ADAPT_AFTER,
  ADAPT_FACTOR,
  ARMOR_FRACTION,
  ARMOR_TAKEN,
  ENRAGE_AFTER_OWN_TURN,
  ENRAGE_STEP,
  BROKEN_TAKEN,
  HEAD_THRESHOLDS,
  HUNGER_BELOW,
  HUNGER_STEAL,
  PLAGUE_LOSS,
  PRESSURE_STEP,
  RAMP_STEP,
  RITUAL_EVERY,
  ruleOf,
  STANCES,
  type BossRule,
} from "./bossRules";
import { TOWER_XP_FACTOR } from "./tower";
import { EXECUTE_HP, HIGH_HP, RAGE_MAX, TRAITS, type TraitId, type TraitMods, type TraitRules } from "./traits";

export type TipKind =
  | "passive"
  | "trait"
  | "stat"
  | "damage"
  | "heal"
  | "danger"
  | "gold"
  | "relic"
  | "info";

export interface Tip {
  title: string;
  kind: TipKind;
  lines: string[];
  source?: string; // shown as "Fuente: ..."
  color?: string; // overrides the kind colour of the title
}

const pct = (v: number) => `${+(v * 100).toFixed(1)}%`;
const n1 = (v: number) => `${+v.toFixed(1)}`;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export const STAT_NAME: Record<keyof Stats, string> = {
  hp: "PV",
  atk: "ATQ",
  def: "DEF",
  speed: "VEL",
  crit: "CRIT",
  resist: "RES",
  accuracy: "Precisión",
  critDmg: "Daño crítico",
  regen: "Regeneración",
  lifesteal: "Vampirismo",
};
const FRACTION_STATS: readonly (keyof Stats)[] = ["hp", "atk", "def", "speed"];

export const MOD_LABEL: Record<EnemyMod, string> = {
  regeneracion: "Regeneración",
  escudo: "Escudo",
  dobleAtaque: "Doble ataque",
  elementoCambiante: "Elemento cambiante",
};

// ---------- helpers ----------

// A Combatant for a class template (class cards, no fight yet).
export function previewCombatant(classId: ClassId): Combatant {
  const char: Character = {
    name: CLASSES[classId].name,
    classId,
    element: "tierra",
    stats: { ...CLASSES[classId].stats },
    traits: [],
    catchphrase: "",
    level: 1,
    xp: 0,
  };
  return { char, hp: char.stats.hp, cooldown: 0, defending: false, progress: 0, ownTurns: 0 };
}

const attackEl = (c: Combatant): Element =>
  c.char.element;

// ---------- elements ----------

export function elementTip(
  element: Element,
  c?: Combatant,
  foe?: Combatant,
  you = true,
): Tip {
  const strong = ELEMENTS.filter((e) => elementMultiplier(element, e) > 1);
  const weak = ELEMENTS.filter((e) => elementMultiplier(element, e) < 1);
  const names = (l: Element[]) => l.map((e) => ELEMENT_LABEL[e]).join(" y ");
  const up = 1 + ADVANTAGE_BONUS;
  const down = 1 - ADVANTAGE_BONUS;
  const lines = [
    `Fuerte contra ${names(strong)}: el daño sube ${pct(ADVANTAGE_BONUS)} (x${up.toFixed(2)}).`,
    `Débil contra ${names(weak)}: el daño baja ${pct(ADVANTAGE_BONUS)} (x${down.toFixed(2)}).`,
    "Contra el resto es daño normal (x1.00).",
  ];
  if (c?.char.classId === "mago")
    lines.push(
      `Foco arcano: la ventaja del Mago pega +${pct(CLASS_PASSIVE_ADVANTAGE_BONUS)} en vez de ${pct(ADVANTAGE_BONUS)}.`,
    );
  if (c && foe) {
    const m = attackElementMultiplier(c, foe);
    const verdict = m > 1 ? "ventaja" : m < 1 ? "desventaja" : "neutral";
    lines.push(
      `Ahora: ${you ? "tus golpes" : `los golpes de ${c.char.name}`} (${ELEMENT_LABEL[attackEl(c)]}) contra ${foe.char.name} (${ELEMENT_LABEL[foe.char.element]}): ${verdict}, x${m.toFixed(2)}.`,
    );
  }
  if (c?.char.weapon)
    lines.push("El elemento del arma cuenta para los sets; tus ataques usan tu elemento.");
  return {
    title: `Elemento ${ELEMENT_LABEL[element]}`,
    kind: "info",
    lines,
    source: "Ciclo: Agua > Fuego > Viento > Tierra > Rayo > Agua",
  };
}

export function weaponTip(c: Combatant): Tip | null {
  const w = c.char.weapon;
  if (!w) return null;
  return {
    title: `Arma de ${ELEMENT_LABEL[w.element]}`,
    kind: "damage",
    lines: [
      `Suma +${n1(w.atkBonus)} de ATQ (ya incluido en tu ATQ ${n1(c.char.stats.atk)}).`,
      `Para los sets cuenta como ${ELEMENT_LABEL[w.element]}; tus ataques usan tu elemento (${ELEMENT_LABEL[c.char.element]}).`,
    ],
    source: "Arma equipada",
  };
}

// ---------- class passives ----------

export function passiveTip(c: Combatant, foe?: Combatant, you = true): Tip {
  const cls = CLASSES[c.char.classId];
  const { id, name } = cls.passive;
  const s = (tu: string, el: string) => (you ? tu : el);
  const hp = c.char.stats.hp;
  const lines: string[] = [];
  switch (id) {
    case "muralla": {
      const after = Math.round(20 * (1 - CLASS_PASSIVE_DMG_REDUCTION));
      lines.push(
        `${s("Recibes", `${c.char.name} recibe`)} ${pct(CLASS_PASSIVE_DMG_REDUCTION)} menos daño de todos los golpes (un golpe de 20 pasa a ${after}).`,
        "Se aplica siempre, además de DEF y Defender.",
      );
      break;
    }
    case "focoArcano": {
      lines.push(
        `${s("Tu", "Su")} ventaja elemental pega +${pct(CLASS_PASSIVE_ADVANTAGE_BONUS)} en vez de +${pct(ADVANTAGE_BONUS)} (x${(1 + CLASS_PASSIVE_ADVANTAGE_BONUS).toFixed(2)} en vez de x${(1 + ADVANTAGE_BONUS).toFixed(2)}).`,
        `Además ${s("tienes", "tiene")} +${pct(CLASS_PASSIVE_MAGE_CRIT)} de probabilidad de crítico y ${s("recibes", "recibe")} ${pct(CLASS_PASSIVE_MAGE_REDUCTION)} menos daño.`,
        "La ventaja no cambia con desventaja o elemento neutral.",
        "La ventaja elemental usa tu elemento, no el del arma.",
      );
      if (foe) {
        const m = attackElementMultiplier(c, foe);
        lines.push(
          `Ahora: ${ELEMENT_LABEL[attackEl(c)]} contra ${ELEMENT_LABEL[foe.char.element]} = x${m.toFixed(2)}.`,
        );
      }
      break;
    }
    case "filoMortal": {
      const mult = critMultiplier(c);
      const crit = c.char.stats.crit;
      lines.push(
        `${s("Tus", "Sus")} críticos hacen x${CLASS_PASSIVE_CRIT_MULT.toFixed(1)} de daño (las otras clases x1.5).`,
      );
      if (c.perks?.critDamage)
        lines.push(
          `Un bono suma +${n1(c.perks.critDamage)}: total x${mult.toFixed(1)}.`,
        );
      lines.push(
        crit > 0
          ? `Con ${pct(crit)} de crítico, más o menos 1 de cada ${Math.max(1, Math.round(1 / crit))} golpes que aciertan es crítico.`
          : "Ahora tienes 0% de crítico: sube CRIT para aprovecharlo.",
      );
      break;
    }
    case "bendicion": {
      const heal = Math.round(hp * CLASS_PASSIVE_REGEN);
      lines.push(
        `Recupera ${pct(CLASS_PASSIVE_REGEN)} de ${s("tu", "su")} vida máxima (${heal > 0 ? `≈${heal} PV` : "menos de 1 PV, no llega a curar"} con ${n1(hp)} de vida) al final de cada turno propio.`,
        `No cura si ${s("caes", "cae")} ni si la pelea terminó, y nunca pasa de la vida máxima.`,
      );
      break;
    }
  }
  return {
    title: name,
    kind: "passive",
    lines,
    source: `Pasiva de clase ${cls.name}, siempre activa`,
  };
}

// ---------- traits ----------

const MOD_ORDER: (keyof TraitMods)[] = [
  "hp",
  "atk",
  "def",
  "speed",
  "crit",
  "resist",
  "accuracy",
];
const MOD_LABEL_LOWER: Record<keyof TraitMods, string> = {
  hp: "vida",
  atk: "ATQ",
  def: "DEF",
  speed: "VEL",
  crit: "crítico",
  resist: "resistencia",
  accuracy: "precisión",
};

// Personality-trait rules (traits.ts): one sentence each, with the real numbers.
const PERSONALITY_TEXT: Partial<Record<keyof TraitRules, (v: number) => string>> = {
  retryAccuracy: (v) => `Si falla un golpe, el siguiente tiene +${Math.round(v * 100)} de precisión.`,
  pride: (v) => `+${pct(v)} de ATQ con más de la mitad de tu vida y −${pct(v)} con menos.`,
  executeBonus: (v) => `+${pct(v)} de daño contra enemigos con menos del ${pct(EXECUTE_HP)} de vida.`,
  guardedBonus: (v) => `Si defendiste en tu turno anterior, tu siguiente golpe hace +${pct(v)}.`,
  killHeal: (v) => `Al derrotar a un enemigo recuperas ${pct(v)} de tu vida máxima.`,
  openingBonus: (v) => `El primer golpe de cada pelea hace +${pct(v)}.`,
  statusBonus: (v) => `+${pct(v)} de daño contra rivales con algún estado elemental.`,
  highHpReduction: (v) => `Recibes −${pct(v)} de daño mientras tengas más del ${pct(HIGH_HP)} de vida.`,
  rageStep: (v) => `Cada golpe que recibes te da +${pct(v)} de daño (hasta ${RAGE_MAX} golpes, +${pct(v * RAGE_MAX)}).`,
};

export function traitTip(id: TraitId): Tip {
  const t = TRAITS[id];
  const mods: TraitMods = t.mods;
  const sign = (v: number) => (v > 0 ? "+" : "−");
  const effects = MOD_ORDER.filter((k) => mods[k]).map((k) => {
    const v = mods[k] ?? 0;
    const abs = Math.round(Math.abs(v) * 100);
    return FRACTION_STATS.includes(k)
      ? `${sign(v)}${abs}% ${MOD_LABEL_LOWER[k]}`
      : `${sign(v)}${abs} puntos de ${MOD_LABEL_LOWER[k]}`;
  });
  const tags: string[] = [];
  const tag = "tag" in t ? t.tag : undefined;
  if (tag === "healOnWin")
    tags.push(
      `Cura ${pct(SEDIENTO_HEAL)} de tu vida máxima al ganar una pelea de un nivel.`,
    );
  if (tag === "xpOnLoss")
    tags.push(
      `Si pierdes una pelea de un nivel, conservas ${GAFE_LOSS_XP} EXP (sin él pierdes todo el EXP de esa pelea).`,
    );
  const r = "rules" in t ? t.rules : undefined;
  if (r && "critDamage" in r)
    tags.push(
      `Tus críticos pegan +${n1(r.critDamage)} más (tope +${n1(TRAIT_CAPS.critDamage)}).`,
    );
  if (r && "nonCritPenalty" in r)
    tags.push(
      `Los golpes que no son críticos pegan ${pct(r.nonCritPenalty)} menos.`,
    );
  if (r && "lowHpReduction" in r)
    tags.push(
      `Cuanta menos vida tienes, menos daño recibes: hasta −${pct(r.lowHpReduction)} con 0 de vida (tope ${pct(TRAIT_CAPS.dmgReduction)}).`,
    );
  if (r && "healPenalty" in r)
    tags.push(
      `Toda cura en combate (ataques, habilidades, regeneración, robo de vida, Bendición) rinde ${pct(r.healPenalty)} menos.`,
    );
  if (r && "thorns" in r)
    tags.push(
      `Devuelves ${pct(r.thorns)} del daño que recibes a quien te golpea.`,
    );
  if (r && "spread" in r)
    tags.push(
      `Cada golpe que acierta pega entre x${n1(1 - r.spread)} y x${n1(1 + r.spread)} de su daño; el promedio es el mismo y la precisión no cambia. El daño estimado muestra el promedio.`,
    );
  const rules: TraitRules = r ?? {};
  for (const [k, text] of Object.entries(PERSONALITY_TEXT) as [keyof TraitRules, (v: number) => string][])
    if (rules[k]) tags.push(text(rules[k] as number));
  const lines = [...effects.map((e) => `${e}.`), ...tags];
  return {
    title: t.name,
    kind: "trait",
    lines,
    source: "Rasgo del personaje (fijo de por vida)",
  };
}

// ---------- stats ----------

export interface StatCtx {
  foe?: Combatant;
  you?: boolean;
  inRun?: boolean;
}

export function statTip(
  stat: keyof Stats,
  c: Combatant,
  ctx: StatCtx = {},
): Tip {
  const { foe, you = true, inRun = false } = ctx;
  const st = c.char.stats;
  const cls = CLASSES[c.char.classId];
  const s = (tu: string, el: string) => (you ? tu : el);
  const foeName = foe?.char.name ?? "el rival";
  const lines: string[] = [];
  let kind: TipKind = "stat";
  let title = `${STAT_NAME[stat]} ${FRACTION_STATS.includes(stat) ? n1(st[stat]) : pct(st[stat])}`;
  switch (stat) {
    case "hp": {
      kind = "heal";
      title = `PV ${Math.round(c.hp)} de ${Math.round(st.hp)}`;
      lines.push(
        `${you ? "Tu vida" : `Vida de ${c.char.name}`}: ${Math.round(c.hp)} de ${Math.round(st.hp)} máximo.`,
        you
          ? inRun
            ? "Si llegan a 0 caes y el intento termina (una sola vida)."
            : "Si llegan a 0 pierdes la pelea."
          : "Si llegan a 0, cae y ganas la pelea.",
      );
      break;
    }
    case "atk": {
      kind = "damage";
      lines.push(
        (you
          ? "Fuerza de tus golpes"
          : `Fuerza de los golpes de ${c.char.name}`) +
          `. Daño se reduce por la DEF rival (como un porcentaje).`,
      );
      if (foe) {
        const a = cls.attack1;
        const em = attackElementMultiplier(c, foe);
        lines.push(
          `Ahora, ${a.name}: ${n1(st.atk)} × ${n1(a.power)} × ${em.toFixed(2)} (elemento) reducido por DEF de ${foe.char.name}.`,
          `Con defensa, equipo y pasivas: ~${estimateDamage(c, foe, "attack1")} por golpe (sin crítico).`,
        );
      } else
        lines.push(
          `Con ${cls.attack1.name} (poder ${n1(cls.attack1.power)}): ${n1(st.atk * cls.attack1.power)} antes de la DEF del rival.`,
        );
      break;
    }
    case "def": {
      lines.push(
        `La DEF reduce el daño como un porcentaje: DEF ÷ (DEF + ${DEF_K === 1 ? "" : `${DEF_K} × `}ATQ del atacante), hasta ${pct(DEF_CAP)} como máximo.`,
      );
      if (foe)
        lines.push(
          `Contra ${foeName} (ATQ ${n1(foe.char.stats.atk)}): ${pct(defReduction(foe, c))} menos daño.`,
        );
      if (foe)
        lines.push(
          `Ahora, ${CLASSES[foe.char.classId].attack1.name} de ${foeName} ${s("te", `le`)} hace ~${estimateDamage(foe, c, "attack1")}.`,
        );
      lines.push(
        `Defender (la acción) divide además el daño por ${1 / DEFEND_FACTOR}.`,
      );
      break;
    }
    case "speed": {
      lines.push(
        `VEL decide cada cuánto te toca: cada tic sumas VEL × 100 al progreso del turno y actúas al llegar a 10 000 (ritmo limitado entre ${RATE_MIN} y ${RATE_MAX}).`,
      );
      if (foe) {
        const me = st.speed;
        const him = foe.char.stats.speed;
        lines.push(
          me === him
            ? `Con VEL ${n1(me)} contra ${n1(him)} (${foeName}) se alternan los turnos.`
            : me > him
              ? `Con VEL ${n1(me)} contra ${n1(him)} (${foeName}) ${s("juegas", `${c.char.name} juega`)} más seguido.`
              : `Con VEL ${n1(me)} contra ${n1(him)} (${foeName}) el rival juega más seguido.`,
        );
      }
      lines.push("La cola muestra los próximos 6 turnos: solo el primero es seguro, el resto es una estimación.");
      break;
    }
    case "crit": {
      kind = "damage";
      const m = critMultiplier(c);
      lines.push(
        `Probabilidad de que un golpe que acierta sea crítico: ${pct(st.crit)} (máx. 60%).`,
        `Un crítico hace x${m.toFixed(1)} de daño${c.char.classId === "picaro" ? " (Filo mortal)" : ""}.`,
      );
      if (foe) {
        const d = estimateDamage(c, foe, "attack1");
        lines.push(
          `Ahora, ${cls.attack1.name}: ~${d} normal, ~${Math.round(d * m)} crítico.`,
        );
      }
      break;
    }
    case "resist": {
      lines.push(
        `Acorta la duración de Escarcha, Quemadura y Ruptura que te apliquen: ${pct(st.resist)} menos (mín. 1 turno).`,
      );
      break;
    }
    case "accuracy": {
      lines.push(
        `Tu Básico y tus habilidades nunca fallan: la precisión (${st.accuracy >= 0 ? "+" : "−"}${pct(Math.abs(st.accuracy))} ahora) no cambia su resultado.`,
        "Solo cuenta para los golpes fuertes de los rivales, que sí pueden fallar.",
      );
      break;
    }
  }
  return { title, kind, lines, source: `Stat de ${c.char.name}` };
}

// ---------- actions ----------

export function attackDisabledReason(c: Combatant, key: MoveKey): string | null {
  return isSkillId(key) ? skillBlockReason(c, key) : null;
}

const damageLine = (c: Combatant, foe: Combatant, key: MoveKey) => {
  const d = estimateDamage(c, foe, key);
  return `Daño: ~${d} (sin crítico). Con crítico (${pct(c.char.stats.crit)} de probabilidad): ~${Math.round(d * critMultiplier(c))}.`;
};

// Class benefit of a perfect guard (combat.ts earnGuard).
const guardBonusText = (classId: ClassId): string =>
  `ganas 1 de ${RESOURCE_NAME[classId]}${classId === "clerigo" ? " y purificas un estado negativo" : ""}`;

/** Short consequences of a skill (no formulas): shown under its button. */
export function skillEffects(def: SkillDef): string[] {
  const out: string[] = [];
  if (def.shield) out.push(`Escudo ${pct(def.shield)} de PV máx.`);
  if (def.heal) out.push(`Cura ${pct(def.heal)} de PV máx.`);
  if (def.healIfDamage) out.push(`Si hace daño, curas ${pct(def.healIfDamage)}`);
  if (def.cleanse) out.push("Purifica un estado negativo");
  if (def.reduceNextHit) out.push(`Reduce ${Math.round(def.reduceNextHit * 100)} % el próximo impacto`);
  if (def.cancels === "interruptible") out.push("Interrumpe rituales");
  if (def.cancels === "break") out.push("Si causa Quiebre, cancela una Carga");
  if (def.aguante >= 1) out.push("Castiga el Aguante");
  if (def.extraCharge) out.push("+1 carga elemental extra");
  if (def.consume) out.push("Consume el estado elemental");
  if (def.exposedPower) out.push("Más daño a Expuestos");
  if (def.selfDamage) out.push(`Te cuesta ${pct(def.selfDamage)} de PV`);
  return out;
}

/** Cost, generation and cooldown of a skill in words, straight from its SkillDef (ActionPanel and Duel). */
export function skillMeta(def: SkillDef): string {
  const res = RESOURCE_NAME[def.classId];
  return [
    def.cost ? `Cuesta ${def.cost} ${res}` : "Sin costo",
    def.gen ? `+${def.gen} ${res}` : null,
    def.cooldown ? `Espera ${def.cooldown}` : null,
  ].filter(Boolean).join(" · ");
}

/** What consuming would do right now, or why it would not (null when the skill does not consume). */
export function consumeHint(c: Combatant, foe: Combatant | undefined, def: SkillDef): string | null {
  if (!def.consume) return null;
  const el = c.char.element;
  const mage = c.char.classId === "mago" ? MAGE_CONSUME_MULT : 1;
  const st = (who: Combatant | undefined, id: StatusId) => who?.statuses?.find((x) => x.id === id)?.stacks ?? 0;
  if (el === "fuego") {
    const n = st(foe, "quemadura");
    return n ? `Consume Quemadura ×${n}: adelanta 1,5 tics de daño` : "Sin Quemadura en el objetivo: no consume";
  }
  if (el === "agua") {
    const n = st(foe, "escarcha");
    if (!n) return "Sin Escarcha en el objetivo: no consume";
    return foe?.frostDelayed ? "Ya retrasado por Escarcha: no vuelve a retrasar" : `Consume Escarcha ×${n}: retrasa su turno ${pct(FROST_DELAY[Math.min(3, n)] * mage)}`;
  }
  if (el === "tierra") {
    const n = st(foe, "ruptura");
    return n ? `Consume Ruptura ×${n}: tu siguiente ataque ignora ${pct(Math.min(0.9, n * RUPTURE_BYPASS_PER_CHARGE * mage))} de DEF` : "Sin Ruptura en el objetivo: no consume";
  }
  if (el === "viento") {
    const n = st(c, "impulso");
    return n ? `Consume Impulso ×${n}: adelantas tu turno ${pct(WIND_ADVANCE[Math.min(3, n)] * mage)}` : "Sin Impulso propio: no consume";
  }
  return (c.charge ?? 0) >= 3 ? "Descarga Sobrecarga: daño extra" : `Sobrecarga ${c.charge ?? 0}/3: necesita 3 cargas para descargar`;
}

export function attackTip(c: Combatant, key: "attack1" | SkillId, foe?: Combatant): Tip {
  const a = attackOf(c, key);
  const def = key === "attack1" ? null : SKILLS[key];
  const st = c.char.stats;
  const lines: string[] = [];
  if (!def) {
    lines.push("Ataque básico del arma: nunca falla, no cuesta nada y genera 1 de recurso si hace daño.");
  } else {
    lines.push(def.description);
    lines.push(
      `Cuesta ${def.cost} de ${RESOURCE_NAME[def.classId]}${def.gen ? ` · genera ${def.gen}` : ""} · ${def.cooldown ? `espera ${def.cooldown} turno propio` : "sin espera"}.`,
    );
  }
  if (!def || def.power > 0) {
    lines.push(def ? `Poder x${n1(a.power)} (Básico × ${n1(def.power)}; ATQ ${n1(st.atk)}).` : `Poder x${n1(a.power)} del arma (ATQ ${n1(st.atk)}).`);
    if (foe) {
      lines.push(damageLine(c, foe, key));
      const em = attackElementMultiplier(c, foe);
      if (em !== 1) lines.push(`Elemento: x${em.toFixed(2)} (${em > 1 ? "ventaja" : "desventaja"}).`);
      if (foe.defending) lines.push(`${foe.char.name} se defiende: ya está contada la mitad de daño.`);
      if (def && def.target === "all") lines.push("Golpea a todos los enemigos vivos.");
    } else lines.push(`Daño base ≈ ${n1(st.atk * a.power)} antes de la DEF del rival.`);
  }
  if (def) {
    const hint = consumeHint(c, foe, def);
    if (hint) lines.push(hint + ".");
  }
  if (a.heal > 0) lines.push(`Cura ${pct(a.heal)} de tu vida máxima (≈${Math.round(st.hp * a.heal)} PV).`);
  const why = def ? skillBlockReason(c, def.id) : null;
  if (why) lines.push(`No disponible: ${why}`);
  return {
    title: `${a.name} · ${def ? "Habilidad" : "Básico"}`,
    kind: "damage",
    lines,
    source: def
      ? `Habilidad de ${CLASSES[c.char.classId].name}`
      : `Básico de ${WEAPON_TYPE_DATA[c.char.weapon?.type as keyof typeof WEAPON_TYPE_DATA]?.label ?? "tu arma"}`,
  };
}

export const guardRule = (classId?: ClassId): string =>
  `Guardia perfecta: si hay una amenaza fuerte anunciada y eliges Defender, el primer golpe fuerte compatible hace ${pct(1 - PERFECT_GUARD_FACTOR)} menos (en vez de ${pct(1 - DEFEND_FACTOR)}) y ${classId ? guardBonusText(classId) : "tu clase gana un bono"}.`;

export function defendTip(b: Battle): Tip {
  const perfect = strongPending(b);
  const lines = [
    `Hasta el inicio de tu próximo turno recibes la mitad del daño (x${DEFEND_FACTOR}).`,
    "Gasta tu turno: no atacas.",
    guardRule(b.player.char.classId),
    perfect
      ? "¡Ahora mismo hay una amenaza fuerte anunciada: defender es guardia perfecta!"
      : "Ahora no hay amenaza fuerte anunciada: sería una defensa normal.",
  ];
  for (const slot of pendingIntents(b)) {
    if (slot.intent === "defend" || slot.intent === "protect" || slot.intent === "rebuild" || slot.intent === "channeling") continue;
    const e = b.enemies[slot.e];
    const base = estimateDamage(e, { ...b.player, defending: false, guard: false }, slot.intent);
    const def = estimateDamage(e, { ...b.player, defending: true, guard: perfect }, slot.intent);
    lines.push(`${intentInfo(slot.intent, b, slot.e).name} de ${e.char.name} te haría ~${def} en vez de ~${base}.`);
  }
  return { title: perfect ? "Defender · guardia perfecta" : "Defender", kind: "info", lines, source: "Acción de combate" };
}

// ---------- enemy intents ----------

export interface IntentInfo {
  name: string;
  glyph: string; // shape cue besides colour
  effect: string; // what it does to you
  counter: string; // how to answer it
  cancel: "interrumpir" | "quiebre" | null;
  cancelLabel: string; // always says whether it can be interrupted
  strong: boolean;
  damage: number | null;
}

/** Everything the UI says about an enemy's committed intent (docs/ideal/01 §9). */
export function intentInfo(intent: Intent, b: Battle, idx: number): IntentInfo {
  const e = b.enemies[idx];
  const strong = isStrongIntent(intent);
  const damage = intent === "attack1" || intent === "attack2" || intent === "charge"
    ? Math.round(estimateDamage(e, b.player, intent))
    : null;
  const NOT = "No se puede interrumpir";
  switch (intentType(intent)) {
    case "carga":
      return {
        name: "Carga", glyph: "↯", strong, damage, cancel: "quiebre", cancelLabel: "Cancelable por Quiebre",
        effect: `Golpe fuerte · ignora 30 % de DEF · ~${damage} PV`,
        counter: "Defender la mitiga; Quiebre la cancela (agota su Aguante con Rompeguardia o Rompemuro). No es interrumpible.",
      };
    case "canalizacion":
      return {
        name: "Ritual", glyph: "✦", strong, damage, cancel: "interrumpir", cancelLabel: "Interrumpible",
        effect: "Te aplica Ruptura y reduce tus curas a la mitad",
        counter: "Sello o Sabotaje lo interrumpen; Defender no lo detiene.",
      };
    case "defensa":
      return {
        name: "Defender", glyph: "◧", strong, damage, cancel: null, cancelLabel: NOT,
        effect: "No ataca · recibe la mitad de daño hasta su próximo turno",
        counter: "Usa el turno para generar recurso, escudarte o golpear otro objetivo. No es interrumpible.",
      };
    case "proteccion": {
      const ally = b.enemies[b.enemies[idx].intentAlly ?? -1];
      return {
        name: "Proteger", glyph: "◈", strong, damage, cancel: null, cancelLabel: NOT,
        effect: `No ataca · da un escudo${ally ? ` a ${ally.char.name}` : " a un aliado"}`,
        counter: "El escudo absorbe daño antes que la vida. No es interrumpible.",
      };
    }
    case "reconstruccion":
      return {
        name: "Reconstruir", glyph: "▣", strong, damage, cancel: null, cancelLabel: NOT,
        effect: "No ataca · recompone su armadura y sale de Roto",
        counter: "Aprovecha el turno para golpear; ya no te ataca esta vez. No es interrumpible.",
      };
    default:
      return intent === "attack2"
        ? {
            name: attackOf(e, "attack2").name, glyph: "⚠", strong, damage, cancel: null, cancelLabel: NOT,
            effect: `Golpe fuerte · ~${damage} PV`,
            counter: "Defender ahora es guardia perfecta (−75 %). No se puede interrumpir.",
          }
        : {
            name: attackOf(e, "attack1").name, glyph: "⚔", strong, damage, cancel: null, cancelLabel: NOT,
            effect: `Ataque · ~${damage} PV`,
            counter: "Defender lo reduce a la mitad. No se puede interrumpir.",
          };
  }
}

// Tip for an announced action of enemy `idx` (an index into Battle.enemies).
export function intentTip(intent: Intent, b: Battle, idx?: number): Tip {
  const i = idx ?? livingEnemies(b)[0] ?? 0;
  const info = intentInfo(intent, b, i);
  const foe = b.enemies[i].char.name;
  return {
    title: `${foe}: ${info.name}`,
    kind: info.strong ? "danger" : "info",
    lines: [info.effect + ".", info.counter, `${info.cancelLabel}.`, "Su intención ya está decidida: no cambia por lo que elijas."],
    source: "Intención anunciada por el rival",
  };
}

export const guardTip = (c: Combatant): Tip => ({
  title: "Guardia perfecta lista",
  kind: "damage",
  lines: [
    `Defendiste ante una amenaza fuerte: ${guardBonusText(c.char.classId)}.`,
    "Reduce 75 % el primer golpe fuerte compatible.",
  ],
  source: "Guardia perfecta",
});

const STATUS_RULE: Record<StatusId, string> = {
  escarcha: `Cada carga quita ${pct(STATUS_DATA.escarcha.per)} de velocidad. Consumirla retrasa su próximo turno (5, 10 o 15 % según las cargas).`,
  quemadura: `Al inicio de su turno sufre ${pct(STATUS_DATA.quemadura.per)} del golpe que la causó por carga (máx. ${STATUS_DATA.quemadura.max}), con tope de ${pct(BURN_CAP)} de la vida máxima. Consumirla adelanta 1,5 tics.`,
  impulso: `Cada carga da +${pct(STATUS_DATA.impulso.per)} de velocidad propia. Consumirlo adelanta tu siguiente turno (10, 20 o 30 %).`,
  ruptura: `Cada carga quita ${pct(STATUS_DATA.ruptura.per)} de DEF (máx. ${STATUS_DATA.ruptura.max}). Consumirla hace que tu siguiente ataque ignore parte de la DEF.`,
};

export const statusTip = (s: StatusEffect): Tip => ({
  title: `${STATUS_DATA[s.id].label} ×${s.stacks}`,
  kind: "info",
  lines: [
    STATUS_RULE[s.id],
    `Dura ${plural(s.turns, "turno más", "turnos más")} del portador; cada golpe del mismo elemento la renueva.`,
  ],
  source: "Efecto elemental",
});

// Boss mechanic shown as a HUD chip (label + tooltip); null when it has nothing to show.
export const BOSS_TEXT: Record<BossRule, { title: string; line: string }> = {
  plaga: { title: "Plaga", line: `Al final de cada turno del jefe pierdes ${pct(PLAGUE_LOSS)} de tu vida máxima.` },
  presion: { title: "Presión", line: `Cada turno suyo suma +${pct(PRESSURE_STEP)} de daño por nivel (máx. 5). Una guardia perfecta contra su golpe fuerte la reinicia.` },
  aprende: { title: "Te lee", line: `Si repites la misma acción ${ADAPT_AFTER} veces seguidas, la siguiente hace ${pct(1 - ADAPT_FACTOR)} menos.` },
  armadura: { title: "Armadura", line: `Barra del ${pct(ARMOR_FRACTION)} de su vida: recibe ${pct(1 - ARMOR_TAKEN)} menos de daño. Al romperla queda Roto (+${pct(BROKEN_TAKEN - 1)} de daño recibido) y la recompone después.` },
  velocidad: { title: "Aceleración", line: `Cada 2 turnos propios gana +${pct(RAMP_STEP)} de velocidad. La Escarcha lo frena.` },
  cabezas: { title: "Cabezas", line: `Al bajar del ${HEAD_THRESHOLDS.map((t) => pct(t)).join(", ")} de vida se cura y gana una cabeza: su próxima acción suma impactos extra.` },
  marchitar: { title: "Ritual", line: `Cada ${RITUAL_EVERY} turnos propios prepara un ritual que te aplica Ruptura y reduce tus curas a la mitad. Solo Sello o Sabotaje lo interrumpen; Defender no.` },
  posturas: { title: "Postura", line: `Alterna cada 2 turnos propios: ofensiva (+${pct(STANCES.ofensiva.dmg - 1)} daño, −${pct(1 - STANCES.ofensiva.def)} DEF) y defensiva (−${pct(1 - STANCES.defensiva.dmg)} daño, +${pct(STANCES.defensiva.def - 1)} DEF).` },
  hambre: { title: "Hambre", line: `Se cura ${pct(HUNGER_STEAL)} del daño que hace y con menos del ${pct(HUNGER_BELOW)} de vida actúa una vez más.` },
};

export function bossBadge(c: Combatant): { label: string; tip: Tip } | null {
  const rule = ruleOf(c);
  if (!rule || !c.boss) return null;
  const t = BOSS_TEXT[rule];
  const label =
    rule === "presion" ? `Presión ×${c.boss.pressure}`
    : rule === "velocidad" ? `Aceleración ×${c.boss.ramp}`
    : rule === "cabezas" ? `Cabezas ×${1 + c.boss.heads}`
    : rule === "posturas" ? `Postura ${c.boss.stance}`
    : rule === "armadura" ? ((c.shield ?? 0) > 0 ? "Armadura" : c.boss.broken > 0 ? `Roto ${c.boss.broken}` : "Sin armadura")
    : t.title;
  return { label, tip: { title: t.title, kind: "info", lines: [t.line], source: "Mecánica de jefe" } };
}

/** Closing line of a lost fight; a turn-cap draw counts as a defeat outside duels. */
export const lossLine = (b: Battle): string =>
  b.status === "draw" ? `Empate por el límite de ${TURN_CAP} turnos: cuenta como derrota.` : "Caíste.";

export function queueTip(b: Battle): Tip {
  const foes = livingEnemies(b).length;
  return {
    title: "Orden de turnos",
    kind: "info",
    lines: [
      "Muestra los próximos 6 turnos según la velocidad actual. Solo el primero es seguro: el resto es una estimación y cambia con Escarcha, Impulso y tus acciones.",
      foes > 1
        ? "Cada rival muestra qué hará antes de que elijas; esa intención ya está decidida."
        : "El rival muestra qué hará antes de que elijas; esa intención ya está decidida.",
      `Turnos resueltos: ${b.turn}. A los ${TURN_WARN} se avisa y a los ${TURN_CAP} la pelea termina sin ganador.`,
      guardRule(b.player.char.classId),
    ],
  };
}

// "Resolver rápido" button: what it does and, if blocked, why.
export function autoTip(reason: string | null): Tip {
  return {
    title: "Resolver rápido",
    kind: "info",
    lines: [
      "Juega la pelea por ti con una estrategia fija: elige objetivos, usa tus dos habilidades equipadas según el recurso de clase y defiende ante los golpes fuertes anunciados.",
      "Solo al empezar la pelea. Es bajo tu riesgo: con una sola vida, si pierdes el intento termina.",
      `Si tu vida baja de ${pct(AUTO_STOP_HP)}, te devuelve el control.`,
      reason ? `No disponible: ${reason}` : "Disponible ahora.",
    ],
    source: "Acción de combate",
  };
}

// ---------- enemy modifiers ----------

export function modTip(mod: EnemyMod, enemy?: Combatant): Tip {
  const st = enemy?.char.stats;
  const lines: string[] = [];
  switch (mod) {
    case "regeneracion":
      lines.push(
        `Al final de cada turno propio recupera ${pct(REGEN_FRACTION)} de su vida máxima${st ? ` (≈${Math.round(st.hp * REGEN_FRACTION)} PV)` : ""}.`,
        "Los golpes flojos pueden no ser suficientes: pega fuerte.",
      );
      break;
    case "escudo":
      lines.push(
        `Empieza con un escudo igual al ${pct(SHIELD_FRACTION)} de su vida${st ? ` (${Math.round(st.hp * SHIELD_FRACTION)} puntos)` : ""}.`,
        "El escudo absorbe el daño antes que la vida y no se regenera.",
      );
      if (enemy?.shield !== undefined)
        lines.push(`Escudo que le queda: ${Math.round(enemy.shield)}.`);
      break;
    case "dobleAtaque":
      lines.push(
        `Después de cada ataque suyo lanza un golpe básico extra que hace ${pct(DOUBLE_ATTACK_FACTOR)} del daño.`,
        "El golpe extra tiene su propia tirada de crítico.",
      );
      break;
    case "elementoCambiante":
      lines.push(
        `Cada ${ELEMENT_SHIFT_EVERY} turnos propios cambia a otro elemento al azar.`,
        "Mira su icono antes de elegir: la ventaja y la desventaja cambian.",
      );
      break;
  }
  return {
    title: MOD_LABEL[mod],
    kind: "danger",
    lines,
    source:
      mod === "dobleAtaque"
        ? `Modificador de enemigo: jefes en ascensión 4+; en torre y salas, desde el piso ${MODIFIER_FLOORS[mod]}`
        : `Modificador de enemigo de torre y salas, desde el piso ${MODIFIER_FLOORS[mod]}`,
  };
}

export function enrageTip(): Tip {
  return {
    title: "Enfurecido",
    kind: "danger",
    lines: [
      `Pasado su turno ${ENRAGE_AFTER_OWN_TURN}, el rival sube ${pct(ENRAGE_STEP)} su ATQ en cada turno propio.`,
      "Evita los duelos eternos: termina la pelea antes de que escale.",
    ],
    source: "Regla anti-empate",
  };
}

export function shieldTip(c: Combatant, you: boolean): Tip {
  return {
    title: `Escudo ${Math.round(c.shield ?? 0)}`,
    kind: "info",
    lines: [
      `Absorbe el daño antes que la vida de ${you ? "tu personaje" : c.char.name}.`,
      "Cuando se agota, los golpes llegan a la vida.",
    ],
  };
}

// ---------- progression and gear ----------

export const levelTip = (level: number, xp: number, stars: number): Tip => ({
  title: `Nivel ${level} de ${levelCap(stars)}`,
  kind: "stat",
  lines: [
    `Cada nivel sobre el 1 suma +${pct(LEVEL_POWER_STEP)} de vida, ATQ y DEF.`,
    `El tope de nivel sube con las estrellas: ${LEVEL_BASE_CAP} sin estrellas y +${LEVEL_CAP_PER_STAR} por estrella (${levelCap(5)} con 5).`,
    level >= levelCap(stars)
      ? "Estás en el tope: sube estrellas para seguir."
      : `EXP ${xp}/${xpToNextLevel(level)} para el nivel ${level + 1} (cada nivel L cuesta ${XP_COST_FACTOR} × L²).`,
    `EXP por pelea ganada: ${FIGHT_XP.normal} normal, ${FIGHT_XP.elite} élite, ${FIGHT_XP.final} jefe final; +${pct(CLEAR_XP_BONUS)} al limpiar el nivel. En la torre, ${pct(TOWER_XP_FACTOR)}; las salas no dan.`,
    `Los héroes muy por debajo de tu mejor nivel aprenden más rápido: ${GAP_BANDS.map((b) => `×${b.mult} con ${b.gap}+ niveles de diferencia`).join(", ")}.`,
  ],
  source: "Nivel del héroe",
});


export const gearTip = (): Tip => ({
  title: "Piezas de equipo",
  kind: "info",
  lines: [
    `Cada pieza trae una tirada propia: su stat principal varía ±${pct(ROLL_SPREAD)}.`,
    `Líneas extra: ${extraLines("c")} desde rango C, ${extraLines("a")} desde A y ${extraLines("s")} en S (la última es una línea especial de S). Cada una es otro stat con su propia tirada.`,
    "El rango pesa más que en los héroes (S es muy superior a A); 3 estrellas dan +10% y 5 estrellas +20% extra.",
    `Topes de la suma de todas las piezas: vida +${pct(GEAR_CAP.hp)}, ATQ +${pct(GEAR_CAP.atk)}, DEF +${pct(GEAR_CAP.def)}, velocidad +${pct(GEAR_CAP.speed)}.`,
    "Si repites una pieza, la repetida queda como copia con su propia tirada: sirve de material en la Forja o para quedarte con la mejor tirada.",
  ],
  source: "Equipo",
});





