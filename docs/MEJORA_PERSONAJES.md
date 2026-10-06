# Siguiente nivel estético de personajes

**Estado:** mejoras de personajes, armas y accesorios aplicadas en código; compatibles con la Fase 2 de “juice”.
**Actualizado:** 2026-10-06  
**Premisa:** aumentar identidad, detalle y expresividad sin abandonar el pixel art, sin imágenes externas y sin alterar juego, datos o economía.

## Encaje con los documentos actuales

La Fase 2 de [`MEJORA_VISUAL.md`](./MEJORA_VISUAL.md) añade movimiento y efectos generados por código. Este trabajo complementa esa fase: los efectos dan vida y celebración; el rediseño estático hace que cada héroe se reconozca como propio.

| Trabajo | Relación | Cómo evitar pisarse |
|---|---|---|
| Partículas, hit-stop, entrada de jefe, parallax y confeti | Complementario: decoran acciones y escenas alrededor del personaje. | Mantenerlos en los componentes de efectos; las mejoras de arte permanecen en las cuadrículas de sprites. |
| Respiración de sprites | Complementario con contacto visual: el mismo sprite gana vida sin cambiar sus píxeles. | Poner la animación en el contenedor del sprite y conservar `prefers-reduced-motion`. |
| Entrada de jugadores/avatar con accesorio (`RoomScreen`) | Hay un punto de integración: la animación mostrará los sprites y accesorios. | No editar `RoomScreen` mientras la Fase 2 esté en curso; reutilizar `Sprite` y `applyAccessories` cuando se integre. |
| Armas generadas por elemento | El catálogo ya define 6 tipos × 5 elementos en cuadrículas 32×32. | Detallar empuñaduras y gemas dentro de los generadores existentes; conservar tipo, rareza y elemento. |
| Accesorios por rasgo | Se dibujan como capas sobre el héroe. | Refinar silueta/contraste sin cambiar `TraitId`, cantidad de rasgos ni anclas públicas. |
| Arena de Cavernas | Ya usa escenarios SVG deterministas. | Profundizar pared, portón, antorchas, calaveras y piso de piedra en el generador; mantener fondos de otros mundos intactos. |
| UI global, gacha y sala | Compatible: marcos y tarjetas siguen con la estética cálida actual. | No tocar estilos globales ni contratos de sala para redibujar personajes. |

**Conclusión:** pueden avanzar en el mismo ciclo de trabajo. El piloto usa `src/sprites/classes.ts`, que no figura entre los archivos locales modificados para la Fase 2. Conviene integrar los cambios de sala después de que se revise ese grupo.

## Dirección artística

- Conservar la cuadrícula lógica **32×32**, el pixel duro, la luz arriba-izquierda, las paletas elementales y el borde oscuro.
- Tomar la referencia visual compartida como norte: contornos más marcados, brillos de metal/blade legibles, emblemas nítidos y la misma combinación cálida de piedra, ámbar y verde. La referencia orienta el acabado; no se integra como archivo de imagen.
- Mantener las siluetas, equipo y paleta general actuales; añadir identidad en zonas pequeñas y legibles: broches, runas, costuras, hombreras, adornos del arma y rasgos faciales.
- Dar a cada clase una marca propia: insignia defensiva para el Caballero, sigilo elemental para el Mago, marcas de oficio para el Pícaro y símbolo de sanación para el Clérigo.
- Usar piezas por capas en las cuadrículas existentes. Los rasgos aleatorios siguen siendo accesorios; no se confunden con el equipo fijo de cada clase.
- No cambiar identificadores ni estructura de personajes, `TraitId`, rareza, color de elemento o tamaño de almacenamiento.
- Escalar el mismo SVG con `shapeRendering="crispEdges"` en colección/gacha; una ilustración de mayor tamaño solo se consideraría tras validar el piloto y sin sustituir el sprite de combate.

## Plan de trabajo

1. **Identidad de clase.** Aplicado: Caballero con blasón, Mago con gema y runas, Pícaro con insignia de gremio y Clérigo con sol elemental.
2. **Armas.** Aplicado sobre los 6 tipos × 5 elementos: brillos blancos de filo, empuñaduras con virolas de oro y gemas de pomo facetadas; conserva el color de gema por rareza.
3. **Accesorios.** Aplicado: retoques de contraste/lectura para Glotón, Frágil y Escurridizo; mismos rasgos, anclas y composición.
4. **Arena de Cavernas.** Aplicado en `src/sprites/backgrounds.ts`: mampostería en filas escalonadas, portón de arco, antorchas, relieves y uniones de losas; los demás mundos mantienen sus generadores.
5. **Validación técnica.** Pruebas de cuadrícula, armas, accesorios y fondos (4 archivos: 9 pruebas), lint y typecheck completados. La revisión en navegador todavía está pendiente.
6. **Integración con movimiento.** Mantener la respiración y los efectos actuales en su contenedor; revisar que no recorten ni desenfoquen los detalles y respeten `prefers-reduced-motion`.

## Límites y recursos

- No se crean PNG, JPG, WebP ni hojas de sprites como fuente del juego. El arte se mantiene en TypeScript/SVG.
- No se agregan modelos, dependencias pagas, fuentes remotas ni servicios de generación. El proceso cabe en el plan Free mediante un piloto y revisiones pequeñas.
- Los cambios de personaje son solo presentación; no tocan `lib/game`, stats, RNG, perfiles, Supabase ni protocolo de sala.
- Mantener separados los cambios ya presentes de la Fase 2; no restaurar, limpiar ni reescribir sus archivos locales.
- No publicar ni hacer push desde este trabajo.

## Piloto ejecutado

Se extendieron los emblemas a las cuatro clases mediante `OVERLAYS` en `src/sprites/classes.ts`. También se detallaron todas las empuñaduras, filos y gemas de pomo en `src/sprites/weapons.ts`; `p` continúa tomando el color de rareza y el reflejo `w` es fijo. En `src/sprites/accessories.ts` se mejoraron la lectura de la pierna de pollo de Glotón, el centro de la venda de Frágil y el brillo de las estelas de Escurridizo. En `src/sprites/backgrounds.ts` se añadió una cámara pétrea de Cavernas con muro, portón, antorchas y losas generadas por código. No se modificaron tipos de arma, rasgos, anclas, rarezas, datos, reglas de juego ni fondos de otros mundos.

La integración de código es compatible con la Fase 2 y no requiere imágenes ni dependencias. La inspección visual en navegador sigue pendiente porque el entorno no ha podido conectarse al servidor local; validar esa lectura antes de hacer más denso el arte.
