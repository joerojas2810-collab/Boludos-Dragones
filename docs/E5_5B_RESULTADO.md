> Historial: describe el motor anterior por rondas; vigente: docs/ideal/

# E5 5b — Escarcha e Impulso en rondas

## Implementación

- `ENGINE_VERSION` sube a 17 para que el replay rechace registros hechos con la semántica v16.
- Explotar Escarcha consume el estado del enemigo. Una vez por enemigo y ronda, reordena las ranuras pendientes elegibles para que ocurran después de la próxima acción del PJ. Con 1–2 cargas mueve una ranura; con 3, hasta dos. No reordena una ranura resuelta, una ranura que ya esté después de la acción del PJ ni una intención fuerte que ya recibió su espera de aviso. Si no hay ranura elegible, consume las cargas sin cambiar la cola.
- Explotar Impulso consume el estado propio. La regla inicial de Q17-B concedía una acción extra con 2+ cargas. Q19 probó exigir 3 cargas y mover esa acción al final de la cola de la ronda; esa es la candidata actual, pendiente de aprobación por balance.
- El bono crítico del Pícaro sobrevive a la activación que lo concede, se consume en el siguiente ataque y expira si esa próxima activación propia es Defender.
- `autoPolicy` valora la acción adicional de Impulso y el daño amenazante que Escarcha mueve detrás de la próxima acción del PJ. La semilla y el orden de las tiradas no cambian; la nueva acción puede consumir las tiradas de combate que le corresponden.
- Sobrecarga conserva el valor de 5a (+40 % de daño básico adicional); no se recalibró aquí.

Las pruebas cubren consumo, movimiento de una y dos ranuras, exclusión de golpe fuerte con espera concedida, límite de 3 acciones y bono del Pícaro. Las cinco habilidades conservan daño, enfriamientos y reglas de 5a.

## Medición

Se ejecutó `scripts/sim-stage3.ts` con semilla 13013 y 100 corridas por nivel. Se usó una sola arma canónica permitida por clase para completar la matriz class × element: Espada, Bastón, Daga, Maza y Mandoble. La salida temporal fue `/private/tmp/e5-5b.json`; no se versionó. El comparador usa `scripts/baseline/motor13.json` y los pisos de ruido de clase en `docs/E2_RESULTADO.md`.

| Elemento | Victorias | Cambio vs motor 13 | Duración vs motor 13 |
|---|---:|---:|---:|
| Agua | 72,74 % | −0,32 pp | −5,79 % |
| Fuego | 70,01 % | +0,13 pp | −6,66 % |
| Viento | 75,01 % | +9,00 pp | −15,72 % |
| Tierra | 59,59 % | +0,99 pp | −11,11 % |
| Rayo | 58,97 % | −1,93 pp | −10,97 % |

| Clase | Cambio de victorias agregado | Límite (piso + 2 pp) | Duración agregada |
|---|---:|---:|---:|
| Caballero | +5,25 pp | 2,18 pp | +1,01 % |
| Mago | +2,31 pp | 2,60 pp | −1,20 % |
| Pícaro | +0,14 pp | 3,23 pp | −2,12 % |
| Clérigo | +0,05 pp | 2,31 pp | −23,74 % |
| Berserker | +0,12 pp | 2,54 pp | −11,36 % |

| Clase | Agua | Fuego | Viento | Tierra | Rayo |
|---|---:|---:|---:|---:|---:|
| Caballero | +2,32 pp | +4,97 pp | +16,73 pp | +1,36 pp | +0,86 pp |
| Mago | +0,92 pp | +1,22 pp | +7,05 pp | +4,06 pp | −1,73 pp |
| Pícaro | −1,21 pp | −1,92 pp | +8,08 pp | −0,53 pp | −3,70 pp |
| Clérigo | −2,83 pp | −2,52 pp | +6,92 pp | −0,36 pp | −0,97 pp |
| Berserker | −0,83 pp | −1,12 pp | +6,22 pp | +0,44 pp | −4,12 pp |

## Resultado y límite

