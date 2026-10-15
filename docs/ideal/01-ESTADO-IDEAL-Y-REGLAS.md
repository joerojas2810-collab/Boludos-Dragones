# Boludos & Dragones — Estado ideal y contrato de diseño

Versión 1.0 propuesta · 15 de octubre de 2026

> Revisión implementada posterior: [Habilidades motor27](../HABILIDADES_V27.md). Sus valores y el kit inicial del Clérigo sustituyen los de esta propuesta histórica; `skills.ts` es el catálogo ejecutable.

## 0. Lectura, autoridad y alcance

Este documento convierte la conversación en un destino de producto y una especificación inicial de implementación. No declara que las propuestas ya estén probadas ni aprobadas individualmente. El dueño solicitó un documento para que Claude Code pueda ejecutar el cambio; todavía no se modificó el proyecto.

Confirmado por el dueño: juego entendible, con progresión, desafío y diversión; diferenciar clases y elementos; evaluar un regreso a cuatro botones sin repetir la rutina anterior; mejorar consecuencias visuales e inteligencia enemiga; conservar pintado y pixel con las mismas señales; el progreso actual de jugadores no necesita conservarse.

Decisiones propuestas para cerrar el sistema: turnos individuales sin rondas de combate; cuatro botones; cuatro habilidades seleccionables por clase en la primera versión y seis como expansión; recursos de clase pequeños; estados elementales compartidos; IA de utilidad con intenciones comprometidas. Todos los números marcados como iniciales son configuración de balance, no resultados medidos.

Al entregar este paquete a Claude para implementarlo, el dueño debe indicar que aprueba este contrato de destino. Esa aprobación habilita las etapas locales completas, sin pedir permiso por cada ajuste reversible. Producción, push que despliega, SQL remoto y borrados reales conservan las confirmaciones operativas del repositorio. Esta tarea documental no ejecuta ninguno.

No conservar progreso simplifica datos y compatibilidad; no autoriza borrar identidades/PIN, modificar economía o eliminar archivos históricos por iniciativa propia. El reset previsto borra progreso de juego, conservando cuentas y acceso, salvo instrucción expresa distinta.

## 1. Problema y experiencia buscada

Antes: fuerte cuando está disponible, Defender ante el golpe anunciado y básico mientras vuelve la fuerte. Ahora: más botones y excepciones, pero clases parecidas y progreso principalmente numérico. En presentación, distintas habilidades comparten movimiento e impacto elemental.

Objetivo: entender una amenaza, elegir entre dos respuestas razonables, reconocer la clase por sus decisiones y sus movimientos, desbloquear alternativas que cambien la forma de jugar y encontrarse enemigos con conductas legibles.

El juego sigue siendo web, para amigos, funcional en solitario y en salas de 2–7 participantes, con entradas/salidas y juego nivelado que no castigue a quien juega menos. Profundidad no significa convertir cada turno en una consulta de documentación.

No se cambia en este contrato: cinco clases, cinco elementos, ciclo elemental, rarezas F–S, equipo/forja, rutas y economía como sistemas. Sus coeficientes pueden recalibrarse por el nuevo combate, documentando el motivo. No crear clases nuevas, reacciones entre pares de elementos, consumibles, maná, árbol de talentos o IA generativa.

## 2. Cuatro acciones visibles y progresión

Barra: Básico | habilidad equipada A | habilidad equipada B | Defender. Dos habilidades distintas, de la clase, aprendidas. Reordenar espacios no cambia reglas. Cambios fuera de pelea, antes de iniciar una expedición o entre encuentros en las pantallas de preparación habilitadas; nunca durante la resolución de una pelea. Revalidar la selección en el servidor.

Primera entrega: 4 habilidades por clase = 20 seleccionables; 2 equipadas; 5 perfiles de básico y 1 acción Defender con beneficios de clase. Expansión: 6 por clase = 30 seleccionables. No contar 5 variantes de color como 5 habilidades nuevas. Las 10 de expansión son backlog, no requisito para cerrar primera entrega.

