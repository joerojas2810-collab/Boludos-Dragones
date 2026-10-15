// Pure view-model helpers for combat HUDs (docs/torre/05-AUDITORIA-ACUMULACIONES-HUD.md).
// They only read engine state and engine constants (consumePreview, speedOf, bossRules helpers): the
// UI never keeps its own copy of a rule. No React, no tooltips (explain.ts wraps these into Tips).
import {
  consumePreview,
  equippedSkills,
  estimateDamage,
  FROST_CAP,
  furyBonus,
  QUIEBRE_EXPOSED_REDUCTION,
  RATE_MAX,
  RATE_MIN,
  rateOf,
  skillBlockReason,
  SOBRECARGA_DAMAGE_BONUS,
  speedOf,
  TURN_THRESHOLD,
  WIND_CAP,
  type Combatant,
  type ConsumePreview,
  type MoveKey,
  burnTickDamage,
} from "./combat";
import {
  ADAPT_FACTOR,
  adaptAfter,
  ARMOR_FRACTION,
  ARMOR_TAKEN,
  armorBrokenRounds,
  armorRegrow,
  BROKEN_TAKEN,
  EXTRA_IMPACT,
  HEAD_HEAL,
  headThresholds,
  HUNGER_STEAL,
  hungerBelow,
  MAX_EXTRA_IMPACTS,
  plagueLoss,
  PRESSURE_MAX,
  PRESSURE_STEP,
  pressureGain,
  RAMP_MAX,
  RAMP_STEP,
  rampInterval,
  RITUAL_HEAL_CUT,
  ritualEvery,
  ruleOf,
  stanceFor,
  stanceLength,
  STANCES,
  type BossRule,
} from "./bossRules";
import { SKILLS, type SkillId } from "./skills";
import {
  BURN_CAP,
  burnDamage,
  MAX_ELEMENT_CHARGES,
  STATUS_DATA,
  type StatusId,
} from "./statuses";
import { traitTotals } from "./traits";

const pct = (v: number) => `${+(v * 100).toFixed(1)} %`;
const n1 = (v: number) => `${+v.toFixed(1)}`;
const turnsOf = (n: number, you: boolean) =>
  `${n} ${n === 1 ? "turno" : "turnos"} ${you ? "propio" : "suyo"}${n === 1 ? "" : "s"}`;

// ---------- damage preview ----------------------------------------------------------------------

/**
 * Expected non-critical damage of a hero attack with the prepared penetration (Ruptura consumed)
 * already counted, exactly as `strike` will apply it. Skills without damage do not spend it.
 */
export function previewDamage(att: Combatant, foe: Combatant, key: MoveKey): number {
  const bypass = Math.min(0.9, att.nextAttackDefenseBypass ?? 0);
  return estimateDamage(att, foe, key, false, bypass);
}

// ---------- prepared penetration ----------------------------------------------------------------

export interface Penetration {
  pct: number; // share of DEF the next attack ignores
  text: string; // "Penetración preparada: 16 % DEF"
  condition: string; // exact expiry (combat.ts: strike spends it, closeTurn drops it)
  pierceBonus: number; // relic: the attack that spends it deals +x
}

/**
 * Ruptura consumed -> `nextAttackDefenseBypass` on the attacker. The engine spends it on the next attack
 * that lands and drops it when the attacker closes its next own turn without attacking (the close of the
 * turn that created it does not count: `bypassFresh`).
 */
export function preparedPenetration(c: Combatant): Penetration | null {
  const v = c.nextAttackDefenseBypass ?? 0;
  if (v <= 0) return null;
  const bonus = c.relic?.pierceBonus ?? 0;
  return {
    pct: v,
    text: `Penetración preparada: ${pct(v)} DEF`,
    condition: c.bypassFresh
      ? "Se gasta en tu siguiente ataque que impacte; si no atacas, se pierde al cerrar tu próximo turno."
      : "Se gasta en tu siguiente ataque que impacte; si no atacas en este turno, se pierde al cerrarlo.",
    pierceBonus: bonus,
  };
}

// ---------- status row --------------------------------------------------------------------------

