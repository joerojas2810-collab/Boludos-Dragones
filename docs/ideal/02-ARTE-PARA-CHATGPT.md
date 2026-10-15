# Dirección artística y pedidos para ChatGPT

Contrato complementario de 01-ESTADO-IDEAL-Y-REGLAS.md · ambos estilos confirmados por el dueño.

DESTINATARIO DEL PEDIDO: CHATGPT. Claude Code integra y verifica los archivos resultantes; no se le encarga producir las ilustraciones.

## 1. Resultado buscado y responsables

Conservar fantasía pintada y pixel art. Mismos personajes, funciones, señales, secuencia de acciones y momento de impacto en ambos. Cada estilo conserva su técnica: no convertir un pintado en pixel bajando resolución ni aplicar suavizado al pixel. No rediseñar el elenco para resolver una falta de efectos.

ChatGPT: conceptos, referencias de continuidad, iconos originales, poses clave, efectos dibujados y propuestas de sonido si dispone de herramienta apropiada. Claude Code: revisar manifiestos, preparar cortes/exportaciones mediante herramientas disponibles, importar, verificar y conectar eventos. La generación de una hoja por IA no garantiza cuadros alineados ni animación utilizable: revisar continuidad y cada frame antes de integrar.

No pedirle a ChatGPT que dibuje barras, números o textos funcionales dentro de los sprites; deben ser UI para traducir/escalar/actualizar. Mantener Nunito/Alegreya y paneles existentes salvo problemas concretos de legibilidad.

## 2. Antes de producir

La revisión de arte a cargo de ChatGPT/Codex crea un inventario con assetId, ruta, estilo, clase, elemento, acción, dimensiones de celda, filas/columnas, frames, fps, loop/hold, transparencia, ancla del pie, caja opaca y uso real. Comparar héroes, efectos y jefes en galería existente. Clasificar: reutilizable, requiere receta visual, requiere ajuste y falta.

Datos verificados como antecedente: HERO_ACTIONS tiene idle, attack_1/2/3, defend, perfect_guard, hit, dodge, defeat y victory. Hay manifiestos e importadores por estilo. Bárbara/Berserker ya tiene diseño aprobado de mujer pelirroja con hacha; no volver a dibujarla como Caballero por usar una versión histórica. Sus dimensiones difieren entre estilos y de otros personajes: copiar las del manifiesto específico, no generalizar384×384 a todos.

El catálogo de71 efectos principales incluye gacha/forja/emotes y no cubre necesariamente71 efectos de combate. El flujo actual reutiliza hit_ELEMENTO y attack_2 para muchas habilidades; una receta distinta y un evento nuevo pueden resolver parte del trabajo sin dibujar otro personaje.

El inventario determina cantidades definitivas de archivos nuevos; no pedir cientos de hojas de antemano.

## 3. Gramática visual obligatoria

| Clase | Gesto y silueta | Forma del efecto | Sonido sugerido |
|---|---|---|---|
| Caballero | postura firme, anticipación corta, peso del arma/escudo | arcos sólidos, cuña frontal, placas | metal y golpe seco |
| Mago | formación antes de liberación, manos/bastón legibles | sellos y geometría que convergen | tono creciente y descarga |
| Pícaro | estocada precisa, desplazamiento breve, retorno rápido | líneas finas, cortes dirigidos | silbido corto y corte |
| Clérigo | gesto ceremonial y centro estable | círculos, pulsos y envolturas protectoras | campana/pulso cálido |
| Berserker | anticipación corporal amplia, golpe contundente | arcos amplios y fragmentos de impacto | hacha e impacto grave |

| Elemento | Movimiento/material | Señal al mantener | Señal al consumir |
|---|---|---|---|
| Fuego | ascendente, brasas y llama | brasa localizada y símbolo de cargas | concentración, estallido, desaparición de brasas |
| Agua | flujo y cristal | cristales/pulso frío | fractura de cristal y señal de demora en cola |
| Viento | lateral, espiral y estelas | corrientes alrededor del portador | ráfaga hacia delante y avance visible en cola |
| Tierra | bloques y grietas angulares | grieta localizada en defensa | fragmentos convergen hacia la próxima penetración |
| Rayo | trazos quebrados, arcos conectados | nodos cargados propios | conexión de nodos, descarga y apagado |

