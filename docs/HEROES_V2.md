# HEROES_V2 — Héroes únicos y modos nivelado / colección

**Estado:** APROBADO por el dueño (2026-10-10), tras el cruce Claude ↔ ChatGPT (`docs/CRUCE_IAS.md`: Q1–Q6, P1 y P9). Los contratos de la primera etapa quedan en §8; nada se programa sin la confirmación de cada etapa.
**Glosario compartido:** `docs/COMBATE_V2.md` §0.
**Alcance:** cómo se define un héroe al salir del gacha, cómo crece, qué ve el jugador en Forja y gacha, y los modos de **salas y torre**. No toca economía ni probabilidades.

## 1. Decisiones cerradas

1. **Rareza F–S se mantiene** (multiplicadores ×1,0 / 1,15 / 1,3 / 1,5 / 1,75 / 2,0 / 2,6; probabilidades 31 / 22,5 / 16,5 / 12 / 9 / 6 / 3 %; sin pity). El rango da **poder**, no habilidades.
2. **El Factor de atributo ya existe y se formaliza (Q1-A):** cada factor se sortea de forma independiente entre 85 % y 115 % (`STAT_VARIANCE = 0.15`, `characters.ts`; hp, atk, def, crit, speed; la precisión no es un factor) y se guarda en el héroe. El efecto conjunto sobre el poder total se limita a ±10 % frente al mismo héroe con todos los factores en 100 %.
3. **Sin cambio de Factor pagado.** Para conservar otro Factor se usa una copia: se intercambia la copia completa o se elige qué héroe conservar al fusionar. El rasgo y todos los factores viajan juntos; nunca se seleccionan por separado.
4. **Copias, ★, subir de rango y fusión** siguen igual (`heroFusion.ts`, `docs/REDISENO_COMBATE.md` §7d); el Factor de atributo viaja con el héroe y cada copia. La fusión conserva íntegro el perfil (rasgo + factores) del héroe elegido.
5. Un F con Factor de atributo alto **no supera** a una S: el rango sigue multiplicando (F ×1,0 frente a S ×2,6, antes de ★ y nivel).
6. **Salas y torre usan los mismos dos modos** (§5): **nivelado** y **colección**.

## 2. Estado actual verificado (base del diseño)

- Al sortear un héroe: clase y elemento al azar, `rollStat` por stat (Factor de atributo de 85–115 %), rasgo (`rollTrait`). Con el reset, todos los héroes se re-sortean con las reglas nuevas (tope ±10 %).
- `OwnedCharacter` guarda `stats` **base con su Factor de atributo** (sin rango, ★ ni nivel); en uso, `heroFromOwned` calcula `scaleStats(c.stats, rarity, stars, level)` y suma equipo, arma y sets. Por eso **subir de rango o ★ conserva el Factor en proporción de forma automática**: el multiplicador se aplica sobre los stats base guardados.
- Las copias guardan su perfil completo (`copies?: HeroProfile[]`): rasgo y factores. Las piezas de equipo ya guardan `{roll, lines}` (precedente).
- `characterKey = c-clase-elemento-rango`: un héroe por clave; las repetidas son copias.
- Fusión (`fuseHeroes`): si el destino ya existe se queda con su nivel y equipo y se elige solo el rasgo (`keep`); si no, el base conserva nivel (con tope), equipo y stats.

## 3. Lo que cambia

### 3.1 El Factor de atributo viaja con cada copia
- `copies` pasa de `TraitId[]` a una lista de `{ trait, factors }` (los factores sorteados para esa copia), igual que las piezas.
- **Intercambio con una copia:** la pestaña *Héroes* de la Forja intercambia el perfil completo del héroe principal por el de la copia: rasgo y todos los factores juntos. No se pueden mezclar rasgo de una copia y factores de otra.
- **Fusión** al ascender a un rango donde ya existe el héroe: se elige qué héroe conservar como perfil; rasgo y factores de ese héroe quedan juntos, y el perfil del otro pasa a copia (se extiende `keep`).
- **Subir ★ / rango sin fusión:** el héroe principal conserva su Factor; las copias usadas como material se consumen con sus propios factores.
- **Mercado:** la copia que viaja lleva su rasgo y su Factor de atributo. El Factor no modifica `TRADE_VALUE` en la primera versión.