export interface StatusRow {
  key: StatusId | "sobrecarga";
  label: string;
  short: string; // 3-letter mark for narrow cards
  stacks: number;
  max: number;
  turns: number | null; // carrier's own turns left; null = no duration by turns
  negative: boolean;
  ready: boolean; // Sobrecarga 3/3 with a consuming skill equipped
  duration: string;
  text: string; // "Escarcha 2/3 · 2 turnos propios"
  effect: string; // what it does right now
  aria: string;
}

const ORDER: StatusId[] = ["escarcha", "quemadura", "impulso", "ruptura"];
const SHORT: Record<StatusRow["key"], string> = { escarcha: "Esc", quemadura: "Que", impulso: "Imp", ruptura: "Rup", sobrecarga: "Sob" };

/** Damage of one Quemadura tick on `c` (start of its turn), capped per tick. */
export const burnTick = burnTickDamage;

export interface RowOpts {
  you?: boolean; // the carrier is the player (own-turn wording)
  burnBonus?: number; // hero relic that boosts Quemadura ticks on enemies
}

/** One compact entry per active elemental state (never one per charge). Out-of-range stacks are clamped for display. */
export function statusRows(c: Combatant, { you = true, burnBonus = 0 }: RowOpts = {}): StatusRow[] {
  const rows: StatusRow[] = [];
  for (const id of ORDER) {
    const s = c.statuses?.find((x) => x.id === id);
    if (!s || s.stacks <= 0 || s.turns <= 0) continue;
    const d = STATUS_DATA[id];
    const stacks = Math.min(d.max, Math.max(1, s.stacks));
    const per = pct(d.per * stacks);
    const effect =
      id === "escarcha" ? `−${per} de velocidad`
      : id === "impulso" ? `+${per} de velocidad propia`
      : id === "ruptura" ? `−${per} de DEF`
      : `${burnTick(c, burnBonus)} de daño al inicio de su turno (tope ${pct(BURN_CAP)} de PV máx. por tic)`;
    const duration = turnsOf(s.turns, you);
    rows.push({
      key: id, label: d.label, short: SHORT[id], stacks, max: d.max, turns: s.turns, negative: d.negative, ready: false,
      duration, text: `${d.label} ${stacks}/${d.max} · ${duration}`, effect,
      aria: `${d.label}, ${stacks} de ${d.max} cargas, ${d.negative ? "negativo" : "positivo"}, dura ${duration}. ${effect}.`,
    });
  }
  const charge = c.char.element === "rayo" ? Math.min(MAX_ELEMENT_CHARGES, c.charge ?? 0) : 0;
  if (charge > 0) {
    const full = charge >= MAX_ELEMENT_CHARGES;
    const ready = full && !!c.loadout?.some((id) => SKILLS[id].consume);
    const effect = full
      ? `+${pct(SOBRECARGA_DAMAGE_BONUS)} de daño${ready ? "; una habilidad que consume la descarga" : ""}`
      : `Con ${MAX_ELEMENT_CHARGES} cargas: +${pct(SOBRECARGA_DAMAGE_BONUS)} de daño y descarga con una habilidad que consume`;
    const duration = "sin duración por turnos";
    rows.push({
      key: "sobrecarga", label: "Sobrecarga", short: SHORT.sobrecarga, stacks: charge, max: MAX_ELEMENT_CHARGES, turns: null,
      negative: false, ready, duration,
      text: `Sobrecarga ${charge}/${MAX_ELEMENT_CHARGES} · ${ready ? "Listo" : duration}`,
      effect,
      aria: `Sobrecarga, ${charge} de ${MAX_ELEMENT_CHARGES} cargas, positivo, ${duration}${ready ? ", lista para descargar" : ""}. ${effect}.`,
    });
  }
  return rows;
}

/**
 * Announcements for a screen reader: only what changed between two renders (new, changed stacks, gone,
 * Sobrecarga ready, penetration prepared/spent). Durations ticking down are never announced.
 */
