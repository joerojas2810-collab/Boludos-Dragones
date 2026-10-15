# Torre — expedición interminable con progresión de partida

Propuesta v1.0 · 15 de octubre de 2026. Investigación basada en el código actual, no implementación ni balance validado. Complementa el estado ideal del juego y aprovecha su combate de cuatro botones.

## 1. Diagnóstico: qué reconstruimos

La torre YA es endless semanal. Tiene semilla común, dos modos/rankings, una vida, PV arrastrados, curación entre peleas, grupos de 1–3 rivales, jefe cada 5 pisos y jefe nombrado cada 10. Cliente y servidor reproducen acciones sobre el mismo motor. No tiene elecciones de ruta, reliquias activas, tienda ni build temporal. Su variedad viene de encuentros y escala, no de decisiones entre encuentros.

El objetivo es convertir «otra pelea más difícil» en «mi expedición tomó esta forma por mis decisiones». Conservar combate, clase, elemento y arte; agregar profundidad entre combates. No introducir otro sistema de maná, más botones ofensivos, reclutamiento de grupo o 25 variantes independientes por clase-elemento.

Decisiones propuestas aquí todavía no se han probado con jugadores. Dar este contrato a Claude para ejecutar requiere adoptar el diseño; el archivo no afirma esa aprobación. Las correcciones de errores actuales se distinguen de cambios que dependen del nuevo modo.

## 2. Referencias investigadas y qué tomamos

