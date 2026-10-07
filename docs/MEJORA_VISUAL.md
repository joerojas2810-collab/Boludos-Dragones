> **Nota (2026-10-07):** este documento describe la fase de pixel art por código. Desde v6.0 el juego usa arte pintado en archivos; las reglas vigentes están en la sección "Arte" de `CLAUDE.md`. Se conserva como historial.

# Dirección de mejora visual — Boludos & Dragones

**Estado:** las 7 etapas están aplicadas en secuencia; falta la revisión visual final en navegador.  
**Actualizado:** 2026-10-06  
**Premisa:** que el juego sea más atractivo visualmente y que cada mejora conserve el comportamiento, los datos y las pantallas que ya funcionan.

## Dirección visual

### Idea central: una noche de rol entre amigos

La interfaz debe sentirse como una mesa de rol de fantasía armada para una noche ruidosa entre amigos: cálida, aventurera, un poco irreverente y fácil de leer durante una pelea. El pixel art de bordes duros sigue siendo el lenguaje visual; no se reemplaza por ilustraciones genéricas, gradientes suaves ni una estética móvil distinta.

La personalidad viene de las siluetas, accesorios, expresiones, emblemas y momentos de juego. Los paneles y controles dan estructura sin competir con los personajes.

### Principios

1. **Reconocer antes que decorar.** Clases, enemigos, elementos, rarezas y estados deben distinguirse en tamaño real y sin depender solo del color.
2. **Jerarquía clara.** En combate destacan héroes, intención enemiga, vida y acciones; en salas, fase, temporizador, jugadores y resultado.
3. **Un mismo mundo visual.** Menú, combate, colección, gacha, mercado y sala comparten bordes, tipografía, iconos, estados y tratamiento de tarjetas.
4. **Pixel art deliberado.** Mantener la cuadrícula 32×32, bordes nítidos, luz arriba-izquierda y formas legibles. Evitar suavizado y detalle que desaparezca al reducir el sprite.
5. **Humor con intención.** Apodos, poses, accesorios y emotes aportan el tono; textos funcionales siguen siendo cortos y claros.
6. **Movimiento con medida.** Reservar las animaciones más vistosas para eventos importantes y respetar `prefers-reduced-motion`.
7. **PC primero, móvil usable.** Mantener la composición de escritorio sin scroll innecesario y adaptar controles y tarjetas para pantallas estrechas.

## Sistema visual propuesto

La paleta actual de marrones, naranja y verde permanece como base para evitar una ruptura visual. Se clarifican los roles:

| Rol | Uso | Dirección |
|---|---|---|
| Fondo | Fondo general y profundidad | Marrón carbón cálido, con variación muy sutil |
| Superficie | Paneles y tarjetas | Marrón medio, separación clara del fondo |
| Borde | Marcos pixel | Contorno oscuro y filete naranja existente |
| Acción | Botón principal y confirmación | Verde legible, con estados hover, foco, pulsado y deshabilitado |
| Atención | Temporizador, peligro y combate | Ámbar/naranja; rojo solo para daño, jefe o peligro real |
| Premio | Rareza alta, recompensa y victoria | Oro reservado para momentos de mérito |
| Información | Elementos, ayudas y selección secundaria | Acentos elementales existentes, con icono y texto cuando haga falta |

Los colores de elemento y rareza no se cambian en la lógica ni en los datos: cualquier ajuste será solo de presentación y deberá conservar su asociación actual. Se evitará usar el mismo acento para significados distintos en una misma pantalla.

### Tipografía

- Mantener **Chakra Petch** para controles, números, etiquetas y texto compacto.
- Usar **MedievalSharp** en títulos de pantalla y encabezados narrativos, con moderación.
- Dar a descripciones largas una tipografía sans legible si la actual dificulta leerlas; validar primero que no cambie alturas ni rompa diseños compactos.
- No usar la tipografía decorativa en estadísticas, temporizadores, precios o registros.

### Componentes

