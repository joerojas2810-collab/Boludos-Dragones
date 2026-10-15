> Historial: describe el motor anterior por rondas; vigente: docs/ideal/

# Diseño funcional: combate por progreso, armas, clases y elementos

**Destinatario:** diseñador/a de lógica de combate  
**Estado:** propuesta de diseño para revisión; no autoriza por sí sola cambios en producción.  
**Objetivo:** que los encuentros exijan leer al rival y escoger respuestas, sin convertir el combate en una lista larga de excepciones ni depender principalmente de inflar vida y daño.

## 1. Pilares y límites

1. El jugador debe poder anticipar qué amenaza viene y entender por qué una acción es buena ahora.
2. La velocidad cambia cuándo puede actuar el combatiente, no solo un porcentaje abstracto de daño.
3. El arma determina el ataque básico y respeta las armas permitidas por clase.
4. Las cinco habilidades tácticas están disponibles durante el combate para todas las clases. No se equipan dos ni se desbloquean por clase.
5. Cada habilidad conserva una función común. Clase y elemento modifican su expresión mediante reglas acotadas, no cinco sistemas separados por combinación.
6. Defender sigue siendo una respuesta explícita a un golpe anunciado y conserva la guardia perfecta.
7. Los números de daño, postura, umbrales y tiempos son variables de balance; no se fijan en este documento.

Se excluyen expresamente los sistemas de equipo con efectos (idea 5 del texto compartido) y bifurcaciones/eventos de expedición (idea 6).

## 2. Estructura del combate

### 2.1 Línea de progreso y velocidad

Reemplazar la lectura de “ronda global” por una línea de progreso de combate. Cada combatiente avanza según su velocidad. Cuando llena su medidor, queda listo y puede realizar una acción. El juego resuelve las acciones enemigas que ocurran mientras el héroe aún no está listo; el jugador las ve en la línea y no puede actuar fuera de su ventana.

- Mostrar el avance del héroe y de los enemigos, quién será el siguiente en actuar y las intenciones que ya fueron anunciadas.
- Si varios combatientes llegan a estar listos a la vez, resolver el empate con la regla de iniciativa existente o una regla determinista equivalente; no introducir tiradas nuevas sin medirlas.
- Una acción consume el avance requerido y el combatiente vuelve a progresar. El coste temporal de las habilidades puede diferir, pero debe ser visible y fácil de comparar.
- Conservar inicialmente el límite vigente de hasta tres acciones del combatiente más rápido como salvaguarda de balance, hasta comprobar que el modelo de progreso no lo hace redundante.
- El básico rápido debe recuperar antes que una habilidad lenta, pero no debe generar acciones gratuitas ni llenar de estados a varios objetivos automáticamente.
- No avanzar el combate en tiempo real mientras la aplicación está pausada esperando una decisión del jugador.

**Definición de términos:**
- **Acción / activación:** un combatiente llena el progreso y resuelve una acción.
- **Carga / Canalización:** intención enemiga anunciada que tarda en resolverse y admite una respuesta antes del impacto.
- **Ciclo de progreso:** intervalo descriptivo para interfaz y telemetría; evitar que reglas de duración dependan de una “ronda” ambigua.

**Duraciones recomendadas:** enfriamientos bajan cuando vuelve a activarse quien posee la habilidad; Quemadura hace tic cuando se activa el afectado; los estados propios bajan al terminar las activaciones de su portador. La interfaz debe mostrar “faltan N activaciones” y no solo “N turnos”. Validar esta convención con simulaciones, porque el progreso acelerado hace que el orden de tic sea parte del balance.

### 2.2 Ventana de defensa

Defender consume la activación del jugador. Un golpe fuerte anunciado puede ser defendido para activar Guardia perfecta. Las Cargas y Canalizaciones necesitan un tiempo de aviso suficiente para que una activación del jugador pueda ocurrir antes de su resolución; si el héroe no llega a estar listo, la intención se resuelve y el jugador observa el evento.

