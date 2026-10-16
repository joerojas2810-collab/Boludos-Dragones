## Cierre aprobado — 16/10/2026

Christian aprobó subir esta fase. Se integran invocación pintada con marcos por rango y diez héroes sin scroll, inspección individual, victoria/derrota de Progreso y cierre de Torre. Se conserva Pixel Art y las reglas de recompensas/guardado. Suite completa: 84 archivos, 992 pruebas correctas; ESLint dirigido y compilación de producción correctos. La primera ejecución aislada falló por archivos temporales del entorno; la ejecución fuera de aislamiento pasó. Validación visual de formatos documentada debajo. Se excluyen del commit los cambios ajenos de Review.tsx, tsconfig.json y borradores de otras fases.

Próxima fase: superficies secundarias (Torre, salas, eventos, misiones y retratos), primero auditoría y muestras locales. Luego pulido final. Esta sección prevalece sobre los estados históricos de integración y autorización de abajo.

## Marcos por categoría en invocación — 16/10/2026

Los héroes pintados usan los marcos existentes F, E, D, C, B, A y S según su rango. El marco conserva proporción 3:4 y el retrato se centra dentro de la abertura, con elemento y estrellas separados. Se mantiene la vista de diez personajes sin scroll y la inspección individual. Revisión visual en 320×568, 390×844, 844×390, 1366×768 y 2560×1440; diez cartas visibles. TypeScript y ESLint revisados. Integración local; sin commit ni push.

## Corrección de personajes e invocación vigente — 16/10/2026

Christian indicó que los personajes se veían mal y que la invocación ya entrega solo héroes. Se comprobó GachaPage: SHOW_EQUIPMENT_BANNER=false, banner inicial character. El equipo permanece en el código por compatibilidad, pero no forma parte de la invocación visible. La mezcla de armas era un error de los ejemplos de la galería; ahora sampleItems tiene un tipo de retorno exclusivo de personajes e incluye las cinco clases y afinidades. Armas y equipo se mantienen únicamente en las muestras de recompensas de mazmorra, que son un flujo diferente.

El motor actual guarda duplicados de personajes como copias y reembolsa al superar el límite; no sube estrellas automáticamente. Se quitó esa opción desactualizada del selector de muestras. No se modificaron las reglas ni los resultados del servidor.

El retrato pintado de la invocación ahora usa HeroSprite directamente en un área propia de la tarjeta, sin una segunda miniatura enmarcada con nombre repetido. Conserva rango, elemento y estrellas. El factor se resume en la vista conjunta; sus valores completos se muestran al seleccionar la carta. Esto evita que los textos reduzcan el personaje a unos pocos píxeles. La vista compacta cubre también ventanas intermedias como 660x668; apaisado vuelve a cinco columnas y dos filas. Pixel conserva ItemCard y su arte.

Validación final: diez héroes de cinco clases, cuerpos completos dentro de la zona y proporción del arte conservada, sin scroll, en 320x568, 390x844, 660x668, 768x1024, 844x390, 1366x768 y 2560x1440. Se corrigió un cruce en apaisado detectado durante la prueba. Detalle de héroe ampliado comprobado en móvil sin scroll. TypeScript y ESLint dirigidos correctos. Sin imágenes generadas ni cambios de probabilidades, cuenta, economía o backend. Sin commit ni push.

---

## Botín de invocación sin scroll — ajuste del 16/10/2026

Christian pidió ver todo el botín de invocación sin desplazamiento. Se reemplazaron las filas de altura natural por una grilla ajustada al alto de la ventana: cinco columnas y dos filas en escritorio, dos columnas y cinco filas en móvil. Las diez recompensas y Continuar quedan visibles a la vez. El tamaño del arte usa el espacio restante; los factores permanecen visibles en escritorio.

En móvil y ventanas de poca altura se usa una vista compacta (ilustración, nombre, clase/elemento y resultado con rango). Seleccionar una carta abre su detalle completo con factores y nombre extenso dentro de la misma presentación. Volver al botín y Escape regresan a la vista de las diez cartas. No se eliminaron datos ni se cambiaron recompensas. En escritorio también se puede consultar el detalle de cada carta. El diseño es exclusivo de Pintado.

Verificación visual y geométrica: 320x568, 390x844, 768x1024, 844x390, 1366x768, 1440x900 y 2560x1440, con diez cartas visibles, pie accesible y dimensiones desplazables iguales al área disponible. Detalle de nombre largo comprobado sin scroll en 320x568, 844x390 y 1366x768. TypeScript y ESLint del componente correctos. No se repitió la suite del motor porque este ajuste solo cambia presentación e inspección de los resultados.

Pruebas visuales: art_concepts/presentations/botin-sin-scroll-desktop.png, botin-sin-scroll-movil.png y botin-sin-scroll-mediciones.json. Sin commit ni push. Esta sección reemplaza la decisión anterior de lista desplazable; abajo se conserva el historial.

---

## Integración local y formatos — 16/10/2026