export function statusChanges(prev: StatusRow[], next: StatusRow[], name: string, prevPen = 0, nextPen = 0): string[] {
  const out: string[] = [];
  for (const n of next) {
    const p = prev.find((x) => x.key === n.key);
    if (!p || p.stacks !== n.stacks) out.push(`${name}: ${n.label} ${n.stacks} de ${n.max}.`);
    else if (n.ready && !p.ready) out.push(`${name}: Sobrecarga lista para descargar.`);
  }
  for (const p of prev) if (!next.some((x) => x.key === p.key)) out.push(`${name}: ${p.label} terminó.`);
  if (nextPen > 0 && nextPen !== prevPen) out.push(`${name}: penetración preparada, ${pct(nextPen)} de DEF.`);
  else if (nextPen <= 0 && prevPen > 0) out.push(`${name}: la penetración preparada ya no está activa.`);
  return out;
}

// ---------- consumption -------------------------------------------------------------------------

/** Short, exact lines for what a consuming skill would do now. Everything comes from `consumePreview`. */
export function consumeLines(att: Combatant, foe: Combatant | undefined): string[] | null {
  const pv: ConsumePreview | null = consumePreview(att, foe);
  if (!pv) return null;
  const x = pv.mage > 1 ? ` (Mago ×${pv.mage})` : "";
  switch (pv.state) {
    case "quemadura": {
      if (!pv.ready) return ["Sin Quemadura en el objetivo: no consume"];
      const out = [`Consume Quemadura ×${pv.stacks}: adelanta 1,5 tics = ${pv.damage} de daño${x}`];
      const cap = foe ? Math.round(foe.char.stats.hp * BURN_CAP) : 0;
      if (foe && (pv.damage ?? 0) >= cap) out.push(`Tope aplicado: ${pct(BURN_CAP)} de PV máx. por tic`);
      else if (foe) out.push(`Un tic normal: ${burnTick(foe, att.relic?.burnDmg ?? 0)}`);
      return out;
    }
    case "escarcha": {
      if (!pv.ready) return ["Sin Escarcha en el objetivo: no consume"];
      const max = pv.delayPct ?? 0;
      const capped = max >= FROST_CAP ? `, tope ${pct(FROST_CAP)}` : "";
      if (pv.alreadyDelayed) return [`Escarcha ×${pv.stacks}: ya fue retrasado en este ciclo, se consume sin retrasar más`];
      const real = (pv.delayLost ?? 0) / TURN_THRESHOLD;
      const out = [`Consume Escarcha ×${pv.stacks}: retrasa hasta ${pct(max)} de su turno${x}${capped}`];
      if (real < max) out.push(`Ahora solo puede quitar ${pct(real)}: su progreso es bajo`);
      return out;
    }
    case "ruptura":
      return pv.ready
        ? [`Consume Ruptura ×${pv.stacks}: tu siguiente ataque ignora ${pct(pv.bypass ?? 0)} de DEF${x}${att.relic?.pierceBonus ? ` y pega +${pct(att.relic.pierceBonus)}` : ""}`]
        : ["Sin Ruptura en el objetivo: no consume"];
    case "impulso": {
      if (!pv.ready) return ["Sin Impulso propio: no consume"];
      const a = pv.advancePct ?? 0;
      return [`Consume Impulso ×${pv.stacks}: adelantas ${pct(a)} de tu turno${x}${a >= WIND_CAP ? `, tope ${pct(WIND_CAP)}` : ""}`];
    }
    case "sobrecarga":
      return pv.ready
        ? [`Descarga Sobrecarga: ${pv.damage} de daño extra`]
        : [`Sobrecarga ${pv.stacks}/${MAX_ELEMENT_CHARGES}: necesita ${MAX_ELEMENT_CHARGES} cargas para descargar`];
  }
}

// ---------- stats: base -> effective -------------------------------------------------------------

export interface StatBreakdown {
  base: number;
  effective: number;
  mods: string[]; // each modifier that applies now, with its size
  notes: string[]; // modifiers that depend on the target or the skill: never folded into `effective`
  changed: boolean;
}

const sgn = (v: number) => (v >= 0 ? "+" : "−") + pct(Math.abs(v));

