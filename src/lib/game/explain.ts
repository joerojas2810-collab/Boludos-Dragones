// Pure tooltip text. Every number comes from the real constants or from the
// character's real stats, so the UI can never drift from the rules.
import {
  CLASS_PASSIVE_ADVANTAGE_BONUS,
  CLASS_PASSIVE_CRIT_MULT,
  CLASS_PASSIVE_DMG_REDUCTION,
  CLASS_PASSIVE_REGEN,
  CLASSES,
  TRAIT_MULT_CAP,
  type Character,
  type ClassId,
  type Stats,
} from "./characters";
import {
  actionsLeft,
  attackElementMultiplier,
  BASE_FLEE_CHANCE,
  CRIT_MULTIPLIER,
  critMultiplier,
  DEF_WEIGHT,
  DEFEND_FACTOR,
  DOUBLE_ATTACK_FACTOR,
  ELEMENT_SHIFT_EVERY,
  ENRAGE_AFTER_TURN,
  ENRAGE_STEP,
  estimateDamage,
  fleeChance,
  hitChance,
  MAX_ACTIONS_PER_ROUND,
  REGEN_FRACTION,
  SHIELD_FRACTION,
  GUARD_COUNTER_BONUS,
  livingEnemies,
  pendingIntents,
  PERFECT_GUARD_FACTOR,
  skillOf,
  strongPending,
  type Battle,
  type Combatant,
  type EnemyMod,
  type Intent,
  type MoveKey,
} from "./combat";
import { AUTO_MIN_HP, AUTO_STOP_HP } from "./auto";
import { COUNTER_TAKEN, SKILL_LEVEL } from "./skills";
import {
  ADVANTAGE_BONUS,
  ELEMENTS,
  ELEMENT_LABEL,
  elementMultiplier,
  type Element,
} from "./elements";
import {
  applyUpgrade,
  FLOOR_SCALE,
  UPGRADE_STACK_CAP,
  UPGRADE_STACK_STEP,
  UPGRADES,
  upgradeLabel,
  XP_PER_WIN,
  xpToNext,
  type UpgradeId,
} from "./progression";
import {
  RELIC_CAPS,
  RELICS,
  SYNERGIES,
  relicTotals,
  type Relic,
  type RelicId,
  type RelicRarity,
} from "./relics";
import {
  BOSS_EVERY,
  CHEST_COINS,
  COIN_FLOOR_SCALE,
  eventCost,
  FIGHT_COINS,
  FIGHT_HEAL,
  FIGHT_XP_MULT,
  fleeCost,
  FLEE_COIN_FRACTION,
  GAFE_LOSS_XP,
  LEVEL_UP_HEAL,
  LIFE_LOSS_HEAL,
  MAX_LIVES,
  maxHp,
  modsAtFloor,
  MODIFIER_FLOORS,
  POTION_HEAL,
  REST_HEAL,
  RELIC_EVERY,
  SEDIENTO_HEAL,
  START_LIVES,
  XP_FLOOR_SCALE,
  type DoorKind,
  type FightKind,
  type Run,
  type ShopItem,
} from "./run";
import { TRAITS, type TraitId, type TraitMods } from "./traits";
import { FLOORS_PER_WORLD, WORLD_ELEMENT_BIAS, worldOf } from "./worlds";

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
  dodge: "ESQ",
  accuracy: "Precisión",
  flee: "Huida",
};
const FRACTION_STATS: readonly (keyof Stats)[] = ["hp", "atk", "def", "speed"];

export const ATTACK_NUMBER: Record<MoveKey, string> = {
  attack1: "Ataque 1",
  attack2: "Ataque 2",
  attack3: "Ataque 3",
};

export const MOD_LABEL: Record<EnemyMod, string> = {
  regeneracion: "Regeneración",
  escudo: "Escudo",
  dobleAtaque: "Doble ataque",
  elementoCambiante: "Elemento cambiante",
};

export const RELIC_RARITY_LABEL: Record<RelicRarity, string> = {
  comun: "Común",
  rara: "Rara",
  legendaria: "Legendaria",
};
export const RELIC_RARITY_COLOR: Record<RelicRarity, string> = {
  comun: "#d1d5db",
  rara: "#7dd3fc",
  legendaria: "#fde047",
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
  return { char, hp: char.stats.hp, cooldown: 0, defending: false };
}

