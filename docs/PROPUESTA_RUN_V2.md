# Propuesta: Modo Progreso (antes "Run v2")

Estado: **propuesta final revisada, sin construir.** Todas las decisiones de diseño y de economía están cerradas (los números son valores de partida que se miden con simuladores). El plan de construcción está en [PLAN_RUN_V2.md](PLAN_RUN_V2.md). No hay rama ni cambios de código de esta propuesta; `main` y v7.0 quedan intactos (el único cambio hecho aparte en `main` fue la interfaz de la forja).

## Cambio de enfoque
Con poder fijo, 1 vida y sin mejoras ni reliquias, los Dungeons **dejan de ser una run roguelike** y pasan a ser un **modo de progreso (campaña)**: etapas con pisos y jefes que miden a tu héroe.

- **Antes (roguelike):** el héroe crece dentro de la run; la variedad viene del azar (reliquias, mejoras, puertas).
- **Ahora (progreso):** el héroe **ya llega hecho**. Lo que importa se decide **antes de entrar**: qué héroe llevas, su nivel, estrellas y equipo (gacha, forja, EXP). La etapa es la prueba, y en combate cuenta cómo peleas.

Idea de fondo: el juego es una **campaña de progreso** (colecciono, mejoro, vuelvo y paso la etapa que antes no podía), no una carrera de azar.

## Principio clave: cada modo tiene una razón distinta
| Modo | Razón de existir | Qué lo hace distinto |
|---|---|---|
| **Dungeons (campaña)** | Progresar y conseguir botín | Rangos F-SSR, ascensión, botín (partes, núcleos, piezas, monedas). Solo, a tu ritmo. Es la prueba de tu progreso. |
| **Torre semanal** | Competir durante la semana | Misma semilla, ranking (nivelado y colección), premios por piso y premio diario al #1. |
| **Salas (viernes)** | La noche social | Todos juntos piso a piso; apuestas, interferir, ayudar y jefe cooperativo. Importa la interacción, no el botín. |

Prueba para cualquier idea nueva: ¿refuerza la razón de su modo o la mezcla con la de otro? Si la mezcla, no entra.

Referentes: Dead Cells (la meta no te hace más fuerte dentro de la run) y los gacha (la estrella/ascensión abre el tope de nivel).

## Reglas comunes
- Un solo motor con **poder fijo**: nivel por héroe, rango, estrellas y equipo. No cambia dentro del dungeon.
- Se quitan las **mejoras de nivel dentro de la run** y **todas las reliquias**.
- **1 vida en todos los modos**: perder una pelea termina el intento.
- Se quita la **run clásica** como modo propio.
- Un solo set de ítems: el de la colección. El botín no da poder durante el intento.
- Nomenclatura: el código sigue diciendo `run`; la interfaz puede hablar de "intento" o "etapa". Renombrar código no es parte de esta propuesta.

## Lógica por modo

### Dungeons: campaña de progreso
- Rangos F a SSR. Desbloquear el siguiente = **solo limpiar** el anterior (sin requisito de vidas).
- **Ascensión 0-5 se mantiene** (por dungeon: limpiarlo en el nivel N abre el N+1 para todos sus niveles; +% de monedas y botín por nivel como hoy). **Al subir la ascensión cambia el elemento de cada nivel** (y el del jefe final, que existe en los 5 elementos); el **tipo de pieza que suelta cada nivel no cambia**. Así los mismos niveles se rejuegan con otros héroes y el casco de un nivel siempre sale de ese nivel. El elemento nuevo se sortea por semilla (dungeon, nivel y ascensión), siempre distinto al de la ascensión anterior. La tabla de jefes (elemento por jefe) vale para ascensión 0.
- **Reglas de ascensión a reescribir** (varias dependían de fogatas, peleas difíciles y vidas, que ya no existen). Propuesta: L1 enemigos +12% vida y +5% ataque (acumulable por nivel, como hoy); L2 la curación entre peleas baja a la mitad; L3 los grupos de peleas normales suman un enemigo más (máx. 3); L4 los jefes atacan dos veces; L5 sin curación entre peleas. (decidido).
- Dificultad **fija y suave por rango**, con jefes como picos, calibrada contra el poder permanente.
- EXP del héroe por pelea y por nivel limpiado (solo Dungeons da EXP por ahora). Sin ranking.
- Repetir niveles ya limpiados = farmeo: paga 60% con decaimiento diario por niveles (ver "Economía").

