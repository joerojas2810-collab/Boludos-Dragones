## Publicación aprobada — 19/10/2026

Christian autorizó publicar esta corrección. Se incorporó por avance directo origin/main d167ca8, que conserva habilidades equipadas al iniciar combates de mazmorra. Sin sobrescribir cambios ajenos de Review.tsx ni tsconfig.json.

Suite completa: 84 archivos y 995 pruebas correctas, ejecutada dentro del aislamiento con dos workers de threads y margen de 30 segundos. ESLint dirigido y compilación de producción correctos. La cobertura nueva comprueba los nueve jefes, cinco elementos y cinco poses (225 combinaciones); Pixel conserva su comportamiento. La inspección interactiva del navegador no se realizó en esta corrección. Las notas inferiores conservan el historial previo a la autorización.

# Corrección de arte de jefes por elemento — 19/10/2026

La captura de Christian muestra el diseño anterior del Señor de las Moscas. El registro nuevo solo contiene su paleta nativa (agua); cuando el combate pide otro elemento, enemyAnim buscaba el nombre de ese elemento y terminaba en /art/enemies, el arte antiguo.

Se prioriza el registro aprobado: pose/elemento solicitado, pose/paleta nativa del jefe, y solo después idle aprobado. Las variantes elementales no cambian el elemento del personaje, el HUD ni las reglas de combate. Se conserva Pixel Art. No se crean colores o ilustraciones nuevos; los jefes pintados conservan su diseño aprobado mientras no exista una variante elemental aprobada.

Prueba de regresión: nueve jefes × cinco elementos × cinco acciones (225 combinaciones), además de la cobertura existente de 370 acciones activas y compatibilidad Pixel. Las cinco pruebas de enemies.test.ts pasaron dentro del aislamiento con pool de threads. La ejecución fuera del aislamiento fue rechazada; no se insistió en ese permiso. No se ejecutó suite completa por no haber solicitud de commit.

La galería /galeria-px/alineacion-combate añade elemento de combate y pose, para reproducir la regresión. La revisión interactiva del navegador no se ha ejecutado en esta corrección; las imágenes locales antiguas y aprobadas se inspeccionaron directamente para confirmar la diferencia. Sin commit ni push. Mantener cambios ajenos de Review.tsx y tsconfig.json.
