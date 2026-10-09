# Continuación de producción pixel art

Plan de trabajo mediante bases compartidas y exportaciones automatizadas. Las siete fases originales están completadas; las secciones históricas conservan sus cantidades y decisiones. Héroes y fondos de combate ya fueron adaptados a HD. El trabajo actual es la conversión de Fase 2: enemigos y jefes a 128×192.

## Reglas de trabajo

- Mantener el pixel art de aventura de fantasía de 16 bits aprobado: iluminación arriba a la izquierda, contorno coherente, tamaños nativos y PNG sin suavizado.
- Conservar los nombres existentes en `public/art/`, cambiando únicamente la extensión a `.png`. Las excepciones requieren autorización del usuario.
- Revisar visualmente cada lote y comprobar sus dimensiones, transparencia y manifiesto. Ejecutar TypeScript, ESLint y Vitest al terminar cada fase, según la instrucción del usuario.
- Hacer commit y push de cada fase terminada a `main`: el usuario confirmó que la rama pixel fue fusionada y autorizó subir los cambios visuales. No retirar el arte pintado ni crear un PR sin solicitud del usuario.
- Trabajar con dos agentes: dirección visual y producción; inventario, exportaciones e integración. Un responsable centraliza los commits y pushes.
- Entregar solo recursos finales y manifiestos; conservar ZIP fuera del repositorio y excluir fuentes, borradores y carpetas de trabajo.

## Actualización de Fase 1: héroes HD

Completada el 8 de octubre de 2026 después de aprobar las cuatro muestras: cuatro clases, diez acciones y cinco elementos. Se reemplazaron las 40 bases de Fuego por tiras nativas 128×192 (144 cuadros), con arma incluida y anclaje (64,180). La importación genera 200 PNG / 720 cuadros, con margen lateral transparente de 6 px por cuadro: tamaño de reproducción 140×192, anclaje (70,180). Las acciones mantienen cuadros, fps, loop y hold de heroes.ts. Poses distintas de ataque, defensa, guardia, golpe, esquive, derrota y victoria; pequeños desplazamientos de piezas completan las transiciones.

Las variantes conservan píxeles neutros y alfa, y cambian solo la rampa exclusiva de cuatro tonos. Paquete phase_1_heroes.zip: 40 bases y manifiesto. Escala entera en combate, mínimo 192 px para el héroe, reducción exacta a 96 px en tarjetas. Verificados 1080p, 2K y móvil; TypeScript y ESLint sin errores; 43 archivos / 414 pruebas aprobadas. Los enemigos y los fondos de combate conservan sus recursos anteriores. Los cuatro reposos antiguos permanecen en la comparación de desarrollo.

## Actualización de Fase 6: combate HD

Autorizada el 8 de octubre de 2026 después de cerrar los héroes HD. Reemplazar 90 capas de combate (18 escenas, nueve parejas normal/jefe) por PNG nativos 960×540; suelo desde y=378 y anclaje central (480,270). Conservar nombres, cinco capas, factores de parallax y las seis pantallas completas HD existentes sin cambios. Reutilizar las cinco capas de Pantano HD aprobadas; producir ocho planos lejanos y ocho grupos de arquitectura nuevos. Los jefes comparten cielo, plano lejano y primer plano y se distinguen por arquitectura ceremonial y detalles de suelo. Entrega acumulada: 96 PNG, manifiesto y ZIP completo.

Producción completa: 90 capas de combate HD importadas y seis pantallas completas intactas. Verificados 96 PNG, paletas exactas, dimensiones, alfa, anclajes, suelo en y=378, igualdad entre entrega y juego y ZIP de 97 entradas (22.318.582 bytes). TypeScript y ESLint sin errores; Vitest 44 archivos / 421 pruebas aprobadas. Revisión visual completada en galería y combate 1080p, 2K y móvil: todas las capas cargan y conservan escalas enteras. La distribución móvil previa del protagonista en la fila superior permanece fuera de esta fase. Lista para commit y push a main. No iniciar la adaptación de enemigos ni otras fases sin la siguiente instrucción del usuario.

## Actualización de Fase 2: enemigos y jefes HD

Producción completa: 24 diseños, cinco familias con normal, élite y jefe más nueve jefes finales. Las 110 tiras de Fuego y sus 392 cuadros conservan el catálogo, con reposo, ataque, recibir golpe y derrota; los 14 jefes también tienen entrada. Importación final: 550 tiras y 1.960 cuadros en cinco elementos. Cuadros nativos 128×192 y pies (64,180); margen lateral 6 px, reproducción 140×192 y pies (70,180).