- Defensa normal: reduce daño según la regla vigente.
- Guardia perfecta: al defender mientras una intención fuerte elegible sigue pendiente, reduce ese golpe un 75 % (factor 0,25) y activa el efecto propio de la clase.
- La guardia perfecta no da un multiplicador general de daño al siguiente ataque.
- Una Canalización interrumpible se detiene con la habilidad Interrumpir; no se cancela por defender, salvo que la habilidad o la regla del jefe lo diga expresamente.
- Evitar una ventana de reacción adicional fuera de la línea de progreso en la primera versión: haría difícil entender si Defender consume una acción.

El momento exacto en que se anuncia una intención y cuándo se considera “pendiente” debe quedar visible y determinista.

## 3. Ataque básico y armas

El básico siempre está disponible, es rápido, hace daño moderado y tiene alta fiabilidad. El perfil lo determina el arma equipada; no es otra habilidad elegible. Cada clase puede equipar solo dos tipos de arma:

| Clase | Armas permitidas |
|---|---|
| Caballero | Espada, Hacha |
| Mago | Bastón, Varita |
| Pícaro | Daga, Arco |
| Clérigo | Maza, Libro |
| Berserker | Mandoble, Martillo |

Cada perfil de básico puede enfatizar daño a vida, precisión, daño a Postura, crítico o rapidez de recuperación. Repartir un presupuesto comparable entre perfiles para que un arma no sea estrictamente mejor. No crear una regla exclusiva difícil de leer por cada arma.

El código actual tiene un ataque básico definido por clase y un especial asociado al arma. Este diseño cambia esa distribución: el arma pasa a definir el básico. Decidir si los especiales actuales se convierten en perfiles del básico o se retiran; no mantenerlos como séptimo botón por accidente.

## 4. Las cinco habilidades universales

Las cinco opciones están disponibles a todas las clases durante la pelea, además del básico y Defender. Sus propósitos deben seguir siendo distinguibles:

| Habilidad | Función base | Regla de límites |
|---|---|---|
| **Golpe** | Daño fuerte a un objetivo. | Coste de progreso o enfriamiento mayor que el básico; no debe superar en todo a las otras opciones. |
| **Barrido** | Daño moderado a todos los enemigos vivos. | Daño por objetivo inferior al Golpe; aplicar como máximo una interacción elemental por objetivo y uso. |
| **Quebrar Postura** | Daño moderado a vida y daño extra a Postura. | Solo cancela una Carga si reduce la Postura a cero y esa Carga admite Quiebre. |
| **Interrumpir** | Daño bajo; detiene una Canalización anunciada como interrumpible. | No cancela Cargas ni ataques ya resueltos; jefes deben señalizar inmunidad o resistencia. |
| **Explotar estado** | Consume un estado elemental disponible y produce el efecto inmediato de ese elemento. | Consume solo el estado indicado (del enemigo o del héroe); enseñar coste y efecto antes de confirmar. |

No permitir que Quebrar Postura e Interrumpir sean dos botones equivalentes: el primero requiere agotar un medidor; el segundo responde a una intención específica. Si una intención no puede ser interrumpida, debe indicarlo en su icono/texto.

No hay recurso de maná. Los enfriamientos o estados visibles son suficientes para regular el uso; evitar sumar otra barra global en esta fase.

## 5. Postura y Quiebre

Postura es una defensa secundaria separada de la vida, reservada inicialmente para élites y jefes. Los enemigos comunes siguen usando solo vida para que el sistema no cargue cada combate de medidores.

- Ataques y habilidades pueden priorizar daño a vida o Postura. Mostrar esos valores como iconos/etiquetas comparables.
- Al llegar Postura a cero ocurre **Quiebre**: cancela una Carga compatible y deja al enemigo brevemente expuesto o retrasa su siguiente activación.
- El enemigo recupera Postura después del estado de Quiebre y obtiene una resistencia temporal al próximo Quiebre, evitando cadenas de cancelación.
- No usar el estado elemental Tierra **Ruptura** para nombrar este evento; mantener **Ruptura** para el estado y **Quiebre** para postura agotada.
- Los jefes pueden cambiar su postura o vulnerabilidades por fase, siempre con aviso explícito.