#### Estructura: niveles individuales (decidido)
- Cada rango es una **lista de niveles**; cada nivel es una **secuencia corta de peleas con la vida arrastrada** (sin puertas, sin descanso, sin mochila, sin "cobrar o seguir").
- **Cada rango es un dungeon con su propio escenario** (mundo = rango; el arte de fondos ya lo hace así). Cada dungeon es una lista de niveles.
- **Cuántos niveles por dungeon: crece con el rango** (más contenido en los altos): F 6, E 6, D 7, C 8, B 8, A 9, S 10, SS 11, SSR 12 (77 en total; valores de partida). Cada nivel es un intento aparte: perder solo repite ese nivel, así que más niveles es más contenido, no más riesgo.
- **Largo de cada nivel: 2, 3 o 5 peleas, mezclado y NO ligado al rango** (aprox. 30% de 2, 40% de 3, 30% de 5; el orden es distinto en cada dungeon y se fija una vez por semilla del rango). Ejemplo F: 3, 2, 5, 3, 2, 3 (+ final de 5). El largo se muestra antes de entrar.
- **La última pelea de cada nivel es un jefe de nivel** (una **élite**; el arte de élite de las 5 familias ya existe). Cuenta dentro del largo: 2 = 1 pelea + jefe, 3 = 2 + jefe, 5 = 4 + jefe.
- **Jefe final de rango:** el último nivel de cada rango **siempre dura 5 peleas** y cierra con uno de los **9 jefes con nombre** (arte ya importado en `public/art/enemies/boss_*`, 5 elementos y 5 animaciones, hoy sin usar en el código). Limpiarlo desbloquea el siguiente rango y paga el cofre de primera limpieza. Reemplaza al jefe final ×1.25 de hoy.
- **Criaturas mezcladas:** dentro de un nivel no hace falta que todas sean de la misma familia (cada mundo: 2-3 familias principales + 1 invitada).
- **Vida:** curación pequeña (~10%) después de cada pelea, en todos los niveles.
- **Pago:** al limpiar el nivel, con el presupuesto de botín por rango (reparto por pelea; los niveles de 5 pagan más y cada pelea es algo más suave).
- Niveles generados con **semilla fija por rango e índice** (sin escribirlos a mano).
- Las **estrellas de objetivo** (3 objetivos opcionales por nivel, una sola vez cada una) quedan para una segunda fase.

#### Elementos: obligar a rotar de héroe (decidido)
- **Cada nivel tiene su propio elemento dominante** (no el mundo): dentro de un mismo mundo ya hay que rotar. El jefe de nivel lleva el elemento dominante.
- **Mezcla, no pared:** dominante ~60% de las peleas en rangos bajos y ~80% en los altos; el resto, otros elementos. Hay un héroe ideal, pero ningún nivel es imposible sin él.
- **Se ve antes de entrar:** cada nivel muestra sus elementos y la pantalla de elegir héroe marca cuál tiene ventaja (hoy solo ordena por poder).
- **Cuidar el inicio:** la meta es que el **día 1, cuando un jugador nuevo empieza a jugar**, pueda hacer **al menos 3 o 4 tiradas** probando los modos (5 con suerte), para tener algo de variedad de elementos desde el comienzo; en F y E el elemento pesa menos. "Tiradas" = **tiradas de 10** (×10 = 2.250 monedas con el descuento actual). Meta del día 1: 3-4 tiradas de 10 = ~6.750-9.000 monedas (5 = ~11.250), es decir 30-50 tiradas sueltas. Hoy el inicio da 500 monedas, así que la diferencia (~6.000-8.500) sale del **progreso del día 1** (cofres de primera limpieza de F, E y D, misiones), no de un bono de regalo, con un **tutorial corto** que lo guía (ver "Economía": simulación 31 tiradas el día 1).
- **Pity (decidido):** solo SSR a las 250 tiradas; ver "Economía".
- Efecto buscado: no se puede farmear un nivel o mundo con un solo héroe; la colección importa.

#### Jefes finales y familias por dungeon (decidido)
Cada jefe con nombre existe en los 5 elementos, así que su elemento no depende del tema: se reparte casi parejo (agua 2, fuego 2, viento 2, tierra 2, rayo 1). El último nivel del dungeon tiene el elemento del jefe como dominante. Los primeros 5 dungeons enseñan los 5 elementos uno por uno.

| Dungeon | Escenario | Jefe final (arte `boss_*`) | Elemento | Familias principales | Invitada |
|---|---|---|---|---|---|
| F | Pantano | Señor de las Moscas (`lord_of_flies`) | Agua | Limo, Espectro | Diablillo |
| E | Cumbres | Rey de Ceniza (`ash_king`) | Fuego | Diablillo, Gólem | Limo |
| D | Cañón | Vigía Eterno (`eternal_watcher`) | Viento | Arpía, Diablillo | Gólem |
| C | Cavernas | Coloso Hueco (`hollow_colossus`) | Tierra | Gólem, Limo | Espectro |
| B | Tormenta | Rey del Trueno (`thunder_king`) | Rayo | Espectro, Arpía | Gólem |
| A | Dungeon A | Madre Hidra (`mother_hydra`) | Agua | Diablillo, Espectro | Gólem |
| S | Dungeon S | Reina Marchita (`withered_queen`) | Tierra | Gólem, Arpía | Limo |
| SS | Dungeon SS | El Sin Rostro (`faceless_one`) | Fuego | Espectro, Limo | Diablillo |
| SSR | Dungeon SSR | Gran Devorador (`great_devourer`) | Viento | Las cinco por igual | — |

- Orden de menos a más imponente (por nombre y papel de cierre; el último pega ×1,25 hoy, se recalibra contra poder fijo). Las élites de cada nivel salen de las familias del dungeon y suben suave dentro de él. Asignación por nombre, sin descripciones del arte: revisar a ojo.

