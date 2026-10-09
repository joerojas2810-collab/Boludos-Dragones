# REDISEÑO DE COMBATE — Boludos & Dragones

Fecha: 2026-10-09 · Estado: documento de trabajo para terminar en Claude Code.
Base: `CLAUDE.md` (estado vigente), `weapons.ts` (armas reales) y las conversaciones de diseño (novedad.txt, solo como inspiración, no como reglas).

## 0. Cómo leer este documento

Etiquetas de estado. Nada de lo marcado POR DEFECTO ni PENDIENTE debe pasar a `CLAUDE.md` hasta validarse.

- **[DECIDIDO]**: el usuario lo eligió explícitamente en esta sesión.
- **[POR DEFECTO]**: propuesta de Claude que el usuario no revisó fila por fila. Validar antes de implementar.
- **[PENDIENTE]**: sin decisión.
- Todos los números son valores de prueba para simulación, no cifras de balance final.

Criterio ante dudas (de CLAUDE.md): lo que genere más risas, rivalidad sana y momentos compartidos, y que mantenga parejos a quienes juegan menos.

Forma de trabajo en Code: preguntar y guiar paso a paso, commits pequeños (uno por cambio lógico), confirmar antes de acciones irreversibles (reset de base, push, migraciones), verificar con `tsc`, `eslint` y `vitest`, simulaciones pesadas solo si cambió el balance.

---

## 1. Estructura del combate [DECIDIDO]

Acciones de cada héroe:

| Acción | Origen | Notas |
|---|---|---|
| Ataque 1 | Universal | Seguro, daño estable. |
| Ataque 2 | **Clase** (1 de 2) | Se elige entre dos opciones **desde el nivel 1** (se elimina el bloqueo del nivel 5). Se cambia libremente en la pantalla de armado y queda bloqueado durante un dungeon o una sala. |
| Ataque 3 | **Arma** | Es el `special` del arma equipada (2 tipos de arma por clase). Reemplaza al rol que hoy tiene el Ataque 2. |
| Defender | Universal | Guardia perfecta contra el golpe fuerte anunciado. |

Antes (real): Ataque 2 = especial del arma, Ataque 3 = habilidad de clase al nivel 5. Se **invierten los roles** y se quita el desbloqueo por nivel. Siguen siendo 4 builds por clase (2 habilidades × 2 armas).

### Precisión y Esquive [DECIDIDO]
- **Esquive se elimina.** El rival ya no esquiva.
- **Precisión se mantiene** como riesgo de los especiales de arma (Hachazo 65 %, Cataclismo 70 %...) y como modificador de arma.
- La línea de esquive de Piernas y Zapatos se reemplaza (ver sección 8).

### Interrupción y control [DECIDIDO por ahora]
- No hay interrupción. El único control es la **Escarcha** (ralentiza).
- "Romper carga" (cancelar un ataque cargado con daño suficiente) queda reservado para cuando se definan ataques cargados con los jefes.
- Descartado: ventana de vulnerabilidad tras Guardia perfecta (devolvería un bono general de daño).

### Guardia perfecta [DECIDIDO]
- Se mantiene el −75 % de daño recibido.
- **Se elimina el +50 % general** al siguiente golpe.
- Cada clase gana un bono propio (ver sección 3).

---

## 2. Elementos

### Tabla elemental [DECIDIDO que es ciclo de 5 con 1 ventaja, 1 desventaja y 2 neutrales; dirección [POR DEFECTO]]
Multiplicadores: ventaja ×1,25, neutral ×1,0, desventaja ×0,75. Aplica igual a héroes, enemigos y jefes. Sin resistencias propias por jefe.

Dirección propuesta (coincide con las reglas del usuario: Agua vence a Fuego, pierde con Rayo, neutral con Viento y Tierra). **Verificar contra `elements.ts`.**

| Elemento | Vence a (×1,25) | Pierde contra (×0,75) | Neutral (×1) |
|---|---|---|---|
| Agua | Fuego | Rayo | Viento, Tierra |
| Fuego | Viento | Agua | Tierra, Rayo |
| Viento | Tierra | Fuego | Agua, Rayo |
| Tierra | Rayo | Viento | Agua, Fuego |
| Rayo | Agua | Tierra | Fuego, Viento |

Ciclo: Agua → Fuego → Viento → Tierra → Rayo → Agua (cada elemento vence solo al siguiente).
Nota: CLAUDE.md describía "vence a los dos siguientes". Hay que actualizarlo.
Luz y Oscuridad quedan fuera por ahora.

