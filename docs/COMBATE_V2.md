> **Reemplazado por el motor de turnos (`docs/ideal/`). Se conserva como historial.**

# COMBATE_V2 — Línea de progreso, habilidades universales, Quiebre

**Estado:** APROBADO por el dueño (2026-10-10) tras el cruce Claude ↔ ChatGPT (`docs/CRUCE_IAS.md`, P1–P9, Q1–Q6). Se programa por etapas (§9) con confirmación del dueño en cada una; los valores numéricos son **de partida** y se ajustan con simulación.
**Base:** `docs/COMBATE_LINEA_PROGRESO.md` evaluada contra el código (`ENGINE_VERSION 13`). Héroes y modos: `docs/HEROES_V2.md`.
**Decisión del dueño:** es un **rediseño** del sistema de ataques (se reemplazan Ataque 2 y Ataque 3).

## 0. Glosario compartido

- **Rango:** F E D C B A S. SS y SSR solo como dificultad de dungeon.
- **Factor de atributo:** variación sorteada de cada atributo del héroe; cada factor individual va de 85 % a 115 % del valor base y el efecto conjunto sobre el poder queda acotado a ±10 % (`HEROES_V2.md`).
- **Activación:** momento en que un combatiente resuelve una acción. Toda duración se cuenta en activaciones **propias del portador**.
- **Progreso:** avance de un combatiente hacia su próxima activación (velocidad).
- **Intención:** acción enemiga anunciada (Golpe, Carga, Preparación, Represalia, Canalización, Ataque múltiple).
- **Aguante:** medidor de defensa secundaria de élites y jefes. Al llegar a 0 ocurre **Quiebre**. No confundir con **Ruptura** (estado de Tierra) ni con la regla de jefe "posturas".
- **Expuesto:** reducción temporal de DEF que deja el Quiebre al jefe; dura hasta que el jefe complete su siguiente activación (§7).
- **Resolución:** recurso del Caballero que da la guardia perfecta (§6.2).
- **Estados elementales:** Escarcha, Quemadura, Impulso, Ruptura, Sobrecarga.
- **Nomenclatura (Q3):** en pantalla "Ataque 2" = habilidad de clase y "Ataque 3" = especial del arma; en el **código** las claves están invertidas (`attack2` = arma, `attack3` = clase). Este documento usa los nombres de pantalla y, cuando hace falta, la clave de código.

## 1. Pilares

1. El jugador anticipa qué amenaza viene y entiende por qué una acción es buena ahora.
2. La velocidad cambia **cuándo** actúa, no solo un porcentaje.
3. El **arma** define el perfil del ataque básico (`CLASS_WEAPONS`: 2 tipos por clase); el elemento y el estado aplicado los define el PJ.
4. **Cinco habilidades universales** para todas las clases.
5. Clase y elemento **modifican** con ganchos acotados (máximo 1 por celda en la v1).
6. Defender y guardia perfecta se conservan.
7. Los números son **variables de balance**.
8. Fuera de alcance: equipo con efectos activos y eventos de expedición.

## 2. Estado actual → destino

| Hoy (motor 13) | Destino |
|---|---|
| Ataque 1 (básico por clase) | **Básico por arma** |
| Ataque 2 (habilidad de clase, código `attack3`) | Se retira |
| Ataque 3 (especial del arma, código `attack2`, enfriamiento 2) | Se retira; sus efectos pasan a perfiles del básico |
| Rondas + acciones extra por velocidad (tope 3) | **Línea de progreso** (§3); tope de 3 se conserva |
| Intención normal/fuerte | Intenciones tipadas en enemigos piloto (§7) |
| Estados solo vía la habilidad de clase | Reglas de aplicación y consumo (§8) |
| Detonar (Mago) | Se absorbe en Explotar estado (§8) |

## 3. Línea de progreso

- Cada combatiente avanza según su velocidad; al llenar queda **listo** y resuelve una acción. La UI muestra la cola y las intenciones anunciadas.
- Desempates por la regla de iniciativa existente; sin tiradas nuevas sin medir.
- El tope de **3 acciones** se conserva hasta comprobar que es redundante.
- El básico no da acciones gratuitas ni aplica estados a varios objetivos.
- El combate no avanza mientras espera la decisión del jugador.
- **Cooldowns y estados** bajan por **activación del portador** (hoy bajan por ronda); Quemadura hace tic cuando actúa el afectado. La UI dice "faltan N activaciones".
- **Etapa de viabilidad previa (E2):** reproducir el balance de `ENGINE_VERSION 13` con el acumulador; si no se logra dentro de la tolerancia acordada, se aborta y se replantea.
- Primer prototipo: **visual** (cola) separado de **simulación** (acumulador).

## 4. Defensa y tiempo de aviso (P5)