const attackEl = (c: Combatant): Element =>
  c.char.weapon?.element ?? c.char.element;

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
    lines.push(
      c.char.weapon.element === c.char.element
        ? "Tu arma comparte este elemento."
        : `Tu arma es de ${ELEMENT_LABEL[c.char.weapon.element]}: tus ataques usan el elemento del arma, no este.`,
    );
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
      `Tus ataques usan el elemento del arma (${ELEMENT_LABEL[w.element]}) en lugar del tuyo (${ELEMENT_LABEL[c.char.element]}).`,
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
        "Se aplica siempre, además de DEF, Defender y reliquias.",
      );
      break;
    }
    case "focoArcano": {
      lines.push(
        `${s("Tu", "Su")} ventaja elemental pega +${pct(CLASS_PASSIVE_ADVANTAGE_BONUS)} en vez de +${pct(ADVANTAGE_BONUS)} (x${(1 + CLASS_PASSIVE_ADVANTAGE_BONUS).toFixed(2)} en vez de x${(1 + ADVANTAGE_BONUS).toFixed(2)}).`,
        "Con desventaja o elemento neutral no cambia nada.",
        "Cuenta el elemento del arma si hay una equipada.",
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
        `${s("Tus", "Sus")} críticos hacen x${CLASS_PASSIVE_CRIT_MULT.toFixed(1)} de daño (las otras clases x${CRIT_MULTIPLIER.toFixed(1)}).`,
      );
      if (c.perks?.critDamage)
        lines.push(
          `Una reliquia suma +${n1(c.perks.critDamage)}: total x${mult.toFixed(1)}.`,
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
        `Recupera ${pct(CLASS_PASSIVE_REGEN)} de ${s("tu", "su")} vida máxima (${heal > 0 ? `≈${heal} PV` : "menos de 1 PV, no llega a curar"} con ${n1(hp)} de vida) al final de cada ronda.`,
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
  "dodge",
  "accuracy",
  "flee",
];
const MOD_LABEL_LOWER: Record<keyof TraitMods, string> = {
  hp: "vida",
  atk: "ATQ",
  def: "DEF",
  speed: "VEL",
  crit: "crítico",
  dodge: "esquive",
  accuracy: "precisión",
  flee: "huida",
};

export function traitTip(id: TraitId, owner?: Character): Tip {
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
      `Cura ${pct(SEDIENTO_HEAL)} de tu vida máxima al ganar una pelea en una run.`,
    );
  if (tag === "xpOnLoss")
    tags.push(
      `Ganas ${GAFE_LOSS_XP} XP extra cuando pierdes una pelea en una run.`,
    );
  const r = "rules" in t ? t.rules : undefined;
  if (r && "critDamage" in r)
    tags.push(
      `Tus críticos pegan +${n1(r.critDamage)} más (suma con reliquias, tope +${n1(RELIC_CAPS.critDamage)}).`,
    );
  if (r && "nonCritPenalty" in r)
    tags.push(
      `Los golpes que no son críticos pegan ${pct(r.nonCritPenalty)} menos.`,
    );
  if (r && "lowHpReduction" in r)
    tags.push(
      `Cuanta menos vida tienes, menos daño recibes: hasta −${pct(r.lowHpReduction)} con 0 de vida (suma con reliquias, tope ${pct(RELIC_CAPS.dmgReduction)}).`,
    );
  if (r && "healPenalty" in r)
    tags.push(
      `Toda cura en combate (ataques, habilidades, regeneración, robo de vida, Bendición) rinde ${pct(r.healPenalty)} menos.`,
    );
  if (r && "thorns" in r)
    tags.push(
      `Devuelves ${pct(r.thorns)} del daño que recibes a quien te golpea. No aparece en Caballeros (ya tienen Contraataque).`,
    );
  if (r && "spread" in r)
    tags.push(
      `Cada golpe que acierta pega entre x${n1(1 - r.spread)} y x${n1(1 + r.spread)} de su daño; el promedio es el mismo y la precisión no cambia. El daño estimado muestra el promedio.`,
    );
  const lines = [...effects.map((e) => `${e}.`), ...tags];
  if (effects.some((e) => e.includes("puntos")))
    lines.push(
      "«Puntos» = puntos porcentuales (+10 crítico = +10% de probabilidad).",
    );
  if (effects.some((e) => e.includes("%")))
    lines.push(`Entre rasgos, cada stat en % topa en ±${pct(TRAIT_MULT_CAP)}.`);
  if (owner) lines.push("Ya está sumado a los stats que ves.");
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
            ? `Si llegan a 0 pierdes 1 vida (de ${START_LIVES}) y vuelves con ${pct(LIFE_LOSS_HEAL)} de vida.`
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
          `. Daño = ATQ × poder del ataque × elemento − DEF rival × ${DEF_WEIGHT}.`,
      );
      if (foe) {
        const a = cls.attack1;
        const em = attackElementMultiplier(c, foe);
        const net = st.atk * a.power * em - foe.char.stats.def * DEF_WEIGHT;
        lines.push(
          `Ahora, ${a.name}: ${n1(st.atk)} × ${n1(a.power)} × ${em.toFixed(2)} (elemento) − ${n1(foe.char.stats.def)} × ${DEF_WEIGHT} (DEF de ${foe.char.name}) = ${n1(net)}.`,
          `Con defensa, reliquias y pasivas: ~${estimateDamage(c, foe, "attack1")} por golpe (sin crítico).`,
        );
      } else
        lines.push(
          `Con ${cls.attack1.name} (poder ${n1(cls.attack1.power)}): ${n1(st.atk * cls.attack1.power)} antes de la DEF del rival.`,
        );
      break;
    }
    case "def": {
      lines.push(
        `Cada golpe recibido baja DEF × ${DEF_WEIGHT} = ${n1(st.def * DEF_WEIGHT)} de daño (mínimo 1 por golpe).`,
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
        "VEL decide cuántas veces actúa cada uno por ronda: el más lento actúa 1 vez; el más rápido actúa (su VEL ÷ la del lento) veces, guardando el resto para otras rondas.",
      );
      if (foe) {
        const me = st.speed;
        const him = foe.char.stats.speed;
        const fast = Math.max(me, him);
        const slow = Math.max(0.1, Math.min(me, him));
        const ratio = Math.min(MAX_ACTIONS_PER_ROUND, fast / slow);
        const lo = Math.floor(ratio + 1e-9);
        const exact = Math.abs(ratio - lo) < 1e-6;
        const times = exact
          ? plural(lo, "vez", "veces")
          : `${lo} o ${lo + 1} veces según la ronda (promedio ${+ratio.toFixed(2)})`;
        if (Math.abs(me - him) < 1e-9 || (exact && lo === 1))
          lines.push(
            `Con VEL ${n1(me)} contra ${n1(him)} (${foeName}) actúan 1 vez cada uno por ronda.`,
          );
        else if (me > him)
          lines.push(
            `Con VEL ${n1(me)} contra ${n1(him)} (${foeName}) ${s("actúas", `${c.char.name} actúa`)} ${times} por ronda; el rival, 1.`,
          );
        else
          lines.push(
            `Con VEL ${n1(me)} contra ${n1(him)} (${foeName}) ${s("actúas", `${c.char.name} actúa`)} 1 vez por ronda; el rival, ${times}.`,
          );
      }
      lines.push(
        `Máximo ${MAX_ACTIONS_PER_ROUND} acciones por ronda. Quién abre la ronda depende de la VEL, con algo de azar.`,
      );
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
    case "dodge": {
      lines.push(
        `Cada ataque rival acierta con su precisión × (1 − ${pct(st.dodge)}) (máx. 60% de esquive).`,
      );
      if (foe) {
        const a = CLASSES[foe.char.classId];
        lines.push(
          `Ahora, ${a.attack1.name} de ${foeName}: ${pct(hitChance(foe, c, "attack1"))} de acierto; ${a.attack2.name}: ${pct(hitChance(foe, c, "attack2"))}.`,
        );
      }
      lines.push("Además suma a la probabilidad de huir.");
      break;
    }
    case "accuracy": {
      lines.push(
        `Se suma a la precisión de todos los ataques (${st.accuracy >= 0 ? "+" : "−"}${pct(Math.abs(st.accuracy))} ahora).`,
        `${cls.attack1.name}: ${pct(cls.attack1.accuracy)} base → ${pct(cls.attack1.accuracy + st.accuracy)} antes de restar el esquive rival.`,
      );
      break;
    }
    case "flee": {
      lines.push(
        `Suma a la probabilidad de huir: ${pct(BASE_FLEE_CHANCE)} base + ESQ ${pct(st.dodge)} + Huida ${pct(st.flee)} = ${pct(fleeChance(c))}.`,
      );
      break;
    }
  }
  return { title, kind, lines, source: `Stat de ${c.char.name}` };
}

