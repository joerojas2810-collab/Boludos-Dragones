# FASE ESCENARIOS

Actualización aprobada por el usuario el 11 de octubre de 2026.

- Rework de los 24 escenarios pintados: seis pantallas principales y dieciocho arenas, con variantes normales y de jefe para mundos y mazmorras.
- Composiciones específicas para escritorio y móvil: 48 fondos WebP en total. Las pantallas móviles son verticales y las arenas móviles cuadradas para el espacio de combate.
- Acabado coherente con los héroes y villanos aprobados, conservando los temas y arquitectura de los escenarios Pixel Art como referencia.
- Eliminada la ampliación adicional y la animación del fondo pintado para conservar nitidez. Los efectos ambientales y la viñeta de jefe se mantienen.
- Pixel Art y el escenario SVG antiguo conservan sus recursos y comportamiento.
- Exportaciones optimizadas: aproximadamente 29.3 MB para el catálogo completo, frente a 137.9 MB de los originales PNG. El navegador utiliza la variante correspondiente al dispositivo.
- Se canceló el requisito de 2K nativo. Los fondos finales conservan la resolución de generación; las pruebas de reescalado no se aplicaron a producción.

Validación: 543 pruebas en 57 archivos, TypeScript, ESLint del área modificada y compilación de producción aprobados. Se verificaron las dimensiones y existencia de los 48 fondos, el menú del juego local y los encuadres de la galería. No se realizó una partida autenticada contra Supabase.

La galería de revisión, los originales y las pruebas de reescalado se conservan en el entorno local de trabajo; este cambio publica los recursos de producción y su integración.