### Efectos elementales [DECIDIDO]
El multiplicador y el efecto especial son sistemas separados: tener ventaja no garantiza el efecto.

| Elemento | Efecto | Reglas |
|---|---|---|
| Agua · **Escarcha** | −10 % de velocidad al objetivo por acumulación | Máx. 3 (−30 %), dura 3 turnos, se renueva con cada golpe de Agua. Sin efecto extra al llegar a 3. |
| Fuego · **Quemadura** | 20 % del golpe por turno durante 3 turnos | Se renueva y acumula hasta ×2. En jefes, daño con tope en % de su vida. |
| Viento · **Impulso** | +8 % de velocidad propia por golpe | Máx. 3 (+24 %), dura 3 turnos. |
| Tierra · **Ruptura** | −8 % de DEF al objetivo por golpe | Máx. 3 (−24 %), dura 3 turnos. |
| Rayo · **Sobrecarga** | Cada 3er golpe de Rayo propio hace +40 % | Contador en el usuario; no marca al enemigo. |

Riesgos a medir en simulación: Agua y Viento dependen de la velocidad (la velocidad ya da acciones extra); equipo con ambos podría dominar.

### Preguntas de implementación
- **[DECIDIDO 2026-10-09] Qué ataques aplican efecto:** solo el Ataque 2 (especial de clase), con 2 acumulaciones por uso; Ataque 1 y Ataque 3 (arma) no aplican estados. La Sobrecarga de Rayo cuenta cualquier golpe propio y la gasta el especial de clase. Las habilidades sin golpe (Santuario, Contraataque) no aplican estados. Simulación (rango S, 8 héroes): –3 puntos de clear en promedio frente a aplicar con todos los ataques; sin clase dominante.
- (Antes pendiente) **Qué ataques llevan el elemento y aplican efecto.** Hoy "el arma fija el elemento del ataque" (del Ataque 2). Con la nueva estructura hay que decidir. Propuesta por defecto: Ataque 1, 2 y 3 usan el elemento del arma y aplican 1 acumulación.
- **Enemigos que aplican efectos al jugador** [POR DEFECTO]: solo élites y jefes, con 1 acumulación por golpe fuerte. Los enemigos normales no.

---

## 3. Clases

Los pasivos actuales se mantienen (`CLASS_PASSIVE_*` en `characters.ts`). Clase y elemento son independientes: cualquier clase usa cualquier elemento.

| Clase | Pasivo | Ataque 2 (1 de 2) | Bono de Guardia perfecta [DECIDIDO] |
|---|---|---|---|
| Caballero | −18 % de daño recibido | Barrido / Contraataque | **Reflejo**: devuelve el 40 % del daño evitado al atacante, sin tirada de acierto. |
| Mago | +55 % de ventaja elemental, +10 % crítico, −5 % daño recibido | Tormenta (×1,3) / Drenar maná | **Acumulación doble**: el siguiente golpe aplica 2 acumulaciones del efecto elemental (con Rayo, la Sobrecarga cuenta como 2 golpes). |
| Pícaro | Críticos ×2 (los demás ×1,5) | Golpe doble / Ejecutar | **Ojo certero**: +50 % de probabilidad de crítico en el siguiente golpe. |
| Clérigo | Regenera 0,5 % de vida máx. por turno | Santuario (cura 10 %) / Castigo | **Purificación**: cura el 8 % de vida máx. y limpia 1 estado negativo. |
| Berserker (nueva) | Furia, ver abajo | Desgarro / Aniquilación | **Habilidad gratis**: el siguiente Ataque 2 o 3 no cuesta vida y su enfriamiento baja 1 turno. |

Notas de balance:
- El +55 % del Mago saltaba contra 2 de 4 elementos rivales y ahora solo contra 1. [POR DEFECTO]: mantenerlo y re-medir; subirlo si queda bajo.
- Clérigo ya estaba ~10 puntos sobre el resto en S (CLAUDE.md), y Purificación lo refuerza: medir primero.
- "Drenar maná" no tiene recurso de maná en el motor: [PENDIENTE] redefinir tras leer `skills.ts`.
- Contraataque del Caballero se solapa algo con Reflejo: revisar.

### Berserker [DECIDIDO]
Fantasía: convierte el peligro en daño.