// ---------- actions ----------

const cdText = (n: number) => plural(n, "ronda", "rondas");

export const cooldownOf = (c: Combatant, key: MoveKey): number =>
  key === "attack2" ? c.cooldown : key === "attack3" ? (c.cooldown3 ?? 0) : 0;

export function attackDisabledReason(
  c: Combatant,
  key: MoveKey,
): string | null {
  const cd = cooldownOf(c, key);
  return cd > 0 ? `Recarga: ${cdText(cd)}` : null;
}

const damageLine = (c: Combatant, foe: Combatant, key: MoveKey) => {
  const d = estimateDamage(c, foe, key);
  return `Daño: ~${d} si acierta (sin crítico). Con crítico (${pct(c.char.stats.crit)} de probabilidad): ~${Math.round(d * critMultiplier(c))}.`;
};

const riposteLine = (c: Combatant) =>
  c.riposte
    ? `Guardia perfecta lista: este ataque hace +${pct(GUARD_COUNTER_BONUS)} (ya contado).`
    : null;

// Ataque 3: the class skill picked at SKILL_LEVEL.
export function skillTip(c: Combatant, foe?: Combatant): Tip {
  const sk = skillOf(c);
  if (!sk)
    return {
      title: "Ataque 3",
      kind: "info",
      lines: [
        `Se desbloquea al nivel ${SKILL_LEVEL}: elegirás 1 de 2 habilidades de tu clase.`,
      ],
    };
  const lines = [sk.description];
  if (sk.power > 0 && foe) {
    const hit = hitChance(c, foe, "attack3");
    lines.push(
      `Acierto ${pct(hit)}${sk.area ? " contra cada enemigo" : sk.hits && sk.hits > 1 ? " en cada golpe" : ""}.`,
      damageLine(c, foe, "attack3"),
    );
    if (sk.hits && sk.hits > 1)
      lines.push(
        `Lanza ${sk.hits} golpes: daño total ≈ ${sk.hits} × lo indicado.`,
      );
    if (sk.executeBelow !== undefined)
      lines.push(
        foe.hp < foe.char.stats.hp * sk.executeBelow
          ? `${foe.char.name} está bajo ${pct(sk.executeBelow)} de vida: ya cuenta el x${sk.executeMult}.`
          : `${foe.char.name} aún tiene más de ${pct(sk.executeBelow)} de vida: sin bonus.`,
      );
  }
  const rl = riposteLine(c);
  if (rl && sk.power > 0) lines.push(rl);
  lines.push(
    `Recarga: ${cdText(sk.cooldown)} tras usarla.${(c.cooldown3 ?? 0) > 0 ? ` Faltan ${cdText(c.cooldown3 ?? 0)}.` : ""}`,
  );
  return {
    title: `${sk.name} · Ataque 3`,
    kind: sk.power > 0 ? "damage" : "heal",
    lines,
    source: `Habilidad de la clase ${CLASSES[c.char.classId].name}`,
  };
}

