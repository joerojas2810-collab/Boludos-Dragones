# Resultado 6a-2 — escalera de dificultad

## Método

Se ajustaron los rangos en `--quick` y después se confirmó la candidata con la simulación completa: semilla 13013, 100 corridas por nivel y ruta, nueve rutas y 3.600 intentos por escenario. Comando de confirmación: `node --import tsx scripts/stage-tune.ts --all-routes --workers=4`. Se usó `node --import tsx` porque `npx tsx` falla al abrir su socket local (`EPERM`) en este entorno. La búsqueda rápida se reproduce con `--quick --fit-staircase --fit-runs=2 --all-routes --workers=4`.

## Candidata confirmada

```text
RANK_TUNE F–S = [1,536; 1,482; 1,526; 1,547; 1,611; 1,762; 2,502]
ASC_TUNE +0…+5 = [1,00; 1,26; 1,42; 1,63; 1,64; 1,85]
ROUTE_TUNE = 1,00 para las nueve rutas
LEVEL_STEP = 0,05
```

El factor de ascensión crece estrictamente dentro del rango en los cinco pasos: `1,00 < 1,26 < 1,42 < 1,63 < 1,64 < 1,85`. No se exige monotonía entre rangos. `ENGINE_VERSION` pasa a 21 porque cambió la generación de estadísticas enemigas.

## Victorias

Héroe de referencia con estrellas iguales a la ascensión. Las metas son 70 % en R+0/0★, 60 % en R+n/n★ y 45 % en S+5/5★.

| Rango | +0 | +1 | +2 | +3 | +4 | +5 |
|---|---:|---:|---:|---:|---:|---:|
| F | 66,9 | 59,6 | 60,0 | 54,6 | 56,1 | 54,5 |
| E | 71,3 | 62,4 | 63,6 | 58,4 | 61,7 | 59,9 |
| D | 67,1 | 58,0 | 59,9 | 53,5 | 57,3 | 53,2 |
| C | 73,0 | 64,2 | 65,7 | 63,4 | 64,3 | 61,7 |
| B | 71,9 | 63,2 | 64,6 | 60,6 | 64,1 | 59,8 |
| A | 72,4 | 63,9 | 66,7 | 63,1 | 64,1 | 62,2 |
| S | 68,8 | 60,1 | 63,6 | 61,2 | 60,8 | 57,6* |

*S+5 da 57,6 % frente a 45 % (+12,6 pp). 35 de 42 referencias quedan dentro de ±5 pp; siete quedan fuera, con desviación máxima de −6,8 pp o +12,6 pp en S+5/5★. El héroe con +2★ obtiene 80,5–94,0 % frente a meta 85 %; el héroe con −2★ obtiene 12,5–24,1 % frente a meta 25 % (S+2 y S+3 son 12,5 y 13,2 %). Las metas de estrellas, en particular ±2★ y S+5, no se alcanzan con la curva compartida probada.

La media por clase a través de la escalera fue: Caballero 71,7 %, Mago 56,0 %, Pícaro 49,0 %, Clérigo 70,3 % y Berserker 64,9 %. Respecto de la media global (~62,4 %), cuatro clases superan ampliamente el piso de ruido +2 pp de E2. Por elemento: Agua 67,7 %, Fuego 65,7 %, Viento 64,4 %, Tierra 57,4 % y Rayo 56,6 %; Tierra y Rayo también exceden la tolerancia de diagnóstico. Son desequilibrios de clase/elemento que una dificultad escalar común no corrige.

## Conclusión

La monotonía interna pasa y R+0 queda dentro de ±5 pp para todos los rangos. La candidata **no pasa el criterio completo de balance**: 22 escalones de referencia, las metas de ±2★, S+5/5★ y las tolerancias por clase/elemento quedan fuera. Ajustar más un único `ASC_TUNE` compartido movería juntas las victorias de todos los rangos y no resuelve la diferencia entre S+5/5★ y los otros +5. Se registra Q23 para que el dueño decida si autoriza factores de ascensión por rango o una revisión de progresión de estrellas; 6a-3 sigue adelante según la instrucción.