#### Botín por nivel: dirigido (decidido)
Referencias: Summoners War y Genshin dan 1 pieza garantizada al final de la etapa; Honkai Star Rail ata cada cueva a sets concretos; la práctica general es garantizar el drop del jefe y no depender de una tirada por pelea.
- **Pago al limpiar el nivel** (no al azar durante él). Cada nivel **anuncia antes de entrar** qué tipo de pieza suelta (casco, peto, piernas, zapatos, collar o arma) y su **elemento es el elemento dominante del nivel**.
- **Niveles de 3 y 5 peleas** (y el jefe final): **1 pieza garantizada** (sin elegir entre varias), más **30% de una segunda** y **5% de una tercera** (valores de partida, a medir). **Niveles de 2 peleas:** solo partes y núcleos.
- **Rango de la pieza:** el del dungeon o inferior (cada escalón la mitad de probable, como hoy), con un % de **un rango más** (valor de partida a medir; hoy 6-30% según la fuente).
- Puntos de partes y núcleos por pelea (valores de partida; mantienen el ritmo actual de botín por minuto): normal 1,0 × (1 + 0,1 × índice del rango); jefe de nivel (élite) ×2; jefe final ×4; +10% por nivel de ascensión. Partes y núcleos se reparten al azar al limpiar.
- Se quitan las peleas "difíciles", los cofres y el bono de riesgo.
- Volumen de piezas en repeticiones: ver "Economía" (decidido).

#### EXP del héroe por pelea (aceptado como valores de partida; se ajustan al probar)
- La **torre da poca EXP** (una fracción de la de Dungeons, valor a medir, ej. 25%); las salas no dan.
- Costo de subir al nivel L = 10 × (L − 1)² EXP; la curva equivale a ~12.000 EXP por hora de juego, constante en todos los tramos.
- ~100 EXP por pelea normal; jefe de nivel ×2,5; jefe final ×5; +25% al limpiar el nivel. **Igual en todos los dungeons** (así se cumple la tabla de horas). Supuesto sin medir: ~60 peleas por hora. Si se pierde un nivel se conserva la EXP ganada. Consecuencia aceptada: farmear dungeons bajos es lo más cómodo para subir de nivel; si molesta, subir la EXP en los altos.

### Torre semanal: competir durante la semana
- Infinita; misma semilla semanal; gana quien llega más lejos. Desempate: **menor tiempo total**.
- Dos rankings: **nivelado** (habilidad) y **colección** (poder completo).
- Premios por piso (ciclo de 10): 1-4 y 6-9 normal, 5 medio, 10 grande. Cada piso se cobra una vez por semana.
- Ranking semanal acumulado (B). **Premio diario a las 21:00 (hora Argentina, UTC−3 fijo)** al #1 de cada ranking. Si alguien lidera desde el lunes cobra toda la semana; es intencional (motiva a superarlo y no es obligatorio jugar la torre).
- Dificultad: **exponencial como hoy** (`FLOOR_SCALE^piso`), con escalón cada 5 y sala de jefe cada 10.
- Premios: ver "Economía → torre". Los pisos de la torre y de las salas conservan su generación por semilla (familias y elementos como hoy); corren sobre el motor nuevo (1 vida, curación ~10% entre peleas, sin reliquias ni mejoras).

### Salas (viernes): la noche social
- Todos juntos piso a piso; ronda de 10 pisos con jefes en 5 y 10; héroe elegido por ronda; nivelado o poder completo.
- Lo central: apuestas, interferir, ayudar, jefe cooperativo y ranking de la noche.
- No pagan nada fuera de la sala: solo fichas y títulos de la noche.
- Dificultad: la del rango de la sala, pensada para que con 2 a 7 jugadores casi todos lleguen al piso 10 y los jefes den la tensión.

## Progresión del héroe (decidido)
- **Decidido: el rango manda** (opción A). El rango es el eje de la **suerte** del gacha (multiplicador algo más empinado que hoy, ej. F ×1,0 → SSR ×3,0, a ajustar); estrella y nivel son el eje del **esfuerzo** y su aporte es moderado: un SSR nuevo debe superar a un F al máximo.
- **Decidido: el rango también da algo cualitativo** (rasgos o habilidades), que el nivel y la estrella no dan. Es la clave para que un rango bajo trabajado se iguale en números pero no en versatilidad.
- Efecto: la tercera habilidad de clase hoy se desbloquea al nivel 5 **de la run**; al pasar el nivel al héroe hay que redefinir cuándo se desbloquea.
- **Decidido, qué da el rango (cualitativo):**
  - **Rasgos:** F-D 1 rasgo; C-A 2 rasgos; S-SSR 2 rasgos con **un rasgo de regla garantizado** (los rasgos de regla alteran el motor de combate: daño crítico, reducción a vida baja, espinas, dispersión; solo hay 4, no dependen de reliquias ni mejoras). No hay pasiva extra.
  - **Habilidades:** C-SSR tienen la tercera habilidad desde el inicio; F-D la **abren a las 3★** (la estrella le da otro propósito a los duplicados).
  - **Definitiva:** una segunda fase, solo SSR; ver pendiente.