Los atlas originales aportan cuatro poses distintas por diseño. La extracción conserva la anatomía mediante escala uniforme y alineación de pies; las transiciones usan desplazamientos de un píxel de la parte superior y entrada por revelado binario. La máscara elemental roja y sus brillos cálidos se normalizan a la rampa exclusiva de cuatro tonos; las variantes cambian únicamente esa rampa, conservando marfil y acero neutros. Sin los filtros de brillo del importador antiguo para HD. Alfa binario, RGB transparente cero y máximo 96 colores por tira base.

La integración usa `pixel-enemies.generated.json`, independiente de los héroes. El importador valida nombres, cuadros, fps, loop, derrota mantenida y anclajes; la galería no solicita entrada para normales ni élites. Recursos pintados y reglas de juego conservados. Entrega: 110 bases y manifiesto en `phase_2_enemies.zip`, 111 entradas y 3.223.212 bytes; borradores y atlas fuera del repositorio. Activos, paletas, alfa, recoloreado exacto y ZIP aprobados; TypeScript y ESLint sin errores; Vitest 45 archivos / 423 pruebas aprobadas. El mapa de muestra se presenta sin las 120 animaciones del catálogo, que se abre mediante un botón. Revisión visual aprobada: cuatro poses de los 24 diseños y muestra con componentes reales en 1080p, 2K y móvil. Catálogo desplegable, entrada de jefe con retorno a reposo y derrota mantenida comprobados. Fase terminada y lista para commit y push.

## Fase 4: estadísticas, sistema y reliquias

El lote 9 reúne los 8 íconos de estadísticas y los 17 de sistema. Reutiliza símbolos aprobados cuando representan el mismo concepto y deriva los estados de corazón y las filas de estrellas de bases compartidas.

Las 99 reliquias se descomponen en **24 diseños base, 72 variantes y 3 distintivos de rareza**. Las variantes son `common`, `rare` y `legendary`, una de cada tipo por diseño. La forma del objeto debe conservarse; los detalles de rareza deben distinguirse también por su forma.

Completada el 7 de octubre de 2026: tres lotes de 33 archivos, cada uno con 8 bases, 24 variantes y un distintivo. Se reutilizaron 5 bases aprobadas y se generaron 19 objetos nuevos. Fase 4 total: 238 PNG finales. Importación de las 99 reliquias verificada píxel por píxel; galería con 257 íconos acumulados (19 de Fase 3 y 238 de Fase 4), sin recursos faltantes. TypeScript y ESLint sin errores; 449 pruebas aprobadas. ZIP completo y manifiestos entregados. El kit de interfaz también quedó completado; siguen los fondos.

Fuentes de nombres: `public/art/icons/icon_relic_*.webp` y `src/lib/artIds.json` (sección `relic`). Fuente del significado, nombre en español y rareza: `src/lib/game/relics.ts`. Usar esos datos para agrupar objetos y comprobar los archivos; no deducir nombres nuevos de los textos en español.

## Fase 5: kit de interfaz

Completada el 7 de octubre de 2026: 130 PNG finales, manifiesto con paleta y cortes, ZIP verificado e integración en `ui-px/`. La galería muestra los 130 recursos sin archivos faltantes y prueba paneles a 320 y 640 px con esquinas fijas. Pruebas de cierre aprobadas: TypeScript, ESLint y 449 pruebas Vitest. Siguiente fase: fondos, previa revisión del usuario.

Referencia exacta: los **130 archivos** actuales de `public/art/ui/`. Construir bases comunes y exportar sus estados de manera consistente:

- 25 botones: 5 variantes por 5 estados; 6 paneles con cortes 9-slice explícitos.
- 18 marcos de rango, 9 favicon derivados de un emblema y 4 logos.
- 8 barras, 5 casillas, 5 pestañas, 6 checkbox y 6 radio.
- 4 input, 4 select, 4 slider y 4 toggle; 2 piezas de scrollbar.
- 14 glifos, 3 cofres y los recursos `separator`, `title_tab` y `modal_scrim`.

Los estados deben compartir geometría y cortes para evitar saltos de tamaño. Revisar un conjunto representativo antes de exportar todo el kit. Las piezas no animadas llevan un cuadro; los cortes y tamaños nativos se declaran en el manifiesto.

## Fase 6: fondos por capas