- **Paneles:** marco doble pixel actual; pestaña de título consistente y contraste suficiente entre contenido y fondo.
- **Tarjetas:** jerarquía repetible para imagen/ícono, nombre, dato clave y descripción; marco de rareza solo cuando la rareza sea relevante.
- **Botones:** conservar tamaño táctil y bisel; añadir un foco de teclado evidente y mantener etiquetas descriptivas.
- **Estados:** selección, hover, foco, activo, espera, éxito, error y deshabilitado deben tener señales visuales diferenciadas.
- **Iconos:** seguir pixel art y la cuadrícula existente; añadir texto o tooltip accesible si el significado no es obvio.
- **Brillos:** reservar brillo animado para legendarios o recompensas destacadas, evitando que toda la pantalla compita por atención.

## Personajes, accesorios y enemigos

### Héroes

- Preservar las cuatro siluetas y el equipo característico: espada/escudo, bastón/orbe, dagas y maza/libro.
- Hacer que cada accesorio de rasgo se lea como forma o prop propio (cabeza, hombro, mano o pie), no como un pequeño cambio cromático.
- Evitar que dos rasgos ocupen o tapen la misma zona. Si coinciden, definir una prioridad o composición legible sin quitar el rasgo del personaje.
- Revisar accesorios sobre las cuatro clases, todas las paletas elementales y fondos claros/oscuros en el tamaño que se usa en juego.
- Mantener expresión y personalidad mediante detalles pixelados simples; no cargar las siluetas con adornos que compitan con armas y rasgos.

### Enemigos y jefes

- Diferenciar familias por contorno, proporción y postura antes de aplicar color: el Gólem debe ganar una forma más singular y el Espectro no debe confundirse con el Limo.
- Dar a cada jefe un rasgo dominante reconocible a primera vista; conservar el parentesco con su familia normal.
- Validar las versiones normales y de jefe al tamaño real de arena, no solo ampliadas en el editor.
- Aplicar paletas elementales sin borrar los rasgos que identifican clase/familia.

## Plan por etapas

Cada etapa produce un cambio pequeño, verificable y fácil de revertir. Se implementaron en orden a pedido del usuario; conviene revisar el resultado visual conjunto antes de publicar.

| Etapa | Trabajo | Criterio para darla por lista |
|---|---|---|
| **1. Dirección y mapa visual** | Acordar esta guía, inventariar lo que ya existe y marcar pendientes concretos. | Guía coherente con `CLAUDE.md` y `docs/ESTADO.md`; alcance y límites claros. **Completada en esta entrega.** |
| **2. Fundamentos de UI** | Revisar tokens, tipografía, contraste, foco y estados de botones/paneles. Ajustar solo estilos compartidos con compatibilidad hacia atrás. | Pantallas actuales conservan contenido y comportamiento; controles y títulos se leen mejor. **Cambio aplicado; falta revisión en navegador.** |
| **3. Accesorios de héroes** | Auditar los accesorios existentes y corregir primero los de Mago, Pícaro y Clérigo; resolver los rasgos poco legibles (Escurridizo, Frágil, Temerario y Glotón, según disponibilidad actual). | Cada rasgo se reconoce sobre las cuatro clases a tamaño real, sin tapar arma, cara ni otro rasgo. **Cambios aplicados; falta revisión en navegador.** |
| **4. Siluetas de jefes y familias** | Mejorar Gólem/Espectro si siguen siendo confusos; revisar los jefes de Tormenta y Cavernas pendientes. | Familia y rango (normal/jefe) se reconocen en silueta y en la arena. **Arte actualizado; falta vista real en navegador.** |
| **5. UI de decisiones y recompensas** | Pulir tarjetas de puerta, evento, mercader, reliquia y mejora, incluida la lectura móvil. | Acción, costo/beneficio y selección se entienden sin depender de leer un bloque largo. **Aplicada en run y sala.** |
| **6. Consistencia entre pantallas** | Llevar los patrones aprobados a inicio, colección, gacha, mercado, run y sala; sin rehacer todas a la vez. | Componentes compartidos mantienen jerarquía y la sala sigue siendo la experiencia social prioritaria. **Aplicada con estilos compartidos.** |
| **7. Revisión final** | Revisar escritorio y móvil, foco/teclado, movimiento reducido y regresiones visuales. | Revisión estática, typecheck, lint y pruebas completados; la vista manual en navegador sigue pendiente porque el navegador no puede conectarse al servidor local. |

