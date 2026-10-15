# FASE ICONOGRAFÍA

## Estado actual — implementación local completada

Validación de cierre: suite completa correcta, 81 archivos de pruebas y 978 pruebas aprobadas antes de actualizar la rama. ESLint del código de la fase también correcto. Christian aprobó explícitamente commit y push. Se incorporó origin/main c595dbd, que persiste habilidades equipadas, y se vuelve a verificar la combinación final.

Combinación final validada: compilación de producción correcta. La suite actual contiene 980 pruebas; 979 pasaron y una excedió 5 segundos al ejecutarse durante la compilación. Se repitió expedition.test.ts por separado, con sus 78 pruebas correctas, incluida la que había agotado el tiempo. No hubo errores de aserción. Advertencia existente de metadataBase en la compilación.

Los cuatro diseños de habilidades fueron aprobados e integrados: Sabotaje, Bastión, Paso evasivo y Restaurar. SKILL_FX utiliza identidades skill_* propias; los archivos de reliquias, pasivas y Oración se conservan. La resolución de arte mantiene los dibujos anteriores de Pixel Art mediante alias, incluidas sus dimensiones nativas. Las puertas compuestas y los iconos nuevos de Torre/Dungeons también están integrados localmente.

La galería consume los archivos integrados e incluye el ActionPanel real con selección de Pícaro/Caballero/Clérigo, avisos del enemigo en la ubicación actual y selector Pintado/Pixel Art. Es una muestra de controles sin modificación de partidas.

Verificado: TypeScript, ESLint, 14 pruebas de presentación/compatibilidad de iconos; comprobación en navegador de los cuatro iconos pintados y sus equivalentes Pixel, cargados en el panel real. No se modificaron reglas de combate. Captura: art_concepts/iconography/fase-iconografia-integrada.png.

Pendiente únicamente revisión final del usuario y autorización de publicación. Sin commit ni push. La suite completa y la compilación de producción se ejecutarán antes del commit autorizado. Las secciones siguientes conservan el historial de la fase; el estado de este apartado es el vigente.

## Avance tras aprobación de puertas

Christian aprobó el tamaño y pidió continuar. Las puertas pintadas quedan conectadas localmente a `Icon` (por ejemplo Dungeons) y `DoorIcon` (Torre/salas), mediante `PaintedDoorImage` compartido. El componente compone un marco y un símbolo con límites visibles medidos, conservando tamaños definidos por cada pantalla. Recurso de producción local: `public/art/iconography-painted-v2/door-frame.webp`; metadatos: `src/lib/art/door-symbols.generated.json`. La galería reutiliza el mismo componente. Pixel Art conserva su rama anterior. Sin commit ni push.

Primer piloto de habilidad generado con la herramienta integrada: Sabotaje, una daga que rompe un sello violeta. Usa como referencias la daga de Agua del equipamiento aprobado y el icono existente de Sello. Exportado a `public/art-review/painted-icons/rogue-sabotage-pilot-01.webp` (256 × 256, alfa, 28.940 bytes). La pestaña Piloto · Sabotaje compara actual/nuevo, 24/40/56/96 px, fondo claro/oscuro y una muestra de botón. No sustituye aún SKILL_FX. Verificación en navegador, TypeScript y ESLint correctos. Pendiente de aprobación del piloto antes de extender a Bastión, Paso evasivo y Restaurar.

Prompt del piloto (herramienta integrada): «Use case: stylized-concept. Asset type: a single transparent painted fantasy game skill icon, SABOTAGE for a rogue. Reference 1 is the approved dagger rendering style and materials: chunky readable silver steel facets, thick clean dark outline, warm gold guard, blue leather grip. Reference 2 is the existing mage seal skill icon: keep the rendering family but make this rogue skill clearly different. Draw ONE short rogue dagger slashing diagonally through a small violet magical ritual ring, visibly breaking its upper edge into 3 simple separated fragments. Blade is the main silhouette; ring subordinate. This communicates physically disrupting a spell, not time manipulation. Painterly cartoon fantasy matching approved equipment, not photoreal, no gritty realism. Large simple shapes and controlled highlights readable at 24 px. Single centered coherent composition fills 85% of square canvas, complete object inside generous 7% transparent margin. Genuine transparent background. No text, letters, UI border, plaque, hand, character, clock, winged boots, complex runes, smoky cloud or excessive glowing particles. Deliver one polished icon only.»

Iniciada por Christian después de pausar INTERFAZ. Conservar el diseño de interfaz actual. Trabajar con el acabado pintado ya aprobado en héroes, villanos, escenarios y equipamiento. No modificar Pixel Art ni producir un lote completo por la mera existencia de archivos históricos.

## Inventario inicial

Galería local: `/galeria-px/actualizacion-iconografia`.