- **Pasivo Furia (umbrales):** +15 % de daño por debajo del 66 % de vida y +30 % por debajo del 33 %.
- **Ataque 2, opción A: Desgarro = Sed de sangre.** Golpe de 120 % que cura el 25 % del daño infligido.
- **Ataque 2, opción B: Aniquilación.** Golpe de 160 %, que sube a 250 % si la vida está por debajo del 33 %. Enfriamiento 3, sin coste.
- **Armas (2 tipos nuevos):**
  - **Mandoble** (estilo sacrificio): especial **Frenesí**. Cuesta el 8 % de la vida actual (nunca deja en 0) y pega fuerte.
  - **Martillo** (estilo peso): especial **Aplastar**. Golpe explosivo, enfriamiento largo, sin coste de vida.
- **Números provisionales:** Frenesí poder 2,6, enfriamiento 2, coste 8 % de vida actual. Aplastar poder 3,0, acierto 85 %, enfriamiento 3.
- Cuidado: en dungeons la vida es única y se arrastra, así que Furia necesita tope y ningún coste de vida puede matar.
- Anti-sinergia: curar al Berserker le baja la Furia (por eso su bono de Guardia no cura).

### Invocador [PENDIENTE: el usuario no está seguro de la clase]
Semilla guardada, sin cerrar nada:
- Pasivo Vínculo = **Conductor elemental**: el familiar usa tu elemento y cada golpe suyo aplica 1 acumulación del efecto elemental.
- El familiar sería un estado con duración (3 turnos, enfriamiento 4), sin vida propia ni entidad nueva en el motor.
- Ataque 2 candidatos: Familiar guardián (escudo 20 % de vida máx. + golpe 30 % ATQ) y Familiar depredador (golpe 40 % ATQ, +30 % por acumulación de estado en el objetivo).
- Alternativa más barata a considerar: Monje (combos y energía), aunque se pisa con Reflejo y Pícaro.

---

## 4. Armas

Real (`weapons.ts`): 8 tipos de mano, 2 por clase. El especial de cada arma reemplaza el ataque 2 actual (`WeaponSpecial`: name, power, accuracy, cooldown, heal). Cada par es "constante" contra "explosivo o con riesgo".

| Clase | Arma 1 | Arma 2 |
|---|---|---|
| Caballero | Espada (Golpe de escudo) | Hacha (Hachazo) |
| Mago | Bastón (Cataclismo) | Varita (Rayo arcano) |
| Pícaro | Daga (Puñalada rápida) | Arco (Disparo certero) |
| Clérigo | Maza (Castigo) | Libro (Plegaria) |
| Berserker | **Mandoble** (Frenesí) | **Martillo** (Aplastar) |

Cambios de código que esto implica:
- `HAND_TYPES`: agregar `mandoble` y `martillo` (de 8 a 10). `CLASS_WEAPONS` y `ClassId`: agregar `berserker`.
- `WeaponSpecial`: agregar un campo de coste propio de vida (por ejemplo `selfCost`: fracción de la vida actual, nunca mata).
- `WEAPON_KEY_SPACE` crece (tipos × elementos × rangos): revisar colección, mercado y SQL que validen tipos.
- Descripciones de Piernas y Zapatos mencionan esquive: actualizar.
- Arte: sprites del Berserker y de las dos armas nuevas.

---

## 4b. Ataques por clase y arma (definición 2026-10-09)

Ataque 1 = golpe seguro de la clase. Ataque 2 = habilidad de clase (1 de 2). Ataque 3 = especial del arma (2 armas por clase).

| Clase | Identidad | Ataque 2 (elige 1) | Ataque 3 (arma) |
|---|---|---|---|
| Caballero [DECIDIDO] | Sin cambios de personaje: defensa alta, pasivo Muralla | **Barrido** · **Contraataque** (cambia: no reduce el golpe recibido, lo aguantas completo y lo devuelves ×1,2 después de recibirlo; dura 2 rondas) | Espada: Golpe de escudo · Hacha: Hachazo |
| Mago [DECIDIDO] | Especialista en estados | **Tormenta** (a todos, poder ×1,3, aplica 2 acumulaciones) · **Detonar** (reemplaza a Drenar maná: poder 1,0 al objetivo, +25 % por acumulación de estado que tenga, y se las borra; recarga 3) | Bastón: Cataclismo · Varita: Rayo arcano |
| Pícaro [sin cambios] | Críticos ×2 | Golpe doble · Ejecutar | Daga: Puñalada rápida · Arco: Disparo certero |
| Clérigo [DECIDIDO] | Sanador-castigador | **Santuario** · **Castigo** | Maza: **Golpe sagrado** (renombrada; era Castigo) · Libro: Plegaria |
| Berserker [DECIDIDO] | Convierte el peligro en daño | Desgarro · Aniquilación | Mandoble: Frenesí · Martillo: Aplastar |

