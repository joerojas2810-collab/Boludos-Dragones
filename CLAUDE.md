# CLAUDE.md — Boludos & Dragones (RPG Gacha de Noche de Juegos)

## Qué es este proyecto
Juego web RPG por turnos, con runs infinitas y tiradas gacha, para jugar con amigos en noches de juegos (reemplazo de LoL). Cada uno juega desde su computadora (el celular es secundario) en una sala en línea. Arte en píxeles generado por código, sin archivos de imagen.

## Contexto de uso (prioridad de diseño)
- Lo más importante: que sea **divertido en una noche de juegos entre amigos**. Son 7 amigos, pero casi nunca juegan todos: debe funcionar bien con 2 a 7 jugadores, con gente que entra o se va a mitad de la noche, y sin que nadie quede bloqueado esperando.
- Se desarrolla por días: durante la semana cada uno puede jugar solo (runs, gacha, colección) y avanzar su cuenta, y el **viernes** se juntan en una sala. Por eso el progreso tiene que vivir en la nube (Supabase, nombre + PIN) y no solo en el navegador, antes del primer viernes.
- Criterio de decisión: ante una duda de diseño, elegir lo que genere más risas, rivalidad sana y momentos compartidos (apuestas, interferir, jefe cooperativo, ranking en vivo) y lo que mantenga parejos a quienes juegan menos.

- Sala de la noche: el anfitrión elige al crearla entre **modo nivelado** (todos con poder base parecido; rareza y estrellas dan estilo y un bono chico, p. ej. hasta +15%) y **poder completo** de la colección. Ranking de la noche por fichas y por piso.
- Entre semana: **semilla de la semana** (todos juegan la misma run cuando quieran y se comparan hasta el viernes) y **tirada gratis diaria**. Jefe cooperativo y apuestas deben escalar con quienes estén presentes (2 a 7).
- Salas (valores aceptados, ver `docs/SALAS.md`): ronda = 10 pisos, o todos eliminados, o tope de 25 min; noche ~2 h con 4 rondas; el piso avanza para todos aunque pierdas (el que muere queda eliminado de la ronda pero sigue apostando e interfiriendo); cada ronda empieza +3 pisos más difícil; tope por piso 90 s (+30 s en jefes); el héroe se elige por ronda; interferir es secreto hasta el reveal; quien se desconecta pierde el turno (Defender) y tras 2 seguidos cuenta como huida. Modo nivelado: `normalizeHero`, variación ±7.5%, bono de rareza+estrellas hasta +15%. MVP del primer viernes: lobby, misma semilla, ronda sincronizada con temporizador, ranking en vivo, apuestas simples, tira de peleas con emotes, modo nivelado; interferir, jefe cooperativo y premios después.
- Combate v2 (HECHO; `ENGINE_VERSION = 3` desde los rasgos con regla de run): guardia perfecta (−75% al golpe fuerte anunciado si defiendes y +50% a tu siguiente golpe; `PERFECT_GUARD_FACTOR`, `GUARD_COUNTER_BONUS`); tercera habilidad por clase al nivel 5 eligiendo 1 de 2 (`skills.ts`: Caballero Barrido/Contraataque, Mago Tormenta/Escudo arcano, Pícaro Golpe doble/Ejecutar, Clérigo Santuario/Castigo; botón Ataque 3); modo rápido solo en peleas fáciles con vida ≥70% (`auto.ts`, una sola entrada `{t:"auto"}` que el servidor repite); grupos de 1 a 3 enemigos (`GROUP_SCHEDULE`: fáciles 1-2, difíciles 2-3, jefes con acompañantes desde el piso 15) con elección de objetivo (clic o teclas 1-3); sin objetos en combate. Registros de acciones de la versión anterior se rechazan con `engine_outdated`. Balance tras v2: clases 49.1/50.3/50.9/49.7, rasgos −4.1…+4.2, runs smart mediana 17, p90 30. Código de salas que lea `Battle.enemy` o `intents` debe usar `enemies` y `queue`.
- Entorno real: proyecto de Supabase creado; `.env.local` válido (6 variables, permisos 600); `supabase/setup.sql` (5 migraciones) ejecutado con éxito en la base real ("Success. No rows returned"). Hecho: interruptores apagados, cuenta admin creada, 9 migraciones ejecutadas. Revisar el Security Advisor tras cada migración: una función con firma nueva nace ejecutable por anon/authenticated; `0018_lockdown_functions.sql` (siempre la última) vuelve a cerrar todas.
- Prioridad (decidida): lo social (salas) pasa a primera prioridad; el pulido de lo solitario queda en segundo plano. Monedas iniciales por cuenta: 500 (2 tiradas a 250). Apuestas: el pozo se reparte entre quienes aciertan, sin crear fichas. No preocupa por ahora la cantidad de sistemas ni la seguridad más allá de que nadie rompa el juego.
- Ritmo de la sala (decidido): **piso a piso, todos juntos**. Todos están en el mismo piso a la vez, cada uno pelea en su celular y, al terminar o al agotarse el tiempo (30 s por turno, configurable), se revelan los resultados; entre piso y piso se apuesta e interfiere. Con pocos jugadores no se espera a nadie y quien se desconecta pierde el turno.
- Orden de trabajo acordado: pantallas del gacha (HECHAS) → kit de Supabase y login (en curso) → diseño e implementación de salas (piso a piso) con jugadores variables, ranking en vivo, apuestas e interferir → semilla semanal y tirada diaria (pantallas) → modo nivelado → jefe cooperativo → **al final**: pantalla "Crear legendario" (legendarios de los amigos definidos dentro del juego) → publicar en Vercel y repasar celular.

- Decisiones de seguridad acordadas (ver `docs/SEGURIDAD.md`): login = Supabase Auth con email sintético y contraseña `HMAC(PEPPER, nombre:pin)` derivada en el servidor (el navegador no habla con el login de Supabase); límites 5 fallos = espera creciente y 20 = bloqueo hasta reinicio, y 20 fallos por IP en 15 min; el reinicio de PIN lo hace solo el dueño del proyecto (admin); el registro exige un "código de la casa" y el registro público de Supabase se desactiva; se acepta que alguien pueda bloquear la cuenta de un amigo (lo arregla el reinicio); zona horaria fija America/Argentina/Buenos_Aires para la tirada diaria y la semana; hasta tener la repetición completa de runs, las monedas llevan un tope por piso (~2× lo que paga una run normal); la aprobación del anfitrión para entrar a salas se decide en la Etapa 4; la repetición de runs corre en un Route Handler de Next (Node) con `src/lib/game`; el motor debe usar tablas precalculadas en vez de `**`/`Math.pow` para que dé lo mismo en Chrome, Safari y Node.
- Modo local: si no hay variables de Supabase, el juego sigue funcionando con `localStorage` como hoy (para desarrollar sin nube).
- Kit de Supabase (por construir tras `docs/SEGURIDAD.md`): `supabase/migrations/*.sql` ordenados, `supabase/setup.sql` unido para ejecutarlo de una vez en el editor SQL, `supabase/tests/` con pruebas de ataque (RLS, escrituras prohibidas), `.env.local.example`, `docs/SUPABASE_SETUP.md` y rutas del servidor que validan la entrada y repiten la run con el motor determinista antes de pagar monedas. Acciones del usuario: crear el proyecto, ejecutar `setup.sql`, desactivar la confirmación por correo, copiar URL y clave pública a `.env.local` y generar un secreto aleatorio. La clave secreta nunca se pega en el chat ni se sube al repositorio.

