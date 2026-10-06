# Siguiente nivel estético de personajes

**Estado:** propuesta compatible con la Fase 2 de “juice”; piloto del Mago aplicado en código.  
**Actualizado:** 2026-10-06  
**Premisa:** aumentar identidad, detalle y expresividad sin abandonar el pixel art, sin imágenes externas y sin alterar juego, datos o economía.

## Encaje con los documentos actuales

La Fase 2 de [`MEJORA_VISUAL.md`](./MEJORA_VISUAL.md) añade movimiento y efectos generados por código. Este trabajo complementa esa fase: los efectos dan vida y celebración; el rediseño estático hace que cada héroe se reconozca como propio.

| Trabajo | Relación | Cómo evitar pisarse |
|---|---|---|
| Partículas, hit-stop, entrada de jefe, parallax y confeti | Complementario: decoran acciones y escenas alrededor del personaje. | Mantenerlos en los componentes de efectos; las mejoras de arte permanecen en las cuadrículas de sprites. |
| Respiración de sprites | Complementario con contacto visual: el mismo sprite gana vida sin cambiar sus píxeles. | Poner la animación en el contenedor del sprite y conservar `prefers-reduced-motion`. |
| Entrada de jugadores/avatar con accesorio (`RoomScreen`) | Hay un punto de integración: la animación mostrará los sprites y accesorios. | No editar `RoomScreen` mientras la Fase 2 esté en curso; reutilizar `Sprite` y `applyAccessories` cuando se integre. |
| UI global, gacha y sala | Compatible: marcos y tarjetas siguen con la estética cálida actual. | No tocar estilos globales ni contratos de sala para redibujar personajes. |

**Conclusión:** pueden avanzar en el mismo ciclo de trabajo. El piloto usa `src/sprites/classes.ts`, que no figura entre los archivos locales modificados para la Fase 2. Conviene integrar los cambios de sala después de que se revise ese grupo.

## Dirección artística

- Conservar la cuadrícula lógica **32×32**, el pixel duro, la luz arriba-izquierda, las paletas elementales y el borde oscuro.
- Mantener las siluetas, equipo y paleta general actuales; añadir identidad en zonas pequeñas y legibles: broches, runas, costuras, hombreras, adornos del arma y rasgos faciales.
- Dar a cada clase una marca propia: insignia defensiva para el Caballero, sigilo elemental para el Mago, marcas de oficio para el Pícaro y símbolo de sanación para el Clérigo.
- Usar piezas por capas en las cuadrículas existentes. Los rasgos aleatorios siguen siendo accesorios; no se confunden con el equipo fijo de cada clase.
- No cambiar identificadores ni estructura de personajes, `TraitId`, rareza, color de elemento o tamaño de almacenamiento.
- Escalar el mismo SVG con `shapeRendering="crispEdges"` en colección/gacha; una ilustración de mayor tamaño solo se consideraría tras validar el piloto y sin sustituir el sprite de combate.

## Plan de trabajo

1. **Piloto visual de una clase.** Añadir un detalle distintivo de pocos píxeles al Mago, usando colores existentes. Ya aplicado: un sigilo de gema en el pecho con oro y el tono claro del elemento.
2. **Revisión a tamaño de juego.** Comparar sprite normal y piloto en los cinco elementos, en batalla y colección. Revisar contraste con túnica, rasgos y arma.
3. **Ajustar el lenguaje por clase.** Definir el motivo visual del Caballero, Pícaro y Clérigo; usar formas diferentes y ubicaciones que no choquen con accesorios.
4. **Aplicar uno por vez.** Cambiar una clase, comprobar la cuadrícula 32×32 y su combinación con accesorios antes de avanzar a la siguiente.
5. **Integrar con movimiento.** Confirmar que respiración, ataque, golpe y revelación de sala no desplacen, tapen ni desdibujen los detalles; mantener todos los efectos bajo `prefers-reduced-motion`.
6. **Revisión final.** Generar una lámina de sprites desde las cuadrículas de código (artefacto temporal, no imagen fuente del juego) y validar dimensiones, paletas y pruebas existentes.

## Límites y recursos

- No se crean PNG, JPG, WebP ni hojas de sprites como fuente del juego. El arte se mantiene en TypeScript/SVG.
- No se agregan modelos, dependencias pagas, fuentes remotas ni servicios de generación. El proceso cabe en el plan Free mediante un piloto y revisiones pequeñas.
- Los cambios de personaje son solo presentación; no tocan `lib/game`, stats, RNG, perfiles, Supabase ni protocolo de sala.
- Mantener separados los cambios ya presentes de la Fase 2; no restaurar, limpiar ni reescribir sus archivos locales.
- No publicar ni hacer push desde este trabajo.

## Piloto ejecutado

Se añadió un pequeño sigilo arcano centrado en el pecho del Mago dentro de `OVERLAYS.mago` en `src/sprites/classes.ts`. Usa el oro existente y `c`, que se convierte en el tono claro del elemento durante el sombreado normal. No modifica la forma base, el arma, las paletas, los rasgos ni los datos del personaje. Es una prueba del lenguaje visual, no un rediseño final de las cuatro clases.

La integración es compatible con la Fase 2; falta verificar la lectura visual del sigilo en el navegador antes de replicar el tratamiento en otras clases.
