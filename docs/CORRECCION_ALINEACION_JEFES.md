# Alineación de jefes — 15/10/2026

La regla de escritorio para un jefe solitario desplazaba su HUD a la izquierda de su columna. Afectaba tanto al estilo pintado como a Pixel Art. Se eliminó ese desplazamiento: la barra de vida y el modelo comparten ahora el mismo centro horizontal, igual que los demás enemigos.

Prueba local: `/galeria-px/alineacion-combate`. Usa BattleArena real con partida de muestra; permite elegir los nueve jefes, ambos estilos y uno, dos o tres enemigos. No modifica la partida guardada.

Verificación en navegador: nueve jefes en ambos estilos a 1920 × 900 y grupos de dos y tres enemigos. Diferencia entre centros de HUD/modelo: como máximo 0,01 px. Jefe solitario comprobado también a 1280 × 720 y 390 × 844. Captura pintada y mediciones en `art_concepts/combat_alignment/`.

## Convención para futuras galerías de combate

Indicada por Christian el 15/10/2026: los ataques/intenciones enemigos se muestran en el panel inferior de combate, junto a la secuencia de turnos y los controles del héroe. No volver a colocarlos debajo de las barras de vida y aguante. Reutilizar los componentes vigentes del juego para evitar presentar una interfaz anterior en las galerías.

Publicación aprobada por Christian el 15/10/2026. La corrección se aplica sobre la versión actual de main y conserva la nueva disposición inferior de ataques.

Validación previa a publicación: 977 pruebas en 81 archivos aprobadas, TypeScript y compilación de producción correctos. Se agregó una anotación explícita de la fila SQL en la prueba histórica `supabase/tests/pglite/upgrade.mts` para resolver un error de tipos presente en la versión remota; sin cambios de lógica ni de base de datos.