Probar primero con un élite y un jefe; no añadir Postura a todos los enemigos hasta que el flujo se entienda y mejore la decisión del jugador.

## 6. Intenciones enemigas

Sustituir gradualmente el binario “normal/fuerte” por intenciones con preguntas tácticas distintas. No activar todos los patrones a la vez; comenzar con pocos enemigos piloto.

| Intención | Aviso y consecuencia | Respuesta principal |
|---|---|---|
| **Golpe** | Daño directo; puede ser normal o fuerte. | Defender, curarse después o aceptar el daño para atacar. |
| **Carga** | Prepara un golpe fuerte con propiedad legible (por ejemplo, ignora parte de DEF). | Defender si no se logra Quiebre; Quebrar Postura puede cancelarla. |
| **Preparación** | El enemigo ganará un beneficio visible si termina su activación. | Interrumpir si es Canalización o aprovechar el intervalo para preparar/dañar. |
| **Represalia** | El siguiente ataque directo activa una respuesta enemiga. | Usar Explotar estado u otra interacción que no cuente como golpe directo, o aceptar el intercambio. |
| **Canalización** | Un efecto empeora o se ejecuta tras un contador anunciado. | Interrumpir si admite control; si no, priorizar otra mitigación/objetivo. |
| **Ataque múltiple** | Varios impactos moderados, no un único impacto grande. | Defender reduce la secuencia; comparar contra una habilidad ofensiva o curación. |

La descripción debe explicar efecto, cuenta atrás y contrajuego: “Canaliza durante una activación; Interrumpir la cancela” o “Carga un golpe que ignora 30 % de DEF; Quiebre la cancela”. Evitar nombres sin consecuencia legible.

## 7. Elementos: aplicación y consumo

Conservar los cinco elementos y sus afinidades: Agua, Fuego, Viento, Tierra y Rayo. La afinidad modifica daño según la tabla existente; el estado es una capa táctica distinta. No hacer que tener ventaja elemental aplique automáticamente más estados.

| Elemento | Estado / lugar | Aplicación y propuesta de Explotar estado |
|---|---|---|
| **Agua** | Escarcha en el enemigo; ralentiza. | Consumir Escarcha para infligir daño a Postura o estorbar una preparación. Elegir una sola variante en balance. |
| **Fuego** | Quemadura en el enemigo; daño gradual con tope. | Consumirla para adelantar el daño pendiente, quitando sus acumulaciones. |
| **Viento** | Impulso en el héroe; acelera progreso. | Consumirlo para aumentar progreso hasta una acción disponible o potenciar daño a Postura; no conceder acciones ilimitadas. |
| **Tierra** | Ruptura en el enemigo; reduce DEF. | Consumirla para que un golpe atraviese defensa o inflija daño de Postura; evitar duplicar íntegramente el beneficio de DEF reducido. |
| **Rayo** | Sobrecarga en el héroe/contador propio; carga por impactos. | Consumirla para una descarga de daño o presión de Postura. No hacer que Interrumpir y Sobrecarga cancelen indistintamente todo. |

Las reglas actuales ponen Escarcha, Quemadura y Ruptura en el enemigo, e Impulso y Sobrecarga en el héroe. Por tanto, “Explotar estado del objetivo” no describe correctamente todos los casos: interfaz y lógica deben identificar el portador. Rayo hoy es un contador de impactos y no un StatusEffect común; unificarlo solo si simplifica persistencia y explicación.

**Seguridad de acumulación:** una habilidad aplica estado como máximo una vez por uso a cada objetivo, sin multiplicar acumulaciones por número de golpes visuales. Barrido puede afectar a varios enemigos, pero cada uno recibe una única aplicación. El básico puede preparar estados, pero poner límite por activación/ciclo. Necesario por el motor de velocidad, ataques múltiples y límite de acciones existente.

