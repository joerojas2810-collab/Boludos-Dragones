# Resultado 6a-2 — escalera de dificultad (Q23-A)

## Método y ajuste

Se mantuvieron `DIFFICULTY_MULT`, `RANK_TUNE`, `ROUTE_TUNE`, las reglas de ascensión y la fórmula de poder. Solo se separó `ASC_TUNE` por rango; +0 permanece en ×1 y cada curva es estrictamente creciente hasta +5. `ENGINE_VERSION` sube a 22 porque cambia el poder enemigo y, por lo tanto, los resultados de combate/replay.

Se hicieron tres iteraciones con `--quick --fit-staircase --all-routes --workers=4`; la primera usó 2 corridas de ajuste por nivel y las dos siguientes 8. En la tercera, el ajuste dio peso 4 al héroe de referencia y peso 1 a cada sonda de ±2★: el contrato prioriza las metas de los 42 escalones, y las sondas sirven para comprobar el coste de esa calibración. La candidata final se confirmó con:

```text
node --import tsx scripts/stage-tune.ts --all-routes --runs=100 --workers=8 --output=/tmp/q23-final.json
```

Semilla 13013; nueve rutas; cada escenario suma 3.600 intentos (100 corridas × 4 niveles × 9 rutas). No se modificaron `RANK_TUNE`, `ROUTE_TUNE` ni la brecha entre clases.

| Rango | Iteración 1 | Iteración 2 | Iteración 3 / candidata |
|---|---|---|---|
| F | 1,000 · 1,235 · 1,320 · 1,530 · 1,540 · 1,625 | 1,000 · 1,235 · 1,370 · 1,530 · 1,565 · 1,700 | **1,000 · 1,235 · 1,370 · 1,580 · 1,590 · 1,700** |
| E | 1,000 · 1,285 · 1,370 · 1,580 · 1,590 · 1,725 | 1,000 · 1,285 · 1,420 · 1,580 · 1,590 · 1,800 | **1,000 · 1,285 · 1,470 · 1,605 · 1,615 · 1,800** |
| D | 1,000 · 1,210 · 1,295 · 1,480 · 1,565 · 1,600 | 1,000 · 1,235 · 1,420 · 1,530 · 1,565 · 1,750 | **1,000 · 1,235 · 1,420 · 1,555 · 1,590 · 1,775** |
| C | 1,000 · 1,285 · 1,370 · 1,580 · 1,590 · 1,700 | 1,000 · 1,285 · 1,420 · 1,630 · 1,640 · 1,775 | **1,000 · 1,285 · 1,445 · 1,630 · 1,690 · 1,775** |
| B | 1,000 · 1,260 · 1,270 · 1,430 · 1,565 · 1,750 | 1,000 · 1,285 · 1,370 · 1,555 · 1,590 · 1,775 | **1,000 · 1,285 · 1,445 · 1,630 · 1,640 · 1,800** |
| A | 1,000 · 1,185 · 1,345 · 1,530 · 1,590 · 1,825 | 1,000 · 1,310 · 1,420 · 1,555 · 1,640 · 1,850 | **1,000 · 1,310 · 1,445 · 1,655 · 1,665 · 1,850** |
| S | 1,000 · 1,160 · 1,345 · 1,480 · 1,565 · 1,975 | 1,000 · 1,260 · 1,370 · 1,530 · 1,565 · 2,000 | **1,000 · 1,260 · 1,370 · 1,580 · 1,590 · 2,000** |

Valores por fila: +0, +1, +2, +3, +4, +5. Cada curva pasa los cinco controles de monotonía estricta.

## Confirmación: héroe de referencia

Victorias por escalón (%); meta: 70 % en +0, 60 % en +1…+5, salvo S+5 (45 %). `*` = fuera de ±5 puntos porcentuales.

| Rango | +0 | +1 | +2 | +3 | +4 | +5 |
|---|---:|---:|---:|---:|---:|---:|
| F | 66,9 | 61,8 | 64,3 | 58,8 | 60,6 | 64,8 |
| E | 71,3 | 59,9 | 58,4 | 60,5 | 63,1 | 63,2 |
| D | 67,1 | 60,9 | 59,9 | 60,3 | 61,9 | 59,7 |
| C | 73,0 | 62,0 | 63,6 | 63,4 | 60,0 | 66,7* |
| B | 71,9 | 59,8 | 61,9 | 60,6 | 64,1 | 63,7 |
| A | 72,4 | 58,8 | 64,6 | 61,2 | 62,3 | 62,2 |
| S | 68,8 | 60,1 | 68,6* | 65,2* | 65,1* | 45,8 |

**38/42 referencias** quedan dentro de tolerancia. Fuera: C+5 66,7 % (+6,7 pp), S+2 68,6 % (+8,6 pp), S+3 65,2 % (+5,2 pp) y S+4 65,1 % (+5,1 pp). S+5 queda en 45,8 % (+0,8 pp). La desviación máxima de las referencias restantes es S+2 (+8,6 pp).

## Sondas de estrellas

Meta con +2★: 85 %. Fuera de ±5 pp: F+0 90,4 % (+5,4); E+0 92,9 % (+7,9); D+0 92,5 % (+7,5), D+1 90,0 % (+5,0); C+0 93,9 % (+8,9); B+0 94,0 % (+9,0), B+1 90,8 % (+5,8); A+0 93,8 % (+8,8); S+0 93,1 % (+8,1), S+1 90,8 % (+5,8), S+2 90,2 % (+5,2) y S+3 90,5 % (+5,5).

Meta con −2★: 25 %. Fuera de ±5 pp: F+3 19,4 % (−5,6); E+2 15,3 % (−9,7), E+3 18,2 % (−6,8); D+2 15,3 % (−9,8), D+3 18,3 % (−6,8), D+4 19,6 % (−5,4); C+2 18,2 % (−6,8), C+3 19,8 % (−5,2), C+4 19,3 % (−5,8), C+5 30,2 % (+5,2); B+2 15,3 % (−9,7), B+3 18,1 % (−6,9); A+2 19,3 % (−5,7), A+3 19,6 % (−5,4); S+2 19,9 % (−5,1) y S+5 11,7 % (−13,3).

## Cierre Q23

La calibración por rango corrige la mayor parte de las referencias y acerca S+5 al objetivo, pero no permite cumplir simultáneamente todas las metas de referencia y las sondas ±2★ con la única palanca autorizada. Se conservan y documentan los cuatro escalones de referencia restantes y las sondas fuera de tolerancia; no se amplía el alcance hacia crecimiento de héroes ni balance de clases. La brecha por clase sigue siendo diagnóstico separado: Caballero 72,3 %, Mago 56,9 %, Pícaro 49,7 %, Clérigo 70,8 %, Berserker 65,6 %.
