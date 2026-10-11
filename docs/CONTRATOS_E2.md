# CONTRATOS_E2 — Prototipo del acumulador de progreso (puerta de viabilidad)

**Estado:** contrato para el programador (ChatGPT/Codex). Rama `v2-e2` (desde `v2`). Diseño: `COMBATE_V2.md` §3 y §4. **Es un prototipo aislado: no se conecta al juego, no cambia `combat.ts` ni `ENGINE_VERSION`.** Objetivo: demostrar (o descartar) que un modelo de progreso por activaciones reproduce el balance del motor 13 antes de construir nada encima. Si no lo logra, se **aborta** y se replantea (decisión del dueño).

## 0. Cómo funciona hoy (verificado en `combat.ts`)
- Cada ronda: `planRound` calcula, por enemigo, cuántas acciones tiene cada lado (`actionCounts`: el lado más rápido actúa `floor(carry + vel_rápido/vel_lento)` veces, tope `MAX_ACTIONS_PER_ROUND = 3`, el resto se acumula en `carry`) y ordena con `buildQueue` (iniciativa `roll = vel × (0,7 + 0,6·rng)`; `lead` = enemigos que actúan antes del primer turno del héroe).
- Las intenciones del enemigo se anuncian al inicio de la ronda (`pickIntents`); una guardia perfecta exige que una intención fuerte siga pendiente (`strongPending`).
- Enfriamientos (`cooldown`, `cooldown3`), estados (`statuses`, `turns`), `reflect` y `defending` se descuentan **por ronda** (`step`, ~líneas 1216–1246; `statusTick` al final de ronda).
- Línea base: `scripts/baseline/motor13.json` (225 combinaciones clase × elemento × rango, `autoPolicy`, semilla 13013) generada por `scripts/baseline-motor13.ts`.

## 1. Entregables
1. `src/lib/game/progressEngine.ts` (puro, sin React/Supabase, solo `rng.ts` con semilla): **planificador de activaciones**.
2. `scripts/compare-e2.ts`: corre el prototipo con las mismas semillas y matriz que la línea base y compara.
3. `src/lib/game/progressEngine.test.ts`: pruebas de §3.
4. Informe corto en `docs/E2_RESULTADO.md` (decisión recomendada: continuar / ajustar / abortar).

## 2. Diseño del prototipo (fijado por el arquitecto)
```ts
export interface Runner { id: string; speed: number; progress: number } // progress en [0, THRESHOLD)
export const THRESHOLD = 100;                    // "puntos de progreso" (escala común)
export function nextActivations(runners: Runner[], opts?: { cap?: number }): { order: string[]; runners: Runner[] };
// Avanza el tiempo hasta que algún runner llena THRESHOLD; devuelve quién actúa (empates: regla del motor 13)
// y el estado de progreso resultante. cap = MAX_ACTIONS_PER_ROUND (3) acciones consecutivas del más rápido.
```
- **Fase E2a (conteo):** *criterio revisado y aprobado por el dueño (2026-10-11).* El **número de activaciones por ciclo** debe coincidir al 100 % con `actionCounts` (ya cumplido en 10 000 casos). El **orden exacto no se exige**: el motor 13 desempata con una iniciativa aleatoria (`velocidad × (0,7 + 0,6·rng)`) y las diferencias de orden aparecen solo con velocidades parecidas (razón < 1,5). La iniciativa se modela como **progreso inicial aleatorio** del ciclo, tomado de la misma tirada del motor (`roll`), y se cuantifica el desacuerdo restante. La puerta real es E2b (balance).
- **Fase E2b (duraciones):** cooldowns, estados (`turns`), `reflect`, `defending` y tics de Quemadura se cuentan en **activaciones del portador** en lugar de rondas, con una **constante de conversión** ajustable por tipo (para calibrar).
- La IA/política es la misma (`autoPolicy`); no se tocan reglas de daño, armas ni habilidades.

## 3. Pruebas obligatorias
- Determinismo: mismas semillas → misma salida.
- E2a: propiedad de equivalencia del conteo de activaciones (y desacuerdo de orden cuantificado) y casos límite: velocidad igual, ×10 más rápido, `cap = 3`, descartes del acumulado.
- Un jugador no puede actuar fuera de su ventana; nada avanza mientras espera la decisión (el planificador es puro: no tiene reloj).
- Sin `Math.random()` ni `Math.pow`/`**` en la lógica (tablas precalculadas, regla del motor).

## 4. Criterios de viabilidad (comparación contra `motor13.json`)
Usar **≥ 10 corridas por nivel** (la línea base actual usa 2: regenerar con `--runs=10` o más; ~12 s). Comparar con **las mismas semillas**:
- Winrate **por rango** dentro de ±3 puntos porcentuales y **por clase** dentro de ±3 puntos.
- Duración media (rondas/activaciones convertidas) dentro de ±10 %.
- Ninguna celda clase × elemento × rango fuera de ±15 puntos (para detectar rupturas locales, sabiendo que el ruido es mayor).
- Si falla: ajustar las constantes de conversión de §2 (máximo 3 iteraciones documentadas). Si sigue fuera tras las 3 → **ABORTAR** y reportar al dueño con la tabla de diferencias; no forzar.

## 5. Reglas de entrega
- Un commit en `v2-e2`. `tsc`, `eslint src scripts`, `vitest` completo en verde. Sin push, sin tocar `combat.ts`, `stage.ts` ni SQL.
- Dudas de diseño: pregunta en `CRUCE_IAS.md`. Informe de resultados: tabla breve y recomendación.