- **Modo nivelado:** rasgos y habilidades por rango siguen aplicando (son "estilo"), pero cualquier efecto fuerte (definitiva) se topea o se apaga en nivelado.
- **Decidido:** la tercera habilidad se **elige 1 de 2 y se guarda en el héroe**, **cambiable sin costo** antes de entrar a un nivel (decisión previa, como elegir héroe por elemento). Cambio técnico: hoy la elección vive en la run (`pendingSkill`, acción de replay `{t:"skill"}`, `char.skill` no se guarda en la colección); pasa a ser un campo del héroe de la colección (migración aditiva) y viaja en el json del héroe como la ascensión. El combate (`combat.ts`, `skills.ts`) no cambia.
- **Para más adelante (fase 2, no ahora):** SSR como personajes propios (nombre, clase y elemento fijos, habilidad firma, por banner, junto con "Crear legendario") y la habilidad definitiva. Hoy el SSR sigue siendo una tirada al azar que se distingue por multiplicador, rasgo de regla garantizado y tercera habilidad desde el inicio.
- **Decidido, tope y aporte del nivel (valores de partida, se ajustan con el simulador):**
  - Tope de nivel = **20 + 10 × estrellas** (0★ = 20 … 5★ = 70); lo fija la estrella, no el rango.
  - Multiplicador de nivel = **1 + 1% × (nivel − 1)** (nivel 70 = ×1,69).
  - Multiplicador de rango más empinado: F 1,0 · E 1,15 · D 1,3 · C 1,5 · B 1,75 · A 2,0 · S 2,35 · SS 2,65 · SSR 3,0. Estrella +10% cada una (hasta ×1,5).
  - Resultado: SSR nuevo (≈3,6) > F al máximo (≈2,5); F al máximo ≈ entre A y S nuevos; SSR al máximo ≈ 7,6 (sin equipo). Esfuerzo total ×2,5 vs suerte ×3,0.
- **Decidido, curva de EXP:** cuadrática (costo de cada nivel ∝ nivel²), calibrada con la meta de **2 horas de juego al día**: nivel 20 ≈ 2 h (día 1), 30 ≈ 7 h, 40 ≈ 17 h, 50 ≈ 33 h, 60 ≈ 57 h, 70 ≈ 90 h acumuladas (≈ 1, 3,5, 8, 16, 28 y 45 días). La exponencial actual se descarta. Falta medir cuánta EXP da cada pelea y cada nivel, y si los dungeons altos dan más.
- **Decidido, EXP extra para héroes bajos (A):** ×2 de EXP si el héroe está 10+ niveles por debajo de tu héroe de mayor nivel, ×3 si son 20+ (bandas de partida, a medir); se corta en el tope de nivel del propio héroe. Motivo: los elementos obligan a rotar de héroe y cada uno se usa menos. Opción B (brecha con el tope de su estrella) queda como ajuste posible si los héroes con muchas estrellas se atrasan.
- **Decidido, estrella (A):** la estrella se sube siempre (el duplicado exacto suma al instante, como hoy). El "gate" ya existe: la estrella solo abre niveles y esos niveles se ganan jugando. No se guardan duplicados pendientes.

## Equipo con variación y stats (decidido)
Referencias: Genshin, Epic Seven y Summoners War usan subestadísticas al azar; AFK Arena es más estructurado. Críticas comunes: "despair" de farmeo cuando todo es azar (ver análisis de sustats).
- **Decidido:** cada pieza tiene una **stat principal fija por tipo** (como hoy) cuyo **valor varía ±15%** (mejor o peor tirada). El **rango suma líneas extra** (como hoy, 1 en C, 2 en A y 3 en SS), pero **cuáles** salen al azar de una lista de 4-5 por pieza, cada una con su valor variable.
- **Decidido:** la tirada al azar aplica a **toda obtención de equipo**: drop de niveles y tirada de gacha **incluida la forja "Armar"** y fusionar piezas (cada pieza forjada trae su propia tirada y líneas; forjar la misma pieza otra vez suma estrella y conserva la mejor tirada, así que repetir también sirve para mejorar la tirada).
- **Decidido:** un duplicado exacto (mismo tipo, elemento y rango) suma la estrella y **conserva la mejor tirada** de las dos, automáticamente.
- **Decidido, conjunto de 8 stats** (referencia: 3-6 atributos principales, cada uno con efecto claro; el resto aparece en equipo y rasgos): **primarios** Vida, Ataque, Defensa, Velocidad; **secundarios** Crítico, **Daño crítico** (nuevo; base ×1,5, Pícaro ×2,0), Esquive, Precisión. Se elimina **Huida**.
- **Decidido, defensa:** pasa de resta fija (`ataque × poder − def × 0,5`) a **reducción en porcentaje** `def / (def + K)`, con K calibrado (~30-40% contra enemigos de su nivel) y tope de 75%. Se mide en la recalibración y sube `ENGINE_VERSION`.
- **Decidido, Huir:** se **quita la acción Huir** del combate; abandonar un nivel desde el menú cuenta igual que perderlo (se conserva la EXP ganada).
- **Líneas extra de equipo** (solo en piezas): **daño crítico**, **robo de vida** y **regeneración por ronda**, con topes duros (valores en "Regla anti paladín" más abajo, ya revisados).
- **Decidido, casco distinto de peto.** Stat principal por pieza y lista de líneas extra posibles (cada pieza usa de 0 a 3 según el rango):
| Pieza | Principal | Pool de líneas extra |
|---|---|---|
| Casco | Vida | Precisión, Crítico, Daño crítico, Defensa, Esquive |
| Peto | Defensa | Vida, Regeneración, Esquive, Robo de vida, Velocidad |
| Piernas | Ataque | Crítico, Daño crítico, Precisión, Velocidad, Robo de vida |
| Zapatos | Velocidad | Esquive, Vida, Ataque, Regeneración, Crítico |
| Collar | Crítico | Daño crítico, Precisión, Ataque, Velocidad, Robo de vida |
| Arma | Ataque (plano) | Sin líneas por ahora (su tipo ya da un extra) |

