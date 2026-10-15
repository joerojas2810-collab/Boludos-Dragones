# Ejecución para Claude Code

## 0. Encargo y control de alcance

Este archivo acompaña 01-ESTADO-IDEAL-Y-REGLAS.md y 02-ARTE-PARA-CHATGPT.md. El primero define reglas; el segundo producción/presentación. No implementar a partir del resumen de la conversación ni de la propuesta preliminar anterior. La aprobación del dueño de este paquete determina autorización para implementar localmente; el documento por sí solo no ejecuta ni autoriza operaciones remotas.

Antes de tocar código: leer AGENTS.md y CLAUDE.md vigentes y verificar Git/status. Las restricciones operativas del repositorio se mantienen. Las reglas de gameplay anteriores que contradigan el contrato nuevo se reemplazan SOLO cuando el dueño autorice esta versión. Informar cambios incompatibles concretos, no solicitar confirmaciones repetidas para trabajo local ya autorizado. No descartar cambios ajenos.

Producción despliega al hacer push a main. Separar implementación, pruebas locales, SQL preparado y publicación. No usar .env.local para apuntar experimentos a base real. No imprimir secretos. El dueño no requiere preservar progreso: no construir una migración costosa de saves viejos ni resetear remoto para resolver tests. Mantener identidad/PIN salvo pedido distinto.

## 1. Inspección y baseline

La ruta consultada fue /Users/josephrojas/Desktop/Nuevo Juego. Resolver ubicación actual si cambió. Verificar versiones reales: documentación consultada reporta ENGINE_VERSION24 y migraciones hasta0057, pero no asumir que siguen siendo los máximos al implementar.