Desbloqueos iniciales propuestos por dominio de clase de la cuenta: habilidades 1/2 al obtener el primer héroe de esa clase; habilidad 3 al alcanzar nivel 5 con cualquier héroe de esa clase; habilidad 4 a nivel 12. Dominio = máximo nivel alcanzado por esa clase, monotónico. Vale para todos sus elementos, rarezas y copias. Ninguna habilidad de la primera entrega depende de estrellas: el tope básico 20 ya existe. Las habilidades 5/6 no tienen nivel fijado hasta medir el ritmo del primer conjunto. Nivel y equipo siguen aumentando poder, desbloqueos agregan alternativas.

Modo nivelado: los cuatro candidatos de primera entrega disponibles para todos desde la preparación; no usar el nivel 1 del preset para bloquearlos. Colección: dominio de clase y héroe propio. Guardar selección por héroe o clave estable y selección de nivelado separada; no mezclar ambos perfiles. Valores predeterminados = habilidades 1/2.

Al desbloquear: mostrar nombre, efecto, una demostración breve y comparación; no equipar automáticamente reemplazando una elección. No vender habilidades ni vincularlas a rareza.

## 3. Contrato temporal: turnos individuales

Se elimina la ronda como unidad del motor de combate. La ronda de sala de 10 pisos/25 minutos es otro concepto y se conserva. El juego se pausa al esperar al humano; tiempo real y duración de animaciones nunca cambian resultados.

### 3.1 Planificador determinista inicial

Progreso entero por combatiente, umbral 10.000. Velocidad efectiva por tick = round(100 × speedOf(combatiente)), limitada inicialmente a [750,1500]. speedOf incorpora los modificadores actuales antes del límite. Estos límites equivalen a una proporción máxima 2:1 y son parámetros globales de balance, no relativos a la lista enemiga. Progreso inicial 0; sin tirada aleatoria de iniciativa. Desempates por mayor velocidad efectiva y luego orden estable definido al iniciar combate; en duelo alternar asignación de desempate mediante semilla compartida y medir ventaja de lado.

Avanzar ticks virtuales mínimos necesarios para que alguien alcance el umbral; todos los vivos acumulan su velocidad efectiva por tick; consumir exactamente un umbral al actuar y conservar sobrante. Si hay varios listos, resolverlos por el orden estable sin volver a avanzar tiempo. Efectos de velocidad actualizan ganancias futuras, sin recalcular retroactivamente progreso ganado.

La cola muestra las próximas 6 oportunidades estimadas. La intención ya comprometida es cierta; posiciones futuras que dependan de acciones/efectos aún no elegidos son proyección, no promesa. Actualizar la previsualización al seleccionar habilidad. Ningún enemigo lento puede conceder acciones extra al jugador contra otros rivales.

Eliminar carry/actionCounts/cuotas por ronda del motor activo. progressEngine.ts es antecedente aislado con ciclos/cuotas: no conectarlo sin quitar esos supuestos. No mantener el factor 0,85 ni conversiones heredadas. No conservar el tope de 3 acciones por ronda dentro de un sistema sin rondas; los límites nuevos se expresan por efecto y por turno.

### 3.2 Orden de un turno

1. Verificar vivo y victoria pendiente. Retirar defensa cuya vigencia termina al empezar este turno.
2. Aplicar daño periódico y mantenimiento de inicio ya existentes. Si muere, omitir acción y resolver fin de combate.
3. Si es jugador, esperar una acción válida; rechazar selección inválida sin gastar recurso, turno ni azar. Si es enemigo, resolver su intención comprometida o elegir una acción de su perfil.
4. Validar objetivos y costos; pagar una sola vez; resolver impactos; efectos y consumo; recursos; muertes; emitir eventos ordenados.
5. Decrementar cooldowns que ya existían al inicio del turno y no fueron creados/refrescados por esta acción. Decrementar duraciones del portador que ya existían al inicio; no acortar un estado recién aplicado.
6. Aplicar recuperación pasiva al cierre si sigue vivo; avanzar contadores personales de jefe/rasgos; establecer próxima intención cuando corresponda; resolver victoria; entregar control al planificador.

Cada efecto debe declarar fase. No resolver mantenimiento leyendo mensajes del log. Documentar si un efecto existente cambia de fase al migrarlo al contrato.

