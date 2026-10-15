# Motor de turnos — API para integradores

Contrato de reglas: `01-ESTADO-IDEAL-Y-REGLAS.md`. Este archivo solo describe la API real del código.
Archivos: `src/lib/game/combat.ts` (motor), `skills.ts` (20 habilidades, loadouts, maestría), `brain.ts` (IA enemiga),
`auto.ts` (políticas), `statuses.ts`, `bossRules.ts`.

## Idea
No hay rondas. Cada combatiente (`Combatant.progress`, entero) suma `rateOf(c)` por tick virtual (`round(100·speedOf)`
acotado a 750–1500); al llegar a `TURN_THRESHOLD = 10000` actúa solo y paga el umbral. La batalla **siempre queda esperando
una decisión humana** (`Battle.awaiting`: 0 = `player`; en duelos también 1 = `enemies[0]`). `step()` resuelve esa acción
y después todos los turnos enemigos hasta el siguiente turno humano (el inicio de turno — Quemadura, quitar Defender — ya está
aplicado cuando la batalla queda esperando).

## Tipos clave
- `Action = "attack1" | "defend" | SkillId` (20 ids de `skills.ts`; los viejos `golpe/barrido/quebrar/interrumpir/explotar` ya no existen).
- `Battle { player, enemies, order, awaiting, humanFoe?, turn, actions, status, log, events, cev, seq, guardEarned?, mods? }`.
  `status`: `"ongoing" | "won" | "lost" | "draw"` (`draw` = tope de 300 turnos; tratarlo como no-victoria). `turn` = turnos resueltos
  por todos (aviso desde `TURN_WARN`=250, tope `TURN_CAP`=300). `actions` = acciones humanas resueltas.
  No existen `queue`, `playerActions`, `universalCooldowns`, `frostDelayedEnemies`, `impulseGranted`.
- `Combatant` (nuevo): `progress`, `ownTurns`, `res` (recurso de clase 0–3), `loadout` (2 habilidades equipadas), `cds` (cooldowns propios),
  `intent`/`intentAlly`/`intentAnswered`/`mem` (enemigos), `defending`, `guard`, `shield`, `statuses`, `charge`, `exposed`, `aguante/aguanteMax`.
- `Intent = "attack1" | "attack2" | "charge" | "channeling" | "defend" | "protect" | "rebuild"`. La intención de cada enemigo está
  **comprometida y visible** (`enemy.intent`) desde el final de su turno anterior. `attack2`, `charge`, `channeling` son amenazas fuertes
  (`isStrongIntent`); `charge` se cancela con Quiebre (Rompeguardia/Rompemuro), `channeling` con Sello/Sabotaje.
  `intentType(intent)` da la categoría en español para la UI. Una amenaza fuerte nunca se resuelve sin que el humano actúe antes.

## API
- `startBattle(hero, foes, rng, opts)` — `opts.loadout?: Loadout` (si falta: las 2 iniciales de la clase). Duelos: `opts.humanFoe`, `opts.foeLoadout`, `opts.swapOrder`.
- `step(b, action, rng, targetIndexAmongLiving?)` — devuelve el mismo objeto `b` si la acción es ilegal. En duelos con `awaiting === 1` actúa el segundo humano
  (internamente se espeja; los eventos/`status` quedan desde el punto de vista del `Battle` original: `won` = ganó `player`).
- `actionError(b, action, target?) : string | null` y `skillBlockReason(combatant, skillId)` — texto español del bloqueo (coste, enfriamiento, no equipada).
- `equippedSkills(c) : [SkillId, SkillId]`, `projectTurns(b, 6) : {id, certain}[]` (id 0 = jugador, k = `enemies[k-1]`; solo el primero es cierto).
- `pendingIntents(b)`, `enemyIntents(b, i)`, `strongPending(b)` (Defender daría guardia perfecta), `livingEnemies(b)`.
- `estimateDamage(att, def, key, crit?, bypass?)`, `hitChance`, `attackOf`: `key` puede ser `"attack1" | "attack2" | "charge" | SkillId`.
  El daño de una habilidad = básico del mismo actor × `SkillDef.power`.
- Constantes: `TURN_THRESHOLD, RATE_MIN, RATE_MAX, TURN_CAP, TURN_WARN, UPCOMING(6), DAMAGE_SCALE, DEFEND_FACTOR, PERFECT_GUARD_FACTOR`.
- `skills.ts`: `SKILLS`, `SKILL_IDS`, `skillsOfClass`, `defaultLoadout`, `loadoutError(classId, loadout, mastery|null)`, `sanitizeLoadout`, `isSkillUnlocked`,
  `newlyUnlocked(classId, from, to)`, `RESOURCE_NAME[classId]`, `ClassMastery`, `Loadout`. Desbloqueo: habilidades 1/2 iniciales, 3 con maestría de clase ≥5, 4 con ≥12
  (maestría = nivel máximo alcanzado con cualquier héroe de esa clase). Modo nivelado: `mastery = null` (las 4 disponibles).
- `auto.ts`: `autoPolicy(b, {policy: "contextual"|"naive"|"basic"})`, `autoResolve(b, rng, opts?)`, `autoBlockReason`, `bestTarget`.

## Eventos
- `b.events: BattleEvent[]` (sfx/animación, como antes: `actor`, `kind`, `classId`, `move`, `weapon`, `element`, `enemy`; `move` es ahora un `MoveKey` que incluye `SkillId`).
- `b.cev: CombatEvent[]` semánticos del último `step` (`turnStarted, actionCommitted, skillResolved, hit, healed, shieldChanged, classResourceChanged, statusApplied,
  statusConsumed, statusExpired, progressChanged, guardTriggered, staggerDamaged, staggerBroken, telegraphStarted, telegraphCancelled, bossPhaseChanged, combatEnded`).
  `actor`/`target`: 0 = jugador, k = `enemies[k-1]`. Son datos de presentación, nunca instrucciones.

## Reglas que cambian respecto de V2 (resumen)
Básico +1 recurso; habilidades cuestan/generan recurso (0–3); cooldown C = C turnos propios bloqueada; Defender dura hasta el inicio del próximo turno propio
(50 %; guardia perfecta 75 % solo frente a amenaza fuerte anunciada, +1 recurso, Clérigo limpia un estado); estados elementales y consumo según `01 §6`
(`SKILL.consume`); escudo activo máx. 10 % PV, cura activa máx. 6 % PV por turno propio; jefes con reglas por turno propio (`bossRules.ts`); Enrage tras 30 turnos
propios (+5 % ATQ por turno); la Reina Marchita ya no se anula con guardia perfecta (solo Sello/Sabotaje).