Comenzar el balance de consumo con dos estados y extenderlo después. Recomendación para prueba: Agua/Escarcha y Viento/Impulso, porque uno controla al rival y el otro afecta la propia línea de progreso; esto prueba tanto control como riesgo de aceleración. Quemadura, Ruptura y Sobrecarga pueden quedar con sus efectos actuales hasta la siguiente etapa.

## 8. Clases y adaptación de las habilidades

Todas las clases comparten las cinco funciones base, pero no se deben escribir 25 habilidades independientes. La lógica debe tener un efecto base y modificadores limitados por clase (uno o dos ganchos por habilidad como máximo). Mantener también la afinidad elemental independiente de la clase.

Roles que conserva el catálogo actual:

| Clase | Identidad ya existente | Adaptación propuesta a las cinco opciones |
|---|---|---|
| **Caballero** | Alta vida/DEF, Muralla reduce daño; usa Espada/Hacha; guardia perfecta refleja. | Guardia perfecta genera Resolución; una habilidad de daño/Quiebre puede gastarla en contraataque o presión de Postura. Si se adopta Resolución, reemplaza el reflejo adicional para no acumular dos premios defensivos. |
| **Mago** | Foco arcano: especialista en ventaja elemental, crítico y resistencia leve; Bastón/Varita. | Enfatiza aplicación/consumo elemental o prepara una secuencia; no duplica la bonificación elemental con acumulaciones ilimitadas. |
| **Pícaro** | Alta velocidad y crítico; Daga/Arco. | Aprovecha objetivos expuestos/intenciones para precisión o progreso; Impulso no debe crear un bucle velocidad → acciones → más Impulso → más velocidad. |
| **Clérigo** | Regeneración y opciones de cura; Maza/Libro. | Acciones protectoras pueden generar Fe para elegir entre sostén y daño, si se aprueba ese recurso. Evitar que Defender y una habilidad den ambas guardia perfecta sin coste adicional. |
| **Berserker** | Furia escala al perder vida; Mandoble/Martillo. | Recibir daño puede alimentar Furia; el jugador decide gastarla o arriesgarse. Tope por activación para que los ataques múltiples no carguen la barra de golpe. |

Los recursos Resolución, secuencia del Mago, marcas del Pícaro, Fe del Clérigo y Furia activa son propuestas de diseño derivadas del texto; requieren aprobación y prototipo. La pasiva actual del Berserker ya escala por vida perdida, así que una barra de Furia adicional puede ser redundante.

### Caballero: ejemplo de lectura

Un Caballero con Hacha ve “Carga: golpe que ignora parte de DEF”. Puede intentar Quebrar Postura si está cerca del Quiebre; si no llega, prepara Defender para la ventana anunciada. Si hace Guardia perfecta, gana la recompensa propia del Caballero. Si lleva Agua, puede gastar Escarcha en Postura; si lleva Viento, puede usar Impulso para avanzar su progreso, con un límite visible. Espada/Hacha cambian su básico, no sus habilidades universales.

## 9. Clases, armas, rareza y estrellas

- **Clase** define estadísticas, pasiva y modificadores de las acciones comunes.
- **Arma** define el básico y continúa limitada a dos tipos por clase. No desbloquea un séptimo comando.
- **Elemento** define afinidad y estado; puede combinarse con cualquier clase permitida.
- **Rasgo** sigue siendo una excepción pequeña que complementa una build, no requisito para operar habilidades.
- **Rango F–S** mantiene presupuesto de poder; **estrellas 0–5** desarrollan estadísticas/progresión. No conceder habilidades distintas por rareza: la complejidad táctica no debe depender de conseguir rango alto.
- Los héroes de rango bajo deben conservar la misma interfaz y reglas de combate; el progreso da potencia, no acceso a la gramática básica.

## 10. Interfaz necesaria