- Defender consume la activación. Guardia perfecta: defender con una intención fuerte pendiente → −75 % (factor 0,25) y bono de clase; sin multiplicador general al siguiente ataque.
- **Regla de aviso:** ninguna intención fuerte se resuelve antes de la **primera activación del jugador tras su anuncio**. La espera se concede **una sola vez** por intención; después se resuelve cuando le toca al enemigo. Medido en activaciones, no en puntos de progreso.
- Motivo (verificado): hoy los enemigos con iniciativa mayor (`lead`, `buildQueue`) pueden actuar antes de la primera acción del héroe y resolver un golpe fuerte sin que pueda defender.
- Canalización interrumpible: se detiene con Interrumpir, no con Defender (salvo regla del jefe).

## 5. Básico por arma

- Siempre disponible, rápido, daño moderado, alta fiabilidad (el Ataque 1 hoy nunca falla; se conserva).
- El arma define el **perfil** del básico (daño a vida, precisión, daño a Aguante, crítico o recuperación), con presupuesto comparable.
- Armas por clase: Caballero Espada/Hacha · Mago Bastón/Varita · Pícaro Daga/Arco · Clérigo Maza/Libro · Berserker Mandoble/Martillo.
- El elemento del PJ define el elemento del ataque y el estado que aplica; el arma no cambia ese elemento. Cada ataque que inflige daño aplica una carga elemental según §8.
- El Ataque 3 actual se retira; sus mejores efectos se reparten como perfiles del básico (revisión de `weapons.ts` caso por caso).
- Cualquier PJ puede usar equipo de cualquier elemento; las armas siguen restringidas por clase. Los bonos de set dependen del elemento de las piezas. No hay multiplicador adicional por coincidir con el elemento del PJ ni resonancia elemental.

### 5.1 Equipo: sin resonancia, autoequipar por poder bruto (Q7)
- **Se elimina la resonancia de estilo** (la de líneas tanque/daño/crítico/sostén y su ×1,5 por habilidad de clase) por ahora, junto con `SKILL_STYLE_GROUP`.
- **Se elimina la afinidad de sets** (`SET_AFFINITY = 1,5`): el set rinde igual para cualquier héroe.
- **Autoequipar** se decide por **nivel de poder bruto**. Interfaz de botones, ordenada: **Poder** · uno por elemento (**Agua, Fuego, Viento, Tierra, Rayo**) · **Desequipar todo**. *Poder* = el mejor poder bruto sin importar el elemento; un botón de elemento = el mejor poder bruto usando de preferencia piezas de ese elemento (set). La interfaz debe verse ordenada visualmente.

## 6. Cinco habilidades universales

### 6.1 Definición y enfriamientos (P2)

Sin maná ni coste de progreso en la v1; enfriamientos en **activaciones propias**, sin compartir entre habilidades.

| Habilidad | Función base | Enfriamiento inicial |
|---|---|---|
| **Golpe** | Daño fuerte a un objetivo | 2 |
| **Barrido** | Daño moderado a todos los enemigos vivos; una interacción elemental por objetivo | 2 |
| **Quebrar Aguante** | Daño moderado + daño extra a Aguante; cancela una Carga solo si causa Quiebre y la Carga lo admite | 1 |
| **Interrumpir** | Daño bajo; detiene una Canalización interrumpible | 1 |
| **Explotar estado** | Daño bajo + consume un estado y aplica su efecto (§8); solo si hay un estado que gastar | 1 |

Tras simulación se sube Barrido o Explotar a 2 si superan al básico en daño o valor esperado por activación.

### 6.2 Clase × habilidad (P3, versión aprobada)

Se conserva la pasiva de cada clase. Sin barra de Furia ni Impulso elemental extra en el Barrido del Pícaro. Curas: máximo 3 % de vida máx. por activación y comparten el tope existente de 6 % por ronda; escudos: máximo 3 % por activación y 6 % por ronda. Todo bono de "siguiente ataque" expira tras una activación propia si no se consume. **Máximo 1 gancho por celda en la v1** y simulación del peor caso con el tope de 3 acciones.

