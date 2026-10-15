> Historial: describe el motor anterior por rondas; vigente: docs/ideal/

# Etapa 3b — resultado de la simulación

## Comparación con la línea base

Se comparó la línea base ENGINE 13 (`scripts/baseline/motor13.json`, semilla 13013, 100 corridas por nivel) con 3b sobre la misma semilla, 100 corridas por nivel y la política `autoPolicy`:

```sh
npx tsc scripts/baseline-motor13.ts --outDir /tmp/e3b-sim --module commonjs --moduleResolution node --target es2022 --esModuleInterop --skipLibCheck --types node
node /tmp/e3b-sim/scripts/baseline-motor13.js --runs=100 --seed=13013 --output=/tmp/e3-3b-baseline.json
```

El resultado contiene 225 celdas y coincide exactamente con la referencia: la diferencia agregada de winrate es **0,00 puntos porcentuales en cada rango y clase**, y la duración media cambia **0,00 %**. Todo queda por debajo del piso de ruido de E2.

| Agrupación | Resultado 3b frente a ENGINE 13 |
|---|---:|
| Rango F, E, D, C, B, A, S, SS, SSR | 0,00 pp cada uno |
| Caballero, Mago, Pícaro, Clérigo, Berserker | 0,00 pp cada uno |
| Duración media por nivel | 0,00 % |

La política existente todavía elige las acciones heredadas; 3b las conserva hasta 3c y no altera `autoPolicy`. Por eso esta comparación demuestra ausencia de regresiones en la ruta vigente, pero no mide el efecto de sustituir una acción heredada por Golpe o Barrido. Esa calibración corresponde a la simulación de etapa 3 y debe repetirse al conectar las nuevas opciones a la política/flujo de combate.

No se ajustaron los valores iniciales: Golpe conserva poder 1,8 y precisión 0,9; Barrido conserva poder 0,9 por enemigo vivo y precisión 0,9. Barrido resuelve un impacto por enemigo vivo, por lo que cada objetivo recibe como máximo una aplicación elemental por uso. Los estados que lleva el propio PJ (Impulso de Viento y carga de Rayo) se aplican como máximo una vez por uso de Barrido, aunque golpee a varios enemigos. Quebrar Aguante, Interrumpir y Explotar estado permanecen deshabilitados y exponen su motivo desde `universalSkills.ts`.

## Enfriamientos

La conversión E2 es **0,85 por activación propia**. El temporizador interno es fraccional: un enfriamiento inicial de 2 queda en `2 × 0,85 = 1,70`; se muestra redondeando hacia arriba (`ceil`): 2. Cada activación propia posterior con otra acción resta 0,85, así que la etiqueta pasa a 1 tras una activación y a 0 tras dos. Se puede volver a usar la habilidad en la siguiente activación. Intentar una habilidad deshabilitada o que sigue enfriando no consume una activación. Los enfriamientos heredados mantienen su ciclo por ronda.

## Ejecución

`npx tsx scripts/baseline-motor13.ts --runs=100 --seed=13013 --output=/tmp/e3-3b-baseline.json` no pudo ejecutarse directamente: el proyecto no tiene `tsx` instalado y `npx` no pudo descargarlo (`ENOTFOUND registry.npmjs.org`). Se usó TypeScript local para compilar el mismo script a CommonJS y Node local para ejecutarlo; la simulación terminó y escribió las 225 celdas indicadas arriba.