Caballero: se mantiene el personaje (velocidad, Reflejo en la Guardia perfecta, Barrido); solo cambia el Contraataque (recibes el daño completo y devuelves el 120 % del golpe recibido). Barrido y Tormenta siguen compartiendo el área; se mide en simulación antes de tocarlos.

## 4c. Armas: nombres y balance [DECIDIDO 2026-10-09]

**Nombre unificado** (`weaponName`): `<Sustantivo> <epíteto de rango> de <Elemento>`, p. ej. "Espada Oxidada de Fuego", "Grebas Divinas de Agua". Epítetos por rango: F Oxidado, E Gastado, D Corriente, C Templado, B Noble, A Heroico, S Legendario, SS Mítico, SSR Divino (con género). El nombre se deriva al cargar el perfil: las piezas viejas se renombran solas. Se acabó el adjetivo al azar y el "Inicial" del tutorial.

**Balance de armas** (daño promedio por ronda, sin crítico ni velocidad): se bajó Martillo (ATQ ×1,2 → ×1,0), Mandoble (×1,1 → ×0,95) y Hacha (×1,2 → ×1,1), y se subió Bastón (×0,9 → ×1,0), Daga (×0,85 → ×0,95), Varita (×0,85 → ×0,9) y Arco (×0,9 → ×0,95). Objetivo: fuertes ~1,35 y débiles ~1,2. Simulación rango S (8 héroes): Espada 74 %, Hacha 70 %, Bastón 64 %, Varita 64 %, Daga 69 %, Arco 68 %, Maza 76 %, Libro 85 %, Mandoble 64 %, Martillo 66 %. El Libro (curación) y el Clérigo siguen altos.

Renombres [HECHO]: Varita, "Rayo arcano" → **Descarga arcana**. Ataque 2 base de clase sin arma: Caballero "Golpe de escudo" → **Estocada**, Mago "Cataclismo" → **Estallido**, Clérigo "Plegaria" → **Rezo**, para no repetir nombres de especiales de arma.

### Pasada de balance 2026-10-09 (valores de prueba, `scripts/class-synth.ts`)

Medido con héroes S 3★ Nv50 con equipo en el dungeon SSR (30 héroes por nivel): media ~68 % con la política automática. Antes: Detonar ~57 %, Clérigo y Libro ~10 puntos sobre el resto. Cambios: Detonar poder 1,0 → 1,2 y +0,25 → +0,35 por acumulación; Castigo robo de vida 50 → 35 %; Santuario 10 → 8 %; guardia perfecta del Clérigo 8 → 5 %; Plegaria (Libro) 13 → 10 %. Resultado (auto): Caballero 68–74, Mago 63–72, Pícaro 62–68, Clérigo 70–78, Berserker 63–73. En el dungeon S todos quedan en 88–96 %. Quedan Detonar ~5 puntos abajo y Clérigo ~5 arriba: se re-mide con jugadores reales. `class-synth.ts` ahora separa el rango del dungeon (`RANK`, incluye SS y SSR) del rango de los objetos (S como máximo).

### Duelos balanceados [DECIDIDO 2026-10-09, `duel.ts`]
- Corregido un sesgo: el lado b del duelo se trataba como enemigo y no aplicaba el especial de clase, los estados ni la Sobrecarga. Ahora ambos lados son héroes (`strike(..., asHero)`); un duelo espejo es 50/50 (test en `duel.test.ts`).
- `DUEL_TUNE` (hp y ATQ por clase) iguala las clases en el modo balanceado: Caballero ×0,95/0,97, Mago ×1,03/1, Pícaro ×1,10/1,03, Clérigo ×1,08/1,08, Berserker ×0,97/0,96. Medido con `scripts/duel-sim.ts` (400 duelos, `DUEL_SKILLS` = la mejor habilidad de cada clase): victorias medias 49–54 % para las cinco clases. Santuario como habilidad de duelo sigue siendo una elección floja (a propósito: es una habilidad de apoyo).

## 5. Jefes

Reglas: la tabla elemental es universal para jefes. La mecánica del jefe es lo que lo distingue. Reutilizar patrones comunes, no 9 sistemas distintos.

### Mecánicas de los 9 jefes [DECIDIDO 2026-10-09, valores de prueba; `bossRules.ts`]
El mapa jefe ↔ dungeon y el elemento fijo ya existían en `levels.ts` (`DUNGEON_THEMES`): se conservan. Nombre: Vigía Eterno.