Cooldown C = C turnos propios completos posteriores al uso sin poder reutilizarlo. Ejemplo: usar C=1 en turno 1, bloqueado en turno 2, disponible en turno 3. Mostrarlo con ese significado. C=0 no tiene bloqueo, pero siguen existiendo costos y requisitos. Las tablas de habilidades usan esta convención.

Estado recibido con duración 3 produce hasta tres mantenimientos del portador posteriores a su aplicación; si se aplica durante su turno, ese mismo cierre no consume duración. Quemadura actúa al inicio de esos turnos. Escarcha/Ruptura afectan desde su aplicación hasta expirar. Escudo dura hasta gastarse o fin de combate; no se acumula indefinidamente.

Límite de seguridad: 300 turnos resueltos sin victoria => empate/timeout, sin premiar derrota como victoria. Interfaz avisa a 250. Enrage inicial tras el turno personal 30 de cada jefe: +5% ATQ acumulativo por turno posterior, configurable. Eliminar toda dependencia de ronda 40 y reportar efecto en duración.

### 3.3 Defender y amenazas

Defender reduce daño entrante 50% hasta el inicio del próximo turno del defensor. Si había una amenaza fuerte enemiga anunciada y pendiente al elegirlo, concede guardia perfecta: 75% de reducción para el primer impacto fuerte compatible, reemplazando 50%, sin sumarse. Consumir la mejora tras ese impacto; el resto conserva 50%. Tope una recompensa de clase por elección de Defender, incluso si hay varios enemigos.

Amenazas fuertes/rituales tienen dos pasos: preparación visible y resolución comprometida en siguiente turno propio. No rerollear intención al descubrir la elección del jugador. Garantizar al menos una acción válida del objetivo humano entre anuncio y resolución. Si el enemigo ya está listo sin que hubiera respuesta, retener su resolución sin sumar progreso adicional hasta completar esa respuesta, luego devolverlo al conjunto de listos. No hacer actuar a todos los demás infinitamente mientras se retiene: seleccionar la siguiente oportunidad del humano y congelar ese avance en espera de input. Mostrar el orden real y probar prioridades con varios anunciantes.

Interrumpir solo cancela acciones con etiqueta interruptible. Quiebre solo cancela acciones con breakCancelable. Defender no cancela rituales por regla general. Reina Marchita: se retira la excepción de guardia perfecta que anula el ritual; mitigación y preparación constituyen la alternativa. Este es un cambio deliberado sobre el código actual.

Si murió el objetivo de una intención de un enemigo, usar retarget definido en el catálogo; no cambiar de habilidad. En 1v1 la muerte finaliza la pelea.

## 4. Reglas compartidas y presupuesto inicial

Conservar fórmula actual de daño, ATQ del arma, defensa y ciclo elemental como punto de partida. Daño de habilidad = multiplicador P sobre el daño básico del mismo actor/objetivo, sin volver a aplicar elemento, crítico, defensa o ATQ del arma dos veces. Ataques de área resuelven por objetivo y aplican como máximo una carga por objetivo y uso. Impactos visuales no multiplican efectos.

Básico: siempre disponible, no falla como el perfil actual del arma; conserva su identidad de arma, genera 1 recurso de clase y una carga elemental cuando causa daño. No genera recurso por objetivo adicional. Ataques de habilidades generan solamente lo indicado en su fila. Sin daño por fallo no hay aplicación elemental; efectos de soporte puros no aplican estado.

Habilidades nuevas: precisión 100% de base; no reintroducir fallos aleatorios como costo oculto. Críticos, resistencias y rasgos existentes siguen sus fórmulas con topes revisados. Diferenciar crítico de apertura determinista del Pícaro.

Recurso de clase R: entero 0–3; visible con tres marcas, sin decaimiento, inicial 0 en cada pelea, no persiste entre combates. Caballero=Resolución, Mago=Foco, Pícaro=Apertura, Clérigo=Bendición, Berserker=Furia. Cada básico añade 1. La habilidad generadora añade el indicado y nunca más de una vez por uso. No generar al recibir cada golpe: evitar multiplicación por enemigos/multihit.

Primera entrega reemplaza ganchos dispersos de las universales; no superponerlos sobre las habilidades nuevas. Mantener pasivas de estadísticas como configuración inicial excepto donde se indica. Resolución anterior de un punto se reemplaza por R; riposte y bonos temporales se mapean a eventos explícitos y no sobreviven como multiplicadores ocultos.

