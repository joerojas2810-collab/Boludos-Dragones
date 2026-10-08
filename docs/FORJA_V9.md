# Forja v9.0 (propuesta, sin construir)

Motivo: la forja actual (6 pestañas, partes por tipo y rango, núcleos elementales, fusiones con reglas de elemento) confunde a los jugadores. Se simplifica a dos acciones y dos materiales.

## Glosario (una palabra por cosa)
- **Equipo**: todo lo que se lleva puesto. Se divide en **armas** y **armadura**.
- **Pieza**: un objeto de equipo concreto.
- **Escamas**: material único de mejora, sin elemento.
- **Dado cargado**: catalizador opcional que sube la probabilidad de éxito, sin elemento.
- **Ascender**: subir de rango (piezas y héroes).
- **Mejorar**: subir el nivel +N de una pieza con Escamas.

## Armas: 2 por clase (cada arma es de una sola clase)
Cada arma **reemplaza el Ataque 2** de la clase (el golpe especial con recarga). Ataque 1, pasiva y habilidad del nivel 5 no cambian. Así cada clase tiene dos estilos: **constante** (golpe especial frecuente) o **explosivo** (golpe enorme, más lento y con riesgo). Hecho en el motor (`WeaponTypeInfo.special`, `attackOf` en `combat.ts`, `ENGINE_VERSION = 9`).

| Clase | Constante | Explosivo |
|---|---|---|
| Caballero | **Espada**: Golpe de escudo ×1.8, acierto 90%, recarga 1 | **Hacha**: Hachazo ×3.2, acierto 65%, recarga 3 |
| Mago | **Varita**: Rayo arcano ×1.8, acierto 95%, recarga 1 (+velocidad, +precisión) | **Bastón**: Cataclismo ×2.8, acierto 70%, recarga 3 |
| Pícaro | **Daga**: Puñalada rápida ×1.7, acierto 95%, recarga 1 (+crítico, +velocidad) | **Arco**: Disparo certero ×2.6, acierto 90%, recarga 3 |
| Clérigo | **Maza**: Castigo ×2.2, acierto 85%, recarga 2, cura 6% | **Libro**: Plegaria ×0.3, acierto 100%, recarga 2, cura 13% (sanador) |

Los números de ATQ, precisión, crítico y velocidad de cada tipo (`WEAPON_TYPE_DATA`) no cambian.

Medido con `scripts/class-synth.ts` (SSR 3★ Nv20, promedio de dos políticas y dos habilidades, 200 héroes): las 8 armas limpian entre 32% y 34%. En S y C las dos armas de una clase quedan a ≤4 puntos entre sí; la brecha entre clases en rangos bajos (Caballero y Clérigo arriba de Mago y Pícaro) ya existía y sigue pendiente.

- HECHO: la lanza desapareció (las existentes pasan a espada con mismo rango, estrellas y elemento; si chocan con una espada que ya tienes, se fusionan y suman 1★) y `CLASS_WEAPONS` quedó con 2 armas por clase. El bastón deja de ser del Clérigo y se desequipa. Migración SQL `0040_no_lanza.sql`, probada en pglite; ejecutar `setup.sql` o `upgrade_from_0040.sql` en Supabase antes del push.
- Con las 5 armaduras son 13 tipos de pieza (antes 14).
- Sonido de Ataque 2 del Clérigo: la campanilla solo suena con el Libro. Pendiente: el texto del tooltip, que aún dice "Ataque de la clase".

## La forja: 2 pestañas

### 1. Ascender
- Piezas y héroes usan **la misma regla y la misma tabla** (`HERO_FUSION` en `heroFusion.ts`): una base + materiales del mismo rango (cualquier tipo y elemento) + monedas. La base conserva tipo, elemento y nombre, sube un rango y vuelve a 0★ y +0.

| Sube | Total (base + materiales) | Monedas |
|---|---|---|
| F → E | 6 | 20 |
| E → D | 6 | 40 |
| D → C | 5 | 80 |
| C → B | 5 | 160 |
| B → A | 4 | 320 |
| A → S | 4 | 640 |
| S → SS | 3 | 1.280 |
| SS → SSR | 3 | 2.560 |
- Las piezas repetidas o sin uso sirven de material: no hay Desmontar.

### 2. Mejorar (+1 a +10)
**Solo para equipo (armas y armadura) de rango S o superior con 5★.** Es el sistema de fin de juego; Escamas y Dado cargado solo caen en dungeons S, SS y SSR. Ascender reinicia estrellas y +N, así que el orden es subir de rango, completar estrellas y mejorar al final.

