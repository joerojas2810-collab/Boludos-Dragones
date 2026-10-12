# FASE EQUIPAMIENTO

## Dirección y procedimiento aprobados

2026-10-12. El usuario aprobó espada, mandoble, martillo y peto como acabado base. Aprobó explícitamente generar 15 diseños base y crear sus cinco variantes elementales mediante recoloreado automático, conservando metal y cambiando acentos.

10 armas: espada, hacha, arco, bastón, daga, maza, varita, libro, mandoble y martillo. 5 piezas: casco, peto, piernas, botas y collar. Cinco elementos por tipo: 75 imágenes.

## Producción

Originales transparentes de 1254 × 1254 guardados fuera del catálogo público de producción. Exportación WebP de 512 × 512 en public/art/equipment-painted-v2, manifiesto en src/lib/art/painted-equipment.generated.json. Recoloreado selectivo de acentos rojos; conserva transparencia, acero, oro y materiales neutros. Paleta: Fuego rojo, Agua azul, Tierra ocre oscuro, Rayo amarillo, Viento verde turquesa.

scripts/prepare-painted-equipment.mjs reproduce la exportación desde los originales. scripts/equipment-color.mjs implementa el recoloreado aprobado por el usuario.

## Integración y revisión

handIconSrc y gearIconSrc resuelven los nuevos iconos para el estilo pintado. Mandoble y martillo tienen diseños independientes. Pixel Art mantiene sus rutas históricas. Se conservan estadísticas, tipos de equipo, reglas y marcos de rareza.

Galería local: /galeria-px/actualizacion-equipamiento. Selección de los 15 tipos, cinco elementos, comparación con iconos anteriores, lectura a 48/80/128 píxeles y tarjeta junto al héroe.

## Estado

Antes del push se integró origin/main (2f35ede), conservando sus cambios de lógica y rutas. Verificación de la versión integrada: 596 pruebas aprobadas en 66 archivos y build de producción correcto. Las dos vistas antiguas de la galería de jefes se adaptaron localmente a los identificadores de ruta nuevos; quedan fuera del commit de EQUIPAMIENTO.

FASE APROBADA por el usuario el 2026-10-12, incluidos tamaño y centrado. Commit y push autorizados. Suite completa: 551 pruebas aprobadas en 61 archivos. La galería de EQUIPAMIENTO se guarda con referencias a recursos de producción, sin depender de bocetos locales sin seguimiento. La ruta de revisión continúa siendo solo para desarrollo.

Producción completa: 15 diseños base y 75 variantes transparentes. Peso total de producción: 3.142.606 bytes (aproximadamente 3 MB). Pruebas dirigidas, suite completa, ESLint y build de producción aprobados. Fase aprobada por el usuario y publicación autorizada.

Umbral de uso vigente: detenerse al 5% disponible y guardar resumen. No usar API de imágenes ni créditos de reinicio.

Verificación final: TypeScript sin errores; galería carga los 15 tipos y el cambio a Agua. Collar revisado a 48 píxeles junto al héroe y marco. Sin modificar el perfil del usuario ni realizar pruebas autenticadas en producción. Suite completa y build ejecutados antes del commit autorizado, siguiendo AGENTS.md.

## Ajuste de tamaño en tarjetas

Corrección posterior de centrado: los límites visibles excluyen píxeles sueltos casi transparentes (alfa hasta 8/255) y conservan 3 píxeles de margen para bordes suavizados. Esto evita que ruido fuera de la silueta desplace el objeto. Recalculado para las 75 variantes y verificado visualmente en la tarjeta de piernas de Tierra. Las tres pruebas dirigidas siguen pasando.

El usuario pidió maximizar el ítem sin superponer elemento u otras etiquetas. Se registraron los límites visibles de los 75 iconos y se usa un recorte SVG del margen transparente, sin alterar archivos ni cortar la silueta. ItemCard reserva bandas para elemento/copias/insignias y nombre/estrellas/estadísticas, y llena el espacio restante. La galería comparte esas medidas y ahora muestra etiquetas reales de ejemplo. Comprobado en navegador que el área del objeto no se superpone con elemento, copias o nombre; margen adicional de 2 píxeles. Pixel mantiene el encuadre anterior. Pruebas dirigidas, TypeScript y ESLint correctos. Sin commit ni push.