Guardia perfecta añade 1 R a todas las clases. Además: Caballero mantiene su reducción pasiva; Mago no recibe el antiguo ×2 siguiente golpe; Pícaro no recibe el antiguo +50 puntos de crítico; Clérigo limpia un estado negativo, sin cura adicional automática; Berserker no recibe el antiguo descuento de cooldown. La recompensa común evita apilar cuatro sistemas de contraataque; su respuesta visual sigue siendo propia. Los valores de pasivas persistentes se centralizan y se miden; ninguna habilidad nueva hereda curas genéricas por acertar del Clérigo.

Curaciones activas: máximo 6% de vida máxima por turno propio, incluida suma de habilidad/robo de vida activado por esa acción; pasiva inicial Clérigo 0,5% al final de su turno, separada y visible. Escudo activo: máximo 10% de vida máxima acumulado. Reducciones de daño multiplican factores y conservan los topes existentes salvo la guardia explícita. Para cooperación, costos y topes se calculan sobre el receptor; una misma fuente no puede renovar infinito fuera de turno.

## 5. Catálogo ejecutable de primera entrega

IDs son sugeridos estables en inglés; nombres en español. P=daño relativo al básico; A=daño a Aguante como fracción del daño efectivo a vida, inicial común 0,25. C=cooldown según §3.2. Consume elemento significa ejecutar §6 después del impacto normal sin generar carga en ese uso. Todos los costos se pagan antes de impacto. Los objetivos deben estar vivos. Fila sin consumo puede aplicar una carga elemental por impacto efectivo. Si consume estado de enemigo, seleccionarlo en ese objetivo; Impulso/Sobrecarga se consumen del actor.

| Clase / ID / desbloqueo | Nombre y resolución inicial | R / C |
|---|---|---|
| Caballero knight_advance / inicial | Avance: P0,85 a uno, A0,25, genera 1 R | costo0 / C0 |
| Caballero knight_breaker / inicial | Rompeguardia: P1,35 a uno, A1,25; si provoca Quiebre cancela amenaza compatible; consume elemento | costo2 / C0 |
| Caballero knight_bastion / nivel5 | Bastión: escudo 8% vida máx.; consume R sin atacar ni consumir elemento | costo2 / C1 |
| Caballero knight_sweep / nivel12 | Corte amplio: P0,65 por enemigo vivo; A0,25; consume elemento por objetivo negativo, una sola vez en estados propios | costo2 / C1 |
| Mago mage_inscribe / inicial | Inscribir: P0,70 a uno, aplica una carga elemental adicional (máximo total2 por uso), genera1 R | costo0 / C0 |
| Mago mage_detonate / inicial | Detonar: P1,0 a uno; consume elemento, mejora su magnitud25% cuando el efecto admite magnitud | costo2 / C0 |
| Mago mage_barrier / nivel5 | Barrera: escudo8% vida máx.; preserva cargas elementales | costo2 / C1 |
| Mago mage_seal / nivel12 | Sello: P0,50 a uno y cancela amenaza interruptible comprometida; no cancela otras | costo1 / C1 |
| Pícaro rogue_feint / inicial | Finta: P0,65 a uno, genera2 R en vez de1; no genera más por crítico | costo0 / C0 |
| Pícaro rogue_finish / inicial | Remate: P1,45 a uno; P1,75 si está Expuesto; consume elemento | costo2 / C0 |
| Pícaro rogue_step / nivel5 | Paso evasivo: próximo impacto recibido hace40% menos daño hasta próximo turno; no es esquive ni elimina efectos ambientales | costo1 / C1 |
| Pícaro rogue_sabotage / nivel12 | Sabotaje: P0,50 y cancela amenaza interruptible | costo1 / C1 |
| Clérigo cleric_judgment / inicial | Juicio: P0,85 a uno, genera1 R | costo0 / C0 |
| Clérigo cleric_consecrate / inicial | Consagrar: P1,30 a uno; consume elemento; no cura automáticamente | costo2 / C0 |
| Clérigo cleric_restore / nivel5 | Restaurar: cura6% vida máxima del receptor (uno mismo en solo, aliado válido en coop) | costo2 / C1 |
| Clérigo cleric_cleanse / nivel12 | Purificar: retira el primer estado negativo según orden estable de aplicación; escudo3%; no elimina Plaga ambiental ni fase de jefe | costo1 / C1 |
| Berserker berserker_charge / inicial | Embestida: P1,0 a uno, genera1 R; autodaño2% vida máx. no letal, no activa robo de vida/otros procs | costo0 / C0 |
| Berserker berserker_release / inicial | Descarga: P1,55 a uno; consume elemento; no añade otro bono de umbral propio aparte de la pasiva de clase | costo2 / C0 |
| Berserker berserker_recover / nivel5 | Sed de sangre: P0,65 a uno y cura4% propia si causó daño efectivo; no aplica consumo elemental | costo2 / C1 |
| Berserker berserker_shatter / nivel12 | Rompemuro: P1,0 a uno, A1,50; consume elemento; cancela solo al causar Quiebre compatible | costo2 / C1 |

