# CONTRATOS_E6A — Etapa 6a: rutas, escalera de dificultad y economía de dungeons

**Estado:** contrato para el programador (ChatGPT/Codex). Rama `v2`. Decisiones del dueño en `CRUCE_IAS.md` (Q21, incisos 1–12). Sub-pasos con commit y auditoría cada uno, **en orden**. Hay reset total (`reset_progress.sql`): sin compatibilidad con datos antiguos. Sin push, sin merge a `main`, sin ejecutar SQL contra Supabase. Dudas de diseño: pregunta en `CRUCE_IAS.md`. Usa `npx tsx scripts/sim-stage3.ts --quick` para iterar y la corrida completa para confirmar.

## Reglas de diseño aprobadas
- **9 rutas temáticas** (jefe + familias de `DUNGEON_THEMES`), todas disponibles desde el inicio; elegir una no exige haber superado otra.
- **Dificultades F, E, D, C, B, A, S.** SS y SSR desaparecen como dificultad (quitar de tablas, tipos, CHECK de SQL, textos y arte que los usen). Cada dificultad tiene ascensiones **+0 a +5** → **42 escalones**.
- **Desbloqueo (independiente de la ruta):** F+0 siempre abierto; R+0 abre al superar (R−1)+0 en cualquier ruta; R+n (n>0) abre al superar R+(n−1) en cualquier ruta. Superar un escalón con cualquier jefe lo habilita para todas las rutas.
- **Ruta:** 4 niveles de **2, 2, 3 y jefe final de 3 combates = 10 combates**; el último nivel cierra el jefe con nombre. Longitud fija para todas las rutas y dificultades. `FINAL_LENGTH` pasa de 5 a 3.
- **Ruta sin recompensa propia:** al superar el último nivel de una ruta en un escalón, se muestra un **letrero con el nombre de la dungeon y un sello verde "COMPLETADO"**; se guarda qué rutas se completaron en cada escalón.

## 6a-1 — Modelo de datos, niveles y progreso
- Tipos: `RouteId` (9, p. ej. el `bossId` de cada tema) separado de `Difficulty` (= `RarityId` F–S) y `Step = { difficulty, asc }`. `DUNGEON_THEMES` pasa a ser por ruta. `LEVELS_PER_RANK`, `DUNGEON_IDS`, `ss`/`ssr` se retiran.
- `levelsOf(route, difficulty)` genera los 4 niveles por semilla fija (longitudes 2, 2, 3 y final 3). El elemento dominante de los niveles es el del jefe de la ruta y la ascensión lo rota (`levelElement`), como hoy.
- **Progreso (`dungeonProgress.ts` y SQL):** (a) banderas de escalón superado (42, compartidas entre rutas) y reglas de desbloqueo de arriba; (b) niveles superados en orden **por ruta y escalón** (`ruta, dificultad, asc → n`); (c) rutas completadas por escalón (para el sello). Funciones puras con tests.
- Migración **0056** (reemplaza las tablas y funciones por rango de 0026/0028/0044/0049/0051 según corresponda; mantener `0018_lockdown_functions.sql` al final; regenerar `setup.sql` y `upgrade_from_*.sql`; actualizar `reset_progress.sql`). El servidor valida ruta, dificultad, ascensión y orden de niveles; los topes anti-granja y `MIN_FIGHT_MS` se conservan.
- Modo local y `repo.ts`/`services.ts`/`validators.ts` adaptados; `PROFILE_VERSION` sube.
- Pruebas: desbloqueo (grafo 42 escalones), progreso por ruta, validación de servidor, `pglite`.
- **No cambia aún** la dificultad numérica ni los pagos (6a-2 y 6a-3): usar tablas puente con los valores actuales.

## 6a-2 — Escalera de dificultad
- Dificultad = `DIFFICULTY_MULT[difficulty] × RANK_TUNE[difficulty] × ASC_TUNE[asc] × (1 + 0,05 × índice de nivel)` con un pequeño desvío `ROUTE_TUNE` (±) por ruta si las mecánicas de jefe lo exigen. La escalera debe ser **monótona**: R+5 no más difícil que (R+1)+0 para un héroe del rango correspondiente.
- **Héroe de referencia por escalón R+n (propuesta, pendiente de aprobación del dueño):** rango de ítem R, **n★**, nivel tope de ese ★ (`levelCap`), equipo completo del rango R sin mejoras. **Metas de victorias** de ese héroe: R+n con n★ ≈ **60 %**; con 2★ más ≈ **85 %**; con 2★ menos ≈ **25 %**; R+0 con 0★ ≈ **70 %**; S+5 con 5★ al máximo ≈ **45 %**. Los valores se ajustan al simular.
- Reescribir `scripts/stage-tune.ts` (o equivalente) para calibrar la escalera con `--quick` y confirmar con la corrida completa; documentar tabla y desviaciones en `docs/E6A_2_RESULTADO.md`. Criterio: por escalón dentro de ±5 pp de la meta; por clase y elemento sin desviaciones mayores que el piso de ruido + 2 pp del agregado.