## Forma de trabajar (obligatorio)
- Antes de construir o ejecutar algo, preguntar y guiar paso a paso. Revisar juntos antes de avanzar.
- Respuestas concisas: sin saludos, sin disculpas, sin explicar el código salvo que se pida.
- Al modificar código, mostrar solo el fragmento cambiado, no el archivo completo.
- Trabajar por etapas (ver "Etapas"). No adelantar etapas sin confirmación.

### Ahorro de tokens en pruebas (acordado)
- Verificar con `tsc`, `eslint` y `vitest` (baratos) siempre; las simulaciones pesadas (`balance.ts`, `trait-balance.ts`, `run-sim.ts`, `gacha-sim.ts`) solo cuando se cambió algo que afecta el balance, y con pocas iteraciones.
- Revisión visual en el navegador: preferir texto/DOM (`read_page`, `get_page_text`) a capturas; capturas a escala 0.5, pocas y solo al final de un cambio visual; máximo 2 vueltas de ajuste.
- Máximo 2 agentes en paralelo; modelo por tarea (Sonnet para arte, diseño y lógica; Haiku para tareas mecánicas). Reportes finales cortos.

## Versiones (acordado)
- Cambios grandes (sistema nuevo, pantalla nueva, motor o base cambian) suben la versión principal: v1, v2, v3… Cambios pequeños (ajustes, pulido, balance, arreglos) suben el decimal: v2.1, v3.1… Cada versión es una etiqueta de git (`git tag vX.Y <commit>`; se empuja con `git push --tags`) y se anota aquí.
- v1.0 base: runs, gacha, cuentas, salas y mercado · v1.1 balance, economía y visual · v2.0 rangos F–SSR, forja, equipo, dungeons y hub · v2.1 atajos de forja, ayudas en salas, sets, mejoras aditivas, celular · v3.0 ascensión y jefe cooperativo · v3.1 resultado de forja, cuadro de encuentros (también en salas), selector de ascensión, anti-granjas · v3.2 premio del jefe cooperativo · v4.0 torre semanal · v5.0 misiones (diarias, semanales y evento Viernes de sala) y tutorial de forja.
- Versión actual: **v5.0**. La próxima etiqueta se decide al cerrar cada tanda de cambios (no por commit).

## Idioma
- Textos del juego, nombres de personajes y mensajes de UI: **español**.
- Código (variables, funciones, tipos, commits, comentarios): **inglés**.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Supabase: Postgres, Realtime (salas) y RLS
- Deploy en Vercel
- Tests de la lógica de juego con Vitest
- Secretos solo en `.env.local`, nunca en el repo

## Estructura
```
src/
  app/            # rutas y UI
  components/     # UI reutilizable (Sprite, Card, HealthBar, BattleLog)
  lib/game/       # lógica pura de juego (sin React, sin Supabase)
    rng.ts        # RNG con semilla
    elements.ts   # tabla de elementos
    rarity.ts     # rarezas y probabilidades
    characters.ts # clases, stats y generación de personajes
    traits.ts     # 20 rasgos y banco de frases de batalla
    progression.ts # XP, niveles, mejoras al subir de nivel, escalado del rival
    weapons.ts    # generación de armas (pendiente)
    combat.ts     # resolución de turnos
    run.ts        # pisos, eventos, escalado
    gacha.ts      # tiradas y pity
  lib/supabase/   # cliente y consultas (pendiente)
  lib/sfx.ts      # efectos de sonido sintetizados (Web Audio), sin archivos
  sprites/        # classes.ts (cuadrículas), palettes.ts, shade.ts (luz/sombra), elementIcons.ts
scripts/
  balance.ts      # simulación de peleas para balancear clases (npx tsx scripts/balance.ts)
```
Páginas: `/prueba` es la pantalla de batalla en solitario (banco de pruebas de la Etapa 1).
Regla: toda la lógica de juego vive en `lib/game` como funciones puras y testeables. La UI solo la consume.

## Reglas de diseño del juego

### Clases (plantillas base)
Caballero (vida alta), Mago (ataque alto), Pícaro (crítico y huida), Clérigo (cura). Cada una con Ataque 1 (seguro, poco daño) y Ataque 2 (arriesgado, mucho daño o menor precisión, con cooldown de 2 turnos).

### Elementos (5)
Fuego, Agua, Tierra, Rayo, Viento. Cada elemento le gana a 2 y pierde contra 2.
Ciclo: cada elemento vence a los dos siguientes de esta lista circular: **Agua → Fuego → Viento → Tierra → Rayo → (vuelve a Agua)**.
- Ventaja: +25% de daño. Desventaja: -25%.
- Aplica a personaje, arma y enemigo.
- La tabla vive solo en `elements.ts` para poder ajustarla fácil.

### Rarezas (5), para personajes y armas
| Rareza | Color | Prob. inicial | Multiplicador de stats |
|---|---|---|---|
| Común | gris | 50% | x1.00 |
| Poco común | verde | 28% | x1.15 |
| Raro | azul | 14% | x1.30 |
| Épico | violeta | 6% | x1.50 |
| Legendario | dorado | 2% | x1.80 |
- Probabilidades y multiplicadores son valores iniciales, ajustables desde `rarity.ts`.
- La rareza es fija. Los duplicados suben **estrellas** (0 a 5): cada estrella suma +10% de stats base (hasta +50%), multiplicando sobre la rareza. Un Legendario de 5 estrellas llega a ×2.7. Ajustable en `rarity.ts`.
- Pity: tras 100 tiradas sin Legendario, la siguiente lo garantiza.

### Personajes únicos
Dos personajes de la misma clase nunca son iguales:
- Stats sorteados en un rango de ±15% sobre la base de la clase.
- 1 o 2 rasgos al azar (ej. Terco: +defensa/-esquive; Sediento: cura al ganar; Gafe: -crítico pero más XP al perder).
- Elemento sorteado al nacer.
- Nombre y frase de batalla generados.
- Al subir de nivel el jugador elige entre 2 o 3 mejoras (build distinto por personaje).
- Legendarios especiales basados en los amigos del grupo: NO son fijos en el código; se crean dentro del juego (pantalla "Crear legendario": nombre, clase base, elemento y una habilidad de una lista de efectos predefinidos con valores topados para no romper el balance) y se guardan en Supabase.

### Combate por turnos
- Acciones: Ataque 1, Ataque 2, Defender, Huir.
- El enemigo anuncia su próxima acción antes de cada turno.
- La probabilidad de acierto y el daño estimado siempre son visibles antes de elegir.
- Huir cuesta parte de las monedas pero conserva la vida.

