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
- Entorno real: proyecto de Supabase creado; `.env.local` válido (6 variables, permisos 600); `supabase/setup.sql` (5 migraciones) ejecutado con éxito en la base real ("Success. No rows returned"). Hecho: interruptores apagados, cuenta admin creada, 9 migraciones ejecutadas. Falta revisar el Security Advisor tras cada migración.
- Prioridad (decidida): lo social (salas) pasa a primera prioridad; el pulido de lo solitario queda en segundo plano. Monedas iniciales por cuenta: 300 (2 tiradas). Apuestas: el pozo se reparte entre quienes aciertan, sin crear fichas. No preocupa por ahora la cantidad de sistemas ni la seguridad más allá de que nadie rompa el juego.
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
- Pity: tras 30 tiradas sin Legendario, la siguiente lo garantiza.

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
- Gacha: una tirada cuesta lo equivalente a ~3 pisos de monedas de run; pity en 30 como está.
- Colección y run: al empezar una run eliges la clase y luego uno de tus personajes de esa clase (su elemento, rasgos y stats vienen ya definidos y suben con rareza y estrellas). Si no tienes ninguno de esa clase, parte uno Común al azar.
- Duplicados del gacha: un personaje se guarda siempre, salvo que sea un duplicado exacto (clase + elemento + rareza): entonces suma +1 estrella al que posees (en 5 estrellas devuelve el 50% del costo). Además, cada tirada cuya clase + rareza ya tengas (con otro elemento) da 1 **fragmento** de esa clase y rareza; 3 fragmentos = +1 estrella a un personaje de esa clase y rareza que elijas. Cada estrella suma +10% de stats, multiplicado sobre la rareza. Pity por banner (personajes y armas por separado): a las 30 tiradas sin Legendario, la siguiente lo es.
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

Estado actual (2026-10-06): publicado en Vercel (boludos-dragones.vercel.app) con login en la nube; Etapas 1-3 jugables; salas reales, racha diaria, votación de sala, premios y mercado de trueque construidos pero sin probar en vivo (ver docs/ESTADO.md); ritmo de niveles afinado (`UPGRADE_POWER 4.8`, `XP_GROWTH 1.2`, `STORM_POWER 0.8`; mediana piso 13-14, p90 ~33). (Resumen histórico a continuación.) Etapa 1 en curso. Hecho: clases, personajes únicos con 20 rasgos y frases, 5 elementos con íconos, combate con probabilidades visibles, sprites 32x32 con armas, sonidos y animaciones, balance, iniciativa, XP y mejoras al subir de nivel. Accesorios por rasgo hechos (algunos poco legibles: Escurridizo, Frágil, Temerario, Glotón).
