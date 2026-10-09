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

**Clases (4), con pasivo** (constantes `CLASS_PASSIVE_*` en `characters.ts`):
- Caballero: −18 % de daño recibido. Mago: ventaja elemental +55 % (en vez de +25 %), +10 % crítico, −5 % daño recibido. Pícaro: críticos ×2 (los demás ×1,5). Clérigo: regenera 0,5 % de la vida máxima por turno.
- Tercera habilidad al nivel 5, 1 de 2 (`skills.ts`): Caballero Barrido/Contraataque, Mago Tormenta (×1,3)/Drenar maná, Pícaro Golpe doble/Ejecutar, Clérigo Santuario (cura 10 %)/Castigo.

**Elementos (5):** Agua → Fuego → Viento → Tierra → Rayo → Agua (cada uno vence a los dos siguientes y pierde contra los dos anteriores). Ventaja +25 %, desventaja −25 %. Tabla solo en `elements.ts`.

**Combate (`combat.ts`, `ENGINE_VERSION = 10`):** acciones Ataque 1 (seguro), Ataque 2 (arriesgado, enfriamiento 2), Ataque 3 (habilidad), Defender; modo rápido solo en peleas fáciles; grupos de 1 a 3 enemigos con elección de objetivo; el enemigo anuncia su golpe; acierto y daño estimado siempre visibles; **guardia perfecta** (defender contra el golpe fuerte anunciado: −75 % y +50 % a tu siguiente golpe); velocidad = acciones extra por ronda; enrage tras el turno 40; sin objetos en combate. Defensa en % (`def/(def+K·ATQ rival)`, tope 75 %). Stats: vida, ATQ, DEF, crítico, daño crítico, esquive, velocidad, precisión, huida.

**Héroes:** 20 rasgos (más 4 con regla de run); cantidad por rango (F-D 1, C-A 2, S+ con rasgo de regla). Rangos **F, E, D, C, B, A, S, SS, SSR** (`rarity.ts`; multiplicador ×1,0 a ×3,0; probabilidades 30/22/16/12/9/6/3/1,5/0,5 %). Estrellas 0-5 solo por copias exactas (a 5★ la copia devuelve 50 % de una tirada). Nivel por héroe (`heroLevel.ts`: tope 20+10×estrellas, +1 %/nivel). Fusión de héroes (`heroFusion.ts`): base 3★ + materiales del mismo rango sube un rango. Sin fragmentos.

**Equipo (`gear.ts`, `weapons.ts`):** 6 casillas (arma, casco, peto, piernas, zapatos, collar); tirada ±15 % por pieza, líneas extra por rango, sets de 2/4/6 piezas (+10/20/30 %), resonancia de estilo, autoequipar. Armas por clase (`CLASS_WEAPONS`); el arma reemplaza el Ataque 2 y fija el elemento del ataque.

**Forja v9 (`docs/FORJA_V9.md`):** *Ascender* (pieza + materiales del mismo rango + monedas = +1 rango) y *Mejorar* (+1..+10 con Escamas y Dado cargado, solo equipo S+ con 5★). Escamas salen de dungeons S/SS/SSR; Dados de misiones, jefe cooperativo, torre y 5 % en el último nivel de dungeons S+ (máx. 2 al día). No se comercian. Quemar piezas: 4 % (50 % en lo "legado").

**Modo Progreso (dungeons):** 9 dungeons F..SSR (`levels.ts`: F6 E6 D7 C8 B8 A9 S10 SS11 SSR12 niveles), 1 vida, vida arrastrada con curación ~10 %, sin puertas, reliquias ni tienda; jefe con nombre en el último nivel; ascensión 0-5 por dungeon; botín por nivel (`levelLoot.ts`: una sola tirada de pieza del rango del dungeon al 5 %, el resto con tope un rango abajo; sin descuento diario en piezas); dificultad calibrada con `RANK_TUNE` (`stage-tune.ts`): héroe estándar limpia F 96 % … SSR 34 %.

**Economía (monedas; fichas solo en salas):**
- Gacha 250 por tirada, pity SSR a 250, tirada gratis diaria, racha diaria, 500 monedas iniciales.
- Monedas por nivel (`levelPay.ts` + `level_base_coins` en SQL, migración 0044): F 60, E 75, D 95, C 120, B 150, A 180, S 210, SS 240, SSR 270; repetir paga 60 % con descuento diario (20 niveles al 100 %, 40 al 50 %, 80 al 20 %, luego 10 %); cofre de primera limpieza por dungeon (F 1000 … SSR 4000; ascensiones 50 %). Objetivo: ~2 tiradas de 10 al día en régimen (~19 al día simulado, `scripts/economy-sim.ts`).
- Misiones (`missions.ts`, mismos valores en SQL): 3 diarias, 3 semanales, 3 del evento Viernes (viernes y sábado).
- Mercado de trueque justo (±25 % de `TRADE_VALUE`); sin regalos.
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
- Hecho local, **sin commit ni push**: economía ×2,4..7,5 (migración 0044), Mago (Tormenta ×1,3), Clérigo (Santuario 10 %), `ENGINE_VERSION 10`, `reset_progress.sql` actualizado (v9), CLAUDE.md reescrito.
- Por hacer: commit; ejecutar `upgrade_from_0044.sql` y luego `reset_progress.sql` en Supabase (con backup); push; cada jugador limpia `localStorage`; correr `pglite` tests; revisar el Security Advisor.
- Balance conocido: Clérigo con Santuario aún ~10 puntos sobre el resto en S; Mago con bastón y Tormenta algo bajo; duelos balanceados con Clérigo ~35 %; forja y fusión ahora baratas frente al ingreso (re-medir).
- Por verificar a mano: salas, jefe cooperativo y duelos en vivo y en celular; premios de torre; garantías del gacha.
- Después: pantalla "Crear legendario"; carrusel de banners del hub; sonido por clic en pestañas.
