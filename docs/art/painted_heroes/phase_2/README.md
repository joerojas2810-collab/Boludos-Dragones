# Fase 2 — Producción aprobada de héroes pintados

Aprobada por Felipe para commit y push el 9 de octubre de 2026. Diseños de la [Fase 1](../phase_1/README.md): Caballero, Mago y Clérigo masculinos; Asesina femenina adulta con capucha. Se conserva el identificador `rogue` para la Asesina.

## Recursos finales publicados

- `heroes/`: 200 tiras WebP sin pérdida, cuatro clases × cinco elementos × diez acciones. Cuadros de 384 × 384 px y anclaje [192, 360].
- `big/`: veinte imágenes estáticas WebP de 640 × 640 px, anclaje [320, 600]. Ampliadas del reposo; no añaden detalle nativo.
- `masks/`: cuarenta máscaras de recoloreado, una por clase y acción. Comparten geometría entre los cinco elementos.
- `manifest.json` y `animations.csv`: archivos, cuadros, fps, anclajes, tamaños, loop y hold. El manifiesto indica la ruta futura de cada recurso dentro del juego.
- `palette.json`, `skin_protection.json` y `validation.json`: paleta, exclusiones de piel y comprobaciones.
- `previews/`: [diez acciones juntas](previews/heroes_actions_review.webp), [cinco elementos](previews/heroes_elements.png) y [montaje de escala sobre un fondo](previews/heroes_map.png).

Las diez acciones suman **36 cuadros por clase y elemento** y conservan los cuadros y fps de `HERO_ACTIONS`. Animación limitada mediante poses ilustradas y pequeñas transformaciones alrededor del anclaje. Las armas están incluidas. Las variantes conservan alfa y píxeles fuera de las máscaras; caras y manos del Clérigo tienen exclusiones manuales de color.

Los PNG de entrega y sus versiones @2x, las hojas originales y los prompts se conservan localmente en `Pedido de Arte Pixel Art/fase_2_heroes_pintados`, fuera del repositorio según la regla de arte de `CLAUDE.md`. Aquí se publica el conjunto final optimizado para el juego. Los WebP sin pérdida conservan los mismos píxeles visibles y alfa de sus PNG de referencia.

## Integración pendiente — Fase 4

Esta publicación archiva la producción aprobada; **no reemplaza archivos en `public/art` ni modifica el juego**. La integración corresponde a la Fase 4, después de la adaptación pixel art de la Asesina en Fase 3.

Al integrar: copiar los recursos a las rutas `game_destination` del manifiesto; versionar tanto las URL pintadas de `HeroSprite` como las precargas de `BattleArena` para evitar caché; conservar metadatos de animación y selección de estilo. Berserker usa provisionalmente el dibujo de Caballero en main: no se produjo una quinta clase ni se modificaron reglas.

Herramienta de dibujo: generación de imágenes integrada de OpenAI. Prompts conservados en la entrega local. [Términos de uso](https://openai.com/policies/terms-of-use/).