Consecuencia domina al adorno: un Quiebre se distingue de daño ordinario aun en escala pequeña y sin audio. Aplicar estado y consumirlo nunca usan exactamente la misma secuencia. La misma habilidad conserva el significado y el momento de impacto entre estilos.

## 4. Pedido real revisado: 38 recursos finales como presupuesto inicial

Revisión del15 de octubre: inspección de iconos pintados, hojas de8 efectos pintados, existencia de equivalentes pixel y metadatos del catálogo. No se ha evaluado cada frame de todos los personajes/jefes ni todas las hojas pixel. Este presupuesto es una selección de producción recomendada, no una afirmación de que todos los recursos existentes sean inutilizables.

Hallazgo visual: hit_fire, hit_water, hit_wind, hit_earth y hit_lightning pintados comparten prácticamente el mismo corte con cambio de color. Para conseguir identidad material, sustituir esos cinco impactos con formas/movimientos distintos. No basta conectar mejor esos archivos actuales.

| Entrega | Diseños funcionales | Versiones pintado/pixel | Total de hojas o imágenes |
|---|---:|---:|---:|
| Impactos elementales realmente distintos: llama/brasa, agua/cristal, corriente, roca/grieta y arco eléctrico |5|2|10 hojas animadas de reemplazo |
| Consumos: detonación de fuego, rotura de escarcha, impulso de viento, concentración de penetración de tierra y descarga de rayo |5|2|10 hojas animadas nuevas |
| Quiebre, cancelación de ritual y reconstrucción de armadura |3|2|6 hojas animadas nuevas |
| Iconos de4 habilidades de Berserker, Sello y Purificar |6|2|12 imágenes estáticas nuevas |
| **Total propuesto** |**19 diseños**|**2 estilos**|**38 recursos finales** |

Una hoja animada contiene varios cuadros, no equivale a una ilustración suelta ni a una única generación sin correcciones. Cantidad de frames, tamaño y formato se fijan con los manifiestos al preparar el lote; no hay recuento fiable de cuadros finales todavía. Versiones de movimiento reducido, compresión y previews son derivados técnicos adicionales: no nuevos diseños artísticos. Esta cifra no cuenta audio ni10 habilidades de expansión.

Reutilización propuesta para14 iconos restantes: Avance→slash; Rompeguardia→shield_bash; Bastión→defend; Corte amplio→sweep; Inscribir→spark; Detonar→cataclysm; Barrera→arcane_shield; Finta→low_blow; Remate→execute; Paso evasivo→flee; Sabotaje→double_strike como representación provisional de maniobra ofensiva; Juicio→mace_strike; Consagrar→smite; Restaurar→prayer. Sabotaje requiere probar reconocimiento: si el símbolo resulta confuso, agregar1 diseño en ambos estilos, total40, no rehacer los20 iconos. Los nombres de archivo son icon_skill_ID con extensión del estilo.

Símbolos de recursos: aprovechar wall/arcane_focus/deadly_edge/blessing y un icono de furia del catálogo; mostrar tres marcas mediante UI. No pedir5 dibujos nuevos solo porque cambiaron los nombres de recursos. Verificar contraste y diferenciación a tamaño real.

No generar personajes, retratos, fondos, paneles ni animaciones completas de héroes para este primer lote. Reutilizar attack_1/2/3, defend, perfect_guard e hit, combinados con recetas diferenciadas. Si la prueba de una clase demuestra que falta una pose imprescindible, abrir un pedido adicional específico; el inventario actual no justifica15 movimientos nuevos.

Las9 señales de jefe se construyen inicialmente con sus animaciones existentes, iconos/contadores de UI y estas familias de efecto: brasas para Presión, grietas/reconstrucción para Armadura, arcos para Velocidad, sello/cancelación para Ritual. Cabezas, postura, aprendizaje y Hambre se explican con estado y gesto existente. No pedir9 nuevos personajes ni9 cinemáticas. Daño menor a Aguante puede usar fragmentos de Quiebre de baja intensidad; ganar/gastar recurso, aplicación/expiración y fase de jefe pueden expresarse en UI. Si una composición no es legible, documentar el faltante antes de ampliar lote.

Orden: primero5 impactos nuevos (10 hojas), después5 consumos (10), luego3 consecuencias (6), finalmente6 iconos (12). Probar dos elementos en combate antes de producir los restantes. Es presupuesto de producción, no orden de generar automáticamente las38 piezas.