export function attackTip(c: Combatant, key: MoveKey, foe?: Combatant): Tip {
  if (key === "attack3") return skillTip(c, foe);
  const a = CLASSES[c.char.classId][key];
  const st = c.char.stats;
  const lines: string[] = [
    key === "attack1"
      ? "Ataque seguro: sin recarga, lo puedes usar siempre."
      : `Ataque arriesgado: pega más pero falla más. Tras usarlo queda en recarga ${cdText(a.cooldown)}.`,
    `Poder x${n1(a.power)}: usa ${pct(a.power)} de tu ATQ (${n1(st.atk)}).`,
  ];
  if (foe) {
    const hit = hitChance(c, foe, key);
    const em = attackElementMultiplier(c, foe);
    const accBonus = st.accuracy
      ? ` ${st.accuracy > 0 ? "+" : "−"} ${pct(Math.abs(st.accuracy))} de tu stat de precisión`
      : "";
    lines.push(
      `Acierto ${pct(hit)} = (precisión ${pct(a.accuracy)}${accBonus}) × (1 − ${pct(foe.char.stats.dodge)} de esquive de ${foe.char.name}).`,
      damageLine(c, foe, key),
    );
    if (em !== 1)
      lines.push(
        `Elemento: x${em.toFixed(2)} (${em > 1 ? "ventaja" : "desventaja"}).`,
      );
    if (foe.defending)
      lines.push(
        `${foe.char.name} se defiende esta ronda: ya está contada la mitad de daño.`,
      );
    const rl = riposteLine(c);
    if (rl) lines.push(rl);
  } else
    lines.push(
      `Precisión base ${pct(a.accuracy)}. Daño base ≈ ${n1(st.atk * a.power)} antes de la DEF del rival.`,
    );
  if (a.heal > 0)
    lines.push(
      `Cura ${pct(a.heal)} de tu vida máxima (≈${Math.round(st.hp * a.heal)} PV), aunque falle el golpe.`,
    );
  const why = attackDisabledReason(c, key);
  if (why)
    lines.push(
      `No disponible: faltan ${cdText(cooldownOf(c, key))} de recarga.`,
    );
  return {
    title: `${a.name} · ${ATTACK_NUMBER[key]}`,
    kind: "damage",
    lines,
    source: `Ataque de la clase ${CLASSES[c.char.classId].name}`,
  };
}

export const guardRule = (): string =>
  `Guardia perfecta: si el rival anuncia un golpe fuerte (Ataque 2) y defiendes, ese golpe hace ${pct(1 - PERFECT_GUARD_FACTOR)} menos (en vez de ${pct(1 - DEFEND_FACTOR)}) y tu próximo ataque hace +${pct(GUARD_COUNTER_BONUS)}.`;

export function defendTip(b: Battle): Tip {
  const perfect = strongPending(b);
  const lines = [
    `Hasta el final de la ronda recibes la mitad del daño (x${DEFEND_FACTOR}) de todos los golpes.`,
    "Gasta una de tus acciones: no atacas.",
    guardRule(),
    perfect
      ? "¡Ahora mismo se anuncia un golpe fuerte: defender es guardia perfecta!"
      : "Ahora no se anuncia ningún golpe fuerte: sería una defensa normal.",
  ];
  for (const slot of pendingIntents(b)) {
    if (slot.intent === "defend") continue;
    const e = b.enemies[slot.e];
    const base = estimateDamage(
      e,
      { ...b.player, defending: false, guard: false },
      slot.intent,
    );
    const def = estimateDamage(
      e,
      { ...b.player, defending: true, guard: perfect },
      slot.intent,
    );
    lines.push(
      `${CLASSES[e.char.classId][slot.intent].name} de ${e.char.name} te haría ~${def} en vez de ~${base}.`,
    );
  }
  return {
    title: perfect ? "Defender · guardia perfecta" : "Defender",
    kind: "info",
    lines,
    source: "Acción de combate",
  };
}

export function fleeTip(b: Battle, coinCost?: number): Tip {
  const st = b.player.char.stats;
  const lines = [
    `Probabilidad: ${pct(BASE_FLEE_CHANCE)} base + ${pct(st.dodge)} de ESQ + ${pct(st.flee)} de huida = ${pct(fleeChance(b.player))}.`,
    "Si lo logras, la pelea termina y conservas tu vida actual.",
    "Si fallas, gastas la acción y los rivales siguen atacando.",
  ];
  if (coinCost !== undefined)
    lines.push(
      coinCost > 0
        ? `En la run, huir con éxito cuesta ${plural(coinCost, "moneda", "monedas")} (${pct(FLEE_COIN_FRACTION)} de las que tienes, mínimo 1). Luego puedes elegir otra puerta.`
        : "Ahora no tienes monedas: huir no cuesta nada.",
    );
  return { title: "Huir", kind: "info", lines, source: "Acción de combate" };
}

