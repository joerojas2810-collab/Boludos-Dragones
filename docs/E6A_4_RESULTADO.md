# 6a-4 — Intensidad de mecánicas por ascensión

Las nueve mecánicas conservan su comportamiento y usan la ascensión de la dungeon (`0…5`) que ya guarda la etapa. Los valores se calculan con funciones puras, limitadas a ese intervalo; la semilla no altera los parámetros. Una ascensión no modifica las peleas normales ni los jefes de otros modos. `ENGINE_VERSION` pasa a 23 porque estas reglas cambian resultados de combate y replay.

| Jefe | Parámetro por ascensión +0…+5 | Aplicación |
|---|---|---|
| Señor de las Moscas | Daño por ronda: 1,5 / 1,8 / 2,1 / 2,4 / 2,7 / 3,0% de vida máxima | Se aplica al final de cada ronda. |
| Rey de Ceniza | Acumulación: +1 / +1 / +2 / +2 / +3 / +3 niveles por ronda; máximo 5 | El máximo existente no cambia. |
| Vigía Eterno | Repeticiones: 2 / 2 / 2 / 1 / 1 / 1 | Conserva el factor de mitigación existente. |
| Coloso Hueco | Roto: 3 / 3 / 2 / 2 / 1 / 1 rondas; recomposición en 6 / 5 / 4 / 3 / 2 / 2 | Conserva barra, mitigación y bonificación de Roto existentes. |
| Rey del Trueno | Acelera cada 2 / 2 / 2 / 1 / 1 / 1 rondas | Conserva el incremento y el máximo existentes. |
| Madre Hidra | Umbrales: +0: 75/50/25%; luego cada umbral sube 2 puntos por ascensión, hasta 85/60/35% en +5 | Cura y suma cabezas al cruzar los umbrales existentes. |
| Reina Marchita | Ritual cada 3 / 3 / 2 / 2 / 2 / 2 rondas | Se limita a una frecuencia de cada dos rondas: el ritual ocupa la acción anunciada de la Reina, por lo que hacerlo cada ronda podía reducir sus ataques y facilitar la pelea. |
| El Sin Rostro | Cambia de postura cada 2 / 2 / 2 / 1 / 1 / 1 rondas | Se mantienen las posturas y sus efectos existentes. |
| Gran Devorador | Umbral de vida: 30 / 33 / 36 / 39 / 42 / 45% | La acción extra y el robo de vida mantienen sus reglas existentes. |

El aviso del selector muestra una línea con el valor activo para la ruta y el escalón escogidos. Por ejemplo, «Presión: acumula 3 niveles por ronda (Ascensión +5)».

## Calibración y residuos

Se usó `stage-tune.ts` con semilla 13013, las nueve rutas y el ajuste vigente de `ASC_TUNE`: primero `--quick` (8 runs por nivel), y después full (100 runs por nivel). Los resultados se guardaron en `/private/tmp/stage-tune-6a4-quick2.json` y `/private/tmp/stage-tune-6a4-full2.json`; los temporales no forman parte del cambio.

En las 42 celdas de referencia, 40 quedaron dentro de ±5 puntos porcentuales. C+5 terminó en 66,7% frente al objetivo de 60% (+6,7 pp), y S+2 en 68,7% frente a 60% (+8,7 pp). El mayor rango entre rutas para una celda de referencia fue 26,8 pp; solo C+3 (7,8 pp) llegó a 8 pp o menos. La causa más clara es S+2: Coloso Hueco dio 57,5% y Reina Marchita 84,3%. Ya en +0, antes del escalado, Gran Devorador quedó en 58,8% y Reina en 72,3% (rango 13,5 pp), por lo que las curvas de +1…+5 no pueden corregir toda la dispersión.

Se evaluó el residuo de la Reina por separado con 100 runs por nivel. Aumentar la frecuencia de su ritual sustituye más ataques por rondas de canalización, lo que puede facilitar el combate; en S+2 ya ocurre cada dos rondas y su frecuencia no puede subir sin invertir más el efecto. Reducir la frecuencia o debilitar la Armadura del Coloso para compensar el rango iría en contra del escalado de mecánica solicitado. Por eso se conserva el escalado monotónico de los parámetros existentes y se registra explícitamente que el objetivo de ≤8 pp entre rutas no es alcanzable en S+2 dentro de esas restricciones.

El límite de dos rondas del ritual conserva su función y aumenta su frecuencia frente a base, pero evita que su acción sustituya ataques de la Reina en todas las rondas. Los umbrales de cura de la Hidra y el cambio de postura cada ronda también alteran los patrones de ataque; se dejaron en los valores de la tabla porque mantienen el significado de la mecánica y los resultados de referencia se mantienen próximos a objetivo.

## Nivelación de rutas

Se añadieron correcciones exclusivamente numéricas: `ROUTE_TUNE` por ruta y `ROUTE_ASC_TUNE[route][asc]`, multiplicadas por los stats de enemigos junto a los ajustes existentes. No cambian reglas, mecánicas ni parámetros de jefe. `ENGINE_VERSION` pasa a 24.

Factores totales efectivos (`ROUTE_TUNE × ROUTE_ASC_TUNE`):

| Ruta | +0 | +1 | +2 | +3 | +4 | +5 |
|---|---:|---:|---:|---:|---:|---:|
| Señor de las Moscas | 0,980 | 1,000 | 0,975 | 1,000 | 0,978 | 1,000 |
| Rey de Ceniza | 0,950 | 0,975 | 1,000 | 0,999 | 0,975 | 1,016 |
| Vigía Eterno | 1,000 | 1,010 | 1,043 | 1,050 | 1,050 | 1,010 |
| Coloso Hueco | 1,025 | 1,050 | 1,025 | 0,950 | 1,000 | 1,000 |
| Rey del Trueno | 0,950 | 0,950 | 0,975 | 1,000 | 1,000 | 0,950 |
| Madre Hidra | 0,950 | 0,950 | 1,008 | 0,967 | 0,950 | 1,025 |
| Reina Marchita | 1,050 | 1,005 | 1,016 | 1,019 | 1,016 | 1,000 |
| El Sin Rostro | 0,975 | 1,050 | 1,000 | 1,000 | 1,032 | 1,025 |
| Gran Devorador | 0,975 | 0,975 | 1,000 | 1,000 | 0,988 | 0,983 |

Se iteró con `stage-tune.ts --quick --all-routes` y se confirmó con semilla 13013, 100 corridas por nivel y ruta. La candidata elegida deja 40/42 promedios de referencia dentro de ±5 pp; C+5 queda +6,4 pp y S+2 +7,2 pp. La dispersión no llega a la meta: máximo 24,3 pp (S+2: Coloso Hueco 54,3 %, Reina Marchita 78,5 %; también A+5: Rey de Ceniza 49,5 %, Rey del Trueno 73,8 %). Solo 1/42 escalones queda en ≤8 pp; los otros 41 superan 10 pp.

Una búsqueda de factores más agresiva redujo S+2, pero abrió diferencias de hasta 42,8 pp en A+2; se descartó. La misma corrección ruta×ascensión afecta los siete rangos y las tasas cambian de manera distinta entre ellos. Conseguir ≤8 pp en todos los escalones sin romper ±5 pp no se pudo resolver con los dos multiplicadores autorizados. Para cerrar ese objetivo haría falta que el dueño habilite correcciones por rango además de ruta y ascensión, o relaje la meta de dispersión. No se cambió ninguna mecánica ni se ocultó el residuo.