### Runs infinitas
- Al empezar una run eliges la **clase** (Caballero, Mago, Pícaro o Clérigo) pero no la "naturaleza": elemento, rasgos, variación de stats, nombre y frase salen al azar de la semilla.
- Empiezan con 3 vidas. Termina al perder las 3. Puntaje = piso máximo.
- Cada piso: 2 o 3 puertas a elegir (pelea fácil, pelea difícil, cofre, mercader, descanso, evento).
- Jefe cada 5 pisos.
- Reliquias: cada pocos pisos se elige 1 de 3, dura solo la run.
- Escalado del enemigo: `power = base * 1.12 ^ floor`. Cada 10 pisos se suma un modificador nuevo (regeneración, escudo, doble ataque, elemento cambiante).

### Gacha
- Moneda ganada en las runs (sin dinero real, nunca).
- Tirada de personaje y tirada de arma, con las rarezas de arriba.
- Duplicados suben estrellas. Pity incluido.

## Arte (pixel art en código)
- Sprites como cuadrículas de datos **32x32** (decidido; antes 16x16) renderizadas en SVG. Sin archivos de imagen. Pixel art duro, no chibi ni suave.
- Cada clase se define con la mitad izquierda espejada más parches asimétricos (`OVERLAYS`) para armas. Luz arriba-izquierda calculada automáticamente en `shade.ts`.
- Armas en mano por clase: Caballero espada y escudo, Mago bastón con orbe, Pícaro dos dagas, Clérigo maza y libro.
- Silueta propia por clase (hecho) y por familia de enemigo (hecho): limo (Pantano), diablillo (Cumbres), arpía (Cañón), gólem (Cavernas) y espectro (Tormenta), cada una con versión normal y de jefe (corona, ojos rojos, más grande). Gólem es la más floja; el espectro se parece algo al limo en ciertos colores.
- Paleta por elemento (el mismo sprite cambia de color).
- Íconos de elemento en pixel art 8x8 con tooltip que explica ventajas y desventajas; no se muestra el nombre en texto.
- Marco por rareza (el Legendario con brillo dorado animado).
- Accesorios chicos por rasgo para distinguir personajes de la misma clase (pendiente).
- Arma: espada básica cuyo color y largo cambian por elemento, con estrellas debajo.
- UI base inspirada en capturas de referencia (RPG pixel móvil): paneles marrón oscuro con borde doble naranja y pestaña de título, casillas con borde por rareza, insignias de rareza, botones verdes con bisel, fuente pixel. No hace falta copiar al detalle.

## Multijugador en línea
- Sala con código de 4 letras creada por un anfitrión.
- Misma semilla para todos los jugadores en cada ronda (mismos pisos y enemigos).
- Estado de sala sincronizado con Supabase Realtime.
- Ranking en vivo por ronda (piso máximo) y de la noche.
- Apuestas con fichas: antes de cada pelea los demás apuestan si el jugador gana o pierde.
- Interferir: gastar fichas para dificultar la próxima pelea de otro (enemigo más fuerte o elemento adverso).
- Jefe cooperativo final: se suma el poder de todos.
- Tiempo límite por turno (configurable por el anfitrión).

## Acceso y datos
- Login con **nombre + PIN de 4 dígitos fijos** (decidido: sin correo ni nada más; simple para los 7 amigos). Nunca guardar el PIN en texto plano: hash con sal y secreto del servidor. Recuperación: otro amigo/anfitrión reinicia el PIN.
- Limitar intentos fallidos por nombre y por IP (con solo 10.000 combinaciones, el límite de intentos es la defensa principal), mensajes de error iguales para que no se sepa qué nombres existen.
- RLS activado en todas las tablas. Cada jugador solo escribe sobre lo suyo.
- Tablas previstas: `players`, `characters`, `weapons`, `runs`, `rooms`, `room_players`, `bets`, `gacha_state` (contador de pity).
- Se guarda por jugador: colección, monedas, estrellas, pity y piso máximo.
- Las tiradas y resultados de combate se resuelven en servidor (Route Handlers o funciones de Supabase), no en el cliente.

## RNG
- Todo azar pasa por `rng.ts` con semilla (ej. mulberry32). Nunca `Math.random()` directo en la lógica de juego.
- Esto permite misma semilla para todos y tests reproducibles.

## Convenciones
- TypeScript estricto, sin `any`.
- Funciones pequeñas y puras en `lib/game`; tests con Vitest para elementos, rareza, escalado, pity y combate.
- Componentes de UI sin lógica de juego.
- **PC primero** (decidido: el dispositivo principal es la computadora; el celular es secundario pero debe funcionar y no desbordar). Pantalla de batalla sin scroll en escritorio.
- Commits en inglés, pequeños, uno por cambio lógico.

## Etapas
1. **Combate en solitario**: 4 clases, generación de personajes únicos, 5 elementos, combate por turnos con probabilidades visibles, sprites básicos.
2. **Run infinita**: pisos, puertas, jefes, reliquias, escalado.
3. **Gacha y colección**: tiradas, rarezas, estrellas, pity, guardado en Supabase con nombre + PIN.
4. **Sala en línea**: lobby, misma semilla, ranking, apuestas, interferir, jefe cooperativo.

