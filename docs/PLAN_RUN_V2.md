# Plan de construcción: Modo Progreso (v8.0)

Complementa a [PROPUESTA_RUN_V2.md](PROPUESTA_RUN_V2.md) (qué se construye y por qué). Este documento dice **cómo, en qué orden y cómo se verifica**. Estado: **plan, sin ejecutar**.

## 1. Estrategia
- **Rama `run-v2` desde la etiqueta `v7.0`.** `main` y Vercel no cambian hasta el merge. Se trae `main` a la rama de vez en cuando (hoy `main` tiene un cambio aparte: interfaz de la forja).
- **Modo local** (sin variables de Supabase, `localStorage`) para jugar y medir sin tocar la base real. Servidor y SQL se construyen después, cuando el juego ya se sienta bien.
- **Cortes verticales:** primero algo **jugable de punta a punta** (héroe → nivel → combate → resultado) para juzgar la sensación; después equipo, servidor, economía, torre y salas.
- **Migraciones SQL aditivas** (`0025+`, sin borrar nada), para que `main` siga funcionando durante el desarrollo. Revisar el Security Advisor tras cada una (`0018_lockdown_functions.sql` siempre la última).
- **Un solo motor:** el motor de run actual se reduce a una **secuencia de peleas** (1 vida, curación ~10% entre peleas, enemigos generados por semilla). Los **niveles** de dungeon, los **pisos** de la torre y los **pisos** de las salas son configuraciones del mismo motor. Se borran puertas, reliquias, mejoras, eventos, tienda, cofres, descanso y vidas.
- Verificación barata siempre (`tsc`, `eslint`, `vitest`); simulaciones pesadas solo al cambiar el balance y con pocas iteraciones (acordado en CLAUDE.md).
- `ENGINE_VERSION` sube a **7** al primer cambio de motor (las repeticiones viejas se rechazan con `engine_outdated`).

## 2. Mapa de impacto (código existente)
| Área | Archivos | Cambio |
|---|---|---|
| Héroe y combate | `characters.ts`, `rarity.ts`, `progression.ts`, `combat.ts`, `skills.ts`, `traits.ts`, `passives`, `auto.ts` | stats (sin huida, daño crítico), multiplicadores de rango, nivel y EXP por héroe, defensa en %, sin Huir, regeneración y robo de vida con topes, tercera habilidad por héroe, rasgos por rango |
| Motor de run | `run.ts` (1.221 líneas), `replay.ts`, `dungeons.ts`, `loot.ts`, `budget.ts`, `economy.ts` | de run con puertas a secuencia de peleas; niveles, jefes con nombre, elementos por nivel, ascensión nueva, botín dirigido, decaimiento por niveles |
| Se borra | `relics.ts`, `events.ts` (+ tests), mejoras en `progression.ts`, tienda, cofres, descansos | |
| Equipo | `gear.ts`, `weapons.ts`, `profile.ts`, `forge.ts`, `market.ts`, `parts.ts` | líneas variables y tirada ±15%, sets nuevos, resonancia, topes, autoequipar en 3 modos, quemar, valor SSR |
| Gacha | `profile.ts` (pull), `gacha.test.ts` | pity solo SSR a 250, rasgos por rango al generar, tiradas de equipo con líneas |
| Modos | `tower.ts`, `room.ts`, `coop.ts`, `awards.ts`, `missions.ts` | motor nuevo, premios, misiones reescritas |
| Servidor | `src/lib/server/services.ts`, `roomRun.ts`, `rooms.ts`, `validators.ts`, rutas en `src/app/api/*` | verificación por repetición con el motor nuevo, EXP, pago por nivel, quemar, nuevos campos |
| SQL | `supabase/migrations/0025+`, `setup.sql`, `supabase/tests/pglite/*` | ver fase 4 |
| UI | `src/app/run/page.tsx` (1.729), `BattleArena`, `ActionPanel`, `HudCard`, `EquipmentEditor`, `coleccion`, `gacha`, `misiones`, `torre`, `sala`, `explain.ts` (1.351), hub | pantalla de niveles, preparación del nivel, ficha del héroe, textos, tutorial |
| Tests | ~385 tests; los de `run*.test.ts`, `relics`, `events`, `combat*` cambian mucho | reescribir con el motor nuevo |

## 3. Fases

### Fase 0: preparación (S)
- Verificar que `v7.0` está etiquetada; crear `run-v2`; confirmar `tsc`, `eslint`, `vitest` en verde y guardar las **líneas base** de balance (`balance.ts`, `run-sim.ts` pocas iteraciones) para comparar.
- Copiar la simulación de economía a `scripts/economy-sim.ts` con los parámetros de la propuesta.
- **Salida:** rama lista, línea base registrada.

