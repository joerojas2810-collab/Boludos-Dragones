# CONTRATOS_H2 — Modos nivelado / colección en torre y salas

**Estado:** contrato para el programador (ChatGPT/Codex). Rama `v2` (después de integrar `v2-h3` y cerrar H1). Diseño: `HEROES_V2.md` §5, `CRUCE_IAS.md` (P1, P9, Q5, Q6). Cualquier ambigüedad: pregunta en `CRUCE_IAS.md`, no se decide en silencio. Hay reset total (`reset_progress.sql`): sin compatibilidad con datos antiguos.

## 0. Hallazgos que reducen el trabajo (verificados en el código)
- **Salas y duelos ya tienen el modo nivelado "elige clase + elemento":** `pickHeroKey` / `parsePickKey`, `balancedHero(classId, element)` (`game/duel.ts`), `ClassElementPicker`, `heroForRound`, `chooseDuelPick`, fase `duel_setup` con "Listo" y pick por defecto al vencer el tiempo (`DEFAULT_DUEL_PICK_FOR`). El tiempo de selección del duelo es **45 s** (`ROOM_K.duelSetupMs`), no 30 s: se **conserva 45 s** y el comportamiento al vencer (pick por defecto) ya está definido.
- **El modo "completo" de las salas ya es "colección":** héroe de la cuenta, restringido al rango elegido por el anfitrión (`hero_wrong_rank`).
- **La torre es lo que falta:** su modo nivelado hoy usa un héroe propio normalizado (`normalizeHero`) o uno aleatorio de la semilla; no elige clase+elemento.
- Los valores de modo se **conservan**: salas `"nivelado" | "completo"`, torre `"nivelado" | "coleccion"`, duelos `"balanceado" | "real"`; no se renombran (nombres actuales).

## 1. Héroe nivelado único (H2a, `src/lib/game/`)
```ts
// nivelado.ts (or duel.ts)
export const NIVELADO_PRESET = { rank: "d", stars: 0, level: 1 } as const;
export function niveladoHero(classId: ClassId, element: Element): Character;
```
- Parte de `balancedHero(classId, element)` y aplica el preset D 0★ nivel 1 (`niveladoBonus("d", 0)` ≈ +1,6 % a hp/atk/def). **Sin Factor de atributo, sin rasgo, sin equipo, sin arma.** Misma salida para todos los jugadores.
- Es la **única fuente** del héroe nivelado de **torre, salas y duelos balanceados**: `heroForRound`, `demoHero`, `ownedSummary`, `roomsDuel`, `towerHero` la usan en lugar de `balancedHero`/`normalizeHero(…, "nivelado")` para el nivelado.
- `normalizeHero(hero, "nivelado")` ya no se usa en caminos de juego; dejarlo solo si algo lo necesita, o eliminarlo con sus tests.
- Prueba: determinista; igual para dos llamadas y dos jugadores; nunca depende de la colección.

## 2. Torre (H2a)
- `RunStartBody` (validators + repo local y remoto) gana `element` (para nivelado). Reglas de `towerHero(profile, mode, characterId, classId, element, seed, playerId)`:
  - `nivelado`: exige `classId` y `element` válidos; devuelve `niveladoHero`; **ignora** `characterId` y no concede EXP a ningún héroe (`heroId` ausente).
  - `coleccion`: exige `characterId` de la cuenta (`heroFromOwned`); sin héroe → 404 "Personaje no encontrado."; poder completo (sin `normalizeHero`); EXP al héroe como hoy.
  - Se elimina el héroe aleatorio por semilla en la torre.
- La **semilla semanal es la misma** para ambos modos (ya lo es).
- UI `app/torre/page.tsx`: en nivelado, selector de clase+elemento (reutilizar `ClassElementPicker`); en colección, selector de héroe propio. Textos de `TOWER_BLURB` actualizados.
- Modo local: igual, sin ranking.

## 3. Ranking con clase y elemento (H2b — requiere OK del dueño para ejecutar el SQL)
- Migración **0055**: `tower_scores` gana `hero_class text` y `hero_element text` (CHECK de valores válidos), actualizados **solo cuando mejora el piso** (mismo `case` que `updated_at`).
- `tower_record` (última definición vigente en las migraciones 0022/0029/0030/0041; partir de la última) recibe `p_class` y `p_element`; el servicio las toma del héroe usado (nivelado: lo elegido; colección: clase y elemento del héroe propio). Validar contra los listados de clases y elementos.
- La función de estado/ranking de la torre devuelve `class` y `element` en `top` y en `mine`.
- UI del ranking: **Nombre · clase · emblema de elemento · piso** (p. ej. "Pol · Pícaro · [Rayo] · Nivel 10"); icono de elemento existente; sin desbordes en celular.
- El CHECK de `mode` y el valor `nivelado` **no cambian**. `tower_settle` y los premios no cambian.
- Regenerar `setup.sql` y `upgrade_from_0053.sql`/`upgrade_from_0044.sql`; revisar que `reset_progress.sql` cubra las columnas nuevas; `0018_lockdown_functions.sql` sigue última; tests `pglite`.

## 4. Salas y duelos (H2a)
- Sin cambios de reglas. Solo: usar `niveladoHero` para el nivelado y los duelos balanceados, y confirmar que el modo colección/"completo" sigue exigiendo el rango de sala.
- Textos de UI: se mantienen los actuales ("Modo nivelado" / "Poder completo"); el cambio de rótulo a "Colección" queda fuera de H2 (decisión del dueño).
- No tocar apuestas, interferir/ayudar, jefe cooperativo ni `duel_setup` (45 s, "Listo", pick por defecto).

## 5. Pruebas obligatorias
- `niveladoHero`: igual para cualquier jugador; sin rasgo/factores/equipo; preset D 0★.
- `towerHero`: nivelado ignora `characterId` y no da EXP; colección exige héroe propio; sin héroe aleatorio.
- Servicio de la torre: `element` obligatorio en nivelado; `tower_record` guarda clase y elemento solo al mejorar el piso (`pglite`).
- Ranking: `top`/`mine` incluyen clase y elemento; un empate conserva el orden actual.
- Salas/duelos: el nivelado usa `niveladoHero` (tests existentes de `room`, `duel`, `roomsDuel` se actualizan con motivo).
- Suite completa en verde (`tsc`, `eslint src scripts`, `vitest`, `pglite` con `npx tsx`).

## 6. Archivos que se tocan
`game/nivelado.ts`, `game/duel.ts`, `game/tower.ts`, `roomui/hero.ts`, `server/roomRun.ts`, `server/roomsDuel.ts`, `server/services.ts`, `server/validators.ts`, `repo.ts`, `app/api/tower/route.ts`, `app/torre/page.tsx`, `components/room/*` (solo si cambia la fuente del héroe), `supabase/migrations/0055_*.sql`, `setup.sql`, `upgrade_from_*.sql`, `reset_progress.sql`, `supabase/tests/pglite/*`, tests de torre, salas y duelos.

## 7. Reglas de entrega
- Dos commits: **H2a** (lógica + UI + servicio, sin SQL) y **H2b** (migración 0055 + ranking). Auditoría de Claude antes de H2b.
- No tocar `combat.ts` ni el motor. Nada de push, SQL contra Supabase, reset ni merge a `main` sin confirmación del dueño.