| Clase | Golpe | Barrido | Quebrar Aguante | Interrumpir | Explotar estado |
|---|---|---|---|---|---|
| Caballero | Resolución gastada: +15 % daño a cualquier enemigo | 2+ enemigos: −10 % al próximo golpe recibido | Con Resolución: +25 % daño a Aguante | Éxito: −15 % al próximo golpe recibido | Escudo 3 % vida máx. |
| Mago | +15 % daño contra objetivo con estado | +10 % daño a cada objetivo con estado | +20 % daño a Aguante con ventaja elemental | Éxito: +15 % al efecto de su próximo Explotar | +25 % a la magnitud del efecto |
| Pícaro | +20 % daño a objetivo Expuesto | Un solo enemigo vivo: +10 % daño | +20 % daño a Aguante si el objetivo tiene estado | Éxito: +10 puntos de progreso (sin llegar a Listo) | Consume Impulso: +15 % crítico en su siguiente ataque |
| Clérigo | Cura 1 % vida máx. al acertar | Cura 1 % por enemigo, máx. 3 % por uso | Si causa Quiebre: cura 3 % | Éxito: escudo 3 % | Cura 3 % además del efecto |
| Berserker | Bajo 50 % de vida: +20 % daño | Bajo 50 %: +10 % a cada objetivo | Bajo 50 %: +25 % daño a Aguante | Éxito bajo 50 %: +10 % daño siguiente ataque | Bajo 50 %, Quemadura explotada +25 % |

Dependen de la etapa 2: los efectos de progreso del Pícaro. Requieren un efecto defensivo temporal nuevo: los "−10 %/−15 % al próximo golpe recibido" del Caballero.

### 6.3 Resolución del Caballero (P6)
Reemplaza **solo** el Reflejo de la guardia perfecta (hoy `GUARD_REFLECT = 0,4`); no modifica el −75 % ni se acumula con la pasiva −18 %. La guardia perfecta da **1 Resolución** (máx. 1), que dura hasta su siguiente activación. El siguiente Golpe o Quebrar la consume para **+15 % de daño contra cualquier enemigo**; si el objetivo tiene Aguante, Quebrar suma además +25 % de daño a Aguante. No cancela una Carga salvo que cause Quiebre y la Carga lo admita. Sin contraataque gratis.

## 7. Aguante, Quiebre e intenciones (P4, P7)

- Aguante solo en **élites y jefes** (pilotos primero); enemigos comunes siguen con solo vida.
- Al llegar a 0: **Quiebre** → cancela una Carga compatible y deja al enemigo **Expuesto**; luego recupera Aguante y tiene resistencia temporal al próximo Quiebre.
- **Expuesto:** Quiebre reduce la DEF del jefe en un 15 % (valor inicial para probar). Dura hasta que el jefe complete su siguiente activación; todos los ataques del PJ antes de ese momento aprovechan la ventana. Al completar esa activación, Expuesto termina. No es un bono exclusivo del Pícaro.
- Intenciones: Golpe, Carga, Preparación, Represalia, Canalización, Ataque múltiple. La UI dice efecto, cuenta atrás y contrajuego ("interrumpible", "cancelable por Quiebre", "inevitable").
- **Pilotos aprobados:**
  - **Élite: Gólem Colosal** (nombre existente en `floorFights.ts`): Aguante y una Carga cancelable por Quiebre; solo Quebrar que agota el Aguante cancela la Carga.
  - **Jefe: Rey de Ceniza** (dungeon E, regla `presion`): conserva su presión acumulativa; anuncia su golpe fuerte y la guardia perfecta lo reduce y reinicia la presión (la regla actual ya apaga la presión; el cambio añade lectura y ventana de decisión).
- Las otras 7 mecánicas de jefe **no se tocan** ahora. Candidatos futuros (no aprobados): Aprende → Represalia; Cabezas → Ataque múltiple; Marchitar → Ritual/Canalización (ya funciona como ritual anulable); Posturas → telegrafiar; Hambre → anunciar el ataque adicional; Plaga queda como presión ambiental; Armadura sin duplicarse con Aguante.
- Defender no debe ser la respuesta automática: cada contrajuego debe ganar en algún caso (criterio de éxito).

## 8. Elementos: aplicación y consumo (P8, Q4)

Afinidades y `elements.ts` sin cambios; la ventaja elemental no aplica más estados. Aplicación: máximo 1 vez por uso y objetivo (Barrido: una por enemigo). **Explotar estado** es una opción **universal de daño bajo** que consume el estado; solo se habilita si hay un estado que gastar. Valores iniciales, sujetos a simulación:

