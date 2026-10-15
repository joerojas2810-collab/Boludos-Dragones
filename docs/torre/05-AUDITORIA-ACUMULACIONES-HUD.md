# Evaluación de acumulaciones, HUD e interfaz

Revisión del código disponible el 15/10/2026, posterior a la propuesta de torre. Hay cambios recientes: BattleFx ya procesa eventos estructurados y el motor ya contiene RelicMods. No reutilizar los faltantes de auditorías anteriores sin comprobarlos. Esta entrega evalúa y especifica; no modifica el juego. No se abrió una partida interactiva: los riesgos de solapamiento son inferencias del layout, no fallos visuales observados.

## Dictamen

Sí necesitamos cambios de presentación, principalmente para hacer visible cuánto hay, cuánto dura y qué acción lo aprovecha. No necesitamos reemplazar el combate, agregar botones ni producir otro lote de arte. Mantener la arena y usar componentes compartidos para héroes/enemigos; separar estados de combate de las seis reliquias de expedición.

La nueva torre agrava problemas existentes: sus bonificaciones deben reflejarse en la predicción de habilidades y sus paneles no pueden competir por espacio con intenciones, PV y estados. La existencia de RelicMods/relics.ts no demuestra que el flujo de torre completo ya esté integrado; TowerMode conserva el flujo anterior y su texto sin descansos.

## Qué significa cada acumulación

| Sistema | Regla actual | Representación actual | Cambio requerido |
|---|---|---|---|
| Recurso de clase |0–3; nombres distintos por clase | ActionPanel muestra nombre, tres rombos y número/3 | Conservar. No confundir con carga elemental o reliquias. Mostrar ganancia/coste real en acciones |
| Escarcha | Máximo 3; duración base 3 turnos del portador, reducible por resistencia; reduce velocidad 10%/carga | Icono agua, ESC, ▼cantidad; duración en ayuda | Mostrar cantidad/límite y duración accesibles sin depender del tooltip |
| Quemadura | Máximo 2; duración base 3; daño por carga y tope 6% PVmáx por tic | Icono fuego, QUE, ▼cantidad; regla en ayuda | Distinguir cargas de daño; ayuda contextual con próximo tic real y límite aplicado |
| Impulso | Máximo 3; base 3 turnos; velocidad+8%/carga | Icono viento, IMP, ▲cantidad | Cantidad/límite y duración; predicción de consumo con reliquia |
| Ruptura | Máximo 3; base 3 turnos; DEF−8%/carga | Icono tierra, RUP, ▼cantidad | Cantidad/límite; tras consumir mostrar penetración preparada en atacante |
| Sobrecarga |0–3 sobre portador Rayo; consumo al llegar a 3 | Hexágono ⚡cantidad y SOB; /3 en ayuda | Mostrar cantidad/3 y Listo al completar; no dibujar reloj de expiración ficticio |
| Aguante | Barra enemiga que se vacía hasta Quiebre | Barra numérica, alerta al 25% | Conservar; explicar «vaciar para quebrar», diferenciar de PV/escudo |
| Expuesto y resistencia a Quiebre | Ventana temporal y protección posterior | Escudo roto sobre sprite; chip Expuesto; contador de resistencia | Una sola explicación temporal precisa: hasta completar el siguiente turno propio; evitar ambigüedad de “hasta su turno” |
| Escudo, defensa y mitigación | PV absorbibles, defensa activa y reducción del próximo golpe son reglas distintas | Chip de escudo; marcas de defensa/mitigación sobre sprite; chips en HUD | Conservar separación; mostrar porcentaje y condición de expiración de mitigación |
| Jefes | Presión, Aceleración, cabezas, postura, armadura/roto, ritual, etc. | bossBadge muestra algunos contadores y ayudas generales | Añadir máximos o próximo umbral cuando cambien la decisión; no tratarlos como estados elementales |
| Reliquias | Efectos temporales de expedición; seis espacios, nivelesI/II propuestos | Motor ya tiene campos de bonificación; flujo viejo de torre no basta | Panel propio con nivel, efecto efectivo, duración y usos; Fénix consumido visible y persistente |

