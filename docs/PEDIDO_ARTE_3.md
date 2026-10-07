# Pedido de arte 3: pixel art (por fases, solo archivos finales)

Enviar junto con las imágenes de estilo de prueba (adjuntas) y esta carpeta de referencia de nombres: `public/art/` actual. **Una fase por vez; no avanzar a la siguiente sin aprobación.**

## Prompt base (pegar al inicio de cada fase)

Eres el artista del juego "Boludos & Dragones" (RPG por turnos de fantasía, humor entre amigos, español). Usa como guía las imágenes adjuntas: pixel art, misma escala de píxel, contorno, paleta e iluminación (arriba-izquierda) en TODO.

**Entrega (obligatoria, prioridad = rápido y limpio):**
- SOLO archivos finales listos para el juego. NO entregues archivos fuente, capas, .ora/.psd/.aseprite, máscaras, prompts, bocetos, maquetas, hojas de contacto, variantes descartadas ni carpetas de trabajo.
- PNG con fondo transparente, **tamaño nativo (1x)**, sin suavizado ni escalado previo, sin sombra fuera del sprite. Nosotros ampliamos en múltiplos enteros.
- Animaciones: **una tira horizontal por animación**, cuadros del mismo tamaño, sin separación. Mismos cuadros y velocidad que indica cada fase.
- **Mismos nombres de archivo** que los actuales de `public/art/<carpeta>/` (extensión `.png`): así se reemplaza sin tocar código. Si falta alguno en la lista, avísame en una línea; no inventes nombres.
- Un `manifest.json` por carpeta con: archivo, ancho y alto del cuadro, cantidad de cuadros, fps, loop (sí/no) y punto de anclaje (pies o centro).
- **Elementos por recoloreo (ahorra tiempo):** dibuja solo la versión Fuego. Pinta lo que cambia por elemento con una **rampa exclusiva de 4 tonos** que no uses en nada más, y entrégame esa rampa en HEX. Los otros 4 elementos los generamos por script.
- Cuando termines, responde con una lista de archivos y nada más.

## Fase 1 — Héroes (define tamaño y anclaje de todo lo demás)
- 4 clases: Caballero (`knight`), Mago (`mage`), Pícaro (`rogue`), Clérigo (`cleric`). Vista de frente, mismas proporciones en las 4.
- Tamaño de cuadro: [definir con tu prueba, ej. 64×96]. Pies siempre en el mismo punto del cuadro.
- 10 animaciones por clase (`hero_<clase>_<acción>.png`), cuadros y fps de `src/lib/art/heroes.ts`:
  idle 4 (6 fps, loop) · attack_1 4 (12) · attack_2 5 (10) · attack_3 5 (10) · defend 2 (8, queda en el último) · perfect_guard 3 (12) · hit 2 (12) · dodge 3 (12) · defeat 4 (8, queda) · victory 4 (8, queda).
- Arma en mano dibujada aparte como capa por clase (para cambiarla por tipo); si es muy lento, arma genérica por clase.
- Total: 40 tiras (4 × 10) × 5 elementos por recoloreo nuestro.
- Cuadro grande de idle para el hub: el mismo idle sin cambios (lo ampliamos nosotros).

## Fase 2 — Enemigos
- 5 familias: limo (`slime`), diablillo (`imp`), arpía (`harpy`), gólem (`golem`), espectro (`specter`). Cada una en `normal`, `elite` y `boss` (más grande, corona, ojos rojos).
- 9 jefes finales únicos: `ash_king`, `eternal_watcher`, `faceless_one`, `great_devourer`, `hollow_colossus`, `lord_of_flies`, `mother_hydra`, `thunder_king`, `withered_queen`.
- 5 animaciones: idle, attack, hit, defeat, entrance (esta última solo jefes). Nombres como los de `public/art/enemies/`.
- Ver cuadros por animación en `src/lib/art/enemies.generated.ts`. Total: 15 diseños × 4 + 9 jefes × 5 = 105 tiras, × 5 elementos por recoloreo nuestro.

## Fase 3 — Armas, equipo, partes y núcleos
- Íconos 32×32 (o tu tamaño de ícono): 9 armas (espada, hacha, lanza, arco, bastón, daga, maza, varita, libro) en Fuego (recoloreo nuestro) + 5 piezas de armadura (casco, peto, piernas, zapatos, collar). Nombres de `public/art/weapons/` y `public/art/equipment/`.
- 14 partes (una por tipo) y 5 núcleos (uno por elemento): mismos nombres que `public/art/icons/icon_core_*` y partes actuales.
- El rango (F a SSR) lo muestra el marco, no hace falta dibujar 9 versiones.
- Marcos de tarjeta 3:4 por rango: `card_f` … `card_ssr` (9).

## Fase 4 — Íconos del sistema (mismo nombre que `public/art/icons/`)
- Tamaño de ícono único. Por familia: elementos (5), clases (4), pasivos (4), habilidades (18), rasgos (24), mejoras (15), eventos (8), puertas (7), dungeons (9), rangos (9, sin letra), ascensión (7), enemigos (4), estadísticas (8), sistema (17), reliquias (99).
- Sin texto ni números dentro (el juego los dibuja).
- Entrega por tandas de familia si es muy largo (empieza por elementos, clases, rangos, puertas).

## Fase 5 — Interfaz
- Mismos nombres que `public/art/ui/`: paneles (9-slice con los cortes en el manifest), botones (5 variantes × 5 estados), barras, casillas (`slot*`), pestañas, inputs, checkbox/radio, scrollbar, separadores, glifos, cofres (3), favicon y logos (emblem, wordmark, primary, stacked).
- Los cortes 9-slice se declaran en el manifest.

## Fase 6 — Fondos
- 16:9, 5 capas por fondo (cielo, lejos, medio, suelo, primer plano), nombres de `public/art/backgrounds/`, solo versión desktop (celular lo recortamos por código).
- Mundos: swamp, peaks, canyon, caverns, storm × (normal, boss) y dungeons A, S, SS, SSR × (normal, boss), más menú, colección, gacha, lobby, mercado y forja (con 5 capas también).

## Fase 7 — Efectos
- Nombres de `public/art/effects/`: golpes por elemento (5), crítico, daño, curación, escudo, regeneración, ventaja/desventaja, guardia perfecta, subir de nivel, victoria, derrota, esquive, podio, confeti, forja (6), gacha (apertura y revelación por rango, pity), entrada de jefe por rango, emotes (10).
- Cada uno con `remove`/`hold`/`loop` en el manifest.

## Cómo lo recibimos
Dejamos el ZIP en una carpeta fuera del repo y corremos los importadores (`scripts/import-*.mjs`, ajustados a PNG y a los cuadros nuevos). `public/art` solo recibe los PNG finales.