Actualización del 8 de octubre de 2026: **96 de 96 recursos completados**. Se añadieron colección, invocación, sala, mercado y forja a **960×540**, con el detalle de la muestra HD aprobada. Los 91 archivos anteriores permanecen a 320×180 sin cambios. El manifiesto declara dimensiones por archivo; el importador y el escalado de pantallas respetan ambos tamaños. Paquete completo: `phase_6_backgrounds_complete.zip`, 96 PNG y manifiesto. Verificados ZIP, dimensiones e igualdad de importación; TypeScript y ESLint sin errores, 412 pruebas aprobadas. La muestra de Pantano 960×540 y Caballero 128×192 permanece separada; no convierte los héroes existentes ni sus animaciones.

El usuario autorizó continuar directamente con Fase 7 usando el nuevo detalle. Las mejoras del resto de las fases se evaluarán después del cierre de 6 y 7.

Estado al 7 de octubre de 2026: **91 de 96 archivos entregados e integrados** (90 capas de combate y menú). Faltan únicamente colección, gacha, lobby, mercado y forja, como imágenes únicas. La herramienta alcanzó su límite diario y el usuario eligió esperar al reinicio previsto para el 8 de octubre, aproximadamente 13:37 de Argentina. Conservar los 91 recursos terminados; no iniciar Fase 7 ni marcar Fase 6 completa. Las pruebas de código se ejecutarán al añadir los cinco restantes.

Los nombres actuales incluyen **18 escenarios de combate con 5 capas desktop**, es decir, 90 archivos. Compartir capas entre normal y jefe cuando el escenario lo permita, conservando una diferencia visual clara en la zona de combate. Referencias: `public/art/backgrounds/`, `src/lib/art/backgrounds.ts` y `src/lib/art/backgrounds.generated.ts`.

El usuario decidió mantener menú, colección, gacha, lobby, mercado y forja como una sola imagen por pantalla. Conservar los nombres `menu_desktop_composite.png`, `collection_desktop_composite.png`, `gacha_desktop_composite.png`, `lobby_desktop_composite.png`, `market_desktop_composite.png` y `forge_desktop_composite.png`. El alcance final de Fase 6 es de 96 archivos: 90 capas de combate y 6 imágenes de pantalla. No producir versiones mobile; el juego realizará el recorte. El lote nativo usa 320×180, alfa binario, suelo al 70 % y paleta efectiva por archivo. La integración parcial mantiene el respaldo pintado de las cinco pantallas pendientes. `phase_6_backgrounds_batch_1.zip` contiene los 91 recursos completados y su manifiesto; el paquete completo se prepara al terminar los 96.

## Fase 7: efectos

Completada el 8 de octubre de 2026: **142 PNG finales**, 71 animaciones y 71 variantes de movimiento reducido. Diseños nuevos con el detalle HD aprobado; golpes 128×128, auras/forja/invocación 192×192, entradas por rango 384×192, resultados 384×128, emotes 64×64, glifos 32×48 y otros tamaños declarados por archivo. Se conservaron cuadros, fps, filas, mapas de glifos, loop y finish de las referencias. Cofres cerrados y abiertos, máscaras de rango y símbolos aprobados distinguen las variantes. PNG con alfa binario y máximo 96 colores, anclaje central; reduced estático o transparente para decoraciones. Importador, galería y selección de rutas pixel integrados; respaldo pintado y lógica de juego conservados. ZIP `phase_7_effects.zip`, 143 entradas y 1.999.074 bytes. La revisión de las demás fases con el nuevo detalle queda pendiente de decisión del usuario.

Existen **71 efectos principales y 71 versiones en `reduced/`**. Referencias de nombres: `public/art/effects/`. Referencia exacta de cuadros, fps, filas, tamaño de celda y comportamiento al finalizar: `src/lib/art/effects.generated.ts`. Conservar `remove`, `hold` o `loop` y los metadatos de glifos cuando correspondan.

Reutilizar bases para los cinco golpes elementales, las aperturas y revelaciones de gacha por rango y las entradas de jefe. Exportar las variantes y versiones reducidas mediante reglas comunes cuando su animación y significado lo permitan. No cambiar los cuadros ni las velocidades para ahorrar producción sin una aprobación explícita.

## Cierre

Al completar cada fase: ejecutar las pruebas de código, revisar la integración y actualizar el traspaso con cantidades verificadas. La aprobación para convertir el pixel art en la línea principal permanece como un paso separado al terminar la producción y revisión.
