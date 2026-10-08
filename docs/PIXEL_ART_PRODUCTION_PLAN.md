# Continuación de producción pixel art

Plan de trabajo para acelerar las fases pendientes mediante bases compartidas y exportaciones automatizadas. Las cantidades describen el alcance pendiente; no son entregas completadas.

## Reglas de trabajo

- Mantener el pixel art de aventura de fantasía de 16 bits aprobado: iluminación arriba a la izquierda, contorno coherente, tamaños nativos y PNG sin suavizado.
- Conservar los nombres existentes en `public/art/`, cambiando únicamente la extensión a `.png`. Las excepciones requieren autorización del usuario.
- Revisar visualmente cada lote y comprobar sus dimensiones, transparencia y manifiesto. Ejecutar TypeScript, ESLint y Vitest al terminar cada fase, según la instrucción del usuario.
- Hacer commit y push de cada lote terminado a `design/pixel-art`. No fusionar con `main`, retirar el arte pintado ni crear un PR sin solicitud del usuario.
- Trabajar con dos agentes: dirección visual y producción; inventario, exportaciones e integración. Un responsable centraliza los commits y pushes.
- Entregar solo recursos finales y manifiestos; conservar ZIP fuera del repositorio y excluir fuentes, borradores y carpetas de trabajo.

## Fase 4: estadísticas, sistema y reliquias

El lote 9 reúne los 8 íconos de estadísticas y los 17 de sistema. Reutiliza símbolos aprobados cuando representan el mismo concepto y deriva los estados de corazón y las filas de estrellas de bases compartidas.

Las 99 reliquias se descomponen en **24 diseños base, 72 variantes y 3 distintivos de rareza**. Las variantes son `common`, `rare` y `legendary`, una de cada tipo por diseño. La forma del objeto debe conservarse; los detalles de rareza deben distinguirse también por su forma.

Propuesta: tres lotes de 33 archivos. Cada lote contiene 8 bases, sus 24 variantes y un distintivo de rareza. La distribución concreta se decide al preparar cada lote; no requiere crear 99 diseños independientes.

Fuentes de nombres: `public/art/icons/icon_relic_*.webp` y `src/lib/artIds.json` (sección `relic`). Fuente del significado, nombre en español y rareza: `src/lib/game/relics.ts`. Usar esos datos para agrupar objetos y comprobar los archivos; no deducir nombres nuevos de los textos en español.

## Fase 5: kit de interfaz

Referencia exacta: los **130 archivos** actuales de `public/art/ui/`. Construir bases comunes y exportar sus estados de manera consistente:

- 25 botones: 5 variantes por 5 estados; 6 paneles con cortes 9-slice explícitos.
- 18 marcos de rango, 9 favicon derivados de un emblema y 4 logos.
- 8 barras, 5 casillas, 5 pestañas, 6 checkbox y 6 radio.
- 4 input, 4 select, 4 slider y 4 toggle; 2 piezas de scrollbar.
- 14 glifos, 3 cofres y los recursos `separator`, `title_tab` y `modal_scrim`.

Los estados deben compartir geometría y cortes para evitar saltos de tamaño. Revisar un conjunto representativo antes de exportar todo el kit. Las piezas no animadas llevan un cuadro; los cortes y tamaños nativos se declaran en el manifiesto.

## Fase 6: fondos por capas

Los nombres actuales incluyen **18 escenarios de combate con 5 capas desktop**, es decir, 90 archivos. Compartir capas entre normal y jefe cuando el escenario lo permita, conservando una diferencia visual clara en la zona de combate. Referencias: `public/art/backgrounds/`, `src/lib/art/backgrounds.ts` y `src/lib/art/backgrounds.generated.ts`.

El usuario decidió mantener menú, colección, gacha, lobby, mercado y forja como una sola imagen por pantalla. Conservar los nombres `menu_desktop_composite.png`, `collection_desktop_composite.png`, `gacha_desktop_composite.png`, `lobby_desktop_composite.png`, `market_desktop_composite.png` y `forge_desktop_composite.png`. El alcance final de Fase 6 es de 96 archivos: 90 capas de combate y 6 imágenes de pantalla. No producir versiones mobile; el juego realizará el recorte.

## Fase 7: efectos

Existen **71 efectos principales y 71 versiones en `reduced/`**. Referencias de nombres: `public/art/effects/`. Referencia exacta de cuadros, fps, filas, tamaño de celda y comportamiento al finalizar: `src/lib/art/effects.generated.ts`. Conservar `remove`, `hold` o `loop` y los metadatos de glifos cuando correspondan.

Reutilizar bases para los cinco golpes elementales, las aperturas y revelaciones de gacha por rango y las entradas de jefe. Exportar las variantes y versiones reducidas mediante reglas comunes cuando su animación y significado lo permitan. No cambiar los cuadros ni las velocidades para ahorrar producción sin una aprobación explícita.

## Cierre

Al completar cada fase: ejecutar las pruebas de código, revisar la integración y actualizar el traspaso con cantidades verificadas. La aprobación para convertir el pixel art en la línea principal permanece como un paso separado al terminar la producción y revisión.