- 246 archivos WebP en `public/art/icons` (excluye equipamiento pintado v2 y carpetas de estados). El catálogo incluye recursos históricos; no todos tienen uso actual confirmado.
- 20 habilidades actuales consultadas desde SKILLS y sus dibujos efectivos desde SKILL_FX. Sello, Purificar y las cuatro habilidades de Berserker ya tienen iconos conectados: las listas históricas que los pedían no describen el estado actual.
- Navegación: Dungeons usa door_boss; Torre dungeon_rank_s; Héroes class_knight; Invocar system_chest; Forja upgrade_sharp_edge; Misiones event_whispering_book; Sala system_token. Reutilización comprobada en AppShell, no falta de archivos.
- Economía: moneda, fragmentos, escamas y dado cargado ya tienen símbolos propios. Conservar su distinción cuenta/expedición/material.
- Los estados elementales ya tienen capas visuales; no rehacerlas dentro de esta fase. Aguante y Expuesto requieren evaluar legibilidad antes de pedir arte adicional.

## Candidatos de primer lote (propuesta, no aprobación)

| Habilidad | Dibujo actual | Motivo para revisar | Dirección propuesta |
|---|---|---|---|
| Sabotaje | relic_broken_clock | Reliquia usada como habilidad | Daga cortando un sello mágico; interrupción, no control del tiempo |
| Paso evasivo | relic_winged_boots | Puede sugerir velocidad o esquiva garantizada | Paso lateral con estela y guardia; comunica mitigación |
| Restaurar | skill_prayer | Conserva Oración del sistema anterior | Mano con pulso de cura, distinta de limpieza/purificación |
| Bastión | passive_wall | Pasiva reutilizada como defensa activa | Escudo físico con placas, distinto de Defender y barrera arcana |

Estas son necesidades de identidad/lectura propuestas; no se declara que los dibujos actuales estén rotos. Primero revisar juntos a 24/40/56 px y sobre fondo claro/oscuro en la galería. Después producir una muestra piloto y aprobarla antes de extender. El primer lote sería como máximo cuatro iconos pintados, sin regenerar las veinte habilidades.

## Estado

Galería de diagnóstico creada con originales existentes, candidatos anotados, las veinte habilidades, menú/economía y catálogo completo. Sin iconos nuevos generados ni reemplazos de producción. Sin commit ni push.

## Puertas — propuesta de composición

Ajuste posterior solicitado: algunos símbolos eran pequeños por el margen transparente de sus archivos. Se midieron los límites visibles de los siete símbolos (alfa > 8, margen de 3 px) con `scripts/measure-door-symbols.mjs`. La galería usa encuadre SVG centrado, sin modificar imágenes, y una caja interior del 40% × 45% a left 30% / top 34%. Así el tamaño depende de la silueta y no del lienzo original. Revisados los siete a 48/80/128 px; TypeScript correcto. Captura: `art_concepts/iconography/puertas-tamano-ajustado.png`. Este ajuste sustituye las medidas de caja del primer borrador descritas abajo.

Christian pidió corregir el símbolo que invade la puerta. La superposición está dibujada en los WebP históricos `icon_door_*`; no se arregla moviendo un elemento CSS de esos archivos. DoorIcon actual usa símbolos sueltos en Torre/salas, por lo que tampoco se debe afirmar que todos los modos montan dos imágenes superpuestas.

Se generó con la herramienta integrada un marco vacío reutilizable, usando `icon_door_chest.webp` como referencia. Exportado WebP transparente 512 × 512, 69.984 bytes, en `public/art-review/painted-icons/door-frame-v1.webp`. Galería: nueva pestaña Puertas, siete comparaciones antes/después, tamaños 48/80/128. El símbolo ocupa una caja de 36% × 35%, a 32% horizontal y 43% vertical: queda dentro del hueco y conserva separación del arco. Verificado visualmente y con medidas de los 28 ejemplos; TypeScript correcto. Sin reemplazo de recursos de producción ni cambios en Pixel Art. Pendiente de evaluación del usuario.

Prompt utilizado (herramienta integrada, edición): «Use case: precise-object-edit. Edit target: the supplied painted fantasy game doorway icon. Remove the treasure chest completely. Keep the same thick gray stone arched doorway, moss accents, chunky hand-painted cartoon fantasy rendering, warm edge highlights, three-quarter depth but nearly frontal symmetrical arch, square icon composition. The central doorway must be EMPTY dark navy flat shadow, no chest, no symbol, no props, no handles or wooden plank details in that central opening: this is a reusable frame for overlaying separately sized icons. Preserve the stone threshold and arch, keep the central opening spacious, about 52% of image width and from 27% to 83% of image height. Keep whole arch and threshold inside canvas with 5% transparent outer margin. Transparent background outside the door, genuine alpha, no checkerboard. No text, no labels, no decorations crossing the doorway opening.»
