# Implementación y pruebas para Claude Code

Especificación pendiente de ejecución. Leer junto al diseño y contrato de datos; no interpretar los números iniciales como balance probado. Respetar AGENTS.md del repositorio. No desplegar ni borrar cuentas o datos reales como parte de esta entrega.

## Primero: errores existentes

1. `TowerMode.tsx:128` llama startTower sin info.loadout, mientras el replay servidor usa el loadout guardado. Pasar el mismo snapshot y probar habilidades no predeterminadas.
2. `tower.ts:124–129` calcula lunes UTC; SQL usa lunes ART. Una sola autoridad de semana, devuelta por servidor; guardar weekKey y seed al iniciar. Nunca asignar semana de envío a una partida de semilla anterior.
3. `TowerMode.tsx:73–104` marca banked antes de completar petición y liquida al desmontar. Separar suspensión de cierre, reintentar fallos y usar confirmación servidor.
4. `services.ts:618–657` cierra run antes de registrar torre en una operación separada. Hacer cierre, puntuación y premios atómicos e idempotentes.
5. Validar el parámetro torre de la ruta; valores desconocidos deben mostrar recuperación.

Las referencias corresponden al código auditado; localizar símbolos si cambian las líneas.

## Arquitectura sin rehacer otros modos

Crear módulo de expedición de torre que reutilice resolución de combate, catálogo de habilidades, cerebros y render de arena. No añadir decisiones de tienda al motor de golpes. `floorFights.ts` es compartido: generar encuentro mediante adaptador de torre que reciba ordinal de combate, tipo forzado y roles; conservar salas y cooperativo con sus reglas actuales. La curación nueva y la retirada de modificadores acumulativos son exclusivas de torre.

`TowerRunState` debe guardar: runId, owner, mode, weekKey ART, seed, engineVersion, catalogVersion, revision, status, phase, sector, node, combatOrdinal, heroSnapshot, skillLoadout, battleState, HP, relics, fragments, pendingOffer, pendingEvent, nextFightPact, phoenixSpent, rewardLedger, score, RNG cursors y cursor de acciones aceptadas. Snapshot de Colección incluye estadísticas/equipo/habilidades disponibles; cambios posteriores de cuenta no alteran la partida. Nivelado conserva preset y selección inicial de clase/elemento.

Fases explícitas: preparation, initial_relic, route, combat, event, shop, rest, sanctuary, reward, sector_summary, suspended y ended. Guardar fase de origen al suspender. El servidor valida transiciones; no confiar en fase, precios, daño, premios ni opciones enviados por cliente.

Unión de acciones versionada: choose_route, combat_action, choose_relic, replace_relic, decline_relic, buy, choose_event, choose_rest, choose_sanctuary, set_loadout, continue, suspend y retire. Cada acción lleva actionId y expectedRevision. La elección referencia offerId y optionId generados por servidor. Los cambios de habilidades sólo se admiten en preparación o santuario y con dos IDs distintos válidos. Las acciones de eventos con recompensa usan pendingOffer persistente para no duplicar costes.

Función pura de transición/replay y validación de entradas compartidas; efectos externos sólo al confirmar transacción. RNG por semilla + sector + nodo + propósito + índice de oferta, separado de animación, clicks o abrir paneles. Un reintento no consume otra tirada. No permitir pesca de ofertas mediante refresco.

## Persistencia, puntuación y seguridad de premios

Tabla específica tower_runs, o equivalente aislado del cierre automático de runs genéricas. Índice único parcial por jugador/modo con estado activo; iniciar devuelve la existente si corresponde. Guardar versiones para reanudar con motor compatible; si no existe compatibilidad, cerrar con motivo explícito y conservar premios ya confirmados, sin reinterpretar logs viejos.

Checkpoints servidor con log verificable: no aceptar snapshot arbitrario del cliente. Enviar lotes de hasta 256 acciones y 64 KiB; confirmar último cursor y revision. Enviar guardado al alcanzar diez acciones de combate o cinco segundos desde la primera acción pendiente, lo que ocurra antes, y al resolver cada nodo. No esperar diez acciones si ya venció el plazo. pagehide es sólo intento adicional. Persistir localmente acciones sin confirmar; al reconectar, reenviar con los mismos IDs. Resolver conflictos mediante estado canónico y cola pendiente, nunca mezclando dos revisiones.

El límite actual de 8.000 acciones no basta como garantía del nuevo alcance. Proponer presupuesto total inicial de 150.000 acciones validadas: admite 350 combates a 300 acciones del jugador más decisiones. Confirmar el límite efectivo de turnos del motor y dimensionar tiempo/memoria con simulación antes de fijarlo. Los límites de lote no son límites de expedición. Si se agota un presupuesto, cierre técnico explícito y puntuación conservada; jamás truncar silenciosamente. No reejecutar 150.000 acciones en cada petición: checkpoint firmado por servidor y replay incremental.