## Decisiones de diseño acordadas (aún sin implementar)
- Enemigos: una familia por mundo (bestias, no-muertos, golems…), con silueta propia y jefes con nombre. Los mundos son bloques de 10 pisos con nombre y elemento dominante (propuesta del agente de la Etapa 2, a revisar).
- Pantalla de la run: una fila de 2 o 3 tarjetas por piso con ícono y texto, sin mapa.
- Armas: suman ATQ según rareza y estrellas, y su elemento es el del ataque (hoy solo cuenta el del personaje).
- Gacha: una tirada cuesta lo equivalente a ~3 pisos de monedas de run; pity en 100 (decidido 2026-10-06).
- Colección y run: al empezar una run eliges la clase y luego uno de tus personajes de esa clase (su elemento, rasgos y stats vienen ya definidos y suben con rareza y estrellas). Si no tienes ninguno de esa clase, parte uno Común al azar.
- Duplicados del gacha: un personaje se guarda siempre, salvo que sea un duplicado exacto (clase + elemento + rareza): entonces suma +1 estrella al que posees (en 5 estrellas devuelve el 50% del costo). Además, cada tirada cuya clase + rareza ya tengas (con otro elemento) da 1 **fragmento** de esa clase y rareza; 3 fragmentos = +1 estrella a un personaje de esa clase y rareza que elijas. Cada estrella suma +10% de stats, multiplicado sobre la rareza. Pity por banner (personajes y armas por separado): a las 100 tiradas sin Legendario, la siguiente lo es.
- Armas con 6 tipos (espada, hacha, lanza, arco, bastón, daga) × 5 elementos × 5 rarezas = 150 combinaciones; cada tipo tiene un sabor (multiplicador de ATQ y un efecto secundario pequeño). Las monedas de una run se guardan al terminar, perder o abandonar (una sola vez por run).
- Cada clase tiene un pasivo visible (implementado y balanceado; constantes `CLASS_PASSIVE_*` en `characters.ts`): Caballero "Muralla" (−10% daño recibido), Mago "Foco arcano" (ventaja elemental +40%), Pícaro "Filo mortal" (críticos ×2.0), Clérigo "Bendición" (regenera 1.5% de la vida máxima al final de cada turno; bajado del 4% inicial porque con más el Clérigo ganaba 58% y los Clérigos enemigos alargaban demasiado las peleas). Los enemigos de cada clase también tienen su pasivo. Clases dentro de ±3% (49.4 / 49.7 / 51.3 / 49.6).
- Velocidad = acciones extra (decidido): el más lento actúa 1 vez por ronda; el más rápido actúa `velocidad ÷ velocidad del otro` veces, guardando el sobrante (12 vs 6 = 2 por ronda; 12 vs 8 = 1, 2, 1, 2…; tope por ronda ajustable). Cooldowns y regeneraciones cuentan por ronda. En implementación.
- Hecho (pedido del usuario): interfaz más clara con tooltips ricos (hover, foco y toque) que explican cada rasgo, pasivo, reliquia, modificador, elemento, stat y acción con números reales (`explain.ts`, `Tooltip.tsx`, `Chip.tsx`); clases rediseñadas (más detalle, sombreado y armas); escenario propio por mundo y sala de jefe distinta (`ArenaBackground`, 5 mundos × normal/jefe, suelo al 70%, animaciones que respetan "reducir movimiento"). El fondo solo se usa en `/run`; `/prueba` mantiene el fondo simple.
- Revisión visual pendiente: accesorios sobre Mago/Pícaro/Clérigo tras el rediseño, jefes de Tormenta y Cavernas a tamaño real, pantallas de mercader/evento/reliquia en celular.
- Sonido: se mantienen los mismos efectos actuales; no habrá música de fondo por ahora.
- Armas: bonus plano de ATQ (base 4 × rareza × estrellas) y su elemento pasa a ser el elemento del ataque del héroe.
- Persistencia por ahora local en el navegador (perfil versionado y serializable) hasta conectar Supabase; las tiradas reciben el Rng como parámetro para pasarlas al servidor después.
- Dificultad objetivo de la run: no todas las runs se completan, pero una build afortunada puede ser muy fuerte (mediana piso 14-18, p90 ≥ 28, top 1% ≥ 40); una run dura ~15-25 min y las horas de una noche (2-4 h) salen del ciclo run → monedas → gacha → colección. El factor de escalado deja de ser fijo en 1.12 y se ajusta por simulación.
- Dos monedas distintas: **monedas** (se ganan en runs, sirven para gacha y mercader, se guardan en la cuenta) y **fichas** (solo viven dentro de una sala/noche; sirven para apostar e interferir; no se convierten en monedas; cuentan para el ranking de la noche). Mecánica propuesta, por probar en una noche real y ajustar (constantes en un solo archivo): todos empiezan con 100 fichas; apostar es 1 a 1 sobre ganar o perder la pelea de otro jugador (mínimo 10, no se puede apostar más de lo que se tiene); interferir cuesta 30 y deja la próxima pelea del objetivo más difícil (enemigo +20% o elemento adverso), una vez por pelea; si el objetivo gana igual, recibe 15 fichas de compensación; ranking de la noche por fichas, aparte del ranking por piso máximo.
- Tiempo límite por turno en la sala: 30 s por defecto, configurable por el anfitrión; si alguien se desconecta pierde el turno.
- Supabase: se configura más adelante (el usuario crea el proyecto y pasa las claves para `.env.local`).
- Abiertos: probar en tamaño celular (mobile first), música de fondo.