`statuses.ts` renueva duración al aplicar el mismo estado y limita cargas; no crea un icono por carga. `fresh` evita gastar al cierre inmediato un estado autoaplicado. Debe explicarse «turnos del portador», nunca «rondas globales». No añadir duración ficticia a recurso, escudo o Sobrecarga.

## Hallazgos y prioridad

1. **Alta — Penetración preparada sin indicador persistente.** `combat.ts:881` guarda nextAttackDefenseBypass al consumir Ruptura. No aparece en StatusIcons/HudCard ni en explain. Las cargas desaparecen, pero queda un efecto futuro invisible. Añadir «Penetración preparada: X% DEF», condición y expiración exactas del motor. No afirmar que dura indefinidamente: combat.ts también la limpia en mantenimiento. Si el ataque siguiente no consume el efecto en todos los órdenes de turno, probarlo antes de prometerlo en UI.
2. **Alta — Predicción de consumo desactualizada frente a reliquias.** `explain.ts:542–564` calcula Escarcha e Impulso sin frostBonus/windBonus ni el mismo cap final usado por `combat.ts:850–900`. Mostrar el resultado efectivo: para Escarcha distinguir demora máxima de demora posible según progreso actual. Extraer cálculo puro compartido; no copiar una fórmula distinta en tooltip. Revisar también daño de Quemadura, penetración y descarga con sus bonificaciones.
3. **Alta — Información esencial demasiado repartida.** `StatusIcons.tsx` contiene estados elementales sobre sprites, `HudCard.tsx` muestra otras condiciones y ActionPanel contiene recurso/intenciones. Mantener iconos sobre sprites como eco visual, pero ofrecer una fila legible y estable en tarjeta/detalle del seleccionado, sin repetir tres filas grandes por enemigo.
4. **Media — Cantidad y duración no se distinguen en lectura rápida.** Los badges muestran stacks, no turnos; duración está en statusTip. Propuesta de ficha compacta: «Escarcha 2/3 ·2 t propias». En tarjetas estrechas, icono+2/3 y acceso a detalle; en seleccionado, texto completo. El aria-label debe incluir cantidad, máximo y duración.
5. **Media — Stats base pueden parecer stats actuales.** HudCard usa c.char.stats para ATQ/DEF/VEL, mientras Escarcha/Impulso/Ruptura y reglas de jefe alteran resultados. Etiquetar Base o mostrar «base → efectiva», con ayuda del modificador. No inventar un único ATQ efectivo cuando depende de objetivo o habilidad.
6. **Media — Debuffs secundarios poco concretos.** Curas½ no muestra healCut restante y Mitigación no indica porcentaje en su chip, aunque el sprite sí tiene la cantidad. Unificar fuentes y mostrar turno restante/condición; las diferencias entre fin de turno y próximo impacto importan.
7. **Media — Mecánicas de jefe con previsión incompleta.** bossBadge informa Presión×n, Aceleración×n y Cabezas×n, pero sus ayudas son generales. Mostrar próximo escalón y respuesta relevante; para armadura separar escudo actual de fase Roto y momento de reconstrucción. Ritual debe destacar interrumpible y herramientas equipadas capaces de hacerlo. Además, BOSS_TEXT usa intervalos fijos mientras bossRules.ts tiene helpers por ascensión: derivar repetición, ritual y aceleración de la configuración efectiva. Mostrar contador de reconstrucción y aviso de repetición del jefe que aprende; aclarar que cabezas temáticas no equivalen automáticamente a impactos extra sin límite.
8. **Media — Densidad y anclaje de estados.** StatusIcons usa top 14%, iconos 36–44 px, flex-wrap; tres enemigos estrechos más estados y chips pueden ocupar varias filas sobre sprites. Definir fila compacta y detalle del seleccionado; medir antes de mover personajes. No añadir reliquias sobre cada sprite.
9. **Media — Duplicación de intenciones.** IntentCard y ActionPanel/IntentStrip presentan la misma amenaza en niveles distintos. En móvil múltiple, la tarjeta oculta efecto/cancelación y el panel conserva explicación. Conservar esa jerarquía y una sola zona con texto completo; no sumar una tercera lista.
10. **Media — Detalles y selección comparten superficie.** Info se abre dentro de una tarjeta que vive en un radio clickeable. Separar activación del objetivo de botones de ayuda, evitando propagación de click/Enter. HudCard posiciona detalle absoluto; Tooltip usa portal y límites de viewport: revisar ambas conductas, no asumir idéntica protección ante recortes.
11. **Conservar — FX y callouts ya mejorados.** BattleFx ahora procesa eventVfx para consumo/quiebre/interrupción/reconstrucción/limpieza, y stepNumbers separa daño, cura y autodaño. pickCallouts prioriza eventos y añade «y N más». No pedir rehacer esa integración; probar con acumulaciones simultáneas y acceso real al registro.
12. **Conservar — Lenguaje que no depende sólo de color.** Ya existen formas, flechas, abreviaturas, números, Aguante accesible e intención textual. Mejorar consistencia, no sustituirlo por partículas sin explicación.

