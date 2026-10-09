# CLAUDE.md — Boludos & Dragones (RPG gacha de noche de juegos)

Estado vigente. El historial y las decisiones antiguas están en `docs/HISTORIAL_CLAUDE.md` (copia íntegra del CLAUDE.md anterior) y en `docs/ESTADO.md`, `docs/FORJA_V9.md`, `docs/SALAS.md`, `docs/SEGURIDAD.md`, `docs/RELEASE_ECONOMIA_V2.md`, `docs/PLAN_RUN_V2.md`.

## Qué es
Juego web RPG por turnos con gacha para jugar con amigos (reemplazo de LoL). 7 amigos, casi nunca juegan todos: debe funcionar con 2 a 7, con gente que entra o sale, sin bloquear a nadie. Entre semana cada uno avanza solo (dungeons, gacha, forja, misiones, torre); el **viernes** se juntan en una **sala**. PC primero, celular secundario (no debe desbordar). Producción en Vercel (`boludos-dragones.vercel.app`), cada push a `main` despliega; progreso en Supabase (nombre + PIN de 4 dígitos).

**Criterio ante dudas de diseño:** lo que genere más risas, rivalidad sana y momentos compartidos, y que mantenga parejos a quienes juegan menos.

## Forma de trabajar (obligatorio)
- Antes de construir o ejecutar algo grande, preguntar y guiar paso a paso. Trabajar por etapas, sin adelantar sin confirmación.
- Respuestas concisas: sin saludos ni disculpas; al modificar código mostrar solo el fragmento cambiado.
- Confirmar antes de acciones irreversibles (reset de la base, push, migraciones).
- Ahorro de tokens: verificar siempre con `tsc`, `eslint` y `vitest`; simulaciones pesadas solo si cambió el balance y con pocas iteraciones. Revisión visual con `read_page`/`get_page_text`; capturas a escala 0.5 y pocas. Máximo 2 agentes en paralelo.
- Idioma: textos del juego y UI en **español**; código, comentarios y commits en **inglés**. Commits pequeños, uno por cambio lógico.

## Stack y estructura
Next.js (App Router) + TypeScript estricto (sin `any`) + Tailwind · Supabase (Postgres, RLS, polling para salas) · Vercel · Vitest. Secretos solo en `.env.local`.
- `src/lib/game/`: toda la lógica de juego, funciones puras y testeables (sin React ni Supabase). La UI solo la consume.
- `src/lib/game/server/`, `src/app/api/`: servicios y rutas que repiten las acciones con el motor determinista antes de pagar.
- `supabase/migrations/*.sql` (ordenadas; `0018_lockdown_functions.sql` siempre se ejecuta última), `supabase/setup.sql` (todo junto), `supabase/upgrade_from_NNNN.sql` (generados con `npx tsx scripts/build-setup-sql.ts [--from=NNNN]`), `supabase/reset_progress.sql` (manual y destructivo), `supabase/tests/pglite/`.
- Todo azar pasa por `rng.ts` con semilla (nunca `Math.random()` en la lógica). El motor usa tablas precalculadas en vez de `**`/`Math.pow` para dar lo mismo en Chrome, Safari y Node.
- Modo local: sin variables de Supabase el juego usa `localStorage`.
- Cada migración nueva: ejecutar `upgrade_from_NNNN.sql` en Supabase ANTES del push y revisar el Security Advisor.

## Reglas del juego (vigentes)

**Clases (5), con pasivo** (constantes `CLASS_PASSIVE_*` en `characters.ts`):
- Caballero: −18 % de daño recibido. Mago: ventaja elemental +55 % (en vez de +25 %), +10 % crítico, −5 % daño recibido. Pícaro: críticos ×2 (los demás ×1,5). Clérigo: regenera 0,5 % de la vida máxima por turno. Berserker: Furia por umbrales de vida (más daño con poca vida). Invocador/Monje: en pausa.
- Habilidad de clase = **Ataque 2**, 1 de 2 desde el nivel 1 (`skills.ts`): Caballero Barrido/Contraataque (×1,5), Mago Tormenta/Detonar, Pícaro Golpe doble/Ejecutar, Clérigo Santuario/Castigo, Berserker Desgarro/Aniquilación.

**Elementos (5):** ciclo Agua → Fuego → Viento → Tierra → Rayo → Agua; cada uno vence solo al siguiente (×1,25) y pierde contra el anterior (×0,75); los otros dos son neutrales. Tabla solo en `elements.ts`. Estados (`statuses.ts`): Agua Escarcha, Fuego Quemadura, Viento Impulso, Tierra Ruptura, Rayo Sobrecarga. Solo el especial de clase los aplica (2 acumulaciones); Detonar los consume; enemigos solo si son élite o jefe y en golpes fuertes. La **resistencia** (línea de equipo y stat) acorta los estados negativos. **Sin esquive.**