| Subir a | Éxito | Escamas por intento |
|---|---|---|
| +1 | 100% | 1 |
| +2 | 90% | 2 |
| +3 | 80% | 3 |
| +4 | 70% | 4 |
| +5 | 60% | 5 |
| +6 | 50% | 6 |
| +7 | 45% | 7 |
| +8 | 40% | 8 |
| +9 | 35% | 9 |
| +10 | 30% | 10 |

- Solo el +1 es seguro. Desde el +2, al fallar pierdes las Escamas del intento y la pieza queda en su nivel. Costo plano: igual al nivel al que subes (55 Escamas sin fallos).
- **Dado cargado:** opcional en cualquier intento, 1 por intento, suma +20 puntos de éxito. Sin tope salvo 100%: usarlo en un nivel fácil es decisión (y desperdicio) del jugador.
- **Contador de mala suerte:** cada fallo seguido en un nivel suma +5 puntos al siguiente intento; se reinicia al acertar.
- Medido (`scripts/mejorar-sim.ts`): una pieza de +0 a +10 cuesta ~113 Escamas sin dados y ~98 usándolos en +9 y +10 (~4 dados). Un equipo de 6 piezas, ~680.
- Bono por nivel: +4% por nivel, total **+40%** de las stats de la pieza a +10. Medido contra `GEAR_CAP` (set completo de 6 piezas 5★, sin líneas extra): el +40% deja S en 36-50% del tope de ATQ/VIDA/DEF, SS en ~50-75% y SSR llega al tope de DEF (por eso no pasar de +40%). Medido con `scripts/mejorar-power.ts` (set completo 5★, +0 → +10): en ascensión 5 y Nv20, S sube 52→74%, SS 49→73%, SSR 47→58% (SSR casi llega al tope de equipo, por eso no pasar de +40%); con héroe Nv70 suma +8 a +12 puntos; en ascensión 0 casi no aporta (ya limpia 88-95%). Es significativo sin romper el juego.
- Las estrellas siguen viniendo de duplicados, sin cambios.

## Qué desaparece
Forjar/Armar, Refinar, Fusionar partes, Desmontar, Atajos de partes, los 14 tipos × 9 rangos de partes, los 5 núcleos elementales y la regla de "distinto elemento" al fusionar piezas.

## Migración
- Cada parte existente se convierte en Escamas (equivalencia por rango, sin pérdida de valor).
- Cada núcleo existente se convierte en Dados cargados.
- Premios que hoy dan partes o núcleos (botín, jefe cooperativo, torre, misiones) pasan a Escamas y Dados cargados con el mismo valor.
- `part_stock`, `budget.ts`, `parts.ts`, `forge.ts` y las rutas del servidor se reemplazan; sube `ENGINE_VERSION` solo si cambian las stats de combate.

## Tasa de caída (propuesta, por afinar al construir)
**Escamas** (solo dungeons S, SS y SSR; se pagan al limpiar un nivel, con el mismo descuento diario por repeticiones que las monedas y +10% por nivel de ascensión):
| Dungeon | Escamas por nivel limpiado |
|---|---|
| S | 2 |
| SS | 3 |
| SSR | 4 |
- Jugador activo (8 niveles al día en SSR): ~220 por semana, unas 2 piezas a +10 por semana, un set de 6 en ~3 semanas.
- Jugador casual (3 niveles al día en S): ~40 por semana, una pieza cada ~3 semanas.
- Una pieza a +10 cuesta ~113 Escamas (~98 usando dados).

**Dado cargado** (objetivo: 2-3 por semana a un jugador regular, 5 a uno muy activo):
- Misión semanal: 1. Evento Viernes de sala: 1.
- Jefe cooperativo: 1 al ganar el grupo, +1 al MVP (reemplaza al núcleo actual).
- Torre semanal, top 3: 1 cada uno (reemplaza los núcleos).
- Último nivel de un dungeon S+: 5% de caer, máximo 2 por día por este camino.
- **No se intercambia ni se vende; queda ligado a la cuenta.** Las Escamas tampoco: así el mercado solo mueve equipo. Si se pudiera comprar el dado, desaparecería el riesgo de Mejorar.

## Pendiente de decidir
- Arte de Escamas y Dado cargado: pedido listo en `docs/PEDIDO_ARTE_FORJA_V9.md`.