#### Revisión numérica de topes y sets (hecha con `gear.ts`)
Con un set de 6 piezas del elemento del héroe (afinidad ×1,5), el bono del set solo ya iguala o supera los topes de equipo vigentes: **rayo** (crítico 22,5% vs tope 20%) y **viento** (velocidad 36% vs tope 30%) los superan **desde rango C sin estrellas**; **fuego** supera el tope de ataque (60%) desde S; **agua**, desde A con 5★. En el rango máximo todo satura (SSR 5★: ataque 86%, vida 142%, crítico 38%, velocidad 61%). Efecto: parte del equipo y de las tiradas de ±15% se desperdicia. Corrección propuesta (a validar con el mismo cálculo): **bajar los sets ~40%** (fuego +6/12/18% ataque; agua +8/16/24% vida y regeneración; tierra +8/16/24% defensa; viento velocidad +5/10/15% y esquive +1,5/3/4,5%; rayo crítico +3/6/9% y daño crítico) y **subir los topes** de crítico (a ~0,30) y velocidad (a ~0,45) y dar holgura a ataque y vida. Es normal que el equipo máximo (SSR 5★) sature algo.

#### Sets de elemento (el bono de cada elemento)
Ya existen (2, 4 y 6 piezas, arma incluida; ×1,5 si el set es del elemento del héroe). Objetivo: conseguir todo el equipo más fuerte de **tu** elemento y tener el bono de 6. Se actualizan a los 8 stats:
| Elemento | Bono (2 / 4 / 6 piezas) |
|---|---|
| Fuego | Ataque +6 / +12 / +18% |
| Agua | Vida +8 / +16 / +24% y regeneración (nueva) |
| Tierra | Defensa +8 / +16 / +24% |
| Viento | Velocidad +5 / +10 / +15% y esquive +1,5 / +3 / +4,5% |
| Rayo | Crítico +3 / +6 / +9% y daño crítico (nuevo) |
(valores revisados, antes 10/20/30% ataque, vida y defensa; viento 8/16/24%; rayo 5/10/15%)
El "set de estilo" es la **resonancia de estilo** (abajo), que cuenta líneas y no agrega etiquetas a las piezas.

#### Estilos de pelea: 2 por clase = las dos terceras habilidades
Cada clase ya elige 1 de 2 terceras habilidades; esas dos opciones son los dos estilos (8 en total, sin sistema nuevo). Nombres de partida (a ajustar):
| Clase | Estilo A (habilidad) | Estilo B (habilidad) |
|---|---|---|
| Caballero | Muralla (Contraataque): tanque | Vanguardia (Barrido): daño en área |
| Mago | Tempestad (Tormenta): daño en área | Arcano (Escudo arcano): defensivo |
| Pícaro | Danzante (Golpe doble): ritmo | Verdugo (Ejecutar): remate |
| Clérigo | Sanador (Santuario): cura | Inquisidor (Castigo): daño y robo de vida |
La ficha del héroe muestra su estilo (por la habilidad elegida) y una etiqueta automática de **build** según el grupo de stats que domine su equipo (tanque, daño, crítico/evasión, sostén).

#### Resonancia de estilo (fase 1; es el "set de estilo", sin segunda capa de piezas)
Los sets de elemento van por la etiqueta de elemento de cada pieza; la resonancia va por las **líneas** que lleva el equipo, así que **no agrega etiquetas ni piezas nuevas**. Cada stat pertenece a un solo grupo:
| Grupo (build) | Stats que cuentan | Estilos de héroe que lo aprovechan |
|---|---|---|
| Tanque | Vida, Defensa | Muralla, Arcano |
| Daño | Ataque, Precisión, Velocidad | Vanguardia, Tempestad |
| Crítico y evasión | Crítico, Daño crítico, Esquive | Danzante, Verdugo |
| Sostén | Regeneración, Robo de vida | Sanador, Inquisidor |
- Solo cuentan las **líneas extra** del equipo puesto (las principales son fijas por tipo y no son una elección). Por **proporción**, no por cantidad fija (con equipo SSR hay ~15 líneas y un umbral fijo activaría los cuatro grupos a la vez): un grupo con **≥ 40%** de las líneas extra (y al menos 2) da el bono chico y con **≥ 60%** el mayor (Sostén, con menos fuentes, **30% y 50%**). Con equipo F-D (sin líneas extra) no hay resonancia. Valores de partida revisados: Tanque −4% / −8% de daño recibido; Daño +5% / +10% de daño; Crítico y evasión +0,1 / +0,2 al multiplicador de crítico (de ×1,5 a ×1,6 / ×1,7); Sostén +0,5% / +1% de vida regenerada por ronda. Todo entra en topes globales.
- **×1,5 si el grupo coincide con el estilo del héroe** (igual que la afinidad de los sets de elemento).
- Efecto anti "paladín": repartir líneas entre grupos baja la resonancia de todos.

#### Equipos guardados: fase 2 (no en la fase 1)
Se deja para después (hasta 3 por héroe, con nombre, aplicar con confirmación al tomar piezas de otros héroes). Revisión ya hecha: se guardan como claves tipo+elemento+rango, que no se rompen por las tiradas.

#### Autoequipar (desarrollado)
Hoy `autoEquipPlan` es voraz: por casilla elige la pieza que más sube el poder del héroe (cuenta sets de elemento) y nunca toma piezas de otros héroes. Tres modos:
- **Por poder** (el actual).
- **Por set del elemento:** por casilla, la mejor pieza **del elemento del héroe** si la tiene; si no, la de más poder. Apunta al bono de 6.
- **Por estilo:** por casilla, la pieza con mayor puntaje usando los stats del grupo del estilo del héroe (la tabla de arriba) y desempata por poder.
- Opción "**tomar de otros héroes**" (apagada por defecto): si se activa, puede mover piezas de otros héroes, mostrando cuáles.