/**
 * ATQ / DEF / VEL as the engine would use them right now. ATQ only folds in what does not depend on
 * the target or the skill (boss stance/pressure, Furia, Orgullo); the rest goes to `notes`.
 */
export function statBreakdown(c: Combatant, stat: "atk" | "def" | "speed"): StatBreakdown {
  const base = c.char.stats[stat];
  const mods: string[] = [];
  const notes: string[] = [];
  let effective = base;
  const stacks = (id: StatusId) => c.statuses?.find((s) => s.id === id)?.stacks ?? 0;
  const rule = ruleOf(c);
  if (stat === "speed") {
    const e = stacks("escarcha");
    const i = stacks("impulso");
    const ramp = c.boss?.ramp ?? 0;
    if (e) mods.push(`Escarcha ×${e}: ${sgn(-STATUS_DATA.escarcha.per * e)}`);
    if (i) mods.push(`Impulso ×${i}: ${sgn(STATUS_DATA.impulso.per * i)}`);
    if (ramp && rule === "velocidad") mods.push(`Aceleración ×${ramp}: ${sgn(RAMP_STEP * ramp)}`);
    effective = rateOf(c) / 100;
    if (Math.round(100 * speedOf(c)) !== rateOf(c)) mods.push(`Ritmo limitado entre ${RATE_MIN / 100} y ${RATE_MAX / 100}`);
  } else if (stat === "def") {
    const r = stacks("ruptura");
    if (r) {
      mods.push(`Ruptura ×${r}: ${sgn(-STATUS_DATA.ruptura.per * r)}`);
      effective *= 1 - STATUS_DATA.ruptura.per * r;
    }
    if (c.exposed) {
      mods.push(`Expuesto: ${sgn(-QUIEBRE_EXPOSED_REDUCTION)}`);
      effective *= 1 - QUIEBRE_EXPOSED_REDUCTION;
    }
    if (c.boss && rule === "posturas") {
      const m = STANCES[c.boss.stance].def;
      mods.push(`Postura ${c.boss.stance}: ${sgn(m - 1)}`);
      effective *= m;
    }
    if (c.relic?.hitReduction) notes.push(`Reliquia: −${pct(c.relic.hitReduction)} al daño de cada golpe recibido (no cambia la DEF).`);
  } else {
    if (c.boss && rule === "presion" && c.boss.pressure > 0) {
      const m = 1 + PRESSURE_STEP * c.boss.pressure;
      mods.push(`Presión ×${c.boss.pressure}: ${sgn(m - 1)} de daño`);
      effective *= m;
    }
    if (c.boss && rule === "posturas") {
      const m = STANCES[c.boss.stance].dmg;
      mods.push(`Postura ${c.boss.stance}: ${sgn(m - 1)} de daño`);
      effective *= m;
    }
    const fury = furyBonus(c);
    if (fury > 0) {
      mods.push(`Furia: ${sgn(fury)} de daño`);
      effective *= 1 + fury;
    }
    const pride = traitTotals(c.char.traits).pride;
    if (pride) {
      const m = c.hp / c.char.stats.hp > 0.5 ? pride : -pride;
      mods.push(`Orgullo: ${sgn(m)} de ATQ`);
      effective *= 1 + m;
    }
    if (c.relic?.basicDmg || c.relic?.skillDmg)
      notes.push(`Reliquias: Básico ${sgn(c.relic.basicDmg ?? 0)}, habilidades ${sgn(c.relic.skillDmg ?? 0)} (dependen de la acción).`);
    notes.push("El daño real además depende del objetivo (DEF, elemento) y de la habilidad.");
  }
  return { base, effective, mods, notes, changed: Math.abs(effective - base) >= 0.05 };
}

/** "12 → 10,8" when a modifier applies, else just the base. */
export const statValue = (b: StatBreakdown): string => (b.changed ? `${n1(b.base)} → ${n1(b.effective)}` : n1(b.base));

// ---------- secondary conditions ------------------------------------------------------------------

/** Curas a la mitad (Reina Marchita ritual): own turns left, counting the current one. */
export const healCutText = (c: Combatant): string | null => {
  const t = c.healCut ?? 0;
  return t > 0 ? `Curas −${pct(1 - RITUAL_HEAL_CUT)} · ${turnsOf(t, true)}` : null;
};