| Dungeon | Jefe (elemento) | Mecánica |
|---|---|---|
| F | Señor de las Moscas (agua) | Plaga: pierdes 1,5 % de tu vida máxima al final de cada ronda. |
| E | Rey de Ceniza (fuego) | Presión: +6 % de daño por ronda (máx. +30 %); una guardia perfecta contra su golpe fuerte la reinicia. |
| D | Vigía Eterno (viento) | Aprende: si repites la misma acción 2 veces seguidas, la siguiente le hace 25 % menos. |
| C | Coloso Hueco (tierra) | Armadura del 30 % de su vida (−50 % de daño recibido); al romperla queda Roto 3 rondas (+25 %) y se recompone a las 6. |
| B | Rey del Trueno (rayo) | Velocidad: +10 % cada 2 rondas (máx. +40 %). |
| A | Madre Hidra (agua) | Cabezas: al bajar del 75, 50 y 25 % de vida se cura 10 % y gana una acción por ronda. |
| S | Reina Marchita (tierra) | Ritual cada 3 rondas, anunciado: Ruptura y curas a la mitad 2 rondas; se anula con guardia perfecta. |
| SS | El Sin Rostro (fuego) | Posturas cada 2 rondas: ofensiva (+30 % daño, −20 % DEF) / defensiva (−30 % daño, +30 % DEF). |
| SSR | Gran Devorador (viento) | Hambre: se cura 10 % del daño que hace; bajo 30 % de vida actúa una vez más. |

Los jefes aplican el estado de su elemento en golpes fuertes. La mecánica se activa por `bossId`, así que también vale en torre y salas.

### Afinidad fija por jefe [POR DEFECTO]
Hoy los 9 jefes tienen 5 versiones visuales (una por elemento) asignadas al azar y sin efecto. Se propone una afinidad fija por jefe, con la variante visual correspondiente. Las otras variantes quedan para desafíos futuros.

| Elemento | Jefes |
|---|---|
| Fuego | Rey de Ceniza (ash_king), Señor de las Moscas (lord_of_flies) |
| Agua | Madre Hidra (mother_hydra), Reina Marchita (withered_queen) |
| Viento | Observador Eterno (eternal_watcher), El Sin Rostro (faceless_one) |
| Tierra | Coloso Hueco (hollow_colossus), Gran Devorador (great_devourer) |
| Rayo | Rey del Trueno (thunder_king) |

### Los otros 6 jefes [PENDIENTE]
Se diseñan después de probar los pilotos. Ideas de partida (hipótesis por nombre, no decisiones):
Observador Eterno (aprende de acciones repetidas), El Sin Rostro (alterna posturas anunciadas), Gran Devorador (acumula Hambre), Señor de las Moscas (plaga y desgaste), Madre Hidra (varias cabezas), Reina Marchita (debilitamiento y rituales).
Los ataques cargados (y con ellos "romper carga") se definen aquí.

---

## 6. Dungeons y encuentros

### Dungeons elementales [DECIDIDO 2026-10-09]
El elemento predominante de cada dungeon es el de su jefe (`DUNGEON_THEMES`): F agua, E fuego, D viento, C tierra, B rayo, A agua, S tierra, SS fuego, SSR viento. Todos los niveles del dungeon lo comparten; las ascensiones lo rotan (`levelElement`). Proporción fija `DOMINANT_SHARE = 0.5` en todos los rangos (el resto es un sorteo entre los 5 elementos, así que el predominante real ronda el 60 %); antes subía de 60 % a 80 % por rango y quitaba variedad. En ascensiones cambia el elemento del nivel y del jefe final, no su identidad ni su mecánica. Efecto secundario: las piezas del botín siguen el elemento del nivel (`levelLoot.ts`), así que cada dungeon favorece un elemento de equipo. Simulación (8 héroes, ruido ±6): F 97 %, S 70 %, SSR 30 % (objetivo de `CLAUDE.md`: 96 % y 34 % en los extremos), sin necesidad de recalibrar.

### Eventos entre combates [DECIDIDO: no se hacen]
Se mantiene la decisión de v8: sin puertas, reliquias ni tienda.

### Formato de encuentros [DECIDIDO]
Los tamaños de grupo actuales se mantienen (ya van de 1 a 3 según el rango). Un grupo normal de 3 se anuncia como **Emboscada** en el registro. Sin recompensa extra por ahora (el pago es por nivel, en SQL). Iniciativa por velocidad sin cambios.

## 7. Progresión y economía