**Combate (`combat.ts`, `ENGINE_VERSION = 11`):** acciones **Ataque 1** (básico), **Ataque 2** (habilidad de clase), **Ataque 3** (especial del arma, enfriamiento 2) y **Defender**; modo rápido solo en peleas fáciles; grupos de 1 a 3 enemigos con elección de objetivo; el enemigo anuncia su golpe; acierto y daño estimado siempre visibles; **guardia perfecta** (defender contra el golpe fuerte anunciado: −75 % y un bono propio por clase: Caballero Reflejo 40 %, Mago 2 estados al siguiente golpe, Pícaro +50 % crítico, Clérigo cura 8 % y limpia un estado, Berserker habilidad gratis); velocidad = acciones extra por ronda; enrage tras el turno 40; sin objetos en combate. Defensa en % (`def/(def+K·ATQ rival)`, tope 75 %). **Jefes** con nombre: 9 mecánicas (`bossRules.ts`: plaga, presión, aprende, armadura, velocidad, cabezas, marchitar, posturas, hambre) y cada dungeon usa el elemento de su jefe.

**Héroes:** un héroe es clase + elemento + rango (`characterKey`), con **1 rasgo de personalidad** (20 posibles, `traits.ts`, sorteados en la tirada). Rangos de objeto **F, E, D, C, B, A, S** (`rarity.ts`; multiplicador ×1,0 / 1,15 / 1,3 / 1,5 / 1,75 / 2,0 / 2,6; probabilidades 31 / 22,5 / 16,5 / 12 / 9 / 6 / 3 %). **Sin pity.** SS y SSR solo existen como dificultad de dungeon. Nivel por héroe (`heroLevel.ts`: tope 20 + 10 por ★, +1 %/nivel); cada ★ da +10 % de stats.
- **Copias, ★ y rango (`heroFusion.ts`, doc `docs/REDISENO_COMBATE.md` §7d):** una tirada repetida no sube ★: queda como **copia** del héroe (máx. 50) y guarda el rasgo que le tocó. **Unidad de material** = un héroe del mismo rango o una copia. **Subir ★:** 3 unidades = +1★ (tope 5). **Subir de rango:** base + (ratio−1) unidades del mismo rango + monedas (F 5, E 5, D 4, C 4, B 4, A 4 con 20…640 monedas); el héroe conserva rasgo, nivel y habilidad y sus ★ se convierten con `STAR_CARRY` (5★ en F llega a S como 0★: no hay atajo); si ya existe en el rango siguiente se fusionan (eliges el rasgo, el otro pasa a copia; ★ más altas). **Rasgos:** se cambia el principal por el de una copia. S es el techo. Los héroes no se queman; se mejoran o se intercambian (la unidad que viaja en el mercado es una copia, con su rasgo). Sin fragmentos.

**Equipo (`gear.ts`, `weapons.ts`):** 6 casillas (arma, casco, peto, piernas, zapatos, collar); tirada ±15 % por pieza; líneas extra por rango (C 1, A 2, S 3) más una **línea capstone exclusiva de S** (casco y peto: daño recibido; piernas, zapatos y collar: daño infligido); sets de 2/4/6 piezas (+10/20/30 %), resonancia de estilo, autoequipar. Armas por clase (`CLASS_WEAPONS`); el arma da el **Ataque 3** y fija el elemento del ataque.

**Forja v9 (`docs/FORJA_V9.md`):** pestañas *Ascender equipo* (pieza + materiales del mismo rango + monedas = +1 rango, hasta S), *Héroes* (las tres vías de arriba) y *Mejorar* (+1..+10 con Escamas y Dado cargado, solo equipo S con 5★). Escamas salen de dungeons S/SS/SSR; Dados de misiones, jefe cooperativo, torre y 5 % en el último nivel de dungeons S+ (máx. 2 al día). No se comercian. Quemar: solo piezas, 4 % de su valor (50 % en lo "legado").

**Modo Progreso (dungeons):** 9 dungeons F..SSR (`levels.ts`: F6 E6 D7 C8 B8 A9 S10 SS11 SSR12 niveles), 1 vida, vida arrastrada con curación ~10 %, sin puertas, reliquias ni tienda; jefe con nombre en el último nivel; ascensión 0-5 por dungeon; botín por nivel (`levelLoot.ts`: una sola tirada de pieza del rango del dungeon al 5 %, el resto con tope un rango abajo; los dungeons SS y SSR sueltan piezas S; sin descuento diario en piezas); dificultad calibrada con `RANK_TUNE` (`stage.ts`; héroes de referencia S para los dungeons S, SS y SSR).

