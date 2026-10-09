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
  actionsLeft,
  attackElementMultiplier,
  critMultiplier,
  DEF_K,
  DEF_CAP,
  defReduction,
  DEFEND_FACTOR,
  DOUBLE_ATTACK_FACTOR,
  ELEMENT_SHIFT_EVERY,
  ENRAGE_AFTER_TURN,
  ENRAGE_STEP,
  estimateDamage,
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
  TRAIT_CAPS,
  attackOf,
} from "./combat";
import { AUTO_STOP_HP } from "./auto";
import { WEAPON_TYPE_DATA, weaponSpecial, type WeaponType } from "./weapons";
import { BURN_RATE, LEGACY_BURN_RATE } from "./burn";
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
import { PITY_SSR_THRESHOLD } from "./rarity";
import { COUNTER_TAKEN, SKILL_UNLOCK_STARS } from "./skills";
import {
  ADVANTAGE_BONUS,
  ELEMENTS,
  ELEMENT_LABEL,
  elementMultiplier,
  type Element,
} from "./elements";
import { MODIFIER_FLOORS } from "./floorFights";
import { CLEAR_XP_BONUS, FIGHT_XP, GAFE_LOSS_XP, SEDIENTO_HEAL } from "./stage";
import { TOWER_XP_FACTOR } from "./tower";
import { TRAITS, type TraitId, type TraitMods } from "./traits";

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
  critDmg: "Daño crítico",
  regen: "Regeneración",
  lifesteal: "Vampirismo",
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
        "Se aplica siempre, además de DEF y Defender.",
      );
      break;
    }
    case "focoArcano": {
      lines.push(
        `${s("Tu", "Su")} ventaja elemental pega +${pct(CLASS_PASSIVE_ADVANTAGE_BONUS)} en vez de +${pct(ADVANTAGE_BONUS)} (x${(1 + CLASS_PASSIVE_ADVANTAGE_BONUS).toFixed(2)} en vez de x${(1 + ADVANTAGE_BONUS).toFixed(2)}).`,
        `Además ${s("tienes", "tiene")} +${pct(CLASS_PASSIVE_MAGE_CRIT)} de probabilidad de crítico y ${s("recibes", "recibe")} ${pct(CLASS_PASSIVE_MAGE_REDUCTION)} menos daño.`,
        "La ventaja no cambia con desventaja o elemento neutral.",
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
  "accuracy",
];
const MOD_LABEL_LOWER: Record<keyof TraitMods, string> = {
  hp: "vida",
  atk: "ATQ",
  def: "DEF",
  speed: "VEL",
  crit: "crítico",
  dodge: "esquive",
  accuracy: "precisión",
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
      `Devuelves ${pct(r.thorns)} del daño que recibes a quien te golpea. No aparece en Caballeros (ya tienen Contraataque).`,
    );
  if (r && "spread" in r)
    tags.push(
      `Cada golpe que acierta pega entre x${n1(1 - r.spread)} y x${n1(1 + r.spread)} de su daño; el promedio es el mismo y la precisión no cambia. El daño estimado muestra el promedio.`,
    );
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
    case "accuracy": {
      lines.push(
        `Se suma a la precisión de todos los ataques (${st.accuracy >= 0 ? "+" : "−"}${pct(Math.abs(st.accuracy))} ahora).`,
        `${cls.attack1.name}: ${pct(cls.attack1.accuracy)} base → ${pct(cls.attack1.accuracy + st.accuracy)}.`,
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
        `Se desbloquea con rango C o superior, o con ${SKILL_UNLOCK_STARS} estrellas en rangos F a D. Eliges 1 de 2 habilidades de tu clase y puedes cambiarla.`,
      ],
    };
  const lines = [sk.description];
  if (sk.power > 0 && foe) {
    const hit = hitChance(c, "attack3");
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
  const a = attackOf(c, key);
  const st = c.char.stats;
  const wType = c.char.weapon?.type;
  const special = key === "attack2" ? weaponSpecial(wType) : undefined;
  const lines: string[] = [
    key === "attack1"
      ? "Ataque seguro: sin recarga, lo puedes usar siempre."
      : `Ataque arriesgado: pega más pero falla más. Tras usarlo queda en recarga ${cdText(a.cooldown)}.`,
    `Poder x${n1(a.power)}: usa ${pct(a.power)} de tu ATQ (${n1(st.atk)}).`,
  ];
  if (special)
    lines.push(
      `Este golpe lo da tu arma (${WEAPON_TYPE_DATA[wType as WeaponType].label}) y reemplaza el Ataque 2 de la clase.`,
    );
  if (foe) {
    const hit = hitChance(c, key);
    const em = attackElementMultiplier(c, foe);
    const accBonus = st.accuracy
      ? ` ${st.accuracy > 0 ? "+" : "−"} ${pct(Math.abs(st.accuracy))} de tu stat de precisión`
      : "";
    lines.push(
      `Acierto ${pct(hit)} = precisión ${pct(a.accuracy)}${accBonus}.`,
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
    source: special
      ? `Ataque especial de ${WEAPON_TYPE_DATA[wType as WeaponType].label}`
      : `Ataque de la clase ${CLASSES[c.char.classId].name}`,
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
      `${attackOf(e, slot.intent).name} de ${e.char.name} te haría ~${def} en vez de ~${base}.`,
    );
  }
  return {
    title: perfect ? "Defender · guardia perfecta" : "Defender",
    kind: "info",
    lines,
    source: "Acción de combate",
  };
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
  const a = attackOf(e, intent);
  const lines = [
    `Acierta ${pct(hitChance(e, intent))} de las veces contra ti.`,
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
    source: "Efecto de bono",
  };
}

// ---------- classes ----------


// ---------- Run v2 rules (levels, rank traits, gear, sets, burning, pay, pity) ----------

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
    `Líneas extra: ${extraLines("c")} desde rango C, ${extraLines("a")} desde A y ${extraLines("ss")} desde SS y ${extraLines("ssr")} en SSR. Cada una es otro stat con su propia tirada.`,
    "El rango pesa más que en los héroes (SSR es muy superior a SS); 3 estrellas dan +10% y 5 estrellas +20% extra.",
    `Topes de la suma de todas las piezas: vida +${pct(GEAR_CAP.hp)}, ATQ +${pct(GEAR_CAP.atk)}, DEF +${pct(GEAR_CAP.def)}, velocidad +${pct(GEAR_CAP.speed)}.`,
    "Si repites una pieza, conservas la mejor tirada y sube una estrella.",
  ],
  source: "Equipo",
});



export const burnTip = (): Tip => ({
  title: "Quemar",
  kind: "info",
  lines: [
    `Convierte un héroe o pieza en monedas: ${pct(BURN_RATE)} de su valor de intercambio. Siempre pierdes frente a invocar.`,
    `Lo anterior al cambio (marcado «legado») rinde ${pct(LEGACY_BURN_RATE)}.`,
    "No se puede quemar lo equipado ni tu único héroe.",
  ],
  source: "Colección",
});


export const pityTip = (): Tip => ({
  title: "Garantía (pity)",
  kind: "info",
  lines: [
    "Cuenta las tiradas de este banner desde tu último SSR.",
    `A las ${PITY_SSR_THRESHOLD} sin SSR, la siguiente tirada es SSR seguro. No hay garantía para SS ni S.`,
    "Cada banner lleva su propio contador.",
  ],
});
