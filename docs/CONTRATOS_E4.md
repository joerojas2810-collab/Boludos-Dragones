# CONTRATOS_E4 — Etapa 4: Aguante, Quiebre e intenciones (pilotos)

**Estado:** contrato para el programador (ChatGPT/Codex). Rama `v2`. Diseño: `COMBATE_V2.md` §7. Un solo agente toca `combat.ts` a la vez. Sub-pasos con commit y auditoría cada uno. Valores numéricos = de partida; se ajustan con `scripts/sim-stage3.ts` y se documentan. Dudas de diseño: `CRUCE_IAS.md`. Sin SQL, push ni merge a `main`.
`ENGINE_VERSION` sube a **15** en 4a.

## 4a — Aguante y Quiebre (Quebrar Aguante activo)
- **Solo en élites y jefes** (role `elite`/`final` en `floorFights.ts`, y los jefes con nombre); enemigos comunes no tienen Aguante.
- Estado en `Combatant`: `aguante`, `aguanteMax`, `quiebre` (activaciones restantes de Expuesto), `quiebreResist` (activaciones de resistencia).
- **Valores de partida:** `aguanteMax` = 30 % de la vida máxima del enemigo (como `ARMOR_FRACTION`). Todo golpe dañino del PJ resta Aguante igual al 25 % del daño a vida que causa; **Quebrar Aguante** (daño moderado) resta el 100 % de su daño a vida, más los bonos de §6.2.
- **Quiebre** (Aguante = 0): cancela una Carga compatible pendiente, deja al enemigo **Expuesto** (DEF −15 % hasta que complete su siguiente activación, valor de partida), restaura el Aguante a su máximo y da `quiebreResist` = 2 activaciones del enemigo (no puede volver a quebrarse). No es un bono exclusivo del Pícaro.
- **Habilidades:** habilitar **Quebrar Aguante**; activar los ganchos de clase de §6.2 que dependen de Aguante o de Expuesto (Caballero con Resolución, Mago con ventaja elemental, Pícaro con Expuesto/estado, Clérigo que cura si causa Quiebre, Berserker bajo 50 %).
- **Piloto élite: Gólem Colosal.** Aguante + una **Carga** (golpe fuerte anunciado que ignora 30 % de DEF, valor de partida) cancelable por Quiebre. Solo el Quiebre cancela la Carga; Defender la mitiga como un golpe fuerte (la guardia perfecta se conserva).
- **Pruebas:** determinista; no hay Aguante en comunes; el Aguante baja con daño y se restaura tras el Quiebre; la Carga se cancela solo por Quiebre; la resistencia evita cadenas de Quiebre; Expuesto expira tras la activación del enemigo; replay del servidor acepta `quebrar`; simulación sin deriva > piso de ruido en Caballero/Mago/Pícaro.

## 4b — Intenciones tipadas e Interrumpir
- Tipos de intención en el motor: Golpe, Carga, Preparación, Represalia, Canalización, Ataque múltiple. **En esta etapa solo se implementan Carga (4a) y Canalización**; las demás quedan declaradas.
- **Canalización:** efecto anunciado que se ejecuta tras un contador (1 activación enemiga, valor de partida); marcada "interrumpible" o "inevitable". **Interrumpir** (daño bajo) la detiene si es interrumpible; Defender no la cancela salvo regla del jefe.
- **Piloto de Interrumpir: pendiente (ver Q15 en `CRUCE_IAS.md`).** No programar 4b hasta que el dueño elija; mientras tanto Interrumpir sigue deshabilitado con su motivo.
- **Jefe piloto: Rey de Ceniza** (`ash_king`, regla `presion`, dungeon E): conserva la presión acumulativa; su golpe fuerte se anuncia; la guardia perfecta lo reduce y reinicia la presión (ya existe: añadir lectura y ventana de decisión, sin cambiar su identidad).
- **Regla de aviso (`COMBATE_V2.md` §4):** ninguna intención fuerte se resuelve antes de la primera activación del jugador tras anunciarse; la espera se concede una sola vez.

## 4c — Interfaz
- Barra de **Aguante** solo en enemigos que la tienen; icono de intención con nombre, efecto, cuenta atrás y etiqueta "interrumpible" / "cancelable por Quiebre" / "inevitable"; aviso cuando el Quiebre está cerca; registro de combate en una línea ("Quiebre cancela Carga").
- Sin desbordes en celular; el arte manda; respeta `prefers-reduced-motion`.

## Puertas
`tsc`, `eslint src scripts`, `vitest` y `pglite` en verde; simulación sin deriva > piso de ruido en las clases sin Aguante en juego (dungeons comunes). Auditoría de Claude entre sub-pasos.