| Tema | Estado | Propuesta |
|---|---|---|
| Rangos de héroes y equipo | **[DECIDIDO]** | 7 rangos de objeto, F a S (ver 7c). SS y SSR quedan solo como dificultad de dungeon. |
| Estrellas, copias y fusión | **[DECIDIDO, implementado]** | Ver 7d: copias con rasgo, ★ por material, rango por fusión. |
| Pity | **[DECIDIDO]** | Eliminado (migración 0049). Probabilidades 31/22,5/16,5/12/9/6/3 %. |
| Mejorar equipo | [POR DEFECTO] | Se mantiene el sistema actual con riesgo de fallo y protección acumulativa (`plusStreak`: +5 % por fallo consecutivo). Pendiente si el Dado cargado suma puntos o es relativo (leer `docs/FORJA_V9.md`). |
| Rasgos | **[DECIDIDO, implementado]** | 20 rasgos de personalidad, 1 por héroe (ver 7b). |

---

## 7b. Rasgos: catálogo final [DECIDIDO 2026-10-09, implementado]

Rasgo = personalidad del héroe: manía suave con un sesgo pequeño y una regla corta. **Un rasgo por héroe**, sin importar el rango, tirado de forma uniforme entre 20 (Espinas no sale en Caballeros). La fusión conserva el rasgo. Valores de prueba.

| Rasgo (arte reutilizado) | Manía |
|---|---|
| Terco (stubborn) | +10 % DEF; tras fallar un golpe, el siguiente tiene +10 de precisión. |
| Temerario (reckless) | +10 % ATQ, −8 % DEF. |
| Orgulloso (armored) | +8 % ATQ con más de la mitad de la vida, −8 % con menos. |
| Sanguinario (bloodthirsty) | +8 crítico; +10 % de daño contra enemigos con menos del 40 % de vida. |
| Paciente (patient) | +5 precisión; si defendió la ronda anterior, su siguiente golpe hace +8 %. |
| Estoico (sturdy) | +10 de resistencia a estados, −5 % velocidad. |
| Glotón (glutton) | +8 % vida; recupera 3 % de su vida máxima al derrotar a un enemigo. |
| Tenaz (tenacious) | +8 % vida, −5 % velocidad. |
| Veloz (swift) | +6 % velocidad, −5 precisión. |
| Fanfarrón (lucky) | El primer golpe de cada pelea hace +20 %. |
| Lúcido (lucid) | +3 crítico, +3 precisión, +2 % ATQ. |
| Curioso (accurate) | +10 % de daño contra rivales con algún estado elemental. |
| Cauteloso (cautious) | Recibe −10 % de daño con más del 80 % de vida; −5 % ATQ. |
| Furioso (furious) | Cada golpe que recibe le da +4 % de daño (hasta 5 golpes). |
| Sediento (thirsty) | Cura al ganar. |
| Gafe (jinxed) | −5 crítico, más EXP al perder. |
| Filo del azar, Último aliento, Espinas, Apostador | Sin cambios (reglas de run). |

Salen: Afortunado, Robusto, Certero, Frágil, Blindado, Escurridizo, Fornido y Cobarde (de solo números). Sus hojas de arte se reutilizan para Fanfarrón, Estoico, Curioso y Orgulloso, así que no hace falta arte nuevo por ahora; el arte propio queda para cuando se quiera. Descartados en la votación: Metódico, Rencoroso, Supersticioso.

Implementación: `traits.ts` (catálogo y reglas), `combat.ts` (estado por combatiente: falló, defendió, abrió, rabia), `explain.ts` (textos), `artIds.json` y `sprites/accessories.ts` (arte). Los perfiles viejos descartan solos los rasgos que ya no existen (el reset de progreso ya estaba planeado).

## 7c. Rangos: F a S [DECIDIDO 2026-10-09]