**No pasa el criterio de balance**: 12 de las 25 combinaciones clase × elemento superan su límite de ruido + 2 pp. Viento mejora entre +6,22 y +16,73 pp por clase; Caballero agregado también excede su margen. El mayor delta class × rank es 9,35 pp; duración por clase × rank llega a 28,90 % (principalmente Clérigo). Impulso, al añadir una acción, es el origen más claro de la subida de Viento. El resultado no justifica cambiar el umbral aprobado de 2 cargas dentro de esta tarea; queda para decisión creativa y una iteración de calibración autorizada. La variación de armas no se midió: el resultado usa solo las cinco armas canónicas indicadas.

## Q19-A — calibración conjunta de Impulso y Sobrecarga

Q19 autorizó hasta tres iteraciones rápidas de semilla 13013 y 20 corridas por nivel, seguidas por una confirmación completa de 100 corridas por nivel. Las rápidas usan una arma canónica permitida por clase y cinco rangos (F, D, B, S y SSR); son diagnóstico, no criterio final.

| Iteración rápida | Impulso | Sobrecarga adicional | Viento Δ | Rayo Δ | Agua Δ | Fuego Δ | Tierra Δ |
|---:|---|---:|---:|---:|---:|---:|---:|
| Control Q18 | 2+ cargas; ranura inmediata | +100 % | +12,41 pp | −3,11 pp | −8,73 pp | −0,07 pp | −3,73 pp |
| 1 | 3 cargas; ranura inmediata | +80 % | +8,48 pp | −4,53 pp | −8,73 pp | −0,07 pp | −3,73 pp |
| 2 | 3 cargas; ranura inmediata | +100 % | +8,48 pp | −3,11 pp | −8,73 pp | −0,07 pp | −3,73 pp |
| 3 | 3 cargas; acción al final de la cola | +100 % | +6,92 pp | −3,11 pp | −8,73 pp | −0,07 pp | −3,73 pp |

La tercera variante fue la mejor de las tres para Viento sin empeorar Rayo frente a la segunda. No se hicieron más iteraciones.

### Confirmación completa de la candidata

Comando: `npx tsx scripts/sim-stage3.ts` — semilla 13013, 100 corridas por nivel, ambas armas permitidas por clase (50 combinaciones clase × elemento × arma). Resultado agregado sobre todas las armas:

| Elemento | Cambio de victoria | Cambio de duración |
|---|---:|---:|
| Agua | −0,99 pp | −5,28 % |
| Fuego | −0,51 pp | −6,22 % |
| Viento | +2,89 pp | −12,34 % |
| Tierra | +0,43 pp | −10,64 % |
| Rayo | +0,10 pp | −11,95 % |

Por clase × elemento, los límites son el piso de ruido E2 más 2 pp: Caballero 2,18; Mago 2,60; Pícaro 3,23; Clérigo 2,31; Berserker 2,54.

| Clase | Viento Δ | Viento límite | Rayo Δ | Rayo límite |
|---|---:|---:|---:|---:|
| Caballero | +10,60 pp | 2,18 pp | +8,10 pp | 2,18 pp |
| Mago | +0,99 pp | 2,60 pp | −0,08 pp | 2,60 pp |
| Pícaro | +0,53 pp | 3,23 pp | −3,69 pp | 3,23 pp |
| Clérigo | +3,60 pp | 2,31 pp | +3,31 pp | 2,31 pp |
| Berserker | −1,28 pp | 2,54 pp | −7,14 pp | 2,54 pp |

**No pasa:** quedan fuera de margen Caballero/Viento, Clérigo/Viento y Caballero, Pícaro, Clérigo y Berserker/Rayo. La duración agregada queda dentro de Q14 para Clérigo (−24,14 % frente al límite aceptado de −28,56 %) y Berserker (−10,03 % frente a −10,22 %). El diagnóstico completo también encuentra celdas fuera de margen en otros elementos al combinar ambas armas; en la vista de una arma canónica, Agua, Fuego y Tierra son idénticos a la medición previa a Q19, así que los cambios autorizados no modificaron esas celdas canónicas.

El código conserva como candidata Sobrecarga +100 % adicional e Impulso a 3 cargas con la acción extra al final de la cola; el dueño debe decidir tras auditar el fallo. No se actualizó `ENGINE_VERSION`: Q20 en `CRUCE_IAS.md` pregunta si debe subir a 18, porque Q19 altera el replay de v17. Las salidas están en `/private/tmp/q19-iter1.json`, `q19-iter2.json`, `q19-iter3.json` y `q19-final.json`.