### 3.2 Poder total acotado
Cada factor individual se sortea entre 85 % y 115 % de su atributo base. El efecto conjunto de los factores no puede dejar el valor de poder del héroe por debajo de 90 % ni por encima de 110 % de la referencia del **mismo héroe con todos sus factores en 100 %**. La referencia compara la contribución de atributos base y excluye rango, ★, nivel, equipo y arma; esos sistemas se aplican después y no cuentan para el tope. Se conserva el sorteo ±15 % por atributo. El contrato técnico debe usar una sola métrica de poder para calcular esta comparación.

### 3.3 Se ve el Factor de atributo
- Gacha y Forja muestran por atributo etiquetas claras, por ejemplo `ATQ +12 %` y `DEF −6 %`, más un resumen compacto: **bajo**, **estándar** o **alto**.
- Forja: antes de confirmar un ascenso, fusión o intercambio se muestran **lado a lado el perfil actual y el resultante** (rasgo y cada Factor, con la diferencia en stats). Nunca se cambia nada sin ver el cambio.

## 4. Progresión (sin cambios de regla)
Subir ★ = 3 unidades; subir de rango = base + (ratio−1) unidades + monedas (F 5, E 5, D 4, C 4, B 4, A 4); `STAR_CARRY`; S es el techo; los héroes no se queman. Ver `heroFusion.ts`.

## 5. Modos de salas y torre (P1 y P9, mismos dos modos)

| Modo | Selección y poder | Notas |
|---|---|---|
| **Nivelado** (valor `nivelado` en la base; etiqueta "Torre nivelada" / nivelado en salas) | El jugador **elige clase y elemento**. Preset fijo **rango D, 0★, nivel 1**, igual para todos, **sin Factor de atributo propio** ni equipo; se aplica con `normalizeHero` (bono ≈ +1,6 %) | Un preset por semana en la torre; el mismo en las salas. Se quita el bono por rango/★ del héroe propio |
| **Colección** (hoy "poder completo") | Héroe propio con su poder real: rango, nivel, ★, Factor de atributo y equipo | Se muestra la clase y el elemento del héroe usado |

- **Torre:** dos rankings separados (como hoy), misma semilla semanal. Ranking con **nombre · clase · emblema de elemento · piso**. `tower_scores` solo guarda `max_floor`: hace falta una migración para guardar clase y elemento. El valor `nivelado` del CHECK de `mode` se conserva (no se migra el CHECK).
- **Salas:** el nivelado y el modo colección reemplazan los actuales; el **rango de sala** sigue cambiando solo la dificultad; la lógica de apuestas, interferir/ayudar, jefe cooperativo y duelos 1v1 no cambia de reglas. Los duelos "balanceado" y "héroes reales" siguen mapeados a nivelado y colección.
- **Preparación del duelo nivelado:** cada jugador elige clase y elemento y pulsa **Listo**. Cuando ambos están listos se envía/inicia el duelo. La selección tiene un límite de 30 segundos; queda por definir técnicamente qué ocurre si vence el tiempo y falta un jugador.
- **Efecto a vigilar:** en el nivelado deja de importar la colección; el incentivo de coleccionar queda en el modo colección y en el progreso por dungeons.

## 6. Riesgos
1. Doble estado del Factor en copias: migración SQL y `localStorage` (modo local); **no hay compatibilidad con datos antiguos: se hará un reset** (`reset_progress.sql`, destructivo; lo ejecuta el dueño o lo autoriza explícitamente; cada jugador limpia su `localStorage`).
2. Interacción de la **velocidad** (Factor de atributo) con la línea de progreso de `COMBATE_V2.md`: calibrar tras la etapa 2.
3. Rasgos con velocidad o acciones extra pueden sumar con un Factor alto: revisar `traits.ts` al cerrar el combate.
4. Comparabilidad: el nivelado sin Factor propio puede sentirse "plano"; vigilar con feedback (el Factor se nota en colección).
5. El preset D 0★ es el de arranque; se recalibra con simulación de torre (los pisos están afinados para el nivelado actual).

## 7. Puntos abiertos
1. Métrica técnica de poder que calculará y aplicará el límite combinado de ±10 % (§3.2); el valor y la referencia ya están definidos.
2. Comportamiento técnico al vencer los 30 segundos de selección si no ambos jugadores están listos.

## 8. Contratos de datos
Ver `docs/CONTRATOS_H1.md` (fuente de verdad de tipos y firmas de H1: `HeroFactors`, `HeroProfile`, `copies: HeroProfile[]`, `buildStats`, `swapCopy`, `previewProfileChange`). El tope de ±10 % del §3.2 se implementa como `capFactors` (métrica propuesta, ajustable solo allí).