### Fase 1: héroe y combate (L)
- `rarity.ts`: multiplicadores de rango F 1,0 … SSR 3,0; `STAR_BONUS` se mantiene.
- `characters.ts`: stat `critDmg` (base ×1,5; Pícaro ×2,0 pasa a base), se elimina `flee`; nivel y EXP del héroe; multiplicador de nivel `1 + 1% × (nivel − 1)`; tope `20 + 10 × estrellas`.
- `progression.ts`: costo `10 × (L−1)²`, EXP extra por brecha (×2 a 10 niveles, ×3 a 20), se borran mejoras y `scaleForLevel` del banco de pruebas.
- `combat.ts`: defensa `def / (def + K)` (K calibrable) con tope 75%, daño crítico como stat, se quita la acción `flee`, regeneración y robo de vida con topes (regeneración de equipo ≤ 2%/ronda, robo ≤ 15%, tope global de curación pasiva ≤ 6%), reducción de daño pasiva + resonancia ≤ 25%.
- `skills.ts`: la tercera habilidad se guarda **en el héroe** (elegir 1 de 2, cambiable); C-SSR desde el inicio, F-D a las 3★.
- `traits.ts` / generación: rasgos por rango (F-D 1; C-A 2; S-SSR 2 con rasgo de regla garantizado).
- **Pruebas:** reescribir `combat*.test.ts`, `progression`, `passives`, `traitrules`; test de topes de curación; `balance.ts` con los números nuevos.
- **Salida:** héroes y combate nuevos con tests verdes; `ENGINE_VERSION = 7`.

### Fase 2: motor de niveles (XL), el corte jugable
- `run.ts` → secuencia de peleas: estado mínimo (héroe, índice de pelea, vida, semilla), curación 10% entre peleas, 1 vida, EXP y botín al limpiar. Se borra todo lo de nodos.
- `dungeons.ts`: 9 dungeons, niveles por rango (6,6,7,8,8,9,10,11,12), largos 2/3/5 mezclados por semilla del rango, jefe de nivel élite, último nivel de 5 con jefe con nombre (tabla de la propuesta), familias y elementos por nivel (dominante 60% → 80%), ascensión 0-5 con elemento nuevo y reglas nuevas.
- `loot.ts` / `budget.ts`: botín dirigido (tipo de pieza fijo por nivel, elemento = el del nivel, pieza garantizada en 3 y 5 peleas, +30% / +5% extras, rango del dungeon o inferior con % de +1), partes y núcleos por puntos; repetición 25% / 60%.
- `replay.ts`: acciones mínimas (`act`, `auto`, `fin`); el servidor repite el nivel entero.
- `economy.ts`: decaimiento por niveles (1-20 100%, 21-40 50%, 41-80 20%, 81+ 10%) también sobre el botín.
- **UI mínima en local:** lista de niveles por dungeon (largo, tipo y elemento de pieza, estado), preparación (héroe + equipo actual), combate (sin botón Huir), resultado con EXP y botín. Jefes con nombre y élites usando el arte existente.
- **Puerta de decisión 1 (go / ajustar):** se juega un dungeon completo en local. Si no se siente bien (ritmo, dificultad, elementos), se ajusta aquí antes de construir el resto.
- **Pruebas:** generación determinista de niveles, repetición idéntica en cliente y servidor, pago y botín por nivel, ascensión.

### Fase 3: equipo y gacha (L)
- `weapons.ts` / `gear.ts`: piezas con stat principal y líneas extra (pools por pieza), tirada ±15%, líneas por rango (C 1, A 2, SS 3), sets de elemento revisados, topes nuevos (crítico ~0,30, velocidad ~0,45, holgura en ataque y vida), **resonancia de estilo** por proporción (≥40% / ≥60%; Sostén 30% / 50%), etiqueta de build.
- `profile.ts`: duplicado exacto = +1 estrella y mejor tirada; tirada de gacha y forja (Armar, fusionar piezas) con tirada propia; **quemar** (8% y reconversión única 50% de piezas y héroes "legado"); **autoequipar** en 3 modos (poder, set de elemento, estilo) con "tomar de otros héroes" apagado; pity solo SSR a 250.
- `market.ts`: SSR 36.000.
- UI: `EquipmentEditor` (modos de autoequipar y vista previa), ficha del héroe (nivel, EXP, estilo, build, resonancia, elección de habilidad), gacha (pity SSR), preparación del nivel con "equipar mejor equipo".
- **Pruebas:** script de topes (el cálculo que ya hicimos como test), tiradas deterministas por semilla, mercado, forja con tirada, autoequipar.

