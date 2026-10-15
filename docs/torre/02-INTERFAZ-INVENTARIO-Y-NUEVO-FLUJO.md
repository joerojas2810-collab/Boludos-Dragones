# Inventario de interfaz y flujo de torre

Auditoría estática del código consultado el 15/10/2026. Las líneas son referencias de búsqueda, no garantía de estabilidad. No se realizó inspección visual en ejecución. Cambios de esta tabla son especificación pendiente para Claude; el repositorio original no fue editado.

## 23 superficies revisadas

| ID | Superficie | Referencia relativa a Nuevo Juego | Tratamiento | Resultado esperado |
|---|---|---|---|---|
| UI01 | Hub de torre | `src/app/torre/page.tsx:69` | Reemplazar | Describir expedición, decisiones, pérdida temporal y progreso de cuenta. |
| UI02 | Dos modos | `src/app/torre/page.tsx:113` | Conservar y ampliar | Nivelado y Colección; mostrar expedición activa por modo y snapshot de equipo. |
| UI03 | Subir la torre | `src/app/torre/page.tsx:124` | Reemplazar | Nueva expedición o Reanudar; no cerrar una existente al empezar otra. |
| UI04 | Tooltip de economía | `src/app/torre/page.tsx:75` | Corregir | Dice sin monedas ni botín aunque hay premios. Separar fragmentos temporales de premios de cuenta. |
| UI05 | Premios y medallas | `src/app/torre/page.tsx:85` | Revisar | Premiar combates, no servicios. Reetiquetar hitos por nodo/sector y mostrar límite semanal. |
| UI06 | Ranking | `src/app/torre/page.tsx:134` | Conservar y ampliar | Semana, modo, nodo validado, desempate y estado pendiente de validación. |
| UI07 | Ruta de ejecución | `src/app/run/page.tsx:7` | Corregir | Validar torre=nivelado|coleccion. Valor inválido debe dar recuperación, nunca pantalla vacía. |
| UI08 | Navegación Torre | `src/components/AppShell.tsx:43` | Ampliar | Marcar activa también en /run?torre=... y conservar acceso a Reanudar. |
| UI09 | Instrucciones de partida | `src/app/run/TowerMode.tsx:173` | Reemplazar | Eliminar afirmación de que no existen descansos, rutas ni mejoras. |
| UI10 | Clase, elemento y habilidades | `src/app/run/TowerMode.tsx:176; src/components/room/ClassElementPicker.tsx:64` | Conservar | SkillPicker ya existe. Mostrar dos habilidades equipadas y cuatro botones en combate. |
| UI11 | Tarjeta de Colección | `src/app/run/TowerMode.tsx:195` | Cambiar acción | Seleccionar abre preparación; confirmar héroe, equipo y habilidades antes de iniciar. |
| UI12 | Vida de la sesión | `src/app/run/TowerMode.tsx:56,99` | Reemplazar | Estado persistente; desmontar o pagehide no equivale a liquidar. |
| UI13 | Abandonar | `src/app/run/TowerMode.tsx:265` | Separar | Guardar y salir suspende; Retirarse termina. Silencio de audio se conserva. |
| UI14 | HUD | `src/app/run/TowerMode.tsx:288` | Adaptar | Sector, piso, combate, PV, fragmentos y acceso a seis reliquias; detalles fuera del HUD. |
| UI15 | Siguiente piso | `src/app/run/TowerMode.tsx:362` | Reemplazar | Continuación depende de fase: recompensa, ruta, servicio o cierre. |
| UI16 | Vistas sin batalla | `src/app/run/TowerMode.tsx:254,258` | Agregar | Preparación, reliquia inicial, ruta, evento, tienda, descanso, santuario, recompensa, build y suspensión. |
| UI17 | Panel de combate | `src/app/run/TowerMode.tsx:349; src/components/ActionPanel.tsx:338,400` | Conservar | Básico, defensa y dos habilidades; cola, recurso, enfriamiento y objetivo. Resolver rápido no omite decisiones. |
| UI18 | Objetivos enemigos | `src/components/BattleArena.tsx:344; src/components/useTargeting.ts:6` | Conservar y probar | 1–3 rivales. Click, 1–3, flechas y Enter/Espacio; excluir muertos y mantener correspondencia visual. |
| UI19 | Tarjetas de enemigo | `src/components/BattleArena.tsx:392; src/components/HudCard.tsx:114,161` | Ampliar | Conservar PV, elemento, Aguante e intención. Añadir rol, élite y modificador con explicación de respuesta. |
| UI20 | Posiciones de enemigos | `src/components/arena.css:192,249; src/components/BattleArena.tsx:289` | Verificar | Tres columnas y anchos actuales requieren QA con textos largos, Info abierta y enemigos muertos. |
| UI21 | Altura de combate | `src/app/run/TowerMode.tsx:282; src/components/ActionPanel.tsx:338,400` | Verificar | h-screen, overflow y cortes sm/md: probar móviles pequeños, landscape y teclado sin ocultar acciones. |
| UI22 | Resultado final | `src/app/run/TowerMode.tsx:386` | Ampliar | Motivo, nodo validado, build final, causa de derrota, premios y reintento de sincronización. |
| UI23 | Escena y efectos | `src/components/BattleArena.tsx:293,317,418; src/app/run/TowerMode.tsx:285,318` | Conservar y adaptar | Reusar fondos, sprites y entradas; tema por sector, etiqueta de élite/jefe y modificadores legibles. |