## Realidad del código (decisiones tomadas; actualizar cuando algo cambie)
- Todo corre en local; sin git, sin Supabase, sin deploy por ahora.
- Pantalla de batalla `/prueba`: arena con suelo, personajes de frente (≈27% del ancho cada uno), tarjeta del rival arriba a la izquierda y la propia abajo a la derecha, panel de Acciones en cuadrícula 2x2, Registro a la derecha con lo más nuevo arriba, botón "Nueva pelea" dentro del Registro. Todo debe caber sin scroll en escritorio.
- UI: paneles marrón con doble borde y pestaña de título, botones verdes con bisel, fuente Chakra Petch (cambiada desde Pixelify Sans por legibilidad).
- Animaciones: avance corto al atacar (20%) y parpadeo/sacudida corta al recibir golpe (3%), escalonadas 0.5 s como los sonidos.
- Sonido: espadas sutiles para Caballero y Pícaro (golpe, crítico con tintineo metálico, fallo tipo silbido); Mago con barrido brillante de hechizo; Clérigo con campanilla en su Ataque 2 (Plegaria) y maza normal en el Ataque 1. Rival más grave, jingles cortos de victoria y derrota, botón para silenciar en el Registro (el estado no se guarda al recargar).
- Stats: vida, ataque, defensa, crítico, esquive, velocidad, más `accuracy` y `flee` (aditivos, vienen de rasgos).
- 20 rasgos implementados como modificadores de stats. `Sediento` (cura al ganar) y `Gafe` (más XP al perder) quedan guardados como etiqueta hasta la Etapa 2.
- Iniciativa: cada clase tiene `speed` (Caballero 8, Mago 10, Pícaro 12, Clérigo 10; ±15% por personaje y algunos rasgos la modifican). Cada turno se tira `speed × (0.7 a 1.3)` para cada lado y el mayor actúa primero. La pantalla avisa quién actúa primero ("Rival anuncia: … · actúas primero"). Defender aplica durante todo el turno sin importar el orden.
- Hallazgo: actuar primero pesa solo ~4 puntos de victoria. La ventaja del "jugador" en las simulaciones viene sobre todo de que la IA del rival desperdicia turnos (defiende 20%); no es un desbalance entre clases.
- Balance (2000 peleas por cruce, rasgos y elementos al azar): Caballero 49%, Mago 50%, Pícaro 51%, Clérigo 50%; ~9 turnos por pelea. Volver a correr `scripts/balance.ts` tras tocar stats base.
- Progresión (banco de pruebas): ganar da 25 XP; subir de nivel pide `40 + 20×(nivel-1)` XP. Al subir se eligen 1 de 3 mejoras al azar entre 10 (vida, ATQ, DEF, crítico, esquive, precisión, velocidad, huida, y dos con compromiso: Furia y Coloso). El rival del siguiente combate escala `1.12^(nivel-1)` (misma curva que los pisos). La vida se recupera por completo entre peleas en este banco; en la Etapa 2 la vida pasará de piso en piso. Huir conserva al personaje; perder pide un personaje nuevo.
- Etapa 2, lógica lista (sin pantalla aún): `run.ts` (estado, puertas, nodos, mercader, eventos, constantes de tuning), `relics.ts` (12 reliquias), `events.ts` (8 eventos), `worlds.ts` (5 mundos de 10 pisos con elemento dominante, propuesta aceptada) y `combat.ts` ampliado de forma compatible con los 4 modificadores (regeneración, escudo, doble ataque, elemento cambiante). Reglas: la vida se arrastra entre peleas; perder una pelea cuesta 1 vida y se reintenta el piso con 60% de vida; huir cuesta 30% de las monedas, conserva vida y deja en el mismo piso; reliquia 1 de 3 al terminar cada piso múltiplo de 3; jefe cada 5 pisos; modificadores desde el piso 10 en todos los enemigos (solo hay 4, del 40 en adelante no se suman nuevos).
- Simulación de runs (`npx tsx scripts/run-sim.ts`, bot simple sin huida ni reliquias): mediana piso 10, p90 13. Las muertes se agrupan en los jefes (pisos 5, 10 y 15; 137 de 300 en el 10). Ojo: el jefe está definido más débil que una pelea difícil (`FIGHT_POWER`), y el piso 10 coincide con el primer modificador. Afinar cuando exista la pantalla de la run.
- Balance de rasgos (`npx tsx scripts/trait-balance.ts`): medido con 40000 peleas; cada rasgo queda dentro de ±3.5 puntos de victoria respecto al promedio (antes de −9.5 a +5.7: Frágil y Cobarde eran muy malos, Fornido, Tenaz y Lúcido muy buenos). Los bonus/penalidades de rasgos sobre vida, ATQ, DEF y velocidad suman con tope de ±25% (`TRAIT_MULT_CAP`). La vida de un Mago va de ~55 a ~120 (antes 48 a 132). Los efectos diferidos de Sediento y Gafe justifican que queden un poco por debajo.
- Combate: huir con éxito ya no ignora el golpe del enemigo que actuó primero (bug corregido); tras el turno 40 el enemigo se enfurece (+10% ATQ por turno) para evitar combates eternos (Clérigo contra Clérigo con regeneración).
- Run endurecida (revisión independiente, 57 tests): cada piso abre un solo nodo (`Run.node`) y hay que resolverlo (`leaveNode`, `resolveEvent` o `applyBattleResult`) antes de `nextFloor`; no se puede saltar piso, repetir cofres/descansos/eventos ni dejar una reliquia o mejora sin elegir. Eventos y tienda validan costos (el evento sin recursos devuelve null; vida extra al máximo y poción con vida llena no se cobran). Reintentar una pelea cambia la semilla (`attempts`). Las reliquias no se repiten y tienen topes (`RELIC_CAPS`). Todo el estado es serializable y determinista, lo que permite validar en servidor.
- Dificultad afinada (verificada con 600-2000 runs simuladas por 4 estrategias de bot): enemigo `base × FLOOR_SCALE^piso × multiplicador` con `FLOOR_SCALE` = 1.21 (la regla antigua 1.12 queda solo para `scaleForLevel` del banco de pruebas), `FIGHT_POWER` easy 0.3 / hard 0.4 / boss 0.27, vida del enemigo ×2, modificadores en pisos 12 (regeneración), 20 (escudo), 28 (doble ataque) y 36 (elemento cambiante), puertas con presión de pelea desde el piso 3 y descanso siempre antes de un jefe. Resultado: mediana piso 17-18, p10 7-10, p90 31, p99 43, ningún jefe pasa de ~11-14% de las muertes, ~23-25 min por run, pelear (mediana 17) rinde más que esquivar (12). La mediana según legendarias conseguidas es 12 con 0, 16 con 1, 21 con 2 y 30 con 3 o más.
- Reliquias con rareza (24: 10 comunes, 8 raras, 6 legendarias; pesos 62/30/6 que mejoran con el piso), 5 sinergias por pares, efectos nuevos (robo de vida, daño crítico, regeneración, reducción de daño, multiplicador de daño). Las mejoras se acumulan (+40% por repetición hasta ×3) y desde nivel 5 aparecen 5 mejoras de tier 2. Constantes en `progression.ts`, `run.ts`, `relics.ts`, `combat.ts`.
- Puntos débiles conocidos: la DEF casi no sirve en pisos profundos (`atk×poder − DEF×0.5`); un héroe con mucha vida y poco ataque puede alargar peleas de 40+ turnos hasta el enrage; las reliquias se agotan hacia el piso 60.
- Pantalla `/run` jugable: selección de clase (elemento y rasgos se revelan al empezar), HUD con piso, mundo, vidas, monedas, XP, vida y reliquias; puertas como cartas con ícono; tienda, eventos, cofre/descanso, elección de mejora y de reliquia, game over con puntaje. `?seed=1234` repite la misma run. La presentación de batalla es compartida con `/prueba` (BattleArena, HudCard, ActionPanel, LogPanel). Menú de inicio en `/`.
- Fábrica de azar: `rng.ts` en la lógica; la página usa `Date.now()` solo para crear la semilla en cliente.
- Instalación: Vitest requiere `--legacy-peer-deps` por conflicto de `@types/node` con Next; `vite` se instaló explícito. El scaffold de Next dejó un `AGENTS.md` (reglas de Next.js) que no está enlazado desde este archivo.

- Actualización 2026-10-06 (decidido y hecho): tope de **100 pisos** (`MAX_FLOOR`; al limpiar el 100 la run termina en victoria con +500 monedas); apilamiento de mejoras suave (`UPGRADE_STACK_STEP 0.15`, `CAP 1.75`, `UPGRADE_POWER 5.0`; mediana 12-15, p90 ~30, p99 ~42), `STORM_POWER 0.8`, `FIGHT_POWER.boss 0.22`; 4 rasgos nuevos con "regla de run" y costo (Filo del azar, Último aliento, Espinas —nunca en Caballero—, Apostador; `rules` y `traitTotals` en `traits.ts`, 20% de personajes nuevos los reciben, `RULE_TRAIT_CHANCE`); salas reales con polling (2 s, 5 s en lobby, 15 s pestaña oculta), temporizador por turno, expulsar, premios y títulos de noche, votación de piso 3 y 7, interferir a 20 para el último; racha diaria (+50 día 3, +100 día 7); mercado de trueque `/mercado` (una estrella por trueque); producción en Vercel (cada push a `main` despliega; si hay migraciones nuevas ejecutar `setup.sql` en Supabase antes). Principio de diseño acordado: bonos sumados dentro de cada categoría con topes, rasgos como reglas con costo, sin regalos; ver `docs/ESTADO.md`.
- Visual fase 2 (aprobada): efectos por código (números de daño, pausa de impacto, partículas, entrada de jefe, apertura de gacha, parallax, confeti, podio, etc.; detalles en `docs/MEJORA_VISUAL.md`). Decidido: sin archivos de imagen; se descartaron el icono de intención del enemigo y el brillo holográfico de cartas. Pity del gacha: 100.

