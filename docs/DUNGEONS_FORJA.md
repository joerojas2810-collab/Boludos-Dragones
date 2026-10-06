# Dungeons, rangos F–SSR, equipo y forja (diseño, sin código)

Estado (2026-10-06): **Etapas 1 a 8 implementadas** (armas por clase, rangos F–SSR y equipo); el resto es diseño pendiente. Valores iniciales, todos ajustables por simulación y centralizados en archivos de constantes. Este documento se envía junto con `PEDIDO_ARTE.md`: ahí está todo lo que hay que dibujar.

## 1. Rangos F–SSR (héroes, armas, equipo, partes)
Nueve rangos: F, E, D, C, B, A, S, SS, SSR. Reemplazan las 5 rarezas anteriores en personajes, armas, fragmentos y (más adelante) equipo y partes. **Hecho.** Las reliquias mantienen sus 3 rarezas propias (común, rara, legendaria).

Color de cada rango en la interfaz (provisional, ajustable por el diseñador): F gris `#9ca3af`, E verde `#4ade80`, D turquesa `#2dd4bf`, C azul `#60a5fa`, B índigo `#818cf8`, A violeta `#c084fc`, S dorado `#fbbf24`, SS naranja `#fb923c`, SSR rojo-rosa `#f43f5e`. S, SS y SSR llevan marco con brillo animado y revelación especial en el gacha.

| Rango | F | E | D | C | B | A | S | SS | SSR |
|---|---|---|---|---|---|---|---|---|---|
| Prob. gacha | 30% | 22% | 16% | 12% | 9% | 6% | 3% | 1.5% | 0.5% |
| Multiplicador | x1.00 | x1.10 | x1.20 | x1.30 | x1.45 | x1.60 | x1.80 | x2.05 | x2.30 |

- Gacha y drops pueden dar cualquier rango, de F a SSR.
- Pity (hecho, por banner): a las 100 tiradas sin SS o mejor, la siguiente es SS o mejor; a las 200 sin SSR, la siguiente es SSR.
- Estrellas (0 a 5, +10% cada una) se mantienen sobre el multiplicador del rango.
- Migración de la colección anterior (hecha): Común → F, Poco común → D, Raro → C, Épico → A, Legendario → S. Quedan libres E, B, SS y SSR para conseguirlos jugando. Hay migración nueva en Supabase.
- Modo nivelado: el rango solo da el bono chico (hasta +15%).

## 2. Equipo
Seis casillas: arma, casco, peto, piernas, zapatos, collar. Sin restricción de clase en armadura. Bonos sumados dentro de cada categoría con topes.

| Casilla | Stat principal | Stat secundario |
|---|---|---|
| Casco | Vida | DEF |
| Peto | DEF | Vida |
| Piernas | DEF | Esquive |
| Zapatos | Velocidad | Esquive |
| Collar | Crítico | Precisión |

Armas por clase (hecho, `CLASS_WEAPONS` en `weapons.ts`): **9 tipos** (espada, hacha, lanza, arco, bastón, daga, maza, varita, libro), 2 a 3 por clase.

| Clase | Tipos permitidos |
|---|---|
| Caballero | espada, hacha, lanza |
| Mago | bastón, varita, libro |
| Pícaro | daga, arco |
| Clérigo | maza, bastón, libro |

El gacha puede dar cualquier tipo; cada héroe solo equipa (y solo ve para equipar) las armas de su clase. Las demás quedan en la colección.

## 3. Armas y equipo en medio de la run
- Fuentes: cofres, mercader y jefes. Solo se ofrecen tipos que la clase puede usar.
- El rango sube con el rango del dungeon (hoy, con el piso). Usan el generador actual y la semilla de la run.
- Se llevan puestas en la run y pasan a la colección al asegurarlas un jefe (cada jefe vencido asegura lo recogido hasta ese momento).

## 4. Equipar al empezar (hecho)
Antes de entrar: pantalla "¿Equipar?" con las armas compatibles con la clase y la opción "sin arma". La elección se recuerda.

## 5. Dungeons
Cada dungeon tiene rango, elemento y familia de enemigos. Longitud fija con jefe final. Reemplaza la run infinita de 100 pisos.

Cantidad de jefes = `max(2, redondear(pisos / 5))` (2 es el mínimo). Repartidos parejos; el último piso es el jefe final (más fuerte, da partes de rango +1). Descanso garantizado antes de cada jefe.

| Rango | Pisos | Jefes en los pisos |
|---|---|---|
| F | 8 | 4, 8 |
| E | 10 | 5, 10 |
| D | 12 | 6, 12 |
| C | 14 | 5, 9, 14 |
| B | 16 | 5, 11, 16 |
| A | 18 | 5, 9, 14, 18 |
| S | 20 | 5, 10, 15, 20 |
| SS | 22 | 6, 11, 17, 22 |
| SSR | 25 | 5, 10, 15, 20, 25 |