## 5. Timing inicial de presentación

No es tiempo de simulación. Receta ordinaria objetivo0,5–0,9s; soporte0,4–0,7s; Quiebre/descarga importante hasta1,1s. Primer marcador de impacto0,25–0,40s según receta, común para ambas versiones de una habilidad. Valores iniciales ajustables en preview, sin modificar resolución lógica.

Un hitstop breve puede reforzar un impacto importante, no todos. Limitar flashes y sacudidas; movimiento reducido usa cambios de icono, forma y contraste sin traslaciones/sacudidas obligatorias. Una acción enemiga múltiple debe mostrar número real de impactos, aunque generación elemental siga siendo una por uso.

Si se acelera o salta animación, conservar orden y estado final; no volver a tirar azar ni volver a aplicar daño. No tapar intención, botones, vida o cola con partículas.

## 6. Contrato técnico de entrega

Claude completa las dimensiones exactas a partir del inventario ANTES de pedir arte. No pedir a generación que adivine la grilla. Por asset: ID estable en inglés; propósito; estilo; clase/elemento si aplica; PNG fuente transparente o formato apropiado; transparencia real, no damero dibujado; grilla y orden de cuadros; tamaño de celda; padding; pivote/ancla; cantidad de frames; fps; loop/hold; cuadro/momento de impacto; contorno opaco máximo; licencia/procedencia y herramienta cuando se conozca.

Manifiesto JSON de intercambio sugerido: {id,style,purpose,frameWidth,frameHeight,columns,rows,frames,fps,loop,hold,anchor,impactFrame,padding,sourceFile}. Adaptar a contrato real del importador, sin modificar JSON generado manualmente. WebP de runtime pintado y PNG pixel si así lo exigen los importadores existentes; conservar fuentes y prompts fuera del repositorio según reglas de arte, y finales/manifiestos donde corresponda.

No escalar el pixel con interpolación. Validar sin cortes de armas, cabello o partículas; ancla de pies estable; identidad, rostro, ropa y proporciones consistentes entre cuadros. Alfa y paletas siguen el contrato de cada lote; no imponer alfa binario al pintado si requiere semitransparencia.

## 7. Plantilla para pedir una pieza a ChatGPT

“Estoy ampliando Boludos & Dragones. Usá las imágenes de referencia adjuntas para conservar exactamente personaje, ropa, arma y proporciones. Necesito [ID], propósito [EVENTO Y CONSECUENCIA], estilo [PINTADO/PIXEL]. La clase se expresa mediante [GESTO/FORMA]; el elemento mediante [MATERIA]; el efecto debe comunicar [RESULTADO]. No inventar otra clase ni cambiar la silueta. Entrega [POSE CLAVE / HOJA], [GRILLA], [CELDA], [FRAMES], pivote [ANCLA], fondo transparente real. Secuencia: [ANTICIPACIÓN→IMPACTO→SALIDA]. Impacto en frame[N]. Sin texto ni interfaz dibujada; sin recortes en los bordes; mantener continuidad entre cuadros. Para pixel: píxeles nítidos, sin antialias ni reescalado suave. Para pintado: conservar el acabado de las referencias. Primero presentar una prueba para validar continuidad y legibilidad antes del lote.”

Pedir por lotes pequeños y con referencias reales. Si la herramienta no puede entregar transparencia/grilla exacta, generar poses por separado y resolver ensamblaje/QA después; no declarar lista una animación porque existe una imagen.

## 8. Revisión conjunta

Primer caso completo: Caballero con Avance/Rompeguardia/Bastión y Mago con Inscribir/Detonar/Barrera, Fuego/Agua. Vista pintado/pixel lado a lado, fondos claros/oscuros, desktop1920×1080 y móvil390×844 y320×740, reducido activado/desactivado. Probar skillId distinto con mismo sprite base y comprobar que la consecuencia cambia.

Entrega aprobable: galería aislada, muestra en combate real y tabla de faltantes. Comparar sin números ni audio para evaluar reconocimiento; con audio para comprobar sincronía. La evaluación humana de reconocimiento es distinta de validación automática de archivos.

Fuentes de criterio: manifiesto de ArenaNet https://www.guildwars2.com/en/news/guild-wars-2-design-manifesto/ y claridad gráfica de Riot https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity . Las recetas y cantidades de este documento son propuestas propias para el proyecto.