### Fase 4: servidor y SQL (L)
- Migraciones aditivas (`0025`…): héroe (`level`, `xp`, `skill`), piezas (tirada y líneas), progreso por nivel y ascensión (`dungeon_progress`), `apply_pull` (pity SSR 250), `bank_run` (pago por nivel y cofres), quemar, misiones (tramos nuevos), premios de la torre, marca "legado". Después `0018_lockdown_functions.sql` y revisión del Security Advisor.
- `services.ts` / rutas: iniciar y cerrar nivel con repetición verificada, EXP, topes de seguridad reexpresados en niveles (máximo por nivel; ritmo, ej. ≤ 40 inicios por hora), elegir habilidad, quemar, autoequipar.
- `setup.sql` regenerado (`scripts/build-setup-sql.ts`); pruebas `supabase/tests/pglite` actualizadas y ejecutadas.
- **Pruebas:** `server.test.ts` ampliado, harness pglite, intentos de trampa (nivel repetido, EXP inflada, botín falso).

### Fase 5: torre, salas, misiones, tutorial (L)
- Torre: motor nuevo, premios por piso (5 / 100+núcleo / 250+núcleo), premio diario 21:00 ART, semanal, EXP baja, insignias.
- Salas: rondas de 10 pisos sobre el motor nuevo, nivelado que normaliza también el nivel, jefe cooperativo con héroe nuevo (ya usa poder fijo).
- `missions.ts`: reescritura (niveles, jefes de nivel, peleas, elemento) y premios por tramo (diaria 2 partes / 1 núcleo / 250; semanal; evento).
- **Tutorial del día 1:** héroe inicial (clase a elegir, F, elemento al azar, arma), nivel 1 de F guiado, equipar, limpiar F, primera tirada de 10, forja, misiones.
- Textos de `explain.ts` y ayudas.

### Fase 6: calibración (M)
- `run-sim.ts` / `build-env.ts` / `gacha-sim.ts` / `forge-sim.ts` / `economy-sim.ts` con pocas iteraciones: K de la defensa (~30-40% de reducción contra su nivel), tasas de limpieza por poder (objetivo orientativo F 97% → SSR bajo con héroe del mismo rango y 3★), EXP por pelea (nivel 20 en ~2 h), pago por nivel y cofres, topes y resonancia, build extrema por estilo (±10 puntos del promedio).
- **Puerta de decisión 2:** economía y balance aceptados antes de migrar.

### Fase 7: migración y publicación (M)
- Migración de datos (ver propuesta): dungeons y ascensiones reiniciados, runs a medias cerradas con lo asegurado, torre archivada, héroes y equipo existentes se marcan "legado" (reconversión única 50%), contadores de pity SSR conservados.
- Prueba completa en un proyecto Supabase de ensayo o, si no hay, ensayo con copia local; `setup.sql` ejecutado antes del push; `0018` al final.
- Merge a `main`, etiqueta **v8.0**, CLAUDE.md actualizado (sección de versiones y "Realidad del código"), Vercel.
- Primera noche de viernes como prueba real y ajuste de las constantes con datos.

## 4. Orden y puertas
```
F0 → F1 → F2 ─(puerta 1: se juega y se siente bien)→ F3 → F4 → F5 → F6 ─(puerta 2)→ F7
```
F3 y F4 pueden solaparse en parte (el servidor necesita las estructuras de equipo). F2 y F1 se pueden probar en local sin servidor.

## 5. Riesgos y mitigación
| Riesgo | Mitigación |
|---|---|
| El reescribir `run.ts` y la pantalla de run (~3.000 líneas) rompe la torre y las salas | motor único compartido, tests de repetición por modo, torre y salas migran en F5 con la rama funcionando en local |
| Balance equivocado (curva de EXP, K de defensa, topes) | valores aislados en constantes, simulaciones pocas y baratas en cada fase, puertas de decisión |
| Alcance enorme | cortes verticales: la puerta 1 permite parar y reajustar con un juego ya jugable |
| Datos de producción | migraciones aditivas, ensayo, un solo `setup.sql`, `0018` al final, no tocar la base real hasta F7 |
| Arte: jefes con nombre sin animaciones en el código | usar el arte ya importado (`boss_*`, idle/ataque/golpe/derrota/entrada); lo que falte se pide aparte |
| Gestión de equipo agobiante | autoequipar con vista previa y "equipar mejor equipo" al entrar; equipos guardados quedan en fase 2 |

## 6. Fuera de alcance (fase 2 del producto)
Equipos guardados, SSR como personajes propios por banner ("Crear legendario"), habilidad definitiva, estrellas de objetivo por nivel, modificadores de ascensión elegibles, mapa pintado de la campaña (arte nuevo), renombrar `run` en el código.

## 7. Definición de terminado
- `tsc`, `eslint` y `vitest` en verde; simulaciones dentro de los rangos de la propuesta.
- Un jugador nuevo hace el tutorial y llega a 3-4 tiradas de 10 el día 1; un jugador de 2 horas gana ~1.250 monedas por día en régimen.
- Una sala de 2 a 7 jugadores juega una noche completa (rondas, apuestas, jefe cooperativo) sobre el motor nuevo.
- Migración ensayada, `v8.0` etiquetada, CLAUDE.md al día.