Es obligatorio probar que los generadores no vuelven al básico inútil en todas las situaciones. Los perfiles de arma deben conservar al menos una ventaja contextual. Si una fila domina estrictamente, ajustar P o generación dentro de etapa de balance y registrar antes/después; no añadir castigos o recursos nuevos para arreglarla sin revisar el contrato.

Expansión reservada (sin implementación en primera entrega): Caballero Contraataque/Golpe de escudo; Mago Expansión/Concentración; Pícaro Perforar/Abanico; Clérigo Amparo/Censura; Berserker Torbellino/Desafío. No prometer sus números ni niveles todavía.

## 6. Cinco elementos compartidos

Se conserva ciclo Agua→Fuego→Viento→Tierra→Rayo→Agua y multiplicadores existentes. Efectos en activaciones del portador; máximos inicialmente3 cargas salvo Quemadura2, conservando su dato actual. Duración3 turnos, renovar al aplicar. Inscribir respeta el máximo. Todo básico o habilidad dañina no consumidora aplica estado según su perfil. No aplicar por cada cuadro visual.

| Elemento | Mantener | Consumir con habilidad etiquetada |
|---|---|---|
| Fuego | Quemadura: daño por carga20% del daño del impacto aplicador, máximo total6% vida máx. del afectado por tic | adelantar1,5 tics actuales (máximo6% vida máx.), retirar estado; el daño adelantado no es otro ataque ni genera recurso/carga |
| Agua | Escarcha: −10% velocidad por carga antes del límite global | retirar estado y restar al objetivo5/10/15% del umbral de progreso según cargas, mínimo0; no cancela intención, máximo una demora elemental hasta que el afectado complete su turno |
| Viento | Impulso propio: +8% velocidad por carga antes del límite global | retirar y sumar10/20/30% del umbral al progreso del actor después de pagar el umbral del turno; no da una acción gratuita directa ni puede generar otro Impulso por ese consumo |
| Tierra | Ruptura: −8% DEF por carga | retirar; siguiente ataque propio ignora8/16/24% DEF, expira al finalizar siguiente turno propio si no se usó; no se aplica retroactivamente al golpe consumidor |
| Rayo | Sobrecarga propia:3 cargas, al llegar al máximo agrega5% al daño de ataques mientras la retiene | a3 cargas, descarga daño adicional equivalente a0,60 básicos al objetivo y deja carga0; con1/2 cargas no consume ni añade daño extra; no genera carga por el golpe consumidor |

Multiplicador del Mago al consumir: ×1,25 para daño de Fuego/Rayo, demora de Agua, avance de Viento y penetración de Tierra; conservar límites globales y garantía de respuesta. No aumentar número de objetivos ni crear turnos adicionales. Aplicar consumo una vez por estado del actor; área puede consumir estados negativos por objetivo y cada consumo respeta sus caps.

Selecciones sin consumidor son legales: conservan beneficios persistentes, no tienen detonación. La preparación debe explicar esta renuncia. No crear un quinto botón ni hacer que un básico cambie inesperadamente de función al llegar a3.

## 7. Aguante, amenazas y jefes