/** Mitigación (Paso evasivo): size and exact expiry (first hit received, or the start of the carrier's next turn). */
export const mitigationText = (c: Combatant): string | null => {
  const v = c.nextHitReduction ?? 0;
  return v > 0 ? `Mitigación −${pct(v)} al próximo golpe` : null;
};
export const MITIGATION_CONDITION = "Se gasta con el próximo golpe recibido; si nadie te golpea, termina al empezar tu siguiente turno.";

// ---------- interruptions -------------------------------------------------------------------------

/** Equipped skills that interrupt a ritual (Sello, Sabotaje), with whether each is usable right now. */
export function interrupters(c: Combatant): { id: SkillId; name: string; blocked: string | null }[] {
  return equippedSkills(c)
    .filter((id) => SKILLS[id].cancels === "interruptible")
    .map((id) => ({ id, name: SKILLS[id].name, blocked: skillBlockReason(c, id) }));
}

export function interruptLine(hero: Combatant | undefined): string {
  if (!hero) return "Sello o Sabotaje lo interrumpen; Defender no.";
  const list = interrupters(hero);
  if (!list.length) return "Ninguna habilidad equipada lo interrumpe (Sello o Sabotaje); Defender no lo detiene.";
  return `Lo interrumpes con ${list.map((i) => `${i.name}${i.blocked ? ` (no disponible: ${i.blocked.replace(/\.$/, "")})` : ""}`).join(" o ")}; Defender no lo detiene.`;
}

// ---------- bosses -------------------------------------------------------------------------------

/** Generic rule text of a boss at a given ascension (every number from bossRules helpers). */
export function bossText(rule: BossRule, ascension = 0): { title: string; line: string } {
  const a = ascension;
  switch (rule) {
    case "plaga":
      return { title: "Plaga", line: `Al final de cada turno propio del jefe pierdes ${pct(plagueLoss(a))} de tu vida máxima.` };
    case "presion":
      return { title: "Presión", line: `Cada turno suyo suma ${pressureGain(a)} nivel${pressureGain(a) === 1 ? "" : "es"} de presión (+${pct(PRESSURE_STEP)} de daño por nivel, máx. ${PRESSURE_MAX}). Una guardia perfecta contra su golpe fuerte la reinicia.` };
    case "aprende":
      return { title: "Te lee", line: `Si repites la misma acción ${adaptAfter(a)} ${adaptAfter(a) === 1 ? "vez" : "veces"} seguida${adaptAfter(a) === 1 ? "" : "s"}, la siguiente hace ${pct(1 - ADAPT_FACTOR)} menos.` };
    case "armadura":
      return { title: "Armadura", line: `Barra del ${pct(ARMOR_FRACTION)} de su vida: recibe ${pct(1 - ARMOR_TAKEN)} menos de daño. Al romperla queda Roto ${turnsOf(armorBrokenRounds(a), false)} (+${pct(BROKEN_TAKEN - 1)} de daño recibido) y la recompone ${Math.max(armorRegrow(a), armorBrokenRounds(a) + 1)} turnos suyos después.` };
    case "velocidad":
      return { title: "Aceleración", line: `Cada ${turnsOf(rampInterval(a), false)} gana +${pct(RAMP_STEP)} de velocidad (máx. ${RAMP_MAX} niveles; la VEL efectiva no pasa de ${RATE_MAX / 100}). La Escarcha lo frena.` };
    case "cabezas":
      return { title: "Cabezas", line: `Al bajar del ${headThresholds(a).map((t) => pct(t)).join(", ")} de vida se cura ${pct(HEAD_HEAL)} y gana una cabeza: su próximo ataque suma un impacto extra de ${pct(EXTRA_IMPACT)} del básico por cabeza (máx. ${MAX_EXTRA_IMPACTS}).` };
    case "marchitar":
      return { title: "Ritual", line: `Cada ${ritualEvery(a)} turnos propios prepara un ritual que te aplica Ruptura y reduce tus curas a la mitad. Solo Sello o Sabotaje lo interrumpen; Defender no.` };
    case "posturas":
      return { title: "Postura", line: `Alterna cada ${turnsOf(stanceLength(a), false)}: ofensiva (${sgn(STANCES.ofensiva.dmg - 1)} daño, ${sgn(STANCES.ofensiva.def - 1)} DEF) y defensiva (${sgn(STANCES.defensiva.dmg - 1)} daño, ${sgn(STANCES.defensiva.def - 1)} DEF).` };
    case "hambre":
      return { title: "Hambre", line: `Se cura ${pct(HUNGER_STEAL)} del daño que hace y con menos del ${pct(hungerBelow(a))} de vida su ataque suma un impacto extra de ${pct(EXTRA_IMPACT)} del básico.` };
  }
}

