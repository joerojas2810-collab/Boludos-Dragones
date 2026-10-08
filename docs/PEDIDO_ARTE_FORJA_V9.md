# Pedido de arte: Forja v9.0 (2 íconos nuevos)

Contexto: ver `docs/FORJA_V9.md`. La forja nueva usa dos materiales sin elemento que reemplazan a las partes y los núcleos. Hacen falta exactamente **2 íconos**.

## Estilo (igual que el arte actual)
- Fantasía pintada, mismo trazo, luz y contorno que los íconos de `public/art/icons/` (ver `CLAUDE.md` → Arte).
- Fondo transparente, un solo objeto centrado con aire alrededor, sin texto, sin marco, sin sombra proyectada dura.
- Fuente: PNG 1024x1024 RGBA. El importador (`scripts/import-art.mjs`) lo reduce a **128x128 WebP**; debe leerse bien a **48 px** (silueta clara, 2-3 colores dominantes, contraste alto).
- Sin elemento: nada de colores de fuego, agua, tierra, rayo o viento como identidad.

## 1. Escamas
- Archivo: `icon_material_scales` (PNG fuente; salida `public/art/icons/icon_material_scales.webp`).
- Qué es: material de mejora de equipo. Una escama de dragón suelta, grande, ligeramente curva, con borde irregular y estrías.
- Color: bronce / ámbar metálico cálido, brillo cálido en el borde superior izquierdo, interior algo más oscuro.
- Variante opcional (misma carpeta): `icon_material_scales_pile`, un montoncito de 3 escamas (para cantidades grandes en la interfaz). Si no se entrega, el juego usa la escama simple.

## 2. Dado cargado
- Archivo: `icon_material_loaded_die` (salida `public/art/icons/icon_material_loaded_die.webp`).
- Qué es: catalizador de suerte. Un dado de seis caras gastado, con esquinas desgastadas y puntos visibles en 2-3 caras (sin números).
- Color: marfil o hueso envejecido con un destello dorado/verde de suerte en una esquina o en el punto de arriba; un detalle sutil de que está cargado (una cara con un peso metálico incrustado o una grieta con plomo).
- Vista 3/4 sobre una arista, sin mesa ni manos.

## Imágenes de referencia para adjuntar
- Estilo general y moneda: `public/art/icons/icon_system_coin.webp`
- Objeto suelto pintado: `public/art/icons/icon_relic_whetstone.webp`
- Lo que reemplazan (para ver el tamaño y la lectura): `public/art/equipment/icon_core_fire.webp`, `icon_core_earth.webp`, `icon_part_sword.webp`, `icon_part_helmet.webp`
- Paleta del juego: `public/art/icons/icon_rank_s.webp`, `icon_rank_ssr.webp`

## Qué reemplazan (para ajustar el importador y `src/lib/art.ts` después)
- `public/art/equipment/icon_core_{fire,water,earth,lightning,wind}.webp` (5 núcleos) pasan a **Dado cargado**.
- `public/art/equipment/icon_part_*.webp` (14: axe, book, boots, bow, chest, dagger, helmet, legs, mace, necklace, spear, staff, sword, wand) pasan a **Escamas**.
- Los nuevos viven en `public/art/icons/` (no en `equipment/`). `partIconSrc` en `src/lib/art.ts` (usa `core_*`/`part_*` y `icons-px/` en modo pixel) se reemplaza por dos rutas fijas. Los respaldos pixel (`public/art/icons-px/`) quedan fuera del pedido.
- Falta `import-art.mjs`: añadir los dos nombres a la lista de íconos de `icons/` (no llevan caja de letra de rango).