// Tip for an announced action of enemy `idx` (an index into Battle.enemies).
export function intentTip(intent: Intent, b: Battle, idx?: number): Tip {
  const e = b.enemies[idx ?? livingEnemies(b)[0] ?? 0];
  const p = b.player;
  const foe = e.char.name;
  if (intent === "defend")
    return {
      title: `${foe} se defiende`,
      kind: "info",
      lines: [
        `Durante toda la ronda ${foe} recibe la mitad de daño (x${DEFEND_FACTOR}).`,
        `Tu ${CLASSES[p.char.classId].attack1.name} hace ~${estimateDamage(p, e, "attack1")} en vez de ~${estimateDamage(p, { ...e, defending: false }, "attack1")}.`,
        "No te ataca con esa acción.",
      ],
      source: "Intención anunciada por el rival",
    };
  const a = CLASSES[e.char.classId][intent];
  const lines = [
    `Acierta ${pct(hitChance(e, p, intent))} de las veces contra ti (tu ESQ ya está descontado).`,
    `Daño: ~${estimateDamage(e, p, intent)} si acierta (sin crítico; ${pct(e.char.stats.crit)} de crítico).`,
    `Es su ${ATTACK_NUMBER[intent]}${intent === "attack2" ? ": arriesgado, con recarga" : ": el ataque seguro"}.`,
  ];
  if (intent === "attack2")
    lines.push(
      `Golpe fuerte: si eliges Defender esta ronda, haces guardia perfecta (~${estimateDamage(e, { ...p, defending: true, guard: true }, intent)} en vez de ~${estimateDamage(e, { ...p, defending: false }, intent)}) y tu próximo ataque pega +${pct(GUARD_COUNTER_BONUS)}.`,
    );
  return {
    title: `${foe} usará ${a.name}`,
    kind: "danger",
    lines,
    source: "Intención anunciada por el rival",
  };
}

// Tip for choosing an enemy as the target.
export function targetTip(
  b: Battle,
  idx: number,
  key: MoveKey = "attack1",
): Tip {
  const e = b.enemies[idx];
  const p = b.player;
  const em = attackElementMultiplier(p, e);
  const lines = [
    `Vida ${Math.round(e.hp)} de ${Math.round(e.char.stats.hp)}${e.shield ? ` (+${Math.round(e.shield)} de escudo)` : ""}.`,
    `${CLASSES[p.char.classId][key === "attack3" ? "attack1" : key].name}: ${pct(hitChance(p, e, key))} de acierto, ~${estimateDamage(p, e, key)} de daño.`,
    em !== 1
      ? `Elemento: x${em.toFixed(2)} (${em > 1 ? "ventaja" : "desventaja"}).`
      : "Elemento: neutro.",
    `Su ataque: ~${estimateDamage(e, p, "attack1")} por golpe (ATQ ${n1(e.char.stats.atk)}).`,
    "Elige el objetivo con clic en su tarjeta, con las teclas 1 a 3 o con Tab.",
  ];
  return { title: `Objetivo: ${e.char.name}`, kind: "info", lines };
}

export const riposteTip = (): Tip => ({
  title: "Guardia perfecta lista",
  kind: "damage",
  lines: [
    `Resististe un golpe fuerte: tu próximo ataque hace +${pct(GUARD_COUNTER_BONUS)} de daño.`,
    "Se gasta al acertar con un ataque (o con tu habilidad).",
  ],
  source: "Guardia perfecta",
});

export const reflectTip = (c: Combatant): Tip => ({
  title: "Contraataque activo",
  kind: "info",
  lines: [
    `El próximo golpe que te acierte te hace solo ${pct(COUNTER_TAKEN)} del daño y se devuelve completo al atacante.`,
    `Dura ${plural(c.reflect ?? 0, "ronda más", "rondas más")} o hasta que se use.`,
  ],
  source: "Habilidad Contraataque",
});

export function announceTip(b: Battle): Tip {
  const mine = b.playerActions;
  const foes = livingEnemies(b).length;
  return {
    title: foes > 1 ? "Rivales anuncian" : "Rival anuncia",
    kind: "info",
    lines: [
      foes > 1
        ? "Cada rival muestra qué hará antes de que elijas. Pasa el cursor o toca cada acción para ver su explicación."
        : "El rival muestra qué hará antes de que elijas. Cada acción anunciada tiene su explicación: pasa el cursor o toca.",
      mine > 1
        ? `Esta ronda actúas ${mine} veces porque tu VEL es mayor.`
        : "Cada ronda actúas al menos una vez.",
      `Acciones que te quedan en la ronda ${b.turn}: ${actionsLeft(b)} de ${mine}.`,
      guardRule(),
    ],
  };
}

// "Resolver rápido" button: what it does and, if blocked, why.
export function autoTip(reason: string | null): Tip {
  return {
    title: "Resolver rápido",
    kind: "info",
    lines: [
      "Juega la pelea por ti con una estrategia fija: elige objetivos, usa tu habilidad y defiende golpes fuertes.",
      `Solo en peleas fáciles, al empezar, con al menos ${pct(AUTO_MIN_HP)} de vida y rivales que no te pongan en peligro.`,
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
        `Al final de cada ronda recupera ${pct(REGEN_FRACTION)} de su vida máxima${st ? ` (≈${Math.round(st.hp * REGEN_FRACTION)} PV)` : ""}.`,
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
        `Después de cada ataque suyo lanza un Ataque 1 extra que hace ${pct(DOUBLE_ATTACK_FACTOR)} del daño.`,
        "El golpe extra tiene su propia tirada de acierto y de crítico.",
      );
      break;
    case "elementoCambiante":
      lines.push(
        `Cada ${ELEMENT_SHIFT_EVERY} rondas cambia a otro elemento al azar.`,
        "Mira su icono antes de elegir: la ventaja y la desventaja cambian.",
      );
      break;
  }
  return {
    title: MOD_LABEL[mod],
    kind: "danger",
    lines,
    source: `Modificador de enemigo, desde el piso ${MODIFIER_FLOORS[mod]} en las runs`,
  };
}