#### Al entrar a un nivel (fase 1)
Pantalla de preparación del nivel, en pasos cortos:
1. **Confirmas el héroe** (lista ordenada por ventaja de elemento del nivel y por poder).
2. **Confirmas el equipo:** resumen del héroe con sus 6 casillas, stats totales, sets de elemento y resonancia activos.
3. Desde ahí, tres opciones: **Autoequipar** (selector de modo y vista previa de los cambios antes de aplicar), **cambiar una casilla** (lista de las piezas disponibles de ese tipo, ordenadas por mejora) o **abrir el inventario completo del héroe** (el editor de equipo actual).
4. **Entrar al nivel.**

#### Pools (revisado)
Estructura cerrada; los números se ajustan al medir. Cobertura por grupo: Tanque (casco, peto, zapatos), Daño (piernas, zapatos, collar y el arma), Crítico y evasión (casco, piernas, zapatos, collar), Sostén (peto, piernas, zapatos, collar; Regeneración solo en peto y zapatos a propósito, para que sea escasa). Falta fijar el valor base de cada línea nueva (regeneración, robo de vida, daño crítico) al afinar con el simulador.

- **Regla anti "paladín que se pasa el juego solo":** ningún estilo cubre todo. Lo evitan: (1) cada pieza trae como máximo 3 líneas extra; (2) topes duros por categoría (valores de partida revisados: regeneración de equipo ≤ 2% de la vida por ronda, robo de vida ≤ 15% del daño, **tope global de curación pasiva ≤ 6% de la vida por ronda** sumando Clérigo, equipo y resonancia (sin contar habilidades activas), daño crítico de equipo ≤ +0,5 al multiplicador, reducción de daño de pasiva + resonancia ≤ 25%); (3) el enrage tras el turno 40; (4) las reglas de ascensión (L2 reduce la curación a la mitad y L5 la quita); (5) un mismo equipo no sirve igual en todos los elementos.
- **Riesgos y cómo se miden:** balance con `scripts/build-env.ts` y `run-sim.ts` (build extrema por estilo contra los mismos niveles; aceptable si ninguna limpia mucho más que el promedio, ±10 puntos a ajustar). Gestión: se rota de héroe, no de equipo, y se autoequipa al entrar. Modo nivelado: no usa equipo, no hay estilos ahí.

## Economía (decidido)
Referencias de ingreso gratis: Genshin ~66-74 tiradas por versión de 6 semanas (~12 por semana); HSR: recursos sobre todo de un solo uso. Sin tope de saldo (se puede acumular); sin tope duro de ganancia diaria, solo decaimiento suave; topes de seguridad anti-trampa (máximo por run en `bank_run`, límites de ritmo) reexpresados en niveles.

**Decidido, ingreso en régimen (opción B):** ~1.250 monedas por día para un jugador de ~2 horas (≈ 5 tiradas por día, ≈ 35 por semana, ~3× Genshin). Se ajusta con datos reales tras el primer viernes.

**Decidido, tres capas de pago** (valores de la simulación B, a afinar):
| Capa | Regla |
|---|---|
| Nivel nuevo | Paga **100%**, una sola vez, fuera del decaimiento (también cada ascensión nueva) |
| Nivel repetido | **60%** de base, con decaimiento por niveles repetidos del día: 1-20 al 100% de ese 60%, 21-40 al 50%, 41-80 al 20%, desde 81 al 10% |
| Cofre de primera limpieza | Al limpiar el último nivel de un dungeon o de una ascensión nueva |
- **Pago por nivel casi plano** entre rangos (F 25 a SSR 36): los rangos altos premian con botín (partes, núcleos y piezas), no con monedas. Sin el pago creciente de hoy (×1,35 por rango), que hacía ganar ~125 tiradas por semana en SSR.
- **Cofres de primera limpieza:** F 1.000, E 1.600, D 2.500 (financian el día 1), luego más chicos: C 1.200, B 1.500, A 2.000, S 2.500, SS 3.000, SSR 4.000.
- **Misiones −45%** (son la fuente fija mayor, ~1.170 por día junto con la tirada gratis): diaria 500 → 275, semanal 1.250 → 700, evento 1.000 → 550 (tramos definidos más abajo). **Tirada gratis diaria:** 250. **Torre:** ~100 por día en promedio (premios más abajo; la simulación usó 50, efecto +4%).
- El decaimiento por niveles reemplaza al decaimiento por run (`economy.ts`): 2 h = 1,0; 4 h ≈ 1,4; 8 h ≈ 1,7; 16 h ≈ 2,2 (supuesto: ~15 niveles por hora, sin medir).

**Resultado de la simulación (42 días, 2 h por día, 30 niveles diarios):**
| | Hoy (pago creciente, misiones actuales) | Propuesta B |
|---|---|---|
| Día 1 | 33,5 tiradas | **31 tiradas** (meta 3-4 tiradas de 10) |
| Días 2-7 | 131 | 54 |
| Régimen sin cofres | 125 por semana | **36 por semana** |
| Acumulado día 14 / 30 / 42 | 299 / 751 / 988 | 136 / 260 / 329 |
Limitaciones: es un modelo, no una medición; supone 15 niveles por hora y que se limpian todos los dungeons sin trabas (SSR el día 22, optimista); no incluye ascensiones, gastos de forja ni la torre real. Con B se llega a las 200 tiradas del pity SSR hacia el día ~22.