export interface BossView {
  rule: BossRule;
  title: string;
  label: string; // chip text
  lines: string[]; // rule + live state + what to do
  urgent: boolean; // changes the decision right now (ritual to interrupt, Roto, repetition warning...)
}

const ACTION_NAME = (a: string): string => (a === "attack1" ? "Básico" : a === "defend" ? "Defender" : (SKILLS[a as SkillId]?.name ?? a));
const popcount = (m: number): number => (m & 1) + (m > 1 ? popcount(m >> 1) : 0);

/** Live state of a boss mechanic with its limit, next threshold and the useful response. null when `c` is no boss. */
export function bossView(c: Combatant, hero?: Combatant): BossView | null {
  const rule = ruleOf(c);
  const b = c.boss;
  if (!rule || !b) return null;
  const a = b.ascension;
  const t = bossText(rule, a);
  const lines: string[] = [t.line];
  let label = t.title;
  let urgent = false;
  const maxHp = c.char.stats.hp;
  switch (rule) {
    case "plaga": {
      const loss = plagueLoss(a);
      label = `Plaga −${pct(loss)}`;
      if (hero) lines.push(`Ahora son ≈${Math.round(hero.char.stats.hp * loss)} PV por turno suyo.`);
      break;
    }
    case "presion": {
      label = `Presión ${b.pressure}/${PRESSURE_MAX}`;
      lines.push(`Ahora: ${sgn(PRESSURE_STEP * b.pressure)} de daño.`);
      lines.push(b.pressure >= PRESSURE_MAX
        ? "Al máximo: no sube más. Una guardia perfecta contra su golpe fuerte la reinicia."
        : `Sube a ${Math.min(PRESSURE_MAX, b.pressure + pressureGain(a))}/${PRESSURE_MAX} al cerrar su turno${b.pressureReset ? " (este cierre no sube: la guardia la apagó)" : ""}.`);
      urgent = b.pressure >= PRESSURE_MAX - 1;
      break;
    }
    case "velocidad": {
      label = `Aceleración ${b.ramp}/${RAMP_MAX}`;
      lines.push(`Ahora: ${sgn(RAMP_STEP * b.ramp)} de velocidad.`);
      const every = rampInterval(a);
      if (b.ramp >= RAMP_MAX) lines.push("Al máximo de niveles: no acelera más.");
      else lines.push(`Siguiente nivel en ${turnsOf(every - (b.turns % every), false)}.`);
      if (Math.round(100 * speedOf(c)) > RATE_MAX) lines.push(`Tope de velocidad: el ritmo no pasa de ${RATE_MAX / 100}; más niveles ya no lo aceleran.`);
      break;
    }
    case "cabezas": {
      const ts = headThresholds(a);
      const crossed = popcount(b.crossed);
      label = `Cabezas ${crossed}/${ts.length}${b.heads > 0 ? ` · +${Math.min(MAX_EXTRA_IMPACTS, b.heads)} golpe${b.heads === 1 ? "" : "s"}` : ""}`;
      const next = ts.findIndex((_, k) => !(b.crossed & (1 << k)));
      lines.push(next >= 0
        ? `Próxima cabeza al bajar del ${pct(ts[next])} de vida (≈${Math.round(maxHp * ts[next])} PV): se cura ${pct(HEAD_HEAL)}.`
        : "Ya brotaron todas las cabezas.");
      if (b.heads > 0) {
        lines.push(`Su próximo ataque suma ${Math.min(MAX_EXTRA_IMPACTS, b.heads)} impacto${b.heads === 1 ? "" : "s"} extra (máx. ${MAX_EXTRA_IMPACTS}); después vuelven a 0.`);
        urgent = true;
      }
      break;
    }
    case "hambre": {
      const th = hungerBelow(a);
      const starving = c.hp < maxHp * th;
      label = starving ? "Hambre activa" : "Hambre";
      lines.push(starving
        ? "Ahora su ataque suma un impacto extra."
        : `Se activa al bajar de ${pct(th)} de vida (≈${Math.round(maxHp * th)} PV).`);
      urgent = starving;
      break;
    }
    case "posturas": {
      label = `Postura ${b.stance}`;
      let left = 0;
      while (left < 8 && stanceFor(b.turns + 1 + left, a) === b.stance) left++;
      lines.push(`Ahora: ${b.stance === "ofensiva" ? `${sgn(STANCES.ofensiva.dmg - 1)} daño, ${sgn(STANCES.ofensiva.def - 1)} DEF` : `${sgn(STANCES.defensiva.dmg - 1)} daño, ${sgn(STANCES.defensiva.def - 1)} DEF`}.`);
      lines.push(left <= 1
        ? `Cambia a ${b.stance === "ofensiva" ? "defensiva" : "ofensiva"} al cerrar su próximo turno.`
        : `Dura ${turnsOf(left, false)} más; luego cambia a ${b.stance === "ofensiva" ? "defensiva" : "ofensiva"}.`);
      break;
    }
    case "armadura": {
      const shield = Math.round(c.shield ?? 0);
      const maxShield = Math.round(maxHp * ARMOR_FRACTION);
      if (shield > 0) {
        label = "Armadura";
        lines.push(`Armadura ${shield} de ${maxShield}: recibe ${pct(1 - ARMOR_TAKEN)} menos. Al agotarla queda Roto.`);
      } else if (b.broken > 0) {
        label = `Roto ${b.broken}${b.regrow > 0 ? ` · rearma ${b.regrow}` : ""}`;
        lines.push(`Roto: recibe +${pct(BROKEN_TAKEN - 1)} de daño durante ${turnsOf(b.broken, false)}. Es tu ventana para golpear fuerte.`);
        urgent = true;
      } else {
        label = b.regrow > 0 ? `Sin armadura · rearma ${b.regrow}` : "Sin armadura";
        lines.push("Sin armadura: recibe daño normal.");
      }
      if (b.regrow > 0) lines.push(`Contador de reconstrucción: ${turnsOf(b.regrow, false)}.`);
      if (c.intent === "rebuild") lines.push("Anuncia que reconstruirá su armadura en su próximo turno.");
      break;
    }
    case "marchitar": {
      const every = ritualEvery(a);
      const channeling = c.intent === "channeling";
      label = channeling ? "Ritual · interrumpible" : "Ritual";
      urgent = channeling;
      lines.push(channeling
        ? "Ritual anunciado: se completa en su próximo turno."
        : `Próximo ritual: se anuncia tras ${turnsOf(every - (c.ownTurns % every), false)}.`);
      lines.push(interruptLine(hero));
      break;
    }
    case "aprende": {
      const n = adaptAfter(a);
      let run = 0;
      for (let k = b.last.length - 1; k >= 0 && b.last[k] === b.last[b.last.length - 1]; k--) run++;
      const last = b.last[b.last.length - 1];
      if (last && run >= n) {
        label = `Te lee: no repitas ${ACTION_NAME(last)}`;
        lines.push(`Si repites ${ACTION_NAME(last)}, hace ${pct(1 - ADAPT_FACTOR)} menos daño.`);
        urgent = true;
      } else {
        label = last ? `Te lee ${run}/${n}` : "Te lee";
        if (last) lines.push(`Llevas ${run} de ${n} repeticiones de ${ACTION_NAME(last)}; varía y no se adapta.`);
      }
      break;
    }
  }
  return { rule, title: t.title, label, lines, urgent };
}