Aguante inicial30% vida máx. en élites/jefes como base existente; los comunes no tienen. Al agotarse: Expuesto DEF−15% hasta completar próximo turno propio, recuperar Aguante y resistencia al nuevo Quiebre durante2 turnos propios. Duración y recuperación deben emitir eventos explícitos.

Coloso de Armadura: omitir Aguante genérico para evitar barras duplicadas. Su escudo propio y ventana Roto son su defensa secundaria; ataques de romper usan un multiplicador configurable de daño a ese escudo equivalente al presupuesto anti-Aguante, sin aplicar daño doble a vida. Al romper, Roto durante3 turnos propios, recuperación de armadura6 turnos después del evento de ruptura; probar que recuperación nunca acorta Roto.

| Jefe | Regla personal y respuesta inicial |
|---|---|
| Moscas | Plaga al final de cada turno del jefe,1,5% vida máxima del jugador inicial; no es estado limpiable. Carrera de daño frente a sostén, no purga obligatoria |
| Ceniza | Presión+1 al terminar su turno, máx5; +6% daño por nivel. Guardia perfecta contra su fuerte reinicia0 después del golpe. No sumarla de nuevo en ese mismo cierre: marcar reinicio |
| Vigía | Recuerda2 últimas habilidades semánticas; próxima repetición consecutiva hace75% daño. Mostrar habilidad aprendida antes de elegir. Básico y Defender son IDs propios; no castigar dos habilidades distintas porque usan attack_2 |
| Coloso | Armadura y Roto según arriba; anuncia reconstrucción un turno propio antes de ejecutarla |
| Trueno | +10% velocidad cada2 turnos propios, máx4 cargas, sujeto al límite global de planificador. Mostrar si el límite impide acelerar más |
| Hidra | Al cruzar75/50/25% vida, cura10% una vez por umbral y gana una cabeza, resolver cada umbral cruzado una sola vez. Cabezas aumentan impactos de una acción múltiple en su próximo turno, no generan ranuras de ronda. Cada impacto adicional inicialmente35% del básico, máximo3 adicionales; estados/recurso una sola aplicación por uso. Las cabezas no son objetivos independientes |
| Reina | Cada3 turnos propios prepara ritual interruptible; resolución en el siguiente. Éxito: curas×0,5 y1 Ruptura,2 turnos del afectado. Interrumpir cancela; Defender no. Se puede recuperar antes, proteger o aceptar efecto: no inmunidad obligatoria |
| Sin Rostro | Alterna2 turnos propios ofensiva (+30% daño,−20% defensa relativa) y2 defensiva (−30% daño,+30% defensa relativa), preservando STANCES como configuración. Anunciar cambio antes de que afecte la próxima acción |
| Devorador | Cura10% del daño efectivo a vida causado, no del absorbido por escudo. Bajo30% vida, su siguiente ataque añade impacto de35% básico, sin turno gratis ni generación adicional de estados. Mostrar fase antes de respuesta |

Ascensiones+0…+5 intensifican parámetros existentes por función pura; adaptar semántica a turnos propios, no copiar porcentajes de victoria del motor viejo como requisito de equivalencia. Si una variante hace inevitable una derrota contra un conjunto legal razonable, revisar reglas, no ocultar el problema con más stats.

Cualquier carga cancelable debe explicar requisito: agotar Aguante o romper escudo compatible, no cualquier golpe de la categoría. Cada amenaza obligatoria debe admitir al menos una alternativa accesible con Básico/Defender o costo recuperable; no exigir dos habilidades que el jugador todavía no puede aprender. Permitir preview del jefe y elección antes de entrar.

## 8. Autonomía enemiga sin trampa

IA local determinista de utilidad, no LLM/API. Cada perfil contiene acciones legales, personalidad, pesos y restricciones. Consulta solo snapshot público anterior a la elección humana y memoria de hasta3 acciones resueltas. No consulta input pendiente, RNG futuro, resultado simulado del crítico ni información privada del rival.

Comunes: agresor, protector y ritualista; cada tipo tiene de2 a3 acciones iniciales, no inventar un catálogo nuevo por monstruo. Élites pueden combinar personalidad con regla. Jefes conservan su mecánica y tienen de3 a4 acciones candidatas acordes. Introducir protección de aliados solo con evento y efecto explícitos, no transferencia secreta de daño.