- Hecho (Etapa 1 de `docs/DUNGEONS_FORJA.md`): 9 tipos de arma (nuevos maza, varita, libro) y `CLASS_WEAPONS` en `weapons.ts` (Caballero espada/hacha/lanza; Mago bastón/varita/libro; Pícaro daga/arco; Clérigo maza/bastón/libro); equipar se rechaza si la clase no puede usar el arma (cliente, `migrate` y ruta `/api/collection/equip`); pantalla "¿Equipar?" al empezar una run si el héroe elegido no tiene arma. Migración `0011_weapon_types.sql` (ejecutar `setup.sql` en Supabase antes del push). Pedido de arte completo en `docs/PEDIDO_ARTE.md`.
- Hecho (Etapa 2): las 5 rarezas se reemplazaron por **9 rangos F, E, D, C, B, A, S, SS, SSR** en personajes, armas y fragmentos (`rarity.ts`: ids `f e d c b a s ss ssr`, multiplicadores x1.00 a x2.30, probabilidades 30/22/16/12/9/6/3/1.5/0.5%). Las rarezas de reliquias no cambian. Migración de colección guardada y de Supabase (`0012_ranks.sql`): Común→F, Poco común→D, Raro→C, Épico→A, Legendario→S (también claves, equipado, fragmentos y ofertas del mercado). Pity doble por banner: SS o mejor a las 100 (`pity`), SSR a las 200 (`pitySsr`, columna `pity_ssr`). `apply_pull` ahora recibe `p_pity_ssr`. Modo nivelado usa SSR como tope (x3.45 con 5 estrellas). `ENGINE_VERSION` no se tocó (el motor no lee el rango). Ejecutar `setup.sql` en Supabase antes del push; las pruebas `supabase/tests/pglite` se actualizaron pero no se ejecutaron.
- Hecho (Etapa 3): equipo de 6 casillas (arma, casco, peto, piernas, zapatos, collar). Las piezas de armadura viven en la misma tabla/colección que las armas (`WeaponType` ahora incluye `casco peto piernas zapatos collar`; `HAND_TYPES` = las 9 armas); el banner "weapon" se muestra como **Equipo** y da las 14 clases de pieza. `equipped` guarda el arma bajo el id del héroe y cada pieza bajo `heroId|casilla` (tabla `equipment` con columna `slot`). Bonos en `gear.ts` (`GEAR_BASE`, `GEAR_CAP`, escalados por rango y estrellas; `heroFromOwned` los suma y deja `hero.gear`; `normalizeHero` los deshace en modo nivelado). Sin balancear por simulación todavía.
- Hecho (hub, pasos H1-H5 del plan de pantallas): `AppShell` (barra superior fija con monedas, sonido y sesión; barra inferior de pestañas Dungeons · Héroes · Invocar · Forja "Pronto" · Sala) envuelve las rutas `/`, `/coleccion`, `/mercado`, `/gacha` y `/sala`; combate, salas en vivo, login y admin quedan sin marco. Portada `/` = hub con el mejor héroe animado, estadísticas y botón "Entrar al dungeon". Detalle del héroe con "muñeco" de 6 casillas (`.doll`), el Mercado se abre desde Héroes y el pity del gacha se ve en barras SS y SSR. Estilos en `src/components/shell.css`. - Hecho (Etapa 4, rediseñada): botín **permanente con puntos de control**. Cofre 50% pieza, jefe 1 de 2 (+1 rango), mercader 1 pieza (`loot.ts`; `Run.loot` = lo que llevas puesto, `bag` = sin asegurar, `secured` = asegurado). Cada jefe vencido asegura toda la mochila (incluido su propio botín); lo recogido después del último jefe se pierde si caes o abandonas. Al terminar, `bankRun` / `bank_run` (SQL, `p_loot`) entrega `secured` a la colección: pieza nueva, +1 estrella si es duplicado o reembolso si ya tiene 5. El servidor paga lo que dice la repetición, no lo que dice el cliente. La pieza puesta suma sobre el equipo de colección (no lo reemplaza, salvo el arma: cambia ATQ y elemento). Acción de replay `{t:"loot", i}` (-1 = dejar). Las rondas de sala no tienen botín (`createRun(seed, hero, false)`). Simulación (300 runs/bot): mediana 13-15, p90 33-36, p99 ~52. `LOOT=0 npx tsx scripts/run-sim.ts` compara sin botín. El rango del botín ya depende del rango del dungeon (Etapa 5).
- Hecho (Etapa 5): **dungeons F..SSR** reemplazan la run infinita en `/run` (`dungeons.ts`; la run clásica de 100 pisos sigue solo en las rondas de sala con `rank = null`). Longitud y jefes según la tabla de `docs/DUNGEONS_FORJA.md`, descanso garantizado antes de cada jefe, jefe final ×1.25 que cierra la run; dificultad = piso + `offset` por rango (0,1,1,2,3,4,5,6,8); botín por presupuesto (ver abajo); monedas de victoria por rango. Desbloqueo: limpiar el rango anterior; A, S y SS piden ≥2 vidas restantes en esa limpieza y SSR ≥3 (`UNLOCK_MIN_LIVES`). `profile.dungeons` (rango → mejores vidas) se guarda en Supabase (`dungeon_clears`, `bank_run(p_clear)`) solo si la repetición del servidor confirma la victoria; el servidor valida el desbloqueo al empezar (`dungeon_locked`). Pantalla de elección de dungeon antes de la clase. Calibración (`DUNGEON=<rango> HERO_STARS=3 npx tsx scripts/run-sim.ts 150 smart`, héroe del mismo rango con 3 estrellas, sin equipo): limpia F 97%, E 90, D 81, C 75, B 59, A 48, S 33, SS 16, SSR 5 (SSR con 5 estrellas: 11%). Bug corregido: `/run` no activaba el botín (`createRun(..., true, rank)` ahora sí). Salas con rango: ver Etapa 8.
- Hecho (Etapa 6): **partes y núcleos** (`parts.ts`). 14 partes por tipo × 9 rangos (clave `p-<tipo>-<rango>`, p. ej. "Hoja de espada SSR") y 5 núcleos por elemento (`core-<elemento>`), guardados en `profile.parts` (tabla `part_stock`; `bank_run(p_parts)`). Drops (`PART_DROPS`): pelea fácil 25% de 1 parte, difícil 40%, jefe 2 partes + 1 núcleo, jefe final 3 partes (+1 rango) + 2 núcleos, cofre 1 parte (+25% núcleo); rango = el del dungeon -1/0/+1. Van a la mochila de la run y los asegura el siguiente jefe, igual que el botín (`Run.partBag/partSecured/lastDrops`); el servidor paga lo que dice la repetición. Pestaña "Partes" en Héroes. La forja (Etapa 7) las consume.
- Hecho (reparto del botín por **presupuesto**, `budget.ts`): cada dungeon tiene `dungeonBudget(rango) = pisos × 1.5 × (1 + 0.1 × índice)` puntos (F 12 … SSR 68). Cada pelea, cofre y jefe toma una fracción al azar de lo que queda (fácil/difícil 5%, cofre 15% con mínimo 1, jefe 20%; el jefe final se lleva todo el resto) y lo reparte al azar en partes (1 punto), núcleos (1) y piezas (2; solo cofre 40% y jefes, que ofrecen 2-3 para elegir 1). Rango de cada drop: el del dungeon o inferior (cada escalón la mitad de probable) y una chance de **un rango más** (fácil 6%, difícil 16%, cofre 10%, jefe 18%, final 25-30%, +4%/+8% con grupos de 2/3). **Arriesgar mejora el botín sin gastar pozo**: pelea difícil +60% de puntos gratis, jefe +30%, cada enemigo extra +30%. Lo no gastado vuelve al pozo (`Run.lootPool`). Tienda: pieza con la misma regla de rango. Las runs sin rango (salas) usan las reglas viejas y no dan botín.
- Hecho (Etapa 7): **forja** (`forge.ts`, pantalla `/forja`, pestaña Forja del hub) y **mercado con equivalencia**. Forja: *Armar* (3 partes del tipo y rango + 1 núcleo del elemento + monedas; duplicado = +1 estrella, no sobre 5), *Fusionar partes* (ratio 4,4,3,3,3,2,2,2 + 1 núcleo + monedas al rango siguiente), *Fusionar piezas* (N piezas del mismo tipo y rango y distinto elemento → 1 del rango siguiente, pierden estrellas), *Refinar* (3 partes del mismo rango → 1 del tipo elegido) y *Desmontar* (pieza sin equipar → 2 + estrellas partes). Costos en monedas por fusión (`COMBINE`): 5, 10, 20, 50, 150, 450, 1400, 4200 (Armar = la mitad de fusionar hasta ese rango); `npx tsx scripts/forge-sim.ts` da ≈4 semanas de monedas a 3 runs/día para una pieza SSR por fusión pura. El servidor corre el mismo código y persiste el diff con `apply_forge` (versión optimista, valida existencias). Mercado: toda oferta debe ser **equivalente ±25%**: una pieza vale lo que cuesta una copia de su rango en el gacha (`TRADE_VALUE`: F 500, E 700, D 950, C 1250, B 1650, A 2500, S 5000, SS 10000, SSR 30000); valor(lo que pides) + monedas debe quedar a ±25% del valor de lo que das (monedas > 0 las paga quien acepta, < 0 quien ofrece); se acabaron los regalos; vender por monedas solo a precio justo. Se valida al publicar y al aceptar (`trade_fair` en SQL, migración `0013_forge_trade.sql`). Salas con rango: ver Etapa 8.
- Hecho (Etapa 8, servidor): **salas con rango**. `RoomState.rank` (F por defecto), acción `set_rank` (solo anfitrión, solo en el lobby), mensajes `create{rank}` y `set_rank`, columna `room_state.rank` y `set_room_rank` en `0014_room_rank.sql`. El rango solo cambia la **dificultad** de los enemigos (`Run.difficulty`, `depthOf(floor, rank, difficulty)`, puertas con presión y relicarios incluidos); la ronda conserva su diseño de 10 pisos con jefes en 5 y 10 y no tiene botín. El servidor exige que todos los presentes tengan el rango desbloqueado al elegirlo y de nuevo al iniciar la ronda (`rank_locked`, 409). El lobby tiene un selector de rango para el anfitrión y muestra el rango a los demás. Pendiente: botín por rango dentro de las rondas (hoy no hay) y pruebas del servicio con un almacén falso.
- Hecho (atajos de forja): pestaña **Atajos** en `/forja` con vista previa antes de ejecutar: *Fusionar todo* (un rango), *Subir en cadena* hasta un rango (con "refinar sobrantes primero"), *Refinar sobrantes*, *Desmontar lo que no usas* (rango máximo y estrellas máximas, hasta 60 piezas, con confirmación) y *Armar al máximo*. Teclas 1-5 cambian de pestaña. Son operaciones de `forge.ts` (`mergeAll`, `chain`, `refineAll`, `dismantleLow`, `craftMax`) que simulan las simples y devuelven **un solo diff neto** (lo intermedio se cancela); el servidor las planifica solo con esos parámetros y las guarda con `apply_forge` (límites subidos en `0015_forge_bulk.sql`: 10 piezas ganadas y 80 consumidas por llamada).
- Hecho (ayudas entre jugadores en salas): durante las apuestas, quien no pelea puede **ayudar** a un peleador: *Curar* (+40% de vida antes de la pelea) o *Bendecir* (+15% ATQ/DEF durante la pelea). Cuesta 20 fichas fijas; si el ayudado gana, el ayudante recupera 10 (sin compensación para el objetivo). Comparte el cupo de intervención: **una por pelea**, estorbo o ayuda (`InterfereKind` + `AID_KINDS`, `isAid`, `interference.ts`). Se aplica en `applyRoomAction`, igual en cliente y en la repetición del servidor. Al revelar, la lista muestra "ayudado (Curación) por X" en verde. SQL `0016_room_aid.sql` (tipos de `interferences`, constantes `aid_cost`/`aid_refund`, `interfere`, `settle_battle`, `night_summary`: el "saboteador" solo cuenta estorbos).
- Hecho (inicio de dungeon): ya no se pregunta la clase primero. Tras elegir el dungeon se muestran **tus personajes ordenados por poder** (`heroPower`: vida × (ATQ + ½ DEF) con rango, estrellas, arma y equipo; el más fuerte viene preseleccionado) y el botón "Personaje al azar (run clásica)", que recién ahí pide la clase. Sin personajes en la colección se pasa directo a la clase. En lugar de la pregunta de equipar hay un panel **Equipamiento** (`EquipmentEditor`, el mismo muñeco de 6 casillas de Héroes): botón "Equipamiento" al elegir héroe, y "Empezar" lo abre solo si el héroe no tiene arma y hay una compatible libre; desde ahí se cambia arma y armadura y se pulsa "Entrar al dungeon".
- Hecho (reajuste de economía, `0017_economy.sql`; **sin volver a medir todavía**): tirada del gacha **250** (antes 150; ×10 = 2.250), monedas iniciales 500, valor de intercambio = 250 / probabilidad (`TRADE_VALUE`: F 830, E 1.140, D 1.560, C 2.080, B 2.780, A 4.170, S 8.330, SS 16.670, SSR 50.000), y **monedas por limpiar un dungeon** que crecen ×1.6 por rango (`VICTORY_COINS` F 30 … SSR 290; además FIGHT_COINS, CHEST_COINS y SHOP_PRICES a ~45%: run F ~190, S ~330 (clear ~450); referencia web: 15-20 tiradas por semana para un F2P) para que intentar S/SS/SSR no sea un pozo de monedas; el tope por run de `bank_run` suma +20.000 solo con una limpieza verificada. Motivo: con 3 runs/día se ganan ~11-22 tiradas diarias, el pity SSR (200 tiradas) salía en ~2-3 semanas y era más barato que la forja (~59.000 monedas), y el ingreso por run caía en S/SS/SSR (781/539/244) mientras las fusiones de esos rangos cuestan 1.400-4.200. La forja queda igual. Pendiente: re-medir con `scripts/gacha-sim.ts`, `run-sim.ts` y `forge-sim.ts`.
- Hecho (mejoras aditivas, `ENGINE_VERSION = 5`): las mejoras de nivel ya NO se multiplican entre sí. Cada elección suma una fracción del valor INICIAL del héroe en la run (`Run.upBase`), las fracciones de un stat se suman y tienen tope (`UPGRADE_TOTAL_CAP`: vida +500%, ATQ +400%, DEF +400%, velocidad +150%; piso −50% para Furia/Coloso) con `UPGRADE_POWER = 9`. Motivo: con la regla multiplicativa un héroe nivel 7 llegó a ATQ 11.390. Sets de elemento (`gear.ts`: 2 piezas = bono chico, 4 = mayor, ×1.5 con afinidad) y botón Autoequipar. Simulación sin equipo (héroe del rango con 3 estrellas, 200 runs): E 92%, C 77%, A 35%, S 17%, SS ~2%, SSR 0% (antes 90/75/48/33/16/5): los rangos altos piden estrellas y equipo. Run clásica: mediana 17, p90 23, p99 28 (antes p90 33, p99 42). Capas que siguen multiplicándose entre categorías, cada una con tope: equipo (`GEAR_CAP`), mejoras, reliquias (`RELIC_CAPS`: stats +120%, dmgMult ×2, daño crítico +120%), rasgos (`TRAIT_MULT_CAP` 25%).
- Hecho (ascensión, `ENGINE_VERSION = 6`, migración `0019_ascension.sql`; ejecutar `setup.sql` antes del push): niveles 0-5 opcionales por dungeon, se abre el N+1 al limpiar el N en ese dungeon (`profile.ascensions`, `dungeon_clears.best_asc`, `maxAscension`). Reglas acumulables (`dungeons.ts`): por nivel enemigos +12% vida y +5% ataque; L2 fogatas curan la mitad; L3 peleas difíciles con un enemigo más; L4 jefes con doble ataque; L5 empiezas con 2 vidas. Cada nivel: monedas de victoria +20% y presupuesto de botín +10%. El nivel viaja en el json del héroe de `runs` y el servidor lo repite. Calibración (`ASC=<n> DUNGEON=c HERO_STARS=3 npx tsx scripts/run-sim.ts 200 smart`): limpia 82/73/64/56/41/26% de nivel 0 a 5. Selector en la pantalla de dungeon.
- Hecho (jefe cooperativo, migración `0020_room_coop.sql`; ejecutar `setup.sql` antes del push): tras la ronda 2 (`coopMinRound`) el anfitrión ve "Jefe final (todos juntos)" en `round_end`. Cada jugador pelea en su pantalla contra el mismo jefe (`coop.ts`: `coopNode`, jefe de piso 7, nunca Clérigo, vida ×12 para que nadie lo mate solo; héroe nuevo de la ronda, una sola vida, turno de 30 s, solo acciones `act`). Cliente envía el registro tras cada acción (`coop_submit`); el servidor lo repite (`replayCoop`) y guarda el mejor daño por jugador en `room_coop`; la barra compartida (`coopPool` = 1.6 jefes normales × jugadores, `poolPerPlayer`) suma esos daños; gana el grupo si la suma llega al pozo. Termina cuando todos acabaron o a los 5 min. Modo nivelado ignora el rango de la sala (`coopRank`). Calibración (`npx tsx scripts/coop-sim.ts 150 null`): daño medio ~2 jefes por jugador, el grupo gana ~60-65% con 2 a 7 jugadores. Sin premios todavía (MVP y resultado se muestran en la barra y el resumen). Probado con el cliente falso y tests puros; falta probar en vivo.
- Hecho (premio del jefe cooperativo, migración `0021_coop_reward.sql`): todos los que hicieron daño cobran (ganan: 150 monedas, 1 núcleo, +50 fichas; MVP +1 núcleo y título Matajefes; pierden: 30 monedas, +10 fichas). `coop_pay` paga una vez por jugador (`room_coop.paid`) y limita monedas/núcleos a 3 salas por 24 h (solo fichas después). Constantes `COOP_REWARD` en `coop.ts`.
- Hecho (torre semanal, v4.0, migración `0022_tower.sql`, `/torre`, `?torre=nivelado|coleccion` en `/run`, `tower.ts`): run sin fin con la semilla de la semana (`get_weekly_seed`), igual para todos; dos modos con rankings separados (nivelado: héroes normalizados; colección: tu héroe a poder completo); intentos ilimitados, cuenta el mejor piso (`tower_scores`, solo con repetición verificada y sin acciones ilegales). La run no paga monedas, botín ni partes. Premios semanales perezosos (`tower_state` liquida las 2 últimas semanas, una vez): top 3 de cada modo con ≥ 8 pisos, 300/200/100 monedas y 2/1/1 núcleos (`TOWER_PRIZES`). Mismos topes anti-granja de las runs (ritmo por acción, 60 runs/día, 20 inicios/hora). Modo local: juega con semilla del calendario, sin ranking. Pruebas: `node supabase/tests/pglite/tower.mjs`.
- Hecho (misiones, v5.0, migración `0023_missions.sql`, `/misiones`, `missions.ts`): 3 diarias (renuevan a diario) + 3 semanales (lunes) + 3 del evento **Viernes de sala** (viernes y sábado), sorteadas de forma determinista desde el día/semana (sin tabla; solo se guarda progreso). Puntos de actividad con 3 hitos; un cambio de misión por periodo. Premios fijos en SQL (`mission_claim`, deben coincidir con `SCOPE_TIERS`): diaria 100/150/250 (500), semanal 250/400/600 + núcleo (1.250), evento 100/200/700 + núcleo (1.000). El progreso lo cuenta el servidor desde la repetición verificada de runs (`Run.wins/bossWins`), tiradas y forja (`trackMissions`, best effort) y por triggers de SQL en salas (apuesta ganada, ayuda, daño al jefe coop, ronda con ≥3 pisos). Solo con Supabase (sin modo local). Medido con `gacha-sim.ts`: las misiones aportan ~23 tiradas/semana, cerca de la mitad del ingreso total. Forja: botón "Ver tutorial" con viñetas largas por pestaña (`guide.ts`). Pendiente: probar triggers de salas en vivo; el cambio de misión puede dejarla completa al instante (el progreso se cuenta por tipo).
- Falta (hub): carrusel de banners con arte propio y sonido por clic en pestañas.

Estado actual (2026-10-06): publicado en Vercel (boludos-dragones.vercel.app) con login en la nube; Etapas 1-3 jugables; salas reales, racha diaria, votación de sala, premios y mercado de trueque construidos pero sin probar en vivo (ver docs/ESTADO.md); ritmo de niveles afinado (`UPGRADE_POWER 4.8`, `XP_GROWTH 1.2`, `STORM_POWER 0.8`; mediana piso 13-14, p90 ~33). (Resumen histórico a continuación.) Etapa 1 en curso. Hecho: clases, personajes únicos con 20 rasgos y frases, 5 elementos con íconos, combate con probabilidades visibles, sprites 32x32 con armas, sonidos y animaciones, balance, iniciativa, XP y mejoras al subir de nivel. Accesorios por rasgo hechos (algunos poco legibles: Escurridizo, Frágil, Temerario, Glotón).
