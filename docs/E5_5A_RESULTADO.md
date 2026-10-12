# E5 5a — Explotar Quemadura, Ruptura y Sobrecarga

## Implementación

- `ENGINE_VERSION` sube a 16. Explotar consume Quemadura o Ruptura del objetivo, o Sobrecarga del PJ si tiene 3 cargas. Sin un estado elegible, la acción se rechaza y la interfaz explica el requisito. Escarcha e Impulso siguen para 5b; el gancho del Pícaro que consume Impulso también queda diferido a 5b.
- Todas las variantes causan el 40 % del daño del básico por arma (el ATQ del arma ya forma parte del ATQ del PJ). No aplican cargas nuevas. La Quemadura adelanta un tic con el tope `BURN_CAP` y termina; Ruptura prepara el siguiente ataque para ignorar 8 % de DEF por carga, hasta 24 %; Sobrecarga descarga al tener 3 cargas y suma 40 % del básico al daño común.
- El Mago aumenta en 25 % la magnitud del efecto; el Caballero obtiene un escudo de 3 % de vida máxima; el Clérigo cura 3 % con los topes existentes; el Berserker bajo 50 % aumenta en 25 % la Quemadura adelantada. No se alteraron los valores aprobados de Q16-A.
- `autoPolicy` evalúa Explotar si el valor esperado supera el ataque básico. Con Sobrecarga, el daño total es 0,8× el básico antes del crítico (0,4 común + 0,4 de descarga), así que la política no la elige frente a un básico de daño completo. La meta de recuperación de Rayo **no se alcanza con el presupuesto aprobado actual**; queda para la auditoría del dueño, sin ajuste unilateral.

## Simulación

Se corrió `scripts/sim-stage3.ts` con semilla `13013`, 100 corridas por nivel, 5 clases, 5 elementos, armas legales y 9 rangos: 50 filas clase × elemento × arma y 77.000 intentos por clase. Tiempo: 224,14 s. Se muestran dos agregaciones: ambas armas legales para diagnóstico clase × elemento, y un arma canónica por clase para la comparación de balance alineada con motor 13 y el piso E2.

| Elemento | Victoria actual | Motor 13 | Δ victoria | Turnos por nivel | Δ duración |
|---|---:|---:|---:|---:|---:|
| Agua | 74,68 % | 73,06 % | +1,62 pp | 22,59 | −10,97 % |
| Fuego | 69,37 % | 69,88 % | −0,51 pp | 23,53 | −6,22 % |
| Viento | 66,94 % | 66,01 % | +0,93 pp | 23,57 | −11,34 % |
| Tierra | 59,02 % | 58,59 % | +0,43 pp | 24,60 | −10,64 % |
| Rayo | 58,34 % | 60,90 % | **−2,56 pp** | 25,20 | −10,63 % |

En la agregación canónica de un arma por clase, Rayo es **−1,93 pp** respecto de motor 13, con 25,11 turnos frente a 28,20 (−10,97 %). El valor −2,56 pp de la tabla usa ambas armas legales y, por eso, tiene otro denominador.

### Comparación por clase y rango (arma canónica; pisos E2)

| Clase | Victoria actual | Motor 13 | Δ | Piso E2 | Turnos actuales | Δ duración | Evaluación agregada |
|---|---:|---:|---:|---:|---:|---:|---|
| Caballero | 69,58 % | 67,38 % | +2,21 pp | 0,18 pp | 29,96 | +0,17 % | Supera el piso + 2 pp |
| Mago | 64,65 % | 62,70 % | +1,95 pp | 0,60 pp | 16,36 | −0,36 % | Dentro |
| Pícaro | 59,16 % | 59,55 % | −0,39 pp | 1,23 pp | 17,71 | −1,10 % | Dentro |
| Clérigo | 70,95 % | 71,34 % | −0,38 pp | 0,31 pp | 32,77 | −25,08 % | Duración fuera de ±10 % |
| Berserker | 67,22 % | 67,49 % | −0,28 pp | 0,54 pp | 22,16 | −10,65 % | Duración fuera de ±10 % |

La salida reproducible `comparison` contiene además las diferencias por clase y rango. Las diferencias de esta tabla agregan cambios acumulados desde la línea base y no atribuyen causalidad exclusiva a 5a.

Δ de victoria por clase × elemento, en puntos porcentuales frente a motor 13:

| Clase | Agua | Fuego | Viento | Tierra | Rayo |
|---|---:|---:|---:|---:|---:|
| Caballero | +1,41 | +4,53 | +1,71 | +0,94 | +0,42 |
| Mago | +3,32 | +0,38 | +1,27 | +3,51 | −2,44 |
| Pícaro | +1,22 | −3,14 | +0,36 | −1,79 | −4,97 |
| Clérigo | +2,69 | −1,19 | +1,86 | +1,52 | +0,55 |
| Berserker | −0,53 | −3,14 | −0,56 | −2,04 | −6,38 |