- **Regla común de cargas (cerrada):** máximo 3 cargas por portador del estado elemental. Todo ataque que inflige daño aplica 1 carga, hasta ese máximo, al portador correspondiente según el estado; un ataque de área aplica como máximo 1 carga a cada enemigo alcanzado. Para estados cuyo portador es el PJ, un uso aplica como máximo 1 carga aunque dañe a varios enemigos. Explotar consume las cargas y no aplica ni añade cargas. Defender no añade cargas: la primera defensa consecutiva las conserva; si el PJ vuelve a Defender sin haber atacado entre ambas defensas, las cargas se pierden al terminar la segunda defensa. Un ataque dañino posterior añade una carga (si está bajo el máximo), renueva la duración y reinicia la secuencia de defensas.
- **Daño común:** 40 % del daño que causaría el básico del PJ con el arma equipada, a un objetivo. Para calcular el básico, el ATQ del arma se suma al ATQ del PJ antes de calcular el daño. Explotar no aplica una carga elemental nueva.
- **Escarcha (Agua):** Explotar consume las cargas y retrasa la próxima ranura pendiente del objetivo hasta después de la siguiente acción del PJ. Una vez por enemigo y ronda; 1–2 cargas mueven una ranura y 3 mueven hasta dos. No afecta ranuras resueltas ni intenciones fuertes que ya recibieron su espera de aviso.
- **Impulso (Viento):** Explotar consume las cargas; con 2+ añade una acción del PJ a la cola de la ronda actual, máximo una extra y sin superar 3 acciones. El Pícaro gana además +15 % de crítico en su siguiente ataque.
- **Quemadura (Fuego):** consume las cargas y adelanta un tic de daño, respetando `BURN_CAP`; el efecto termina.
- **Ruptura (Tierra):** consume las cargas; el próximo ataque ignora 8 % de DEF por carga (máximo 24 %) y el bono expira tras una activación propia si no se usa.
- **Sobrecarga (Rayo):** con 3 cargas, consume el contador y descarga +40 % del daño básico adicional. La calibración autorizada queda en `docs/E5_5A_RESULTADO.md`.
- **Detonar del Mago:** deja de ser botón aparte; el Mago usa Explotar con +25 % a la magnitud del efecto. Se calibra por debajo del Detonar actual (~57 % sobre el resto).

El motor real conserva las rondas y la cola de acciones: Escarcha e Impulso aplican sus efectos de Explotar sobre las ranuras, sin el acumulador de E2. Sus modificadores de velocidad por carga siguen activos en el cálculo de acciones de la ronda.

## 9. Plan por etapas (con puerta de salida)

| # | Etapa | Puerta |
|---|---|---|
| 0 | Documentos V2 aprobados (este documento y `HEROES_V2.md`) | Hecho (2026-10-10) |
| H1 | **Héroes:** copias con Factor de atributo, intercambio y fusión conservando el perfil completo, vista del Factor en gacha y Forja; migración SQL | Tests verdes; `upgrade_from_NNNN.sql` con confirmación del dueño |
| H3 | **Equipo:** quitar resonancia y afinidad de sets; nuevo autoequipar por poder bruto con botones (Poder, 5 elementos, Desequipar todo) | Tests verdes; prueba manual de la interfaz |
| H2 | **Modos nivelado/colección** en torre y salas (preset D 0★, elegir clase+elemento, ranking con clase y elemento); migración de `tower_scores` | Prueba manual de salas y torre |
| 1 | Cola visual (sin cambiar motor) | Se entiende en prueba manual |
| 2 | Acumulador de progreso + cooldowns/estados por activación | Resultados ≈ motor 13 dentro de la tolerancia acordada; si no, se aborta |
| 3 | Cinco habilidades + básico por arma + ganchos de clase | Simulación clase × elemento × arma pareja |
| 4 | Aguante/Quiebre + intenciones; Gólem Colosal y Rey de Ceniza | Cada respuesta gana en algún caso |
| 5 | Explotar estado (los 5 estados) | Sin bucles de acciones; simulación a 3 acciones |
| 6 | Recalibrar (`RANK_TUNE`, jefes, salas, duelos, torre, economía) | Suite verde + prueba manual |
| 7 | Subir `ENGINE_VERSION`, migrar | Backup, `upgrade_from_NNNN.sql`, confirmaciones habituales |

H1 y H2 van **antes del motor** (bajo riesgo, no dependen de la línea de progreso). La calibración del Factor de atributo de velocidad se hace tras la etapa 3.

## 10. Puntos abiertos (para el contrato de cada etapa)

1. Escala del progreso en el prototipo aislado E2; no se aplica al motor real mientras conserve rondas.
2. Tolerancia de equivalencia del prototipo E2 respecto del motor 13.
3. Balance final de los valores iniciales (§6.2 y §8), según simulación (`class-balance.ts`, `balance.ts`, `scripts/*-sim.ts`).
4. Efecto defensivo temporal del Caballero (§6.2): modelo y duración.

## 11. Criterios de éxito
El jugador explica la próxima amenaza; hay más de una respuesta razonable por intención; el Pícaro de Viento no domina por acciones; Defender no es la respuesta automática; la duración no sube sin añadir decisiones.

## 12. Protocolo de trabajo entre IAs
Ver `docs/CRUCE_IAS.md`: diseño (ChatGPT/Codex) propone; el dueño aprueba; Claude Code es arquitecto y auditor (contratos, `tsc`, `eslint`, `vitest`, simulaciones); el motor lo toca una sola persona a la vez; una rama y un commit por etapa; lo cerrado no se reabre sin motivo escrito.