## Diseño objetivo de HUD

Siempre visible: PV y escudo cuando exista; recurso de clase junto a los cuatro botones; intención inmediata; Aguante enemigo; objetivo seleccionado; estados decisivos compactos. Un cambio de cargas actualiza número y un pulso breve; alcanzar máximo añade señal Listo cuando exista consumo útil. Un consumo muestra desaparición de cargas y la consecuencia, no sólo un destello.

Detalle del seleccionado: nombre completo, cantidad/máximo, turnos del portador, efecto efectivo, consumo y respuesta posible con habilidades equipadas. Mantener el foco tras actualizar. No esconder Expuesto, amenaza fuerte o penetración preparada detrás de «+N» genérico. Condiciones secundarias pueden agruparse con detalle accesible.

Fuera de la arena: sector/piso, fragmentos y botón Build 6/6. La build muestra niveles y Fénix disponible/gastado; no usa pips de recurso de clase. Monedas permanentes llevan Cuenta; fragmentos Esta expedición; pacto Próximo combate.

## Pantallas y controles obsoletos con la torre propuesta

La tabla siguiente identifica lo que pierde sentido por el cambio. Son requisitos de reemplazo; el código auditado todavía contiene el flujo viejo.

1. Texto del hub que describe sólo cadena de peleas: reemplazar por expedición, decisiones y premios diferenciados.
2. CTA único «Subir la torre»: Nueva expedición/Reanudar según estado.
3. Instrucción «un piso por pelea, sin descanso»: incorrecta con servicios; diez nodos son siete combates.
4. Tooltip «sin monedas ni botín»: distinguir cuenta de fragmentos y reliquias.
5. Selección de héroe de Colección que inicia de inmediato: preparación y confirmación de snapshot.
6. Vista que asume siempre una batalla y retorna vacío sin ella: router de fases de ruta/servicios/recompensas.
7. Botón «Siguiente piso» que inicia otra pelea incondicionalmente: continuación según fase.
8. «Abandonar» como única salida: separar Guardar y salir de Retirarse.
9. Cierre/liquidación por desmontar o cerrar pestaña: sustituir por persistencia y reanudación.
10. Resultado sólo profundidad/premio: incluir build, causa, nodo validado y motivo de cierre.
11. Premios automáticos por pisos 5/10 heredados: élite/jefe del nuevo calendario, sin pagar servicios.
12. Acumulación automática de modificadores a profundidades 12/20/28/36: reemplazar sólo en torre por modificador sectorial compatible.
13. Ranking que no expresa nodos, combate y validación: actualizar semántica y desempate.
14. Pérdida de partida al iniciar otra mediante reemplazo genérico: ofrecer la existente por modo.

