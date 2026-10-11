# Resultado 6a-2 — escalera de dificultad

## Método

Se simuló la matriz completa de 42 escalones en las nueve rutas, con el héroe de referencia aprobado, semilla 13013 y 100 corridas por nivel/ruta (3.600 intentos por escenario). La fórmula aplicada es `DIFFICULTY_MULT × RANK_TUNE × ASC_TUNE[asc] × ROUTE_TUNE[route] × (1 + 0,05 × índiceDeNivel)`. Se probaron candidatos dentro de la fórmula y sin añadir reglas. El comando reproducible es `node --import tsx scripts/stage-tune.ts --all-routes --workers=4`; `npx tsx` no pudo iniciar en este entorno porque el socket local de tsx devuelve `EPERM`.

## Candidata medida

```text
RANK_TUNE = { F: 1,411; E: 1,423; D: 1,483; C: 1,600; B: 1,638; A: 1,842; S: 2,622 }
ASC_TUNE  = [1,000; 1,030; 1,060; 1,092; 1,124; 1,157]
ROUTE_TUNE = 1,000 para las nueve rutas
LEVEL_STEP = 0,05
```

La escalera numérica es monótona en los seis cruces: F+5/E+0 `1,633/1,636`; E+5/D+0 `1,893/1,928`; D+5/C+0 `2,231/2,400`; C+5/B+0 `2,777/2,866`; B+5/A+0 `3,317/3,684`; A+5/S+0 `4,262/6,162`. Todas pasan el criterio numérico.

## Resultado contra metas aprobadas

Victorias (%) de referencia por ascensión, con estrellas iguales a la ascensión:

| Rango | +0 (meta 70 %) | +1 a +5 (meta 60 % cada uno) |
|---|---:|---|
| F | 75,2 | 84,4 · 90,3 · 93,4 · 92,9 · 95,1 |
| E | 75,0 | 85,8 · 91,1 · 93,9 · 94,1 · 95,4 |
| D | 70,4 | 84,7 · 90,1 · 93,6 · 93,1 · 95,0 |
| C | 69,4 | 82,4 · 88,9 · 93,0 · 91,9 · 94,6 |
| B | 70,2 | 84,3 · 90,2 · 93,9 · 93,9 · 95,2 |
| A | 68,3 | 80,4 · 89,1 · 92,5 · 92,4 · 94,4 |
| S | 62,6 | 79,9 · 87,7 · 92,6 · 91,8 · 94,6* |

\* S+5 con 5★ tiene meta especial de 45 %: resultado 94,6 %, desviación **+49,6 pp**. En +0, F queda 0,2 pp fuera de la banda de ±5 pp y S queda fuera por 2,4 pp; E–A están dentro. Los otros rangos/ascensiones se alejan hasta +36 pp de su meta de 60 %.

Los escenarios de estrellas ±2 tampoco cumplen: héroe con +2★ (meta 85 %) quedó entre 91,3 % y 98,4 %; héroe con −2★ (meta 25 %) quedó entre 50,9 % y 84,9 %. La distancia creciente a través de ascensiones muestra que un único multiplicador de enemigos no produce la curva aprobada frente al crecimiento de poder por estrellas.

La media de referencia de las 42 celdas fue 87,4 %. Diagnóstico agregado por clase: Caballero +3,8 pp, Mago −2,6, Pícaro −5,4, Clérigo +2,7 y Berserker +1,5 frente al promedio. Contra los límites clase-específicos de E2 +2 pp, Caballero, Pícaro y Clérigo quedan fuera. Diagnóstico por elemento: Agua +2,3 pp, Fuego +2,0, Viento +0,2, Tierra −2,3 y Rayo −2,4; el contrato no fija tolerancia de elemento para esta etapa. `ROUTE_TUNE` permanece neutral: incluso en +0, el rango de victoria entre rutas va de 54,8 % a 84,8 % en distintos rangos; es variación de los jefes existentes, no corregida por multiplicadores.

## Conclusión y bloqueo de diseño

La fórmula y la monotonía están implementadas y comprobadas, pero **6a-2 no pasa el criterio de balance aprobado**. No se pueden declarar compatibles las metas de victoria con los multiplicadores permitidos y el crecimiento actual del héroe: aumentos por ascensión que mantienen al héroe de referencia en 60 % también vuelven demasiado favorable al héroe con +2★, mientras que rebajar la escalera para castigar ese héroe rompe la meta de referencia y la meta de 25 % para −2★. S+5/5★ también queda casi 50 pp por encima de la meta.

No añadí reglas ni cambié metas. Se necesita decisión del dueño en Q22 antes de retocar los factores. La candidata se conserva como evidencia de monotonicidad y del mejor ajuste medido dentro de las restricciones; no se recomienda integrarla como calibración final hasta resolver Q22.