- **Rangos de objeto (héroes y equipo): 7, de F a S.** SS y SSR salen de gacha, héroes, equipo y forja. Probabilidades: 31/22,5/16,5/12/9/6/**3** % (S queda en 3 %: una S cada ~1,75 días a ~19 tiradas diarias; el 2 % sobrante de los tres altos se reparte entre F, E y D); multiplicador de S ×2,6 (antes 2,35); equipo S ×3,4. Valor de trueque de S: 8330 (250 / 3 %). Fusionar todo lo que se tira da ~+78 % de S extra como techo teórico (proporciones F 5, E 5, D 4, C 4, B 4, A 4; ver 7d).
- **Sin pity.** Se eliminó el pity de 250; `apply_pull` ya no lo exige (migración 0049). Los contadores `pity`/`pitySsr` siguen en el perfil siempre en 0 por compatibilidad con la firma SQL.
- **Dungeons: 9, como niveles de dificultad** (`DungeonId`, ids f..ssr sin cambios; `levels.ts` intacto). Los tres últimos (S, SS, SSR) sueltan objetos S: el top de la pieza es S y el resto sube hasta S en SS y SSR. La fuerza de los enemigos conserva la escala de 9 (`DUNGEON_MULT`); `RANK_TUNE` recalibrado para S (2,85), SS (2,79) y SSR (2,62) con héroes S de referencia (objetivo 62 / 48 / 35 %).
- **Identidad de los rangos altos (equipo):** líneas extra C 1, A 2, S 3, más una **línea capstone** exclusiva de S (casco y peto: daño recibido; piernas, zapatos y collar: daño infligido). Cada pieza S trae hasta 4 líneas.
- Salas: el rango de sala sigue siendo de objeto (F a S).
- Pendiente: re-simular la economía (monedas por nivel, cofres, gacha) con esta cadena.

## 7d. Héroes: copias, estrellas y fusión [DECIDIDO 2026-10-09, implementado]

Un héroe es clase + elemento + rango. Crece en tres ejes; el material de los dos primeros se mide en **unidades**: un héroe del mismo rango vale 1 y cada copia sobrante vale 1 (el héroe base solo aporta sus copias).

- **Copias.** Una tirada repetida ya no sube ★: se guarda como copia (máx. 50, el resto reembolsa 50 %) con el rasgo que le tocó. Así se puede quedar el mejor rasgo de varias tiradas (cambio de rasgo en la Forja) y el material no queda atrapado en estrellas. Código: `profile.ts` (`copies`), SQL 0050.
- **Subir ★ (0 a 5).** 3 unidades = +1★. Cada ★: +10 % de stats y +10 de tope de nivel. Coste en tiradas incluyendo el base (S: 1★ ~133, 3★ ~333, 5★ ~533; F: 13 / 32 / 52).
- **Subir de rango (F a S).** Base + (ratio − 1) unidades del mismo rango + monedas: F 5 (20), E 5 (40), D 4 (80), C 4 (160), B 4 (320), A 4 (640). Conserva clase, elemento, nombre, rasgo, nivel y habilidad. Las ★ se convierten con `STAR_CARRY` (factor de rareza, redondeo abajo: p. ej. 4★ en A pasa a 2★ en S; 5★ en F llega a S como 0★, sin atajo). Si ya existe el héroe en el rango siguiente se fusionan: el jugador elige el rasgo principal (el otro pasa a copia), quedan las ★ más altas, nivel y equipo del ya existente. Las copias del base que no se gastan quedan como un héroe del rango viejo.
- **Rasgos.** El rasgo principal se cambia por el de una copia (el anterior pasa a copia).
- **Mercado.** La unidad que se intercambia es una copia (con su rasgo); un jugador sin ese héroe lo recibe con ese rasgo.
- **Sin quema de héroes.** Se retiró por completo; las piezas siguen quemándose (4 %).
- **Descartado:** requisito de ★ mínimas para fusionar; afinidad de clase o elemento en el material; talentos pasivos por ★ y tope de nivel por rango (decisiones aparte, fuera de esta tanda).
- **Balance medido:** fusionar es 2 a 4 veces más caro que tirar el rango siguiente (A→S 67 frente a 33 tiradas), así que es un sumidero de sobrantes. Si se funde toda la colección sale ~+78 % de S extra como techo; la palanca es el ratio A→S (4; con 5 baja a ~+62 %). Valor de mercado: fusionar siempre pierde frente a comerciar (4 A = 16.680 frente a 1 S = 8.330).
- Código: `heroFusion.ts` (`starUpHero`, `fuseHeroes`, `swapTrait`), servicios `doStarUpHero`/`doFuseHeroes`/`doSwapTrait`, SQL `apply_hero_change`, interfaz `src/app/forja/HeroFusion.tsx`.

## 8. Equipo

Seis casillas: arma, casco, peto, piernas, zapatos, collar.

- **Piernas y Zapatos** [POR DEFECTO]: la línea de esquive pasa a **resistencia a estados** (acorta la duración de Escarcha, Quemadura y Ruptura).
- **Collar**: conserva precisión y crítico.
- Sets de 2/4/6 piezas, tirada ±15 % y líneas extra se mantienen.

---

## 9. Plan de implementación sugerido para Claude Code

Orden recomendado, cada paso con tests y commit propio:

1. **Verificar el estado real del código**: `elements.ts`, `combat.ts`, `skills.ts`, `characters.ts`, `weapons.ts`, `gear.ts`, `stage-tune.ts`. Confirmar la dirección de la tabla elemental, qué hace "Drenar maná" y cómo usa `accuracy` el motor.
2. **Tabla elemental** a ciclo de 5 con 1 ventaja, 1 desventaja y 2 neutrales (`elements.ts`), con tests.
3. **Motor** (`ENGINE_VERSION` 10 → 11): eliminar esquive; Guardia perfecta sin +50 % y con bono por clase; estados de los 5 elementos; reorden de ataques (A2 clase, A3 arma); selección de Ataque 2 desde nivel 1 y cambiable en el armado.
4. **Persistencia**: guardar la elección de Ataque 2 por héroe; bloqueo durante dungeon o sala; compatibilidad con perfiles existentes (valor por defecto).
5. **Equipo**: reemplazar esquive por resistencia a estados; actualizar descripciones.
6. **Berserker**: `ClassId`, pasivo Furia, Ataque 2 (2 opciones), armas Mandoble y Martillo, `selfCost`, bono de Guardia.
7. **Jefes piloto**: Coloso Hueco, Rey del Trueno, Rey de Ceniza; afinidad fija.
8. **Dungeons**: elemento fijo por encuentro; probar en F, C y S.
9. **Simulación** (pocas iteraciones) y recalibrar `RANK_TUNE`. Después, economía (pity fuera).
10. **Server y SQL**: el servidor repite la run con el motor antes de pagar; revisar validaciones de tipos de arma y de clase. Antes del push: `upgrade_from_NNNN.sql` en Supabase y Security Advisor.

Recordatorio de CLAUDE.md: el estado actual tiene cosas **sin commit ni push** (economía ×2,4..7,5 con migración 0044, Mago, Clérigo, `ENGINE_VERSION 10`). Hacer ese commit antes de empezar el rediseño.

---

## 10. Texto sugerido para CLAUDE.md (solo lo decidido)

Reemplazar en "Reglas del juego":

- **Elementos (5):** ciclo Agua → Fuego → Viento → Tierra → Rayo → Agua, cada elemento vence solo al siguiente y pierde contra el anterior; los otros dos son neutrales. Ventaja ×1,25, desventaja ×0,75. Efectos: Agua Escarcha, Fuego Quemadura, Viento Impulso, Tierra Ruptura, Rayo Sobrecarga (valores en `docs/REDISENO_COMBATE.md`).
- **Combate:** Ataque 1 universal; Ataque 2 = habilidad de clase (1 de 2, desde nivel 1, cambiable en el armado); Ataque 3 = especial del arma; Defender. **Sin esquive.** Guardia perfecta: −75 % y bono propio por clase (sin +50 % general). Sin interrupción por ahora.
- **Clases (5):** Caballero, Mago, Pícaro, Clérigo y Berserker (Furia por umbrales; armas Mandoble y Martillo). Invocador en pausa.
- **Jefes piloto:** Coloso Hueco (barra de armadura), Rey del Trueno (velocidad creciente).

---

## 10b. Decisiones cerradas en la revisión del 2026-10-09 [DECIDIDO]

1. Enemigos que aplican efecto elemental: solo élites y jefes, en golpes fuertes.
2. Resistencia a estados reemplaza al esquive en las líneas de equipo (acorta Escarcha, Quemadura y Ruptura, mínimo 1 ronda).
3. Pícaro: resistencia base 0.
4. Quemadura: tope 6 % de la vida máxima por ronda para todos, a medir.
5. Rasgos: camino intermedio (ver sección 7).

## 11. Preguntas abiertas

Cerradas el 2026-10-09: rarezas (7 rangos F a S, 7c), fusión de héroes (7d), 9 rangos o 7, tabla elemental (2), quema de héroes (retirada).

1. ¿Qué ataques llevan el elemento y aplican efecto? Hoy solo el especial de clase aplica estados; revisar con pruebas.
2. ¿Qué hace "Drenar maná" sin maná? (sección 3; el Mago ya usa Tormenta o Detonar)
3. ¿Los eventos entre combates chocan con la decisión de v8? (sección 6; decidido que no se hacen)
4. ¿Dado cargado: puntos porcentuales o relativo? (sección 7)
5. Mapa jefe ↔ dungeon. (sección 6)
6. ¿Se retoma el Invocador o se sustituye por el Monje? (sección 3)
7. Los otros 6 jefes y los ataques cargados. (sección 5)