export function enrageTip(): Tip {
  return {
    title: "Enfurecido",
    kind: "danger",
    lines: [
      `Pasada la ronda ${ENRAGE_AFTER_TURN}, el rival sube ${pct(ENRAGE_STEP)} su ATQ al final de cada ronda.`,
      "Evita los duelos eternos: termina la pelea.",
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

export function freeHitsTip(c: Combatant): Tip {
  return {
    title: `Esquiva ×${c.freeHits}`,
    kind: "relic",
    lines: [
      `Los próximos ${plural(c.freeHits ?? 0, "golpe", "golpes")} del rival fallan automáticamente.`,
    ],
    source: "Efecto de reliquia",
  };
}

// ---------- relics ----------

const RELIC_CAP_ROWS: {
  key: keyof Relic;
  total: keyof ReturnType<typeof relicTotals>;
  cap: number;
  label: string;
  fmt: (v: number) => string;
}[] = [
  {
    key: "healAfterFight",
    total: "healAfterFight",
    cap: RELIC_CAPS.healAfterFight,
    label: "cura tras pelear",
    fmt: pct,
  },
  {
    key: "coinBonus",
    total: "coinBonus",
    cap: RELIC_CAPS.coinBonus,
    label: "monedas extra",
    fmt: pct,
  },
  {
    key: "xpBonus",
    total: "xpBonus",
    cap: RELIC_CAPS.xpBonus,
    label: "XP extra",
    fmt: pct,
  },
  {
    key: "startShield",
    total: "startShield",
    cap: RELIC_CAPS.startShield,
    label: "escudo inicial",
    fmt: pct,
  },
  {
    key: "freeHits",
    total: "freeHits",
    cap: RELIC_CAPS.freeHits,
    label: "golpes esquivados",
    fmt: String,
  },
  {
    key: "lifesteal",
    total: "lifesteal",
    cap: RELIC_CAPS.lifesteal,
    label: "robo de vida",
    fmt: pct,
  },
  {
    key: "critDamage",
    total: "critDamage",
    cap: RELIC_CAPS.critDamage,
    label: "daño crítico extra",
    fmt: n1,
  },
  {
    key: "regen",
    total: "regen",
    cap: RELIC_CAPS.regen,
    label: "regeneración por turno",
    fmt: pct,
  },
  {
    key: "dmgReduction",
    total: "dmgReduction",
    cap: RELIC_CAPS.dmgReduction,
    label: "daño recibido reducido",
    fmt: pct,
  },
  {
    key: "dmgMult",
    total: "dmgMult",
    cap: RELIC_CAPS.dmgMult,
    label: "multiplicador de daño",
    fmt: (v) => `x${n1(v)}`,
  },
];

export function relicTip(
  id: RelicId,
  owned: readonly RelicId[] = [],
  hero?: Character,
): Tip {
  const r: Relic = RELICS[id];
  const lines = [`${r.description}.`];
  // concrete before/after on the hero's base stats, one relic alone
  if (hero && r.mods) {
    const base = hero.stats;
    const solo = applyRelicStatsSolo(base, r);
    const changes = (Object.keys(r.mods) as (keyof Stats)[])
      .map(
        (k) =>
          `${STAT_NAME[k]} ${fmtStat(k, base[k])} → ${fmtStat(k, solo[k])}`,
      )
      .join(" · ");
    lines.push(`En tu personaje: ${changes}.`);
  }
  const caps = RELIC_CAP_ROWS.filter((row) => {
    const v = r[row.key];
    return typeof v === "number";
  }).map(
    (row) =>
      `Tope entre todas las reliquias: ${row.label} máx. ${row.fmt(row.cap)}.`,
  );
  if (
    r.mods &&
    Object.keys(r.mods).some((k) => k === "hp" || k === "atk" || k === "def")
  )
    caps.push(
      `Tope de bonos de vida/ATQ/DEF: +${pct(RELIC_CAPS.statFraction)}.`,
    );
  lines.push(...caps);
  const syn = SYNERGIES.filter((s) => s.needs.includes(id));
  for (const s of syn) {
    const others = s.needs.filter((n) => n !== id);
    const missing = others.filter((n) => !owned.includes(n));
    lines.push(
      `Sinergia «${s.name}»${missing.length === 0 ? " (ACTIVA)" : ""}: con ${others.map((n) => RELICS[n].name).join(" y ")} da ${s.bonus.description}.`,
    );
  }
  lines.push("Dura solo esta run. Cada reliquia aparece una vez.");
  return {
    title: r.name,
    kind: "relic",
    color: RELIC_RARITY_COLOR[r.rarity],
    lines,
    source: `Reliquia ${RELIC_RARITY_LABEL[r.rarity].toLowerCase()}`,
  };
}

function applyRelicStatsSolo(stats: Stats, r: Relic): Stats {
  const m = r.mods ?? {};
  const f = (k: keyof Stats) => 1 + (m[k] ?? 0);
  return {
    ...stats,
    hp: Math.round(stats.hp * f("hp")),
    atk: Math.round(stats.atk * f("atk") * 10) / 10,
    def: Math.round(stats.def * f("def") * 10) / 10,
    speed: Math.round(stats.speed * f("speed") * 10) / 10,
    crit: Math.min(0.6, stats.crit + (m.crit ?? 0)),
    dodge: Math.min(0.6, stats.dodge + (m.dodge ?? 0)),
    accuracy: stats.accuracy + (m.accuracy ?? 0),
    flee: stats.flee + (m.flee ?? 0),
  };
}

const fmtStat = (k: keyof Stats, v: number) =>
  FRACTION_STATS.includes(k) ? n1(v) : pct(v);

// ---------- upgrades (level-up cards and shop training) ----------

export function upgradeTip(id: UpgradeId, hero: Character, stacks = 0): Tip {
  const u = UPGRADES[id];
  const after = applyUpgrade(hero, id, stacks);
  const lines = [`Efecto ahora: ${upgradeLabel(id, stacks)}.`];
  const changes = u.fx
    .map(
      ({ k }) =>
        `${STAT_NAME[k]} ${fmtStat(k, hero.stats[k])} → ${fmtStat(k, after.stats[k])}`,
    )
    .join(" · ");
  lines.push(`En tu personaje: ${changes}.`);
  lines.push(
    stacks > 0
      ? `Ya la tienes ${stacks} ${stacks === 1 ? "vez" : "veces"}: cada repetición suma +${pct(UPGRADE_STACK_STEP)} a los bonos positivos (tope x${UPGRADE_STACK_CAP}).`
      : `Si la repites, cada vez suma +${pct(UPGRADE_STACK_STEP)} a los bonos positivos (tope x${UPGRADE_STACK_CAP}).`,
  );
  if (u.tier === 2)
    lines.push("Mejora de nivel 2: solo aparece desde nivel 5.");
  return {
    title: u.name,
    kind: "stat",
    lines,
    source: "Mejora permanente de esta run",
  };
}

// ---------- run HUD ----------

export function floorTip(run: Run): Tip {
  const w = worldOf(run.floor);
  const nextBoss = Math.ceil(run.floor / BOSS_EVERY) * BOSS_EVERY;
  const nextRelic = Math.ceil(run.floor / RELIC_EVERY) * RELIC_EVERY;
  return {
    title: `Piso ${run.floor} · ${w.name}`,
    kind: "gold",
    lines: [
      `Tu puntaje es el piso más profundo que alcances (ahora ${run.maxFloor}).`,
      `Cada piso, los enemigos son x${FLOOR_SCALE} más fuertes que en el anterior.`,
      `El mundo cambia cada ${FLOORS_PER_WORLD} pisos. Aquí: elemento ${ELEMENT_LABEL[w.element]} (${pct(WORLD_ELEMENT_BIAS)} de sus enemigos lo usan).`,
      `Jefe cada ${BOSS_EVERY} pisos (siguiente: piso ${nextBoss}). Reliquia cada ${RELIC_EVERY} pisos (siguiente: al terminar el piso ${nextRelic}).`,
    ],
    source: "Run infinita",
  };
}

export function livesTip(run: Run): Tip {
  return {
    title: `Vidas ${run.lives} de ${Math.max(START_LIVES, run.lives)}`,
    kind: "danger",
    lines: [
      `Empiezas con ${START_LIVES}. Pierdes 1 cada vez que caes en una pelea y vuelves con ${pct(LIFE_LOSS_HEAL)} de vida.`,
      `Con 0 vidas la run termina y tu puntaje es el piso máximo (${run.maxFloor}).`,
      `Máximo ${MAX_LIVES} vidas. Se compran con monedas en el mercader (a veces) o se ganan en eventos.`,
      "Huir no cuesta vidas.",
    ],
    source: "Run infinita",
  };
}

export function coinsTip(run: Run): Tip {
  return {
    title: `${run.coins} monedas`,
    kind: "gold",
    lines: [
      "Se ganan al vencer peleas y abrir cofres.",
      "Se gastan en el mercader y en algunos eventos.",
      `Huir de una pelea cuesta ${pct(FLEE_COIN_FRACTION)} de las que tengas (mínimo 1): ahora ${fleeCost(run)}.`,
    ],
    source: "Se pierden si la run termina",
  };
}

export function runHpTip(run: Run): Tip {
  return {
    title: `PV ${Math.round(run.hp)} de ${maxHp(run)}`,
    kind: "heal",
    lines: [
      "Tu vida se arrastra de pelea en pelea: no se recupera sola.",
      `Vencer cura ${pct(FIGHT_HEAL.easy)} (fácil), ${pct(FIGHT_HEAL.hard)} (difícil) o ${pct(FIGHT_HEAL.boss)} (jefe) de tu vida máxima.`,
      `Descanso: ${pct(REST_HEAL)}. Poción: ${pct(POTION_HEAL)}. Subir de nivel: ${pct(LEVEL_UP_HEAL)} por nivel.`,
    ],
    source: "Run infinita",
  };
}

export function levelTip(run: Run): Tip {
  const h = run.hero;
  return {
    title: `Nivel ${h.level} · XP ${h.xp} de ${xpToNext(h.level)}`,
    kind: "stat",
    lines: [
      `Faltan ${xpToNext(h.level) - h.xp} XP para el nivel ${h.level + 1}.`,
      `Al subir eliges 1 mejora entre 3 y recuperas ${pct(LEVEL_UP_HEAL)} de vida.`,
      `La XP por pelea sube con el piso (+${pct(XP_FLOOR_SCALE)} por piso).`,
    ],
    source: "Progreso de esta run",
  };
}

// ---------- doors, rewards, shop ----------

const scaled = (base: number, floor: number) =>
  Math.round(base * (1 + COIN_FLOOR_SCALE * floor));

export function fightReward(kind: FightKind, run: Run) {
  const t = relicTotals(run.relics);
  return {
    coins: Math.round(scaled(FIGHT_COINS[kind], run.floor) * (1 + t.coinBonus)),
    xp: Math.round(
      XP_PER_WIN *
        FIGHT_XP_MULT[kind] *
        (1 + XP_FLOOR_SCALE * run.floor) *
        (1 + t.xpBonus),
    ),
    healFrac: FIGHT_HEAL[kind],
  };
}

export const DOOR_LABEL: Record<DoorKind, string> = {
  easy: "Pelea fácil",
  hard: "Pelea difícil",
  boss: "¡Jefe!",
  chest: "Cofre",
  merchant: "Mercader",
  rest: "Descanso",
  event: "Evento",
};

export function doorHint(kind: DoorKind, run: Run): string {
  switch (kind) {
    case "easy":
      return "Poca recompensa, poco riesgo";
    case "hard":
      return "Más recompensa, más riesgo";
    case "boss":
      return "Enemigo temible · gran premio";
    case "chest":
      return `+${chestCoins(run)} monedas seguras`;
    case "merchant":
      return "Compra mejoras";
    case "rest":
      return `Recupera ${pct(REST_HEAL)} de vida`;
    case "event":
      return "Algo inesperado";
  }
}

const chestCoins = (run: Run) =>
  Math.round(
    scaled(CHEST_COINS, run.floor) * (1 + relicTotals(run.relics).coinBonus),
  );

export function doorTip(kind: DoorKind, run: Run): Tip {
  const lines: string[] = [];
  let tipKind: TipKind = "info";
  if (kind === "easy" || kind === "hard" || kind === "boss") {
    const r = fightReward(kind, run);
    tipKind = kind === "easy" ? "info" : "danger";
    lines.push(
      kind === "boss"
        ? `Jefe del piso ${run.floor}: el rival más duro de esta tanda.`
        : kind === "hard"
          ? "Rival más fuerte que en la pelea fácil."
          : "Rival más suave que en la pelea difícil.",
      `Premio al ganar: ${r.coins} monedas y ${r.xp} XP, y te cura ${pct(r.healFrac)} de tu vida máxima.`,
      `Si caes pierdes 1 vida (te quedan ${run.lives}). ${fleeCost(run) > 0 ? `Si huyes pagas ${plural(fleeCost(run), "moneda", "monedas")}` : "Si huyes no pagas nada (no tienes monedas)"} y puedes elegir otra puerta.`,
    );
    const mods = modsAtFloor(run.floor);
    if (mods.length)
      lines.push(
        `Modificadores en este piso: ${mods.map((m) => MOD_LABEL[m]).join(", ")}.`,
      );
  } else if (kind === "chest") {
    tipKind = "gold";
    lines.push(
      `Te da ${chestCoins(run)} monedas, sin pelea ni riesgo.`,
      "El monto crece con el piso.",
    );
  } else if (kind === "rest") {
    tipKind = "heal";
    const gain = Math.min(
      Math.round(maxHp(run) * REST_HEAL),
      maxHp(run) - Math.round(run.hp),
    );
    lines.push(
      `Recuperas ${pct(REST_HEAL)} de tu vida máxima (≈${Math.max(0, gain)} PV ahora; tienes ${Math.round(run.hp)} de ${maxHp(run)}).`,
    );
  } else if (kind === "merchant") {
    tipKind = "gold";
    lines.push(
      `Vende: poción (+${pct(POTION_HEAL)} de vida), entrenamientos que mejoran tus stats y, a veces, una vida extra.`,
      `Tienes ${run.coins} monedas.`,
    );
  } else {
    lines.push(
      "Una situación con elecciones. Algunas cuestan monedas o vida (se avisa antes de elegir) y el resultado puede depender del azar.",
    );
  }
  return {
    title: DOOR_LABEL[kind],
    kind: tipKind,
    lines,
    source: `Puerta del piso ${run.floor}`,
  };
}

export function shopItemTip(item: ShopItem, run: Run): Tip {
  const lines: string[] = [];
  let kind: TipKind = "gold";
  const hp = maxHp(run);
  switch (item.kind) {
    case "heal":
      kind = "heal";
      lines.push(
        `Cura ${pct(POTION_HEAL)} de tu vida máxima (≈${Math.round(hp * POTION_HEAL)} PV). Tienes ${Math.round(run.hp)} de ${hp}.`,
      );
      break;
    case "life":
      kind = "danger";
      lines.push(`Suma 1 vida (tienes ${run.lives}, máximo ${MAX_LIVES}).`);
      break;
    case "reroll":
      lines.push(
        "Cambia las reliquias que te ofrecerán al salir de esta tienda (solo una vez por piso).",
      );
      break;
    case "stat":
      return {
        ...upgradeTip(item.stat, run.hero, run.ups[item.stat] ?? 0),
        source: `Entrenamiento del mercader · cuesta ${item.price} monedas`,
      };
  }
  lines.push(`Precio: ${item.price} monedas (tienes ${run.coins}).`);
  return { title: item.label, kind, lines, source: "Mercader" };
}

export function eventChoiceTip(
  run: Run,
  choice: Parameters<typeof eventCost>[1],
): Tip {
  const cost = eventCost(run, choice);
  const lines = [
    cost.coins || cost.hp
      ? `Cuesta ${[cost.coins ? `${cost.coins} monedas` : "", cost.hp ? `${cost.hp} de vida` : ""].filter(Boolean).join(" y ")}.`
      : "No cuesta nada.",
    choice.outcomes.length > 1
      ? "El resultado depende del azar."
      : "El resultado es seguro.",
  ];
  if (!cost.affordable) lines.push("No te alcanza para pagarlo.");
  return { title: choice.label, kind: "info", lines, source: "Evento" };
}

// ---------- classes ----------

export function classStatTip(classId: ClassId, stat: keyof Stats): Tip {
  return statTip(stat, previewCombatant(classId));
}