Como contexto, el reporte de E3 v14 medía Rayo en −6,76 pp frente a motor 13 con la agregación canónica; v16 queda en −1,93 pp (+4,83 pp acumulados desde v14). En la agrupación de ambas armas, la diferencia es −2,56 pp (+4,20 pp desde v14). La comparación v15→v16, usando el artefacto existente de E4 4a, da Rayo +0,26 pp. Esa diferencia no demuestra que 5a por sí sola haya recuperado el bono: 4a ya había reducido sustancialmente la brecha, y `autoPolicy` no usa la descarga con su valor actual.

Los pisos E2 aprobados son por clase, no por celda clase × elemento. Rayo permanece por debajo de la referencia en total y las celdas de Pícaro y Berserker exceden sus pisos más 2 pp; por tanto, la calibración queda **pendiente de decisión del dueño**. No se comenzó 5b.

## Verificación

- Pruebas focales de combate, autoPolicy y habilidades: 94/94 pasaron.
- PGlite (`node supabase/tests/pglite/run.mjs`): 570 pasaron, 0 fallaron. No se ejecutó SQL contra Supabase.
- La simulación se ejecutó con Node 24 y strip-types, usando un loader temporal local porque `tsx` no está instalado en este checkout; no se añadieron dependencias.
- Verificación final antes del commit: `npx tsc --noEmit --incremental false` pasó; `npx eslint src scripts` tuvo 0 errores (2 advertencias existentes en `Vfx.tsx`); `npx vitest run` pasó con 57 archivos y 562 tests.

## Q18-A — calibración autorizada de Sobrecarga

Se cambió exclusivamente `EXPLOIT_OVERLOAD_DAMAGE_FRACTION`; el daño común de Explotar se mantiene en 40 %, igual que en Q16-A. El total de Explotar con Sobrecarga es, por tanto, 40 % común más la descarga de esta tabla. Cada iteración usa semilla `13013`, 100 corridas por nivel, las cinco armas canónicas permitidas (Espada, Bastón, Daga, Maza y Mandoble) y la comparación de motor 13. Se simularon todas las clases con elemento Rayo; cada celda clase × Rayo contiene 7.700 intentos.

| Iteración | Descarga adicional | Explotar total | Caballero (límite 2,18 pp) | Mago (2,60) | Pícaro (3,23) | Clérigo (2,31) | Berserker (2,54) | Rayo agregado |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Inicial 5b | +40 % | 0,8× | +0,86 pp | −1,73 pp | −3,70 pp | −0,97 pp | −4,12 pp | −1,93 pp |
| 1 | +80 % | 1,2× | +7,22 pp | −0,78 pp | −3,66 pp | +0,90 pp | −5,96 pp | −0,46 pp |
| 2 | +120 % | 1,6× | +9,26 pp | +2,64 pp | −0,75 pp | +2,74 pp | −3,78 pp | +2,02 pp |
| 3 | +100 % | 1,4× | +8,56 pp | +0,81 pp | −2,18 pp | +1,74 pp | −4,81 pp | +0,82 pp |

Un signo positivo o negativo indica cambio frente a motor 13. La meta era que cada celda de clase × Rayo quedara dentro de su piso E2 más 2 pp. Ninguna cifra individual excedió el rango autorizado de +40 % a +120 %. La iteración 3 es el mejor compromiso observado: 3 de 5 clases quedan dentro de su límite (Mago, Pícaro y Clérigo); Caballero excede su margen por 6,38 pp y Berserker queda 2,27 pp por debajo del margen negativo. **La calibración no pasa el criterio de Rayo.** El resultado muestra que un solo multiplicador global favorece demasiado a Caballero mientras no recupera suficiente rendimiento para Berserker.

El candidato conservado es +100 % de descarga adicional (`EXPLOIT_OVERLOAD_DAMAGE_FRACTION = 1.0`), suma total +140 % contando el daño común. En la corrida completa final, Rayo queda en +0,82 pp agregado y duración −12,26 % frente a motor 13. Los deltas de victoria y duración de Agua, Fuego, Viento y Tierra se mantienen, redondeados a dos decimales, en los valores de 5b: −0,32/−5,79 %, +0,13/−6,66 %, +9,00/−15,72 % y +0,99/−11,11 %, respectivamente. Esas desviaciones de Viento y las demás fuera de margen ya estaban presentes en la medición de 5b; la calibración de Sobrecarga no las corrige ni las empeora. Por tanto, el criterio conjunto de balance tampoco queda satisfecho y requiere decisión del dueño antes de cerrar E5.

Las salidas temporales de las iteraciones están en `/private/tmp/e5-q18-iter1.json`, `e5-q18-iter2.json` y `e5-q18-iter3.json`; la matriz completa final está en `/private/tmp/e5-q18-final.json`. No se versionaron.