No quedan obsoletos: cuatro botones, selección de dos habilidades, dos modos, selección de clase/elemento, hasta tres enemigos, númerosR1–R3, controles de objetivo, cola, audio, PV/Aguante, animaciones, estilos, enemigos y fondos existentes. Sus valores, anclajes y foco requieren adaptación, no eliminación.

## Inventario completo de superficies

Las 23 superficies, rutas y referencias se mantienen enumeradas en [02-INTERFAZ-INVENTARIO-Y-NUEVO-FLUJO.md](02-INTERFAZ-INVENTARIO-Y-NUEVO-FLUJO.md). Esta evaluación añade las siguientes extensiones a ese inventario:

24. Fila de estados de héroe y enemigos: cantidad/cap/duración; misma fuente de datos.
25. Indicador de penetración preparada: efecto futuro visible después de consumir Ruptura.
26. Predicciones de habilidades con reliquias: valores efectivos y límites compartidos con motor.
27. Detalle de stats: base frente a efectos actuales.
28. Contadores de jefes: umbral, fase y respuesta, sin una barra genérica para todas las mecánicas.
29. Duración de curas reducidas y condición de mitigación: texto concreto.
30. Anclaje de estados en tres rivales: compactación, seleccionado y ausencia de solapamientos.
31. Panel Build: seis espacios, niveles, efectos y usos; separado de HUD de combate.
32. Vistas de servicios y recompensas: una decisión legal, salida y guardado de oferta pendiente.
33. Códice, historial y récord personal: accesos desde hub y resultado, sin bloquear catálogo de Nivelado.
34. Foco/ayuda/objetivo: detener propagación, aislar atajos por fase y probar navegación táctil/teclado.

## Posiciones de enemigos y validación

Conservar formación actual de uno a tres rivales y lugares estables cuando mueren. No añadir posiciones tácticas ni cuarto enemigo. En arena.css se usan tres columnas; móvil reserva 64% para rivales y 30 cqw para HUD de héroe. Con 320 px de viewport quedan tarjetas estrechas: esto exige medir, no demuestra por sí solo un solapamiento.

Pruebas visuales:320/360/390 px, tablet, desktop, horizontal, zoom 200%, ambos estilos y movimiento reducido. Escenarios: tres rivales con tres estados cada uno; héroe con recurso 3, Sobrecarga 3, escudo y mitigación; Quemadura a máximo renovada; Ruptura consumida con penetración preparada; ritual+quiebre; armadura rota/reconstrucción; muerte de seleccionado; seis reliquias y desconexión. Comprobar que número, duración, intención y cuatro botones se leen sin tapar objetivo.

Pruebas lógicas: predicción coincide con resolución para cada reliquia y cap; resistencia altera duración mostrada; fresh no descuenta antes; mantenimiento borra icono al expirar; nuevas cargas renuevan duración sin multiplicar iconos; Expuesto no se confunde con Ruptura; Fénix gastado sigue gastado tras reanudar. No declarar completado con sólo captura o sólo test unitario.

## Arte y alcance

Cero ilustraciones obligatorias para resolver estos hallazgos. Usar iconos actuales, texto, contadores, marcos y SVG existente de Expuesto. Siluetas propias para estados o VFX exclusivos quedan como pulido opcional después de probar legibilidad. El problema principal es jerarquía y precisión de información, no falta de imágenes.


## Decisión artística posterior aprobada

La franja ampliada descrita arriba queda sustituida por capas elementales universales sobre la zona inferior y bordes del combatiente, sin tapar caras ni aumentar tarjetas. Los cinco elementos y sus14 intensidades en ambos estilos se entregan en [Estados elementales universales](../estados-elementales-universales/LEER-PRIMERO.md), con [contrato para Claude](../estados-elementales-universales/INTEGRACION-CLAUDE.md). La información exacta sigue disponible en detalle accesible. Esta decisión cambia la presentación propuesta, no las reglas del combate.