Puntuación inicial normalizada [0,100]: valor de daño esperado relativo a vida del objetivo + valor de supervivencia propia + valor de proteger aliado prioritario + valor de objetivo del jefe − costo de oportunidad − penalización por repetición. Definir pesos en catálogo; todas las contribuciones y condiciones deben ser inspeccionables en modo desarrollo. La escala concreta se calibra; no comparar daño bruto con porcentajes sin normalizar.

Seleccionar entre candidatas a no más de10 puntos de la mejor mediante RNG con semilla; si solo una es razonable, elegirla. Nunca sortear antes de filtrar ilegalidad. No gastar azar al renderizar ni al consultar preview. Sin pesos dinámicos basados en dinero, tiempo jugado o identidad real del usuario.

Intención elegida se compromete. Memoria modifica elecciones futuras, no la ya anunciada. Coordinación: máximo un preparador fuerte por grupo cuando anunciar varios dejaría una amenaza inevitable; el segundo elige una acción legal alternativa. Aumentar complejidad por conducta y composición, no por lectura omnisciente ni negar ventanas de respuesta.

En duelos humanos no aplicar selección enemiga al rival; usar el mismo motor, tiempos, costos y efectos. Autoplay tiene su propia política con la misma información legal y nunca bonificaciones ocultas. No mantener valores divergentes de habilidad entre PvE/PvP salvo ajustes explícitos medidos.

## 9. Presentación, datos y fin de combate

Eventos estructurados con secuencia, actor, objetivo, skillId, turno, valores y resultado. Mínimo: turnStarted, actionCommitted, skillResolved, hit, healed, shieldChanged, classResourceChanged, statusApplied, statusConsumed, statusExpired, progressChanged, guardTriggered, staggerDamaged, staggerBroken, telegraphStarted, telegraphCancelled, bossPhaseChanged, combatEnded. No confundir animación con reglas; eventos no son instrucciones ejecutables.

La UI muestra4 botones, recurso de clase, estado elemental, próxima amenaza con efecto/contrajuego y cola6. Estimaciones muestran daño y consecuencias, no toda la fórmula. Si la amenaza no es interrumpible, decirlo. Mostrar diferencias por forma e icono además de color; movimiento reducido conserva todas las señales de juego.

Validar por servidor skillId conocido, clase, catálogo de modo, desbloqueo, selección, objetivo, recurso y versión del motor. No confiar en etiquetas de efectos recibidas del cliente. Replays registran acción + objetivo + selección/catálogo + versión + semilla; mismos inputs => mismos resultados Node/navegador. Torre/duelos conservan verificación autoritativa; no ampliar sin plan el modelo de seguridad actual de dungeons/salas.

Progreso nuevo: incrementar versiones de perfil/motor según el repositorio; preparar reset de progreso separado de identidades. No es requisito adaptar saves o replays viejos: rechazarlos explícitamente y empezar pelea nueva. Detectar partidas activas viejas y pedir reinicio, sin convertir logs a medias. No mezclar versiones en salas.

## 10. Qué falta validar y qué puede ajustar Claude

Claude puede ajustar coeficientes de daño, costos R entre1–3, cooldown entre0–2, pesos IA y topes numéricos en la fase de calibración, registrando evidencia. No puede cambiar cuatro botones, agregar maná, eliminar clases/elementos, convertir habilidades en pagos, introducir turnos extra ilimitados o resetear producción para resolver una prueba.

El catálogo es una hipótesis ejecutable, no diseño demostrado. R genera por básico: riesgo de secuencia generador/generador/consumidor. Probar alternativas que reaccionen a amenazas y efectos; si no aparecen, no declarar éxito solo porque gana la misma cantidad. La defensa y las cuatro candidatas pueden dejar parejas demasiado dominantes; medirlo por jefe y por estado inicial.

No afirmar diversión por tests verdes. Validación humana mínima con el grupo: identificar qué hace una habilidad mirando su efecto; explicar la amenaza; escoger dos acciones razonables en situaciones preparadas; reconocer diferencias entre dos clases y dos elementos; describir qué posibilidad aportó un desbloqueo. Registrar respuestas y duración, sin atribuir comentarios inventados a jugadores.
