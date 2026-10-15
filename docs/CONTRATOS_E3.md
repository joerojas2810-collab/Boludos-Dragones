> Historial: describe el motor anterior por rondas; vigente: docs/ideal/

# CONTRATOS_E3 — Etapa 3: habilidades universales, básico por arma, ganchos de clase

**Estado:** contrato para el programador (ChatGPT/Codex). Rama `v2` (E2 integrado). Diseño: `COMBATE_V2.md` §5, §6. **Esta es la primera etapa que modifica `combat.ts`: un solo agente toca el motor a la vez.** Se divide en 4 pasos, cada uno con su commit y su puerta; no se empieza el siguiente sin la auditoría del anterior. Dudas de diseño: pregunta en `CRUCE_IAS.md`.
Nomenclatura: en pantalla "Ataque 2" = habilidad de clase y "Ataque 3" = especial del arma; en el código `attack3` = clase y `attack2` = arma.

## Reglas comunes
- Todo azar por `rng.ts`; sin `Math.random()`, sin `Math.pow`/`**` en la lógica del motor (tablas precalculadas).
- `ENGINE_VERSION` sube a **14** en el paso 3a y no vuelve a subir en 3b–3d de esta etapa.
- Balance: simulaciones con `scripts/baseline-motor13.ts` y `scripts/compare-e2.ts` como referencia. Los números iniciales de `COMBATE_V2.md` son de partida; los ajustes se justifican con simulación y se documentan.
- Desde 3c, `scripts/compare-e2.ts` es histórico y queda retirado; la comparación vigente es `scripts/sim-stage3.ts` contra `scripts/baseline/motor13.json`.
- Tests que fijan valores del motor 13 se actualizan **con el motivo explicado** en el commit.
- Sin SQL, sin push, sin merge a `main`.

## 3a — Elemento del PJ y básico por arma
Cambios:
1. **El elemento del ataque y del estado que aplica es siempre el del PJ** (`char.element`). Se elimina el uso de `weapon.element` en `combat.ts` (líneas ~659, ~769, ~813) y en los textos de `explain.ts` (~164, ~197–199). `weapon.element` queda **solo** para contar sets.
2. **Básico por arma:** el Ataque 1 toma su nombre y perfil del tipo de arma equipada (`WEAPON_TYPE_DATA[type].basic`). Sin arma, se usa el básico de la clase como hoy. El básico **nunca falla** (se conserva).
   - `basic?: { name: string; power: number; crit?: number; heal?: number }` en `WeaponTypeInfo`.
   - Codex **propone la tabla de 10 armas** (Espada, Hacha, Bastón, Varita, Daga, Arco, Maza, Libro, Mandoble, Martillo) con presupuesto comparable (ningún arma estrictamente mejor), partiendo de lo que cada arma ya da (`atkMult`, `accuracy`, `crit`, `speedMult`). La tabla propuesta va a `CRUCE_IAS.md` como pregunta al dueño antes de fijarla; hasta entonces, valores neutros (`power 1`, sin extras).
3. `attack2` (especial del arma) y `attack3` (habilidad de clase) **no se tocan aún**.
Pruebas: el ataque de un PJ con arma de otro elemento usa el elemento del PJ y aplica su estado; el básico cambia de nombre según el arma; sin arma, igual que hoy; simulación de que ninguna clase se desvía más del piso de ruido (ver `CONTRATOS_E2.md` §4) con los valores neutros.
Puerta: `tsc`, `eslint src scripts`, `vitest` en verde y simulación sin deriva.

## Ajustes previos a 3b (decisión Q13-A, dueño)
- Renombrar los básicos: Bastón → "Golpe rúnico", Martillo → "Impacto de martillo" (resto según la tabla de Q13). Renombrar el especial actual del Hacha de "Hachazo" a "Hachazo pesado" (solo datos; desaparece en 3c).
- Los efectos de identidad de Q13 no se programan todavía.

## 3b — Las cinco habilidades universales (añadidas, sin quitar las viejas)
- Nuevo módulo de datos `universalSkills.ts` con `golpe | barrido | quebrar | interrumpir | explotar` (id, nombre, enfriamiento inicial: Golpe 2, Barrido 2, Quebrar 1, Interrumpir 1, Explotar 1; función base de `COMBATE_V2.md` §6.1).
- En esta etapa: **Golpe** y **Barrido** funcionan completos; **Quebrar**, **Interrumpir** y **Explotar** se declaran pero quedan deshabilitados hasta las etapas 4 (Aguante, Canalización) y 5 (estados), con motivo visible en la UI.
- **Valores de partida** (se ajustan con simulación y se documentan): Golpe `power 1,8`, `accuracy 0,9`, un objetivo; Barrido `power 0,9` por enemigo vivo, `accuracy 0,9`, una aplicación de estado por objetivo y uso. Los nombres visibles son los de `COMBATE_V2.md` §6.1.
- Enfriamientos en **activaciones propias**, con la conversión fraccional validada en E2 (`cooldown 0,85`) — decidir y documentar el redondeo para mostrar enteros.
- Las habilidades viejas (Ataque 2 y 3) siguen funcionando hasta 3c.

## 3c — Ganchos de clase y retirada de las viejas
- **Acciones nuevas en todo el sistema (hallazgo de la auditoría de 3b):** hoy solo el motor acepta `golpe`/`barrido`. Torre y duelos se verifican en el servidor reproduciendo el log, así que hay que aceptar las acciones nuevas y retirar las viejas en: `server/validators.ts` (~línea 90, enum de acciones), el tipo `StageAction`/`stageReplay.ts`, `duel.ts` (~100, ~130: acciones y cooldowns de duelo), `auto.ts` (`autoPolicy` debe **elegir** las habilidades nuevas), `explain.ts` (~520–592) y los `pglite`/tests de torre y duelo. Sin esto los intentos con habilidades nuevas serían rechazados.
- **Calibración:** hasta que `autoPolicy` use Golpe/Barrido, la simulación de 3b solo confirma que la ruta heredada no cambió. En 3c se mide el balance real con `scripts/sim-stage3.ts` contra la línea base y el piso de ruido de `docs/E2_RESULTADO.md`.
- **Enfriamientos:** el factor 0,85 de 3b equivale en la práctica a enteros (1,7 baja 0,85 por activación = 2 activaciones). Aceptable; si 3c necesita fraccionales de verdad, documentarlo.
- Implementar la tabla clase × habilidad de `COMBATE_V2.md` §6.2 **solo para Golpe y Barrido** (los de Quebrar/Interrumpir/Explotar esperan a sus etapas), máximo 1 gancho por celda, con los topes de curas/escudos indicados.
- **Resolución del Caballero** (§6.3): reemplaza el Reflejo; da bono de daño al siguiente Golpe/Quebrar.
- Retirar Ataque 2 (clase) y Ataque 3 (arma) del motor, de `skills.ts`, `weapons.ts` (`special`) y de la IA/`autoPolicy`; migrar tests y datos.
- Detonar (Mago) se retira aquí; su función pasa a Explotar (etapa 5).

## 3d — Interfaz
- Botones fijos: Básico (por arma), Golpe, Barrido, Quebrar, Interrumpir, Explotar, Defender; muestran enfriamiento, daño estimado, objetivo válido y por qué están deshabilitados.
- Sin desbordes en celular; el arte manda; poco texto.

## Puertas de calidad (todas las etapas)
`tsc` limpio, `eslint src scripts` sin errores, `vitest` completo en verde, simulación de balance contra la línea base documentada. Auditoría de Claude antes de pasar al paso siguiente.