## Flujo de pantallas

Hub → preparación → reliquia inicial → ruta → encuentro/servicio → recompensa si corresponde → ruta siguiente. Después del jefe: recompensa → resumen de sector → próximo sector. Derrota, retiro y cierre de temporada llevan a resultado final. Guardar y salir vuelve al hub sin terminar la partida.

Desde el hub, añadir accesos al códice de 18 reliquias y seis eventos, al historial de builds y al récord personal. Son vistas nuevas del metagame, además de las 23 superficies existentes auditadas; el códice distingue descubierto de disponible sin bloquear mecánicas. El resultado final enlaza a la build guardada y a la entrada del enemigo que causó la derrota.

La pantalla de ruta muestra dos opciones con composición, rol, modificador, recompensa y riesgo. El jefe del sector es consultable desde el inicio. El resumen de sector no añade premios ni cuenta como nodo. Las seis reliquias se consultan en un panel, con nivel, efecto y duración; el detalle de cuenta permanece separado.

En tienda se muestran tres productos y se permite una compra; después se deshabilitan las otras compras, pero Continuar permanece. El santuario permite una sola recompensa y preparar dos habilidades gratis antes de continuar. Si un evento entrega una oferta de reliquia, mantener una subfase de recompensa pendiente: refrescar no vuelve a cobrar ni vuelve a otorgar el beneficio.

## Combate, tarjetas y posiciones

Conservar un héroe y hasta tres rivales. No introducir formación, movimiento espacial ni un cuarto enemigo. Orden estable por ID del encuentro; un muerto conserva su lugar visual deshabilitado hasta finalizar para evitar saltos de objetivo. La selección de un objetivo vivo se mantiene si sigue válido; si muere, conservar el comportamiento actual de seleccionar el primer vivo y anunciar el cambio.

La tarjeta resume nombre, PV, rol, elemento e intención de la próxima acción. Aguante, ritual y reconstrucción deben conservar sus indicadores y efectos existentes. Info abre detalle con condición, consecuencia y respuesta posible. «Élite» se distingue con texto y marco; el color no es la única señal. Los modificadores de sector se muestran una vez en cabecera y junto a la intención cuando alteren su resultado.

Las teclas 1–3 seleccionan enemigos solamente durante combate. Las vistas de elección usan foco y confirmación explícitos; bloquear la misma pulsación al cambiar de fase. Enter/Espacio no puede comprar una reliquia por arrastre de la acción anterior. Escape cierra detalle antes de ofrecer salida. Todas las acciones tienen alternativa táctil y foco visible.

## Verificación visual requerida

Probar 320, 360 y 390 px; desktop; landscape; zoom 200%; estilos pintado y pixel. Casos: tres rivales, nombre largo, intención de dos líneas, Info abierta, jefe con ritual, un rival muerto, seis reliquias, moneda al máximo y desconexión. Ninguna barra debe tapar objetivos o botones. En móvil, detalles de build abren panel desplazable y no comprimen el campo de batalla.

No se ha demostrado que las posiciones actuales estén rotas: son puntos de riesgo de la nueva densidad informativa. Capturar antes/después con idéntico encuentro para comprobar que la ampliación no empeora legibilidad.
