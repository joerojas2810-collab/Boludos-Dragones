# Música de menú — continuación

2026-10-11. Integración y publicación autorizadas por el usuario. Suite completa: 548 pruebas aprobadas en 59 archivos.

Fuente del usuario: Proyecto de Juego/Musica/Menu/a_small_fire_will_do.wav. Copiada a public/audio/menu-a-small-fire.wav (16.934.546 bytes). Original intacto.

AppShell mantiene una instancia de audio entre menús. Se activa tras interacción, repite con loop, pausa al ocultar la pestaña, salir de los menús o montar BattleArena. Reanuda desde la posición pausada. Volumen Música independiente (35% por defecto), persistido junto a Efectos; Silenciar afecta ambos. La configuración antigua recibe el valor por defecto al cargar.

Pruebas dirigidas: 2 pasan. TypeScript y ESLint pasan. La reproducción audible y la unión del loop todavía no se comprobaron. La revisión del panel de sonido en navegador quedó bloqueada por la selección obligatoria del héroe inicial de un perfil local vacío; no se modificó ese perfil.

Pendiente antes de publicar: verificar en un perfil preparado el audio real, continuidad entre menús, pausa/reanudación en combate y controles Música/Silenciar. Comprobar que el archivo no tenga silencio inicial/final audible en el loop. Considerar convertir el WAV de 17 MB a un formato comprimido de buena calidad. No hay conversor instalado identificado; no descargar ni usar servicios externos sin necesidad.

El usuario cambió el umbral de detención al 5% disponible. Sin consumir créditos de reinicio.

EQUIPAMIENTO sigue pendiente del límite diario de imágenes. La corrección del splash de los nueve jefes está lista localmente y tiene su propia nota en CORRECCION_SPLASH_JEFES.md. Mantener los tres cambios separados y pedir aprobación de la publicación concreta.
