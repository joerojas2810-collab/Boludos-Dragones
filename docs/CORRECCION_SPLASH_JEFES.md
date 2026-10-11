# Corrección del splash de jefes pintados

2026-10-11. Corrección y publicación autorizadas por el usuario. Suite completa: 548 pruebas aprobadas en 59 archivos.

El splash de entrada usaba el efecto boss_entrance_<rango> con una ilustración vieja incorporada. El sprite de combate ya tenía el diseño aprobado de FASE VILLANOS.

BossIntro ahora resuelve la entrada del mismo jefe mediante enemyAnim y DUNGEON_THEMES, mostrando la animación aprobada y el nombre como texto. Los nueve rangos usan sus elementos correctos. Pixel Art y los jefes de familia mantienen su presentación anterior.

La galería local incluye una prueba en /galeria-px/actualizacion-enemigos#presentacion-jefes, con selección de los nueve jefes, entrada reproducible y presentación sostenida para revisar.

Verificación: siete pruebas dirigidas pasan (incluyen los nueve jefes pintados, preservación Pixel, independencia de la galería y cobertura de animaciones), TypeScript y ESLint sin errores. Revisados en navegador Gran Devorador, selección del Señor de las Moscas y desvanecimiento de la entrada. No verificado mediante una partida autenticada en producción.

La corrección no requiere generar imágenes nuevas. Publicación autorizada; mantener EQUIPAMIENTO separado.
