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

La calibración anterior por ruta×ascensión no alcanzó el objetivo. Se reemplazó por `ROUTE_FIT[ruta][rango][ascensión]`: 378 multiplicadores numéricos aplicados a los stats enemigos. No se modifican reglas ni mecánicas de jefes ni los parámetros de 6a-4. `ENGINE_VERSION` pasa a 25.

`scripts/fit-route-tune.ts` ajusta cada factor por bisección usando `stage-tune.ts`, semilla 13013 y ejecución paralela. La corrida de confirmación usa 100 muestras por nivel. Para regenerar la tabla: `node --import tsx/esm scripts/fit-route-tune.ts --quick --runs=24 --fit-runs=100 --iterations=10 --workers=8`. El código generado vive en `src/lib/game/routeFit.generated.ts`.

**Resultado confirmado:** las 42 medias de las nueve rutas están dentro de ±5 puntos porcentuales de la meta; el rango observado va de 45,11 % (S+5, meta 45 %) a 70,22 % (+0, meta 70 %). La diferencia entre la ruta más fácil y la más difícil queda por debajo de 1,25 pp en los 42 escalones (máximo 1,25 pp, en S+1). Se usaron 100 corridas por nivel, semilla 13013.

| Rango | +0 | +1 | +2 | +3 | +4 | +5 |
|---|---:|---:|---:|---:|---:|---:|
| F | 70,22 % / 1,00 pp | 60,14 % / 0,25 pp | 60,19 % / 0,75 pp | 59,97 % / 0,50 pp | 60,25 % / 0,75 pp | 59,94 % / 0,75 pp |
| E | 70,03 % / 0,50 pp | 60,11 % / 1,00 pp | 60,14 % / 0,75 pp | 60,31 % / 0,50 pp | 60,19 % / 0,75 pp | 60,14 % / 1,00 pp |
| D | 70,11 % / 0,50 pp | 60,11 % / 0,75 pp | 60,14 % / 0,50 pp | 60,11 % / 0,75 pp | 59,97 % / 0,50 pp | 60,08 % / 0,25 pp |
| C | 70,03 % / 0,50 pp | 60,17 % / 0,75 pp | 60,36 % / 1,00 pp | 60,17 % / 0,75 pp | 60,14 % / 1,25 pp | 60,11 % / 0,25 pp |
| B | 70,17 % / 0,50 pp | 60,14 % / 0,75 pp | 60,19 % / 0,25 pp | 60,08 % / 0,75 pp | 60,14 % / 0,50 pp | 60,08 % / 0,75 pp |
| A | 70,14 % / 0,75 pp | 60,14 % / 0,75 pp | 60,33 % / 0,50 pp | 60,06 % / 0,50 pp | 60,22 % / 0,75 pp | 60,25 % / 1,00 pp |
| S | 70,06 % / 0,75 pp | 59,97 % / 1,25 pp | 60,06 % / 0,50 pp | 60,31 % / 0,50 pp | 60,06 % / 0,25 pp | 45,11 % / 0,50 pp |

En cada celda, `media de victoria / dispersión máxima entre rutas`.
