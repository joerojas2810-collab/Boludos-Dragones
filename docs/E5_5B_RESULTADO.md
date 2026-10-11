# E5 5b — Escarcha e Impulso en rondas

## Implementación

- `ENGINE_VERSION` sube a 17 para que el replay rechace registros hechos con la semántica v16.
- Explotar Escarcha consume el estado del enemigo. Una vez por enemigo y ronda, reordena las ranuras pendientes elegibles para que ocurran después de la próxima acción del PJ. Con 1–2 cargas mueve una ranura; con 3, hasta dos. No reordena una ranura resuelta, una ranura que ya esté después de la acción del PJ ni una intención fuerte que ya recibió su espera de aviso. Si no hay ranura elegible, consume las cargas sin cambiar la cola.
- Explotar Impulso consume el estado propio. Con 2+ cargas añade una ranura del PJ a la cola actual, después de la acción que explotó el estado; como máximo una vez por ronda y sin superar 3 acciones. El Pícaro además obtiene +15 % de probabilidad de crítico para su siguiente ataque.
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