## Límites para preservar lo hecho

- No cambiar economía, probabilidades, balance, RNG, motor de combate, persistencia, esquema de Supabase ni protocolo de sala como parte de una mejora estética.
- No renombrar identificadores de clases, rasgos, elementos, rarezas, mundos o sprites si eso puede invalidar perfiles o datos guardados.
- ~~No reemplazar sprites de código por imágenes externas~~ (derogado 2026-10-07: se adopta el arte pintado en archivos; ver `CLAUDE.md`, sección Arte). Siguen sin permitirse dependencias pagas.
- Evitar fuentes remotas o recursos de red; usar fuentes locales (Nunito y Alegreya, OFL).
- Los cambios visuales deben ser aditivos y acotados; conservar clases CSS existentes o sus aliases mientras se migra una pantalla.
- Si una mejora requiere cambiar comportamiento, datos persistidos o una API, separarla en otra propuesta y no mezclarla con esta tarea.

## Trabajo con el plan Free

El límite exacto disponible puede variar por producto y periodo; por eso el plan no depende de una cuota concreta. Para mantenerlo viable:

- Trabajar una etapa por ciclo de cambio y mantener el alcance acotado.
- Preferir cambios locales en CSS, SVG/pixel art y componentes existentes frente a generación masiva de imágenes.
- No pedir variantes de cada personaje de una sola vez: probar una clase, un accesorio o una familia y reutilizar el patrón validado.
- Mantener las revisiones visuales en un máximo de dos vueltas por etapa y revisar solo tamaños relevantes.
- Evitar capturas numerosas, simulaciones y pruebas que no correspondan a un cambio de lógica; una mejora puramente visual no necesita simulaciones de balance.
- Antes de tocar código compartido, describir el alcance de la etapa y revisar el diff al terminar.

## Ejecución de las siete etapas

**Etapa 1 — Dirección y mapa visual:** completada con este documento. La guía fija la premisa, los principios, el lenguaje visual, las prioridades de personajes/UI y las salvaguardas para no romper lo existente. No se modificaron componentes ni datos del juego en esta etapa.

**Etapa 2 — Fundamentos de UI:** cambio aplicado de forma acotada en `src/app/globals.css` y `src/components/Panel.tsx`: las pestañas de panel ahora usan la tipografía de título existente y un tono marfil cálido; el foco de teclado comparte el token `--focus` y también se distingue en campos y selectores. Se conservaron las clases y estilos previos. La vista en navegador queda pendiente: el servidor local no pudo abrir el puerto 3000 en el entorno (`listen EPERM`).

**Etapa 3 — Accesorios de héroes:** en `src/sprites/accessories.ts` se compactó la bomba del Temerario para que funcione como accesorio de cadera, se redujo el muslo del Glotón y se movió junto a la cabeza, se cambió el parche de Frágil por una venda de mayor contraste y se simplificaron las estelas elementales de Escurridizo para no ocupar tanto espacio. Se conservaron los IDs de rasgo, colores disponibles y sistema de composición. La revisión en navegador sigue pendiente por el bloqueo del puerto local.

**Etapa 4 — Siluetas de jefes y familias:** `src/sprites/organic.ts` añade al Gólem jefe una corona de fragmentos conectada a la cabeza y cristales que amplían el contorno de los hombros. El Espectro jefe recibe cuernos laterales que se separan de la capucha y mejoran su lectura frente a la silueta normal. No se cambió la generación determinista ni la familia/elemento del enemigo.