Cada nodo resuelto confirma progreso y marca de premios en una transacción. Idempotency key por runId/nodeId/rewardType y restricciones únicas de premios semanales por player/mode/week/combatNode. Retiro sólo liquida lo pendiente, no duplica lo confirmado. Muerte no borra la mejor marca. Registrar timestamp del servidor al alcanzar el nodo para desempatar; nunca usar tiempo del dispositivo.

Congelar weekKey y deadline al inicio. Al cambiar la semana, aceptar para ranking anterior sólo progreso confirmado antes del cierre; cerrar expedición por temporada y no introducir su semilla en la nueva semana. Reloj diario 21 ART es independiente del reinicio semanal. Reintentos recuperan premios ya confirmados, no validan progreso nuevo fuera de plazo.

Economía propuesta: primeros tres sectores por semana y modo, 5 combates normales ×5 + élite 150 + jefe 300 =475 por sector, máximo 1.425 por modo. Servicios no pagan. EXP de Colección al 25% sólo para primera victoria semanal del mismo nodo de combate; repetir no paga. Conservar montos diarios/top 3, cambiar elegibilidad top 3 a jefe del nodo 10; actualizar SQL, UI y pruebas juntos. Estos son cambios de diseño, no descripción del comportamiento vigente.

## Orden de implementación

1. Corregir divergencia de loadout, semana y liquidación con regresiones.
2. Estado versionado, persistencia y reanudación sin nuevas reliquias; replay cliente/servidor idéntico.
3. Calendario de diez nodos, bifurcaciones y servicios; mismo ordinal de dificultad para las dos rutas.
4. Catálogo 18, seis espacios, nivelesI/II, economía temporal y seis eventos. Conectar efectos a eventos del motor, sin duplicar resolución de daño.
5. UI nueva y las 23 superficies del inventario; conservar controles de combate.
6. Ranking/premios, codex e historial; migración de esquema sin ejecutar borrado de cuentas. No conservar progreso antiguo no implica borrar autenticación ni colección.
7. Simulación, pruebas integrales y revisión visual. Activación mediante flag de torre; mantener otros modos sin alteración.

## Pruebas exigidas

- Determinismo: mismo snapshot, versiones, semilla y acciones produce mismo estado cliente/servidor. Abrir paneles y cambiar velocidad no cambia RNG.
- Calendario:10 nodos,7 combates,5 normales,1 élite,1 jefe;50 sectores=500 nodos y 350 combates. Servicios no activan curación de victoria ni premios de combate.
- Reliquias:18 IDs únicos; elegibilidad 6 global+1 clase+1 elemento+2 riesgo; máximo 6 espacios; duplicadoI mejora aII; II no vuelve a mejorar; reemplazar/rehusar sin bloqueo. Ofertas degradan a menos opciones si no hay suficientes IDs elegibles.
- PV: Corazón aumenta máximo sin curar; quitarlo recorta al máximo; repetir equipamiento no genera cura. Fénix se consume una vez por run, incluso tras reemplazo/mejora y reanudación. Un segundo golpe puede matar después de revivir.
- Efectos: no recursión de procs; límites de crítico, demora, Impulso y escudos; cada efecto sólo toca su componente indicado. Diferenciar multiplicadores de golpe, Quemadura, autodaño y descarga.
- Economía: fondos insuficientes, una compra por tienda, pacto sólo próximo combate, premio tras victoria, expiración tras derrota; cero pagos por servicios; límite semanal y aislamiento por modo.
- Backend: propiedad de run, actionId repetido, revisión vieja, dos pestañas, petición fuera de orden, desconexión antes/después de commit, fallo de premio, retiro repetido y cierre de semana. Ningún caso duplica dinero o cambia semana.
- Guardado: recargar en toda fase, especialmente evento pagado con oferta pendiente y recompensa de jefe; cola sin confirmar recuperable, sin compras dobles.
- Regresión: salas/cooperativo mantienen calendario, curación y modificadores previos. Ambos estilos conservan todos los FX y acceso a objetivos.
- UX: cuatro botones; foco y táctil; resolver rápido no elige compras/rutas; capturas en tamaños indicados por inventario.

Ejecutar suites existentes de tower, floorFights y servidor; añadir casos anteriores donde corresponda y pruebas PGlite para transacciones/ranking. Correr checks completos requeridos por AGENTS.md al terminar. El intento de ejecutar Vitest durante esta auditoría fue bloqueado por EPERM al crear temporales Vite en el proyecto Desktop: no constituye prueba fallida del juego ni resultado aprobado. Esta entrega no acredita tests de implementación.

## Balance y criterio de salida

Simular combinaciones por clase/elemento y decisiones, incluyendo estrategias codiciosa, conservadora y aleatoria; semillas múltiples, ambos modos y equipos extremos. Medir supervivencia, turnos, elecciones según PV, reliquias sin uso y combos dominantes. No comparar récords históricos de torre vieja como prueba del nuevo balance. Publicar resultados y parámetros usados. Las pruebas automáticas no certifican diversión: jugar con personas y comprobar que identifican una decisión relevante y comprenden su derrota antes de declarar terminado el diseño.