Rutas verificadas:
- src/lib/game/combat.ts: rondas, cola, acciones, daño y mantenimiento.
- src/lib/game/progressEngine.ts: prototipo E2 aislado con ciclos/cuotas; no es scheduler listo del nuevo contrato.
- src/lib/game/universalSkills.ts, statuses.ts, characters.ts, weapons.ts, bossRules.ts, auto.ts.
- src/lib/game/duel.ts, duelRoom.ts, stageReplay.ts, stage.ts; scripts/*-sim.ts.
- src/lib/game/profile.ts, src/lib/profileStorage.ts, src/lib/game/heroLevel.ts.
- src/components/ActionPanel.tsx, BattleArena.tsx, fx/BattleFx.tsx, AnimSheet/HeroSprite/EnemySprite y src/lib/art/.
- src/lib/server/, src/lib/rooms/messages.ts y api.ts; validadores Zod y rutas API.
- supabase/migrations/, setup.sql, upgrade_from_*.sql, reset_progress.sql y tests/pglite/.

Tomar baseline de tests y simulación antes de cambios. Guardar versión, semilla, flags, resultados y fallos preexistentes en work/reports/ o ubicación de trabajo equivalente. No cambiar tests viejos hasta comprender qué contrato verificaban. Actualizar expectativas por cambios deliberados de diseño, conservando verificaciones de seguridad y determinismo.

## 2. Etapas y entregables

### E0 — Contratos y casos de referencia

Crear tipos de CombatClock, SkillDefinition, EffectOperation, EnemyBrain, CombatEvent, ClassMastery y Loadout. Son nombres orientativos, no obligación de duplicar modelos existentes. Separar skills de gameplay de HeroAction de arte. IDs estables, operadores registrados, datos validados, ninguna función ejecutable arbitraria recibida del cliente.

Escribir cronologías de ejemplo automatizables: velocidad igual, ratio2:1, multienemigo sin transferencia de acciones, cooldown1, duración3, fuerte antes/después de respuesta, simultáneos, muerte por tic, defensor con varios impactos. Fijar orden de eventos y empates.

Entregar mapa de impactos y reporte de contradicciones resueltas. Si falta una definición imprescindible no cubierta, formular una pregunta concreta; continuar trabajo independiente. No improvisar una nueva mecánica central.

### E1 — Motor temporal y paridad de modos

Reemplazar rondas activas por scheduler entero del contrato. Reusar cálculo de daño y catálogos existentes, quitar conversiones0,85 y temporizadores por ronda. Refactorizar bossRoundEnd/statusTick hacia eventos de turno. Garantizar avance finito y límite de combate, muertes y orden estable. Adaptar solo el repertorio mínimo necesario para probar; una ruta de compatibilidad temporal puede servir para comparar, pero no lanzar dos motores permanentes.

Unificar núcleo de PvE y duelo. Compartir efectos y scheduler, conservar reglas de coordinación de sala/duelo y turnos de30s/45s de preparación según contrato actual donde aplique. No transformar por accidente juego simultáneo de preparación o plazo real de sala en tiempo de simulación. Resolver timeout/desconexión mediante acción de fallback documentada, validada y determinista; conservar sanciones sociales vigentes salvo incompatibilidad reportada.

### E2 — Clases y selección

Implementar20 filas del catálogo, cinco recursos y perfiles de armas; sustituir ganchos universales anteriores. Barra4 acciones. Selección fuera de combate, previews, requisitos y errores claros. Guardar mastery/loadouts; reset permite partir limpio, pero no confiar en almacenamiento cliente para autorizar habilidades online.

No completar10 habilidades backlog ni crear nuevas clases. Su diseño existe para reservar espacio, no ampliar alcance. Identidad tiene que probarse con20 antes de multiplicar contenido.

### E3 — Elementos, élites y nueve jefes

Implementar consumo, duración, límites, perfiles de Aguante/Armadura y cronologías propias. Conservar tags interruptible/breakCancelable y garantizar una respuesta. Adaptar ascensiones y sus avisos. Cabezas/Devorador usan impactos adicionales limitados, no ranuras de ronda inexistentes. No reintroducir rondas ocultas para facilitar la adaptación.

### E4 — Cerebros y automatización

Implementar perfiles3 comunes y9 reglas de jefe mediante utilidad sobre información legal. Añadir trazas de scores solo en desarrollo. Persistir intención comprometida, personalidad, memoria y cursor de RNG necesario. Comprobar mismo estado/semilla => misma selección. Preparación no cambia al hover o al renderizar.

Actualizar autoPolicy: entiende costos, conservación de estado, amenaza, ruptura y supervivencia. Comparar al menos política ingenua fuerte-disponible, política contextual y controles básicos. No usar únicamente el bot antiguo para declarar balance.

### E5 — Presentación y arte

Inventariar assets y producir lista exacta de faltantes siguiendo archivo02. Conectar efectos por eventos semánticos. Recetas pueden reutilizar attack_1/2/3, pero no asignar todos los no-básicos a attack_2 sin identidad de consecuencia. Ambos estilos y reducido. Si falta arte, usar fallback legible rotulado en galería; reportar faltante y no declarar arte final completo.

Claude deja brief preciso para ChatGPT por cada recurso nuevo, incluyendo dimensiones reales. No bloquear el motor esperando un lote entero. Importar solo entregas verificadas y regenerar catálogos con scripts, sin editar archivos generated a mano.

### E6 — Datos, modos y seguridad

Bump motor/perfil y schemas de acciones/replay. Rechazar logs de versión vieja con error útil, no reinterpretarlos. Actualizar contratos de torre, duelos, salas, stageReplay y verificación servidor. Mantener seguridad existente en dungeons/salas y sus límites; medir cambios de duración para que MIN_FIGHT_MS/topes no rechacen partidas legítimas ni permitan abuso evidente.

Preparar SQL de progreso nuevo con columnas/tipos necesarios, setup y upgrade generados desde migraciones. Reset de progreso separado, verificable en PGlite/base desechable, listado de tablas afectadas y preservadas. No resetear producción en el desarrollo. Revisar RLS/RPC y accesos tras nuevo esquema.

### E7 — Calibración, QA y entrega

Calibrar parámetros dentro de rangos permitidos por documento01; no ampliar reglas sin registrar decisión. Actualizar docs vigentes y referencias anteriores: marcar reemplazadas las reglas de combate V2 que ya no apliquen. Conservar historial para explicar diferencias, evitar dos fuentes de verdad contradictorias.

Entregar resumen por requisito, archivos, comandos con exit code, resultados, ajustes numéricos, capturas reales/galería y faltantes. Separar listo local, arte pendiente, validación humana pendiente y listo para despliegue. No declarar diversión demostrada ni producción actualizada si no se ejecutó ese paso.

## 3. Pruebas y comandos existentes

package.json consultado: npm test=vitest run; npm run lint=eslint; npm run build=next build. Dependencias locales incluyen TypeScript, tsx, Vitest y PGlite. Antes de usar comandos, verificar configuración actual y no bajar versiones para conseguir verde.

Comandos de referencia:

    npx tsc --noEmit
    npx eslint src scripts
    npm test
    npm run build
    npx tsx scripts/sim-stage3.ts --quick

sim-stage3.ts soporta --runs, --seed, --classes, --elements, --weapons, --output y --workers según el código consultado. No asumir flags para otros scripts: leer sus cabeceras/parseo. Actualizar simuladores para loadouts y turnos antes de usar sus números como evidencia.

Simuladores existentes a revisar según alcance: class-balance.ts, class-synth.ts, balance.ts, stage-sim.ts, stage-tune.ts, fit-route-tune.ts, duel-sim.ts, coop-sim.ts, tower-sim.ts, trait-balance.ts y economy-sim.ts. Pruebas sin tocar economía requieren al menos comprobar que nueva duración/progresión no altera pagos por error; no ejecutar toda simulación pesada en cada edición.

PGlite: supabase/tests/pglite/ contiene .mjs (node archivo) y .mts (npx tsx archivo). run.mjs NO es un lanzador de todos los tests: tiene sus propios casos. Enumerar archivos relevantes e invocarlos individualmente o con un runner que reporte cada exit code. Consultar harness y entorno; no ejecutar SQL contra remoto por confundir una prueba local. tests/database/*.sql requieren entorno Supabase/Postgres apropiado, PGlite no reemplaza todas las garantías de RLS/Realtime/Postgres. security-smoke/rooms-smoke solo contra entorno autorizado de prueba, nunca suponiendo producción.

Durante desarrollo, pruebas del área modificada. Suite completa una vez por commit según instrucciones del repo; repetir únicamente por cambios posteriores o fallos. Registrar errores preexistentes separadamente, sin afirmar build aprobado si falló por caches. Si hace falta regenerar tipos Next, hacerlo con entorno local aislado y volver a verificar.

## 4. Matriz mínima de aceptación

| Área | Casos obligatorios |
|---|---|
| Tiempo | velocidades iguales/2:1, cambios de velocidad, empates, múltiple listo, muerto retirado, ningún turno infinito, resultado idéntico entre runtimes |
| Estados | aplicación/renovación/expiración; no tick inmediato; muerte por Quemadura; 1 consumo por uso; multihit no multiplica cargas; Viento no se autogenera; Agua no bloquea para siempre |
| Recursos | valores0/1/2/3, costo exacto, básico genera una vez, soporte no genera por daño inexistente, inválido no gasta ni consume RNG |
| Defensa | empieza al actuar, termina al próximo turno, perfecto solo frente a amenaza anunciada, recompensa única y primer impacto fuerte, escudos no multiplican cura del Devorador |
| Habilidades |20 filas, ambos espacios, todas parejas legales6 por clase, identidad sin heredar ganchos retirados, cooldown0/1, perfil de arma preservado |
| Jefes |9 reglas, umbrales cruzados por golpe grande, anunciar/cancelar/resolver, ritual no cancelado por Defender, presión reinicia sin reaplicación, Armadura no duplica Aguante |
| IA | legalidad, recurso, personalidad, memoria, compromiso, sin input privado, puntuación normalizada, reproducibilidad, varias amenazas con respuesta posible |
| Datos | clase inexistente, skillId ajeno, selección duplicada/bloqueada, modo nivelado, reset desechable, cuentas preservadas, replay viejo rechazado |
| Modos | solo, torre2 modos, sala2 modos, coop, duelo2 modos, timeout/desconexión; paridad de reglas servidor/cliente |
| Arte/UI | ambos estilos, reducido, previews fieles, eventos de Quiebre/consumo visibles sin audio, desktop1920×1080, móvil390×844/320×740, animación omitida no altera resultado |

Primera entrega tiene25 combinaciones clase-elemento y6 parejas de habilidades por clase:150 configuraciones. Contra9 jefes son1.350 celdas antes de armas, semillas, rarezas o ascensiones. Usar un screening determinista de esas celdas a poder normalizado y muestra pequeña de semillas; profundizar outliers. Muestra estratificada adicional por armas y escalones F/D/S,+0/+5. No afirmar cobertura exhaustiva de todos los equipos/rasgos.

Balance inicial orientativo para preset nivelado: agregar resultados de clase-elemento-loadout, no ocultar una clase mala promediándola con ventaja elemental. Comparar mismas semillas; medir ruido con más de un lote. Investigar brechas agregadas de clase mayores10 puntos de victoria y parejas que dominan en todos los jefes; no exigir50% a cada duelo con ventaja elemental. Umbrales son alertas iniciales, no obligación de igualar cada matchup.

Medir turnos del jugador, acciones totales, timeout, vida restante, elecciones, uso de Defender, acciones fuertes conservadas y duración real sin contar animaciones por separado. Un alto uso de una habilidad no prueba problema por sí solo: buscar dominancia en contextos distintos. Añadir fixtures donde existen dos respuestas razonables y el bot elige según objetivos distintos.

Pruebas humanas: 3–5 integrantes del grupo si están disponibles, misma pelea con dos clases y dos elementos, sin explicar fórmulas. Registrar si entienden amenaza, efecto visual y desbloqueo. Si no hay participantes, declarar pendiente; no inventar resultados ni bloquear que el código local sea revisable.

## 5. Publicación y reset (operación final separada)

Solo después de pruebas: respaldo cuando corresponda; identificar base exacta y versión desplegada; aplicar upgrade necesario; ejecutar reset de progreso acordado; verificar accesos/cuentas/RLS; desplegar código compatible; validar humo. Orden preciso depende de si la versión vieja tolera esquema nuevo: preparar ventana de mantenimiento si no. No usar reset_progress.sql existente sin inspeccionar tablas, triggers y dependencias actuales. El dueño acepta empezar progreso nuevo, no pérdida de identidades ni cambios de ambiente equivocados.

Si no se autorizó operación remota, entregar SQL y checklist listos y reportar qué acción final falta. La implementación local puede quedar completa sin afirmar que el juego público ya cambió.

## 6. Prompt para iniciar la implementación

Copiar los tres documentos al contexto de Claude Code y enviar:

“Implementá la primera entrega de este paquete de estado ideal. Apruebo sus reglas propuestas como destino de trabajo local, incluidos turnos individuales,20 habilidades, cuatro botones, progresión nueva y ambos estilos. Leé01 como contrato de reglas,02 como dirección artística y03 como plan de ejecución y pruebas. No implementes las10 habilidades del backlog. Avanzá por todas las etapas locales necesarias, actualizando contratos/tests/simulaciones y preparando los recursos faltantes para ChatGPT. No necesitás preservar progreso existente. Conservá cuentas y acceso; prepará y probá el reset en un entorno desechable. No ejecutes SQL remoto, reset real ni push/despliegue sin la confirmación operativa correspondiente. Reportá pruebas realmente ejecutadas, resultados y limitaciones; si falta arte final, dejá el fallback legible y el pedido exacto. No cambies decisiones de producto para hacer pasar una prueba.”

Este texto es para que el dueño lo envíe cuando apruebe el destino; no es una afirmación de aprobación ya recibida.