**Etapa 5 — UI de decisiones y recompensas:** se definieron `choice-card`, `choice-button`, `choice-title` y `choice-detail` para unificar puertas, opciones de mejora/reliquia/evento y filas de mercader. Las puertas de la sala ahora incluyen el icono correspondiente. En móvil, una selección de tres puertas pasa a una columna y luego crece a dos/tres columnas según el ancho disponible.

**Etapa 6 — Consistencia entre pantallas:** `src/app/globals.css` ahora comparte roles de superficie, fondo cálido, sombra pixel, transiciones y foco entre pantallas. `Panel` conserva su marco, pero usa títulos y límites móviles coherentes; la tipografía y los colores existentes se reutilizan. No se modificaron las reglas de gacha, run, mercado o sala.

**Etapa 7 — Revisión final:** revisión estática del layout responsive y de `prefers-reduced-motion`; el título de `Panel` puede envolver en móvil y las opciones de tres puertas ya no se comprimen en una fila. `git diff --check` pasó; `npm run lint` terminó sin errores (con una advertencia en `supabase/tests/pglite/run.mjs`); `npm test` pasó (352 pruebas). `npx tsc --noEmit` pasó después de retirar archivos duplicados generados en `.next/types` (`cache-life.d 2.ts`, `routes.d 2.ts`, `validator 2.ts` y `root-params.d 2.ts`). El servidor Next informó que estaba listo en localhost, pero el navegador de Codex rechazó la conexión local (`ERR_CONNECTION_REFUSED`); no se pudo verificar visualmente la página ni tomar capturas.

## Fase 2 — "Juice" por código (aprobada 2026-10-06)

Todo se genera por código (CSS, SVG, canvas pequeño); sin archivos de imagen. Todo movimiento se apaga con `prefers-reduced-motion` y se mide que no ralentice el celular. Aprobadas las ideas 1, 2, 3, 5, 6, 8, 9, 10, 11, 12 y 13; **descartadas la 4 (icono de intención del enemigo) y la 7 (brillo holográfico de cartas)**.

### Grupo A — Combate (`BattleArena`, `arena.css`, `ArenaBackground`, sprites)
1. **Números de daño flotantes:** más grandes en crítico, otro color en curación, distinguen ventaja/desventaja de elemento.
2. **Pausa de impacto (hit-stop):** ~60-100 ms en golpes fuertes, críticos y muerte de jefe.
3. **Partículas por elemento:** chispas/humo/fuego/rayos con los colores del elemento, vidas cortas.
5. **Entrada de jefe:** oscurecer pantalla, nombre grande, temblor corto.
9. **Ambiente por mundo:** hojas, polvo, lluvia o relámpagos según el mundo.
10. **Sprites con respiración:** vaivén de 1 px en reposo.

### Grupo B — Gacha, menú, run y sala (`PullReveal`, `TitleScene`, pantalla de fin de run, `RoomScreen`)
6. **Apertura de gacha con suspenso:** cofre que se agita, brilla según la rareza; Legendario con rayos de luz y destello.
8. **Parallax en el menú:** nubes lentas y montañas en capas (`TitleScene`).
11. **Fin de run:** confeti de píxeles en victoria (piso 100), pantalla más sobria en derrota.
12. **Entrada de jugadores a la sala** con animación y avatar con el accesorio de su rasgo.
13. **Podio animado** al final de la noche con los premios.

### Orden y reglas de ejecución
- Dos agentes en paralelo (A y B) sobre archivos distintos; verificación con `tsc`, `eslint`, `vitest`, `next build` y una captura final a escala 0.5 por grupo.
- No cambiar lógica de juego ni contratos de salas; solo presentación. Cada efecto detrás de una utilidad compartida que respete `prefers-reduced-motion`.
- El push se hace una sola vez al terminar todo. Antes hay que ejecutar `supabase/setup.sql` (migración 0010: pity 100) en Supabase.
- Pendiente de revisión visual en navegador por el usuario tras el despliegue.