Christian aprobó el borrador y pidió integrarlo y revisar proporciones. PullReveal incorpora el acabado pintado sobre el fondo de invocación aprobado, cartas individuales con nombre exterior, factores, rango y resultado, y lista desplazable para diez objetos. El pie de Continuar/Saltar queda accesible sin comprimir las cartas. Se mantienen nuevo/copia/estrella/reembolso/pity, sonido, foco y Escape. Pixel conserva su presentación anterior. La reducción de movimiento elimina la espera decorativa y el destello.

ResultPresentation comparte la nueva composición entre resultados reales de Progreso y cierre real de Torre. Solo recibe presentación y children; importes, EXP, condiciones, guardado y acciones siguen en sus componentes anteriores. Progreso conserva primera limpieza, bono de alcance, subida de nivel, casos sin botín, barridos y botones condicionados por desbloqueos. Torre conserva premios de cuenta frente a recursos temporales y Nueva expedición deshabilitada hasta confirmar guardado. El fondo corresponde al tema/dificultad o al sector de la expedición.

Galería con componentes integrados del juego activados por defecto, prototipo aún comparable, selector de estilo, cinco clases, nombres largos en héroe/cartas, cero EXP/sin piezas/bono y guardado pendiente de Torre. Usa datos de ejemplo, no la cuenta real. No se inició ni se gastó una tirada de cuenta ni se completó una partida real.

Correcciones de revisión: factores que se salían de las tarjetas múltiples; retrato recortado en invocación individual con nombre extenso; placa del nombre que tapaba al héroe. Las filas ahora crecen con el contenido; el desplazamiento queda en la lista; el nombre se coloca debajo de la ilustración. Se comprobó el retorno del foco y el ciclo Tab entre lista y Continuar, además de Escape.

Formatos comprobados: 320x568, 360x800, 390x844, 768x1024, 844x390 apaisado, 1366x768, 1440x900 y 2560x1440 según cada caso. No se observaron desbordamientos horizontales, cruces de nombre/ilustración ni contenido saliendo de tarjetas en los casos finales. Las cinco clases se probaron con nombres largos; cero EXP/sin piezas y cierre de Torre pendiente también. No equivale a certificar todas las resoluciones o una sesión en cada dispositivo físico.

Validación: TypeScript y ESLint dirigidos sin errores; 117 pruebas de gacha, bankLevel y expedition aprobadas. No se ejecutó suite completa ni build de publicación porque no se pidió commit/push. Capturas y mediciones en art_concepts/presentations/. El bloqueo anterior de automatización no se repitió: esta vez se pudo inspeccionar la galería.

Pendiente: revisión de la integración local por Christian y autorización de publicación. Sin commit ni push. Antes de publicar, suite completa y compilación, además de conservar los cambios ajenos de la rama.

---

# Fase PRESENTACIONES Y RECOMPENSAS

## Borrador local — 16/10/2026

Christian autorizó comenzar la fase. Primera entrega en `/galeria-px/actualizacion-recompensas`, disponible únicamente en desarrollo. Sin integración en el juego, commit ni push. Reutiliza el arte pintado aprobado y conserva la interfaz actual.

### Auditoría de los flujos vigentes

- `PullReveal.tsx` ya revela resultados de uno o diez objetos y distingue nuevo, copia, estrella y reembolso. Permite saltar y continuar; tiene recuperación de foco y portal. La galería puede abrir ese componente original con objetos de ejemplo, sin hacer tiradas.
- `ProgressMode.tsx` separa EXP, niveles ganados, monedas, cofre de primera limpieza, piezas y materiales. La derrota conserva la EXP que informe el resultado y no entrega monedas ni botín. El siguiente nivel, ascensión o dificultad dependen de sus condiciones reales.
- La pantalla de Torre tiene un resultado diferente y deberá recibir una revisión propia durante la integración; no asumir que comparte los premios de Progreso.
- La presentación pintada de jefes ya usa el diseño nuevo. Se conserva.

### Propuesta

Cuatro vistas: Invocación, Victoria, Derrota y Botín y materiales. Escenarios aprobados de invocación, pantano y forja; cartas reales y poses de victoria/derrota del Caballero. Diferencia visual entre rangos, nuevos, copias, estrellas y reembolsos. Selector de una o diez invocaciones, rango y tipo de primer resultado. Repetición de secuencia, salto y alternativa sin animación; movimiento reducido respetado. Botones de ejemplo muestran un aviso sin actuar sobre la partida.

Los datos, cantidades y resultados son ilustrativos. Los escenarios no simulan probabilidades. El cofre de primera limpieza se muestra separado de las monedas normales. No se promete siguiente nivel sin desbloqueo: su botón es una muestra visual para el caso válido.

### Verificación y continuación

TypeScript y ESLint dirigidos, recursos existentes comprobados en disco. La automatización del navegador rechazó adquirir la pestaña local por política de seguridad; no se intentó otro método para eludir el bloqueo. La inspección visual interactiva y las medidas de desbordamiento en el navegador siguen pendientes. CSS incluye adaptaciones para móvil y columnas de estadísticas únicas bajo 420 px, pero no se declara verificado visualmente.

Siguiente paso: Christian revisa el borrador en la galería. Ajustar dirección antes de extraer componentes de presentación e integrarlos en los flujos reales. Al integrar, conservar probabilidades, resultados del servidor, guardado, pérdidas, condiciones de desbloqueo, recompensas, Pixel Art, foco y atajos de teclado existentes.