- Mega Crit presenta Slay the Spire alrededor de construcción de combinaciones, enemigos y reliquias: interesa elegir piezas que transforman la partida, no copiar cartas o interfaz. [Fuente del estudio](https://www.megacrit.com/press-kits/slay-the-spire/).
- Supergiant describe Hades como partidas que producen combinaciones y desafíos distintos, con conocimiento que se conserva entre intentos. Tomamos variación intrapartida y aprendizaje, sin convertir muerte en pérdida de colección. [FAQ oficial](https://www.supergiantgames.com/blog/hades-faq/).
- El rediseño de talentos y alternativas de Hades es una referencia de elecciones por estilo; sus parches también excluyen combinaciones problemáticas de modificadores enemigos. Tomamos alternativas y listas de incompatibilidad, no una acumulación sin límite. [Notas oficiales](https://www.supergiantgames.com/blog/hades-the-nighty-night-update-patch-notes/).

Estos juegos no demuestran que 18 reliquias o 10 nodos sea la cantidad correcta para nuestro grupo. Las cantidades siguientes son hipótesis de alcance basadas en nuestros cinco personajes, cinco elementos, nueve jefes y recursos existentes.

## 3. Bucle propuesto

Preparar héroe y dos habilidades → obtener reliquia inicial → elegir entre dos caminos → resolver encuentro → recibir recompensa/decisión → desarrollar seis espacios de reliquia → preparar el jefe → superar sector → continuar, suspender o retirarse.

La muerte termina la build temporal; no borra héroes ni equipo de cuenta. Retirarse termina voluntariamente, conserva puntuación y premios persistentes ya verificados. Suspender conserva la expedición y no la liquida.

Una decisión entre encuentros muestra como máximo dos rutas; una recompensa muestra como máximo tres alternativas. No pedir elecciones después de cada golpe ni agregar cartas al combate.

## 4. Diez nodos por sector, siete combates

«Piso» pasa a significar nodo superado, no sinónimo de pelea. La UI muestra ambos datos: Sector 2 · piso 14 · combate 10. Todos recorren la misma estructura cuantitativa por sector para no premiar una ruta con menos combates sin explicarlo.

| Posición | Tipo | Elección |
|---|---|---|
|1|Combate|Dos composiciones; riesgo y premio conocidos|
|2|Combate|Dos composiciones; victoria ofrece reliquia|
|3|Servicio|Evento o tienda, con información suficiente antes de entrar|
|4|Combate|Dos composiciones|
|5|Élite|Dos variantes compatibles; victoria ofrece reliquia|
|6|Combate|Dos composiciones|
|7|Servicio|Descanso o evento|
|8|Combate|Dos composiciones; victoria ofrece reliquia|
|9|Santuario|Descanso, mejorar reliquia o abastecer; preparación gratuita de habilidades|
|10|Jefe|Jefe del sector anunciado desde su inicio; victoria ofrece reliquia|

Elegir una ruta compromete ese nodo; no regresar a comprar después de ver el resultado de otra opción. Resolver un nodo incrementa profundidad una sola vez; entrar a tienda/evento no basta para contarlo. Un servicio sin compra termina sólo al pulsar Continuar. Se permiten guardar y consultar build antes de confirmar.

No son diez ilustraciones de sector: los nueve temas actuales pueden rotar. El ciclo de jefes conserva los nueve existentes, determinado por semilla y sector, evitando repetición inmediata. Nunca tres jefes especiales simultáneos. Cada jefe conserva su pregunta mecánica.

## 5. Build de expedición

Primera versión:18 reliquias definidas, máximo 6 equipadas,2 niveles por reliquia, sin mochila de reserva. Una reliquia mejora reglas existentes; no sustituye clase/elemento ni añade acciones activas. Catálogo y parámetros iniciales en CONTRATO-DATOS.json.

Se ofrece 1 de 3 al iniciar y después de nodos 2/5/8/10. Ofertas pertinentes al héroe:6 globales,1 de su clase,1 de su elemento y 2 de riesgo. Incluir al menos una global y una de clase/elemento cuando sean elegibles; máximo una de riesgo. Las opciones son IDs únicos, sin duplicar una pieza en la misma oferta. Una que ya esté a nivelI puede ofrecer mejora aII; nivelII no se ofrece como mejora adicional.

Con seis espacios ocupados: comparar reemplazo o rechazar por 10 fragmentos temporales. Cambiar una pieza sólo al adquirir otra; no rotar gratis reliquias a mitad de pelea para explotar pasivas. Mejorar aII no añade un segundo ejemplar. Nada de tier infinito, multiplicadores recursivos o disparos que se activan entre sí sin fin.

Toda reliquia declara duración «Esta expedición», efecto, condición, nivel, tope y fuente artística. Sus procs se activan por acciones lógicas/eventos, no por frames. Los efectos de un proc no vuelven a generar el mismo proc; no suman recursos, cargas o críticos salvo que su regla lo diga explícitamente.

### Catálogo inicial: efectos de niveles I / II

| Tipo | Pieza / arte existente | Efecto inicial |
|---|---|---|
|Global|Corazón del oso / bear_heart|+8/12% PV máximos; no cura al adquirir o mejorar|
|Global|Coraza / bronze_armor|−4/6% daño de golpes enemigos|
|Global|Lente / hunter_lens|+4/6 puntos de crítico; respetar topes de motor|
|Global|Piedra / whetstone|+8/12% daño del básico|
|Global|Botas / winged_boots|Empieza cada combate con 8/12% de progreso, una vez|
|Global|Bolsa / bottomless_purse|+5/8 fragmentos al ganar combate, no monedas de cuenta|
|Caballero|Escudo rúnico / runic_shield|Empieza combate con 1/2 Resolución; no se suma por impacto|
|Mago|Libro / old_book|Inscribir hace+10/15% daño; sin más cargas que su regla|
|Pícaro|Guante / duelist_glove|Primer golpe propio por turno a Expuesto hace+12/18%|
|Clérigo|Cáliz / thirsty_chalice|Primera cura activa de cada combate añade escudo 2/3% PV; respeta tope|
|Berserker|Anillo / blood_ring|Reduce 25/40% el autodaño de Embestida; sigue no letal|
|Fuego|Colmillo / dragon_fang|+10/15% daño de Quemadura; no supera su cap|
|Agua|Musgo / moss_amulet|Consumir Escarcha retrasa+2/4 puntos de progreso; cap total 25% y protección antidemora|
|Viento|Reloj / broken_clock|Consumir Impulso adelanta+3/5 puntos; cap total 40%; no acción gratuita|
|Tierra|Placas / plate_armor|Ataque que aprovecha penetración preparada hace+6/10%; no aumenta cargas|
|Rayo|Sello sabio / scholar_seal|Componente de descarga de Sobrecarga hace+8/12%; no todos los ataques|
|Riesgo|Filo vorpal / vorpal_blade|Habilidades dañinas+12/18%; golpes enemigos recibidos+6/9%|
|Riesgo|Corazón fénix / phoenix_heart|Una recuperación por expedición al morir,15/25% PV; no se recarga al cambiar/mejorar|

Las cifras son valores de partida. Cada pieza tiene que ser pertinente en alguna situación: si un tope vuelve inútil al Cáliz o al Colmillo, ajustar el efecto antes de ampliar catálogo. La ficha debe indicar cuando un cap limita su beneficio.

Topes iniciales de bonificaciones temporales: PVmáx+30%; daño básico+30%; daño habilidades+30%; crítico+12 puntos; reducción adicional de golpes 18%. Aplicar sobre snapshot inicial, sin volver a multiplicar acumulativamente el resultado anterior. Respetar caps de crítico/DEF/velocidad/curación/escudo y garantía de respuesta del motor. El Fénix es una excepción visible a «una vida», no una vida oculta ni un atributo permanente.

Los PV máximos aumentados no elevan los PV actuales; al retirarlos, limitar PV actuales al máximo nuevo. No restaurar salud mediante secuencias de poner/quitar. Un Fénix consumido mantiene su marca run-wide aunque ya no esté equipado.

## 6. Economía dentro de la partida

Moneda temporal: «Fragmentos de torre», con etiqueta «Sólo esta expedición». Empieza con 20; normal+10,élite+20,jefe+30; máximo 999. No se comercia ni se convierte a monedas de cuenta. Un combate puede premiar fragmentos y una elección de reliquia, pero ambas cosas se muestran por separado.

Tienda: tres bienes visibles, máximo una compra por visita; reliquiaI 40, mejora aII 60, curación 20% PV 20. Omitir mejora si no hay una pieza elegible; reemplazar por otra reliquia pertinente. Compra y reemplazo de pieza forman una sola transición atómica. No rerolls en primera versión. Saldo insuficiente se explica; se puede salir sin comprar.

Descanso: elegir curar 25% PV o ganar 25 fragmentos. Santuario del nodo 9: elegir curar 25%, mejorar una piezaI aII o ganar 30 fragmentos. Se pueden cambiar las dos habilidades aprendidas gratuitamente en santuario, antes de confirmar su beneficio; nunca clase, elemento, héroe o equipo de cuenta. Preview de jefe siempre disponible para preparar esas habilidades.

La curación automática de la torre baja de la heredada de dungeon a 2% de PVmáx después de combate ganado, con bono de rasgo aplicable y tope total 6%. Este cambio es exclusivo de torre; no tocar winHeal compartido para salas/dungeons. Recalibrar frente a Clérigo y sustain del equipo.

## 7. Seis eventos iniciales con consecuencias explícitas

Los seis reutilizan arte existente y tienen dos respuestas; mostrar costos ciertos antes de confirmar. No trampas sin información ni dados que roban un objeto permanente.

| Evento | Opción A | Opción B |
|---|---|---|
|Fuente|Curar 15% PV|Recibir 20 fragmentos|
|Altar|Pagar 10% PVmáx, no letal, por una oferta de reliquia|Irse sin costo|
|Bolsa|Recibir 25 fragmentos|Gastar 20 por una oferta de reliquia|
|Libro|Mejorar una piezaI pagando 30 fragmentos|Recibir 10 fragmentos|
|Estatua|Próximo combate: enemigos+10% daño; si gana obtiene 30 fragmentos extra|Continuar sin pacto|
|Mendigo|Pagar 15 fragmentos y curar 20% PV|Continuar sin costo|

Ofertas adicionales del Altar/Bolsa siguen el mismo catálogo de reliquias y tope de espacios. Una opción imposible se deshabilita con razón; siempre hay salida legal. Si no hay mejora elegible en Libro, A se reemplaza por compra de reliquiaI por 30, mostrada antes de elegir. Pacto sólo modifica el próximo combate y luego expira, gane o pierda. Nadie revive fuera de combate por el Fénix.

## 8. Enemigos y escalabilidad

Reutilizar generación por familia/elemento, cerebros, Aguante y los nueve jefes. Un sector anuncia su jefe y un modificador ambiental como máximo, derivado de semilla. Retirar de torre la acumulación automática permanente de todos los modificadores desde pisos 12/20/28/36; no cambiarla en salas.

Listas de incompatibilidad: dobleAtaque no se combina con impactos extra de Hidra/Devorador; no añadir escudo genérico a Armadura del Coloso; regeneración más curas de Hidra/Devorador requiere presupuesto especial y queda fuera de primera versión; cambio elemental debe avisarse y no modificar el elemento entre elegir y resolver un ataque. Ningún modificador elimina la oportunidad de respuesta a una amenaza fuerte.

La profundidad de dificultad se calcula por número de combates, no por servicios visitados. Reutilizar curva 1,065 como punto de partida, no como balance aprobado; separar forcedKind/role y namedBoss del número de combate para respetar élite 5/jefe 10 del sector. Cada sector introduce composiciones/leyes nuevas, no un nuevo subsistema que deba memorizarse.

El contenido crece mediante catálogos, no un if por combinación. El estado de torre transforma un snapshot de héroe y una FightSpec; no modifica el Character permanente desde React. No alterar floorFights compartido de modo que cambien salas/coop sin intención.

Endless no significa procesos sin límite. El código actual acepta 500 pisos y 8000 acciones. Primera versión: límite operativo explícito de 500 nodos, cierra como «límite de temporada alcanzado», no «moriste» ni «victoria final de una torre infinita». Aumentarlo requiere pruebas de almacenamiento/precisión. Exponerlo en reglas; no ocultarlo al jugador. La dificultad y la build tienen techos: no prometer crecimiento infinito del personaje.

## 9. Roguelite y metagame sin castigar al que juega menos

Se pierde al cerrar: reliquias, niveles temporales, fragmentos, pactos y selección de ruta. Se conserva: héroes/equipo de cuenta, conocimiento/códice, logros, récords y premios verificados.

Primera versión del metagame: códice de 18 reliquias y 6 eventos con descubrimiento, historial de builds y causa de derrota, insignias por sector/jefe/variedad de clases y comparación con récord personal. Reutilizar los perfiles existentes. No añadir una segunda granja de moneda para comprar+ATQ permanente en nivelado.

Nivelado ofrece el mismo catálogo mecánico desde el principio: descubrir una pieza no la vuelve exclusiva de veteranos. Colección conserva su poder real inicial, tomado como snapshot al empezar; sus avances de cuenta durante una partida no alteran ese snapshot. La EXP ganada se liquida al cerrar, no sube stats a mitad de torre.

Meta posterior opcional: desafíos semanales y apariencias/títulos, o doctrinas iniciales como alternativas equivalentes, con catálogo común en nivelado. Fuera de primera versión: árbol de stats, empezar siempre en pisos avanzados en ranking, compra de reliquias con monedas reales/de cuenta, mascotas con bonificaciones, equipos de varios héroes.

## 10. Semilla semanal, ranking y pagos

Conservar Nivelado/Colección separados. Misma semilla genera estructura, adversarios y condiciones por modo/semana/version; ofertas filtradas por clase/elemento siguen siendo deterministas, no idénticas entre héroes distintos. Separar streams por nodeId y purpose: encuentros, ofertas, eventos y combate. Una curación o un hover no avanza el RNG del siguiente piso.

Score: mayor nodo completamente resuelto; desempate menor número total de turnos de combates ganados hasta ese punto; luego timestamp servidor del hito, luego playerId. Mostrar ambos datos. Todos tienen 7 combates por sector; los servicios no dan turnos gratis de combate ni premios persistentes. No usar duración de animación, red o tiempo real de pensar para desempatar.

Marcas se actualizan después de cada nodo verificado, indicando «validado hasta pisoN». Derrota/retiro no borra esos hitos. Una sola expedición activa por jugador y modo; no múltiples pestañas editando una misma run. Intentos ilimitados con límites de ritmo actuales.

Fijar weekKey al crear usando Buenos Aires, versión de motor/catálogo y fecha de cierre. Al terminar semana, puntúa lo aceptado hasta el plazo; no trasladar una semilla vieja al ranking nuevo. Un intento viejo se cierra por temporada y puede verse en historial; práctica reanudable de semanas viejas queda fuera de v1. UTC no sustituye la fecha local de juego.

Propuesta de pago, separada del dinero temporal: mantener 5 monedas por combate normal,150 por élite de nodo 5,300 por jefe 10; no pagar servicios; sólo primera limpieza de cada nodo de combate por semana/modo y primeros 3 sectores. Máximo 475 por sector,1425 por modo/semana, antes de premios diarios/semanales. Mantener cuantías actuales de rey diario y top 3, pero elegibilidad top 3 requiere superar primer jefe/nodo 10. Revalidar el presupuesto con economía, no asumir que es gratis añadir más pisos pagados.

EXP de colección conserva factor 25% como referencia, sólo por primeras victorias verificadas de esos mismos combates semanales; repetición no genera EXP ilimitada. Nivelado no entrega EXP a un héroe de cuenta inexistente. Ninguna reliquia multiplica premios persistentes. Este recorte respecto a repeticiones actuales es cambio de economía explícito y requiere medición/adopción antes de publicar.

## 11. Guardar, salir y retirarse

Guardar y salir no cierra ni cobra dos veces. Autosave tras cada transición entre nodos y durante combate en lotes pequeños. Indicador: Guardando/Guardado/Pendiente de conexión/Error. Nunca prometer guardado remoto confirmado sólo por escribir localStorage.

Cerrar pestaña guarda lo posible; no llama a bank/settle como conducta normal. Cliente conserva acciones no confirmadas por runId/revision, servidor devuelve cursor y snapshot validado. Reanudar reconstruye exactos HP, reliquias, ofertas, moneda, combate y RNG. Un rechazo informa qué cursor conserva sin inventar una derrota.

Retirarse requiere confirmación y cierre atómico/idempotente. Cambiar de modo conserva expedición activa en el otro; no usar la función genérica que reemplaza cualquier run abierta para borrar silenciosamente una torre.

## 12. Qué lo hace interesante y cómo comprobarlo

Tres escalas de decisión: en combate, cómo responder a la intención; entre nodos, qué riesgo aceptar; durante la run, qué pieza conservar/cambiar. La clase determina el estilo y el elemento su interacción; las reliquias enfatizan o compensan sin borrar esas identidades.

Situaciones a probar: elegir descanso con PV bajos o evento cuando conviene asumir riesgo; conservar botas frente a más daño para adelantar una ventana; elegir un reemplazo sin perder sinergia; preparar las habilidades contra el jefe anunciado. Si siempre se elige la misma ruta/reliquia, revisar costos/ofertas, no agregar veinte opciones más.

Métricas: supervivencia por sector, turnos/combate, elecciones por contexto y PV, piezas nunca elegidas, combinaciones dominantes, diferencias clase-elemento, abandono durante menús, errores de guardado y deseo de volver a intentar. No confundir más clics con más diversión ni declarar éxito por pasar tests.