Desbloqueo:
- Para entrar a un rango hay que limpiar el anterior.
- Desde el desbloqueo de A (limpiar B para entrar a A) y para todos los rangos superiores, además hay que haberlo limpiado con una cantidad mínima de vidas restantes. Valores por simulación (hoy: 3 vidas).
- Valores iniciales propuestos: A, S y SS con al menos 2 vidas; SSR con 3 (sin perder ninguna).

## 6. Partes y forja
Tipos de ítem: 9 armas + 5 de armadura/collar = 14. Una parte por tipo de ítem y rango (hoja de espada, mango de bastón, peto…). Además, 1 núcleo por elemento (5).

- Drops: cada dungeon tiene un presupuesto de botín que se reparte al azar entre piezas, partes y núcleos; el rango es el del dungeon o inferior, con poca chance de uno más (mayor en peleas difíciles, grupos grandes y jefes). Arriesgar da botín extra sin gastar el presupuesto.
- Armar: partes del tipo + 1 núcleo del elemento, todas del mismo rango, más monedas.
- Combinar partes o ítems del mismo tipo y rango (ratio decreciente, más monedas y 1 núcleo):

| Paso | Ratio | Monedas |
|---|---|---|
| F→E | 4:1 | 10 |
| E→D | 4:1 | 30 |
| D→C | 3:1 | 90 |
| C→B | 3:1 | 270 |
| B→A | 3:1 | 810 |
| A→S | 2:1 | 2.430 |
| S→SS | 2:1 | 7.290 |
| SS→SSR | 2:1 | 21.870 |

- Desmontar un ítem repetido devuelve partes de su tipo y del mismo rango.
- El gacha de armas se mantiene; la forja es una segunda vía.
- Meta de economía: llegar a SSR por fusión pura toma ~3-4 semanas de juego regular. El costo de fusión se calibra como múltiplo de lo que paga un dungeon del rango anterior (`forge.ts` + script de simulación).

## 7. Salas
- Ronda de 10 pisos, jefes en 5 y 10.
- El anfitrión elige un rango que todos los presentes tengan desbloqueado.
- En modo nivelado el rango solo afecta dificultad y drops.

## 8. Plan por etapas (confirmar antes de cada una)
1. `CLASS_WEAPONS` + maza, varita y libro + pantalla "¿Equipar?". **HECHO**
2. Rangos F–SSR en `rarity.ts`, migración de colección y de Supabase, pity doble. **HECHO**
3. Equipo: 5 casillas nuevas con stats. **HECHO** (banner de gacha "Equipo" que incluye las armas; casillas arma, casco, peto, piernas, zapatos y collar; bonos sumados con topes: vida y DEF hasta +50%, velocidad +25%, esquive +10, crítico +15, precisión +10; el modo nivelado ignora el equipo).
4. Armas y equipo en medio de la run. **HECHO** (cofres: 50% de traer 1 pieza; jefes: elegir 1 de 2 o dejarlas, con +1 rango; mercader: 1 pieza a la venta). El botín va a una mochila y **pasa a la colección cuando un jefe lo asegura**: cada jefe vencido asegura todo lo recogido hasta ese momento; lo recogido después del último jefe se pierde si caes o abandonas. Duplicados: +1 estrella, o monedas si ya tiene 5. Falta que el rango dependa del rango del dungeon.
5. Dungeons: rango, longitud, jefes, candados. **HECHO** (dificultad por rango calibrada con simulación; héroe del mismo rango con 3 estrellas y sin equipo limpia F 97%, E 90, D 81, C 75, B 59, A 48, S 33, SS 16, SSR 5%).
6. Partes y drops. **HECHO** (14 partes × 9 rangos + 5 núcleos; pelea fácil 25%, difícil 40%, jefe 2 partes + 1 núcleo, jefe final 3 partes de rango +1 y 2 núcleos, cofre 1 parte; se aseguran con los jefes como el botín).
7. Forja y simulación de economía. **HECHO** (costos de fusión recalibrados: 5, 10, 20, 50, 150, 450, 1400 y 4200 monedas; ≈4 semanas de monedas a 3 runs/día para una pieza SSR por fusión pura) + mercado con intercambios equivalentes ±25%.
8. Salas con rango. **HECHO en el servidor y el lobby** (rango = dificultad; todos los presentes deben tenerlo desbloqueado; sin botín en las rondas).

## 9. Abiertos
- Valores finales de vidas mínimas, costos de fusión y pity.
- Cantidad de familias de enemigos y elementos por dungeon.