**Economía (monedas; fichas solo en salas):**
- Gacha 250 por tirada (sin pity), tirada gratis diaria, racha diaria, 500 monedas iniciales.
- Monedas por nivel (`levelPay.ts` + `level_base_coins` en SQL, migración 0044): F 60, E 75, D 95, C 120, B 150, A 180, S 210, SS 240, SSR 270; repetir paga 60 % con descuento diario (20 niveles al 100 %, 40 al 50 %, 80 al 20 %, luego 10 %); cofre de primera limpieza por dungeon (F 1000 … SSR 4000; ascensiones 50 %). Objetivo: ~2 tiradas de 10 al día en régimen (~19 al día simulado, `scripts/economy-sim.ts`).
- Misiones (`missions.ts`, mismos valores en SQL): 3 diarias, 3 semanales, 3 del evento Viernes (viernes y sábado).
- Mercado de trueque justo (±25 % de `TRADE_VALUE`, S = 8330); solo se ofrecen copias sobrantes de héroes y ★ de armas; sin regalos.
- Topes anti-granja en el servidor (ritmo por acción, inicios por hora).

**Salas (`docs/SALAS.md`):** código de 4 letras, anfitrión; ritmo piso a piso con todos juntos; ronda = 10 pisos (o todos eliminados, o 25 min), noche ~4 rondas; semilla común; turno de 30 s; modo **nivelado** (héroes normalizados, bono de rango+estrellas hasta +15 %) o **poder completo**; rango de sala solo cambia la dificultad; apuestas 1 a 1 (el pozo se reparte entre quienes aciertan); interferir (secreto hasta el reveal) y ayudar (cura/bendice), una intervención por pelea; **jefe cooperativo** (vida compartida, premios); **duelos 1v1** (balanceado o héroes reales, turnos simultáneos); ranking de la noche por fichas y por piso; premios y títulos; desconectado pierde el turno (2 seguidos = huida).

**Torre semanal (`/torre`):** run sin fin con la semilla de la semana, modos nivelado y colección, ranking por mejor piso, premios top 3. **Semilla de la semana** y tutorial del día 1 (`tutorial.ts`).

## Seguridad (`docs/SEGURIDAD.md`)
Login con Supabase Auth con email sintético y contraseña `HMAC(PEPPER, nombre:pin)` derivada en el servidor; 5 fallos = espera creciente, 20 = bloqueo, límite por IP; reinicio de PIN solo por el admin; registro con "código de la casa"; RLS en todas las tablas; funciones SQL cerradas a anon/authenticated (`0018`) y solo `service_role`; el servidor repite la run con el motor antes de pagar. La clave secreta nunca se pega en el chat ni se sube al repo. Zona horaria fija America/Argentina/Buenos_Aires.

## Arte (`public/art/<lote>/`, WebP/PNG finales)
Fantasía pintada. Manifiestos mandan tamaños y cuadros; UI en 9-slice. Fuentes locales Nunito (texto) y Alegreya (títulos). Componentes: `AnimSheet`, `HeroSprite`, `EnemySprite`, `ArenaBackground`, `Icon`, `RankIcon`, `ItemCard`, `Vfx`/`BattleFx`, `Panel`. Mapas de ids en `src/lib/art.ts` y `artIds.json`. **El arte manda** (grande, dentro del marco, poco texto); respetar `prefers-reduced-motion`. Nunca originales `.ora`, prompts ni la carpeta completa al repo. Pendiente de arte: legendarios de los amigos, retratos, sonido. Los sprites SVG de `src/sprites/` son respaldo.

## Versiones
Cambios grandes suben la principal (v8.0 Modo Progreso publicada; v9.0 Forja); pequeños, el decimal. Cada versión es un tag de git (`git tag vX.Y <commit>`, `git push --tags`). La próxima etiqueta se decide al cerrar cada tanda.

## Estado y pendiente (2026-10-09)
- Rama `rediseno-combate` (sin push): combate rediseñado (`ENGINE_VERSION 11`), 7 rangos, 20 rasgos de personalidad, Berserker, 9 jefes, estados elementales, copias/★/rango de héroes, migraciones 0045 a 0050.
- Por hacer (necesita tu confirmación): backup de Supabase; ejecutar `upgrade_from_0044.sql` (cubre 0044 a 0050) y luego `reset_progress.sql`; push y merge a `main`; cada jugador limpia `localStorage`; revisar el Security Advisor.
- Verificación: `tsc`, `eslint`, `vitest` y los `pglite` (`supabase/tests/pglite/*`, con `npx tsx`) en verde. Falta probar a mano con el motor v11: salas, jefe cooperativo, duelos y celular.
- Balance conocido: Detonar ~57 %, Clérigo y Libro ~10 puntos sobre el resto; re-simular la economía con la cadena de 7 rangos y fusionar todo (techo ~+78 % de S extra).
- Pendiente de arte: Berserker propio (hoy usa el arte del Caballero), legendarios de los amigos, retratos, sonido.
- Después: pantalla "Crear legendario"; carrusel de banners del hub; sonido por clic en pestañas.