- Línea de progreso con marcadores de héroes y enemigos, lectura del siguiente evento y animación breve cuando se resuelve.
- Iconos de intención con nombre, daño/efecto esperado, tiempo hasta resolución y etiqueta “interrumpible”, “cancelable por Quiebre” o “inevitable”.
- Botones siempre consistentes: básico de arma, cinco habilidades, Defender. Indicar progreso/coste, estado consumible, enfriamiento y objetivo válido.
- Al seleccionar Explotar estado, previsualizar el estado que consumirá, acumulaciones que quedan y efecto inmediato.
- Mostrar medidor de Postura solo en enemigos que lo usan; anunciar el resultado del Quiebre antes de llegar a cero.
- Registro de combate explica causa y efecto en una línea: “Quiebre cancela Carga”, “Interrupción detiene Canalización”, “Impulso consumido: +X progreso”.

## 11. Plan de implementación y validación

No ejecutar como una única reescritura. Mantener la rama/proyecto actual y separar cambios lógicos.

1. **Prototipo de línea de progreso sin cambiar kits:** validar que se entienda cuándo el jugador puede actuar y que los enemigos avancen durante la espera. Fijar la semántica de cooldowns, estados y desempates.
2. **Básico por arma:** empezar con Espada/Hacha del Caballero. Comparar daño esperado, frecuencia, Postura y claridad frente al básico actual; extender a las demás armas después.
3. **Postura e intenciones piloto:** un élite con Carga y un jefe con Canalización. Confirmar que Quiebre e Interrumpir tienen contrajuegos distintos y que Defender conserva valor.
4. **Cinco habilidades comunes:** conectar los cinco efectos base a la nueva línea. Las cinco están visibles/permitidas a todas las clases; verificar precisión de interfaz y uso de habilidades.
5. **Interacción clase × habilidad:** aplicar modificadores simples por clase. Comenzar con Caballero (Resolución si se aprueba) y Pícaro para probar la interacción entre velocidad y estados.
6. **Interacción elemental:** probar dos consumos iniciales —recomendación: Escarcha e Impulso—; después habilitar Quemadura, Ruptura y Sobrecarga. Añadir caps y tests para multi-hit, Barrido, jefe y acciones extra.
7. **Simulación y pruebas:** tests deterministas de progreso, orden, duración, interrupciones, Quiebre, consumos, límites por ronda y vida persistente. Simulaciones comparan clases, cinco elementos y armas permitidas. No corregir dificultad elevando solo HP/ATQ.
8. **Despliegue gradual:** mantener telemetría de acciones elegidas, intentos interrumpidos, guardias perfectas, Quiebres, duración y victorias/derrotas por combinación.

Criterios de éxito: el jugador puede explicar la próxima amenaza, hay más de una respuesta razonable a cada intención, cada elemento cambia la decisión al menos en algunos encuentros, el Pícaro de Viento no domina por acciones, Defender no es la respuesta automática a todos los enemigos fuertes, y la duración no aumenta sin añadir decisiones.

## 12. Decisiones pendientes antes del balance final

1. ¿La línea de progreso es una barra de llenado por ticks simulados o se conserva el acumulador actual y solo cambia su visualización? Recomendación: separar visualización y simulación en el primer prototipo; no rehacer simultáneamente ambos.
2. ¿Qué coste temporal/enfriamiento tienen las cinco habilidades? Hay que expresarlo en progreso o activaciones propias, no “turnos” ambiguos.
3. ¿Defender consume una activación siempre? Recomendación: sí; la guardia perfecta se gana si el jugador estaba listo y la intención elegible seguía pendiente.
4. ¿Se adopta Resolución para Caballero y qué reemplaza exactamente: reflejo, parte de Muralla o ambos? Recomendación: sustituir el reflejo directo por Resolución para evitar doble recompensa.
5. ¿Qué aplicación elemental hace el básico del arma? Recomendación inicial: como máximo una acumulación por uso; validar contra el número de acciones por velocidad.
6. ¿Qué dos estados se implementan primero y cuál es la duración de Explotar estado?
7. ¿Cuáles de las intenciones actuales de jefe se renombran/adaptan a Carga, Preparación, Represalia, Canalización o Ataque múltiple? No reescribir las nueve mecánicas de golpe.