**Decidido, pity (opción C, umbral 250):** queda **solo el pity de SSR**, garantizado a las **250 tiradas sin SSR** (por banner: personajes y equipo por separado); se **quitan los pity de SS (100) y de S**. Razón: con ~36 tiradas por semana, sin pity 34% no vería un SSR en 6 semanas (SS 3,8%, SS o mejor 1,2%), y el rango es el eje de la suerte (SSR ×3,0), así que ahí es donde el pity mantiene parejos a los amigos. Con 250: ~28% llega al pity, media ≈ 143 tiradas (~4 semanas), máximo ≈ 7 semanas (con 200 serían ~127 y 5,6). El umbral es una constante y se revisa con datos reales tras el primer viernes. Técnico: la columna `pity` (SS) queda sin uso; `pity_ssr` se conserva (los contadores existentes no pierden progreso porque el umbral sube a 250); `apply_pull` cambia por migración aditiva.

**Decidido, forja:**
- **Costos en monedas: se mantienen** (`COMBINE`, `craftCoins`, `refineCoins`). Una pieza SSR por fusión pura cuesta ~31.000 monedas, ~62% de una copia SSR en el gacha (50.000; con pity de 250 en tiradas de 10, ~56.000). Con ingreso B esas monedas casi no pesan (armar F-B <1% de un día; SSR 40%; fusión SS→SSR 80%); lo que limita es el **volumen de partes**.
- **Botín en repeticiones:** primera limpieza = pieza garantizada y extras (como definido). **Repetición:** la pieza deja de ser garantizada y pasa a **25% por nivel** de 3 o 5 peleas; partes y núcleos al **60%**; todo con el mismo decaimiento diario que las monedas (hoy el decaimiento solo recortaba monedas). Resultado esperado: ~3-4 piezas por día (~25 por semana) para un jugador de 2 horas, contra ~20 por día sin esta regla.
- **Desmontar y refinar:** se mantienen (desmontar = 2 partes + 1 por estrella; 3 partes de un rango → 1 del tipo elegido).

**Decidido, quemar:** permanente **8%** del valor de intercambio del rango (solo por rango, sin estrellas; héroes y equipo; a una tirada de 225 siempre se pierde algo, sin ciclo de ganancia); **reconversión única 50%** solo para lo anterior al cambio (marcado "legado").

**Decidido, mercado:** se mantiene la equivalencia por rango ±25% (las tiradas de ±15% del equipo caben en la tolerancia, no se valora por tirada). Ajuste: el valor de una copia **SSR pasa de 50.000 a 36.000** (con pity de 250 cuesta de media ~143 tiradas); el resto de `TRADE_VALUE` se mantiene.

**Decidido, torre (premios):**
| Premio | Valor |
|---|---|
| Piso normal (1-4, 6-9) | 5 monedas |
| Piso medio (5) | 100 monedas + 1 núcleo |
| Piso grande (10) | 250 monedas (= 1 tirada) + 1 núcleo |
| Diario, #1 de cada ranking (21:00 ART) | 250 monedas + 1 núcleo + título "Rey de la torre" |
| Semanal, top 3 de cada ranking | 300 / 200 / 100 monedas + núcleos 2 / 1 / 1 (como hoy) |
| Prestigio | Insignias "Torre 10 / 20 / 30" en el perfil |
Cada piso se cobra una vez por semana; el ciclo de 10 pisos se repite. Presupuesto de la torre ≈ 100 monedas por día en promedio (era ~50; +4% del ingreso total).

**Decidido, misiones por tramo** (el último tramo es una tirada completa; los primeros dan cosas para la forja; suman −45% en monedas):
| | Tramo 1 | Tramo 2 | Tramo 3 | Monedas totales |
|---|---|---|---|---|
| Diaria | 2 partes | 1 núcleo | 250 monedas (1 tirada) | 250 |
| Semanal | 100 monedas + 3 partes | 100 monedas + 1 pieza | 500 monedas (2 tiradas) + 1 núcleo | 700 |
| Evento Viernes | 50 monedas | 100 monedas | 400 monedas + 1 núcleo | 550 |
(la pieza semanal es del rango del mejor dungeon del jugador; las partes y núcleos son ~2% del botín diario).

**Decidido, cofres de ascensión:** **50% del cofre original del dungeon, plano**, por cada nivel de ascensión nuevo (5 niveles = 2,5 veces el cofre; ~48.000 monedas en total entre los 9 dungeons, ~214 tiradas repartidas en ~35 horas de juego).

**Decidido, tutorial del día 1 (corto):** la cuenta nueva empieza con **un héroe inicial** de la clase que elija (rango F, elemento al azar) y su arma. Pasos: (1) nivel 1 de F con combate guiado (botones, defender, guardia perfecta); (2) equipar el arma inicial; (3) limpiar F (cofre de 1.000); (4) primera tirada de 10 con las monedas del cofre y las del inicio; (5) tutorial de forja existente; (6) misiones. No regala monedas extra: el dinero del día 1 sale de los cofres de F, E y D (5.100 en total).

**Economía: sin pendientes de diseño.** Quedan por validar con el simulador y con datos reales (primer viernes): ritmo de niveles por hora, tasas de limpieza por poder, valores de los cofres y del pago por nivel, y el efecto de las ascensiones.