## 6a-3 — Economía
- **Monedas por nivel** por dificultad (`LEVEL_COINS` F…S), con `ASC_COIN_STEP` = **0,04 por escalón de ascensión** (+0/4/8/12/16/20 %).
- **Cofre de primera limpieza:** uno por **escalón**, compartido entre rutas (se paga la primera vez que cualquier ruta supera ese escalón); +0 = cofre completo, +1…+5 al 50 % plano (opción A). Valores base F…S (hoy F 1000, E 1600, D 2500, C 1200, B 1500, A 2000, S 2500) revisables con `economy-sim`.
- **Primera limpieza de nivel:** el pago completo se da una vez por `(dificultad, asc, índice de nivel)`, **compartido entre rutas**; repetir paga 60 % con el descuento diario común (20/40/80 niveles, luego 10 %) y un solo contador diario para todas las rutas.
- **Escamas y Dado cargado:** solo en dificultad S (2 Escamas por nivel, +10 % por ascensión); **tope diario común** equivalente al pago de una limpieza S+5 completa (cuatro niveles), compartido por las 9 rutas; superado el tope, siguen monedas y piezas pero no Escamas ni Dados.
- **Botín:** el rango de las piezas lo da la **dificultad** (nunca por encima de ella; en S, la tirada superior cae como hoy en S).
- Actualizar `scripts/economy-sim.ts` a la estructura nueva y verificar el objetivo de ~2 tiradas de 10 por día en régimen; documentar en `docs/E6A_3_RESULTADO.md`.
- SQL (en 0056 o 0057): `level_base_coins`, `level_chest`, `level_escamas`, `bank_level` y el tope diario común.

## 6a-4 — Variación por ascensión con mecánicas de jefe
Intensificar la mecánica propia de cada jefe, **sin mecánicas nuevas**, con parámetros existentes y un **aviso de una línea** al elegir la ruta y el escalón (determinista por semilla):
| Jefe | Mecánica | Parámetro que escala con +1…+5 |
|---|---|---|
| Señor de las Moscas | Plaga | intensidad del daño por ronda |
| Rey de Ceniza | Presión | rapidez con que acumula |
| Vigía Eterno | Aprende | repeticiones necesarias para adaptarse |
| Coloso Hueco | Armadura | duración y recuperación |
| Rey del Trueno | Velocidad | ritmo de aceleración |
| Madre Hidra | Cabezas | cuándo se activan sus curas |
| Reina Marchita | Marchitar | frecuencia del ritual |
| El Sin Rostro | Posturas | frecuencia del cambio |
| Gran Devorador | Hambre | umbral de vida de la acción extra |
Valores por escalón salen de simulación (vigilar duración y daño acumulado con una vida y curación entre peleas). Documentar en `docs/E6A_4_RESULTADO.md`. Las 9 mecánicas vigentes se conservan; en 4a/4b ya se adaptaron Rey de Ceniza y Reina Marchita.

## 6a-5 — Interfaz
- **Selector de rutas y escalera:** lista de las 9 rutas (nombre, jefe, familias) y la escalera F…S con +0…+5; el escalón actual se escribe "Ruta · C+2"; escalones bloqueados con el motivo; al elegir, el aviso de una línea de 6a-4.
- **Letrero y sello:** al terminar el último nivel, una pantalla con el nombre de la dungeon y el sello verde **COMPLETADO** (CSS/SVG mientras no haya arte); en la lista, las rutas ya completadas en ese escalón llevan el sello.
- Sin desbordes en celular, el arte manda, poco texto, `prefers-reduced-motion`. Verificar en `/run` a 375 px y en escritorio.

## Puertas
`tsc`, `eslint src scripts`, `vitest`, `pglite` (`npx tsx supabase/tests/pglite/*`) en verde; cada informe en `docs/`. Auditoría de Claude entre sub-pasos. Nada de SQL contra Supabase sin OK del dueño.

## Pendientes de decisión del dueño (no bloquean 6a-1)
1. Aprobar la tabla de héroe de referencia y las metas de victoria de 6a-2.
2. Valores finales de cofres y del tope de Escamas tras `economy-sim`.