## Consecuencias a vigilar
1. **El resultado se decide antes de entrar.** Si el héroe no alcanza, no hay táctica que lo salve; la tensión queda en la ejecución del combate.
2. **Se eliminan puertas, tienda, descanso y eventos en Dungeons.** Con niveles fijos no encajan; las decisiones pasan al armado del héroe, al elemento y al combate.
3. **Rejugabilidad:** repetir una etapa limpiada solo sirve para farmear. Hay que asegurar que el farmeo no aburra y que la forja y el gacha den razones para volver.
4. **El balance se reinicia.** Hay que recalibrar con `run-sim.ts` (pocas iteraciones) y subir `ENGINE_VERSION`.
5. **Datos existentes:** ver "Migración de datos guardados".

## Migración de datos guardados (decidido)
- **Dungeons limpiados y ascensiones: se reinician** (como en v7.0), porque la estructura es nueva.
- **Runs a medias:** se cierran al migrar y se entrega lo que ya estaba asegurado por jefe.
- **Torre de la semana en curso:** los puntajes se archivan y la torre arranca limpia con el motor nuevo.
- **Héroes y equipo existentes:** no se borran. Los héroes nacen en nivel 1 y se ponen al día con el EXP extra. Su poder cambia porque cambian los multiplicadores de rango y entra el nivel.
- **Quemar (decidido: 8% permanente y 50% de reconversión única):** convertir héroes y equipo en monedas. Verificación del tope: el valor esperado de una tirada es `2250 × f` si se quema a una fracción `f` de `TRADE_VALUE` (suma de p × 250/p sobre 9 rangos); una tirada suelta cuesta 250 (equilibrio f ≈ 11%) pero **en tirada de 10 cuesta 225 (equilibrio f = 10%)**, y el pity eleva algo el valor esperado. O sea, **10% es exactamente el punto de equilibrio, no un margen**. Dos tasas: (1) **quema permanente ≤ ~8%** de `TRADE_VALUE` (siempre se pierde algo, no hay ciclo); (2) **reconversión única** para lo que ya existía antes de la migración (marcado como "legado"), con una tasa mucho más generosa, **decidida en 50%** de `TRADE_VALUE` (sin precedente exacto: la conversión de duplicados en otros gachas es de pocos %, las compensaciones por nerf se proponen en 50-75% y los reembolsos totales son 100%; aquí nadie pierde poder porque los multiplicadores nuevos son iguales o mayores, y el stock es finito). El equipo ya tiene "desmontar" (en partes); quemar sería la opción en monedas.
- **Héroes y equipo anteriores al cambio (decidido, opción Y):** se dejan como están, sin igualarlos ni darles ventajas; su única diferencia es que los rasgos de los héroes viejos son los que ya tenían (los S-SSR viejos pueden no tener rasgo de regla). Razón de reconvertirlos: cobertura de elementos (la colección vieja es al azar y el juego nuevo pide rotar) y la reconversión al 50%. Sin ventana de tiempo por ahora.
- Modo nivelado y rondas de sala: usan el motor nuevo con **poder fijo**; el nivelado normaliza también el nivel del héroe (además de rango y estrellas).

## Misiones (reescritura a niveles y peleas)
Solo `floors` depende de pisos ("Supera N pisos"); el resto cuenta peleas, jefes, elemento, forja, tiradas o sala. Cambios propuestos (objetivos de partida, a medir con el ritmo real y con la economía):
| Misión | Hoy | Nueva |
|---|---|---|
| Pisos | Diaria 8 / semanal 60 "Supera N pisos" | **"Limpia N niveles"**: diaria 3 / semanal 20 |
| Peleas | Diaria 5 y 10 / semanal 40 | Diaria 15 y 30 / semanal 150 (se juegan ~60 peleas por hora) |
| Jefes | Diaria 1 / semanal 6 "Vence a N jefes" | "Vence a N jefes de nivel": diaria 3 / semanal 20 (cada nivel tiene uno) |
| Dungeon | Diaria 1 / semanal 4 "Limpia N dungeons" | Se quita la diaria; semanal "Limpia 1 dungeon" (un dungeon es una pasada de 6-12 niveles) |
| Elemento | Diaria 3 / semanal 15 "peleas con héroe de {p}" | Diaria 5 / semanal 25 (refuerza rotar héroes) |
| Forja, tiradas, sala | Sin cambio | Sin cambio |
El servidor debe contar niveles limpiados y jefes de nivel desde la repetición verificada (hoy deriva `floors`).

## Pendientes
- **Ninguno de diseño.** Quedan por medir con simuladores y con datos reales (primer viernes): ritmo de niveles por hora, tasas de limpieza por poder, K de la defensa, EXP por pelea, valores de cofres y pago por nivel, topes de equipo, resonancia y efecto de las ascensiones.
- **Fase 2 (después):** equipos guardados, SSR como personajes propios por banner ("Crear legendario"), habilidad definitiva, estrellas de objetivo por nivel, modificadores de ascensión elegibles, mapa pintado de la campaña (arte nuevo).
- **Pantalla de niveles:** se construye con el arte actual; el mapa pintado se pide aparte después.

## Plan de construcción
Ver [PLAN_RUN_V2.md](PLAN_RUN_V2.md): rama `run-v2` desde `v7.0`, desarrollo en modo local, migraciones aditivas, cortes verticales y puertas de decisión; versión **v8.0**.
