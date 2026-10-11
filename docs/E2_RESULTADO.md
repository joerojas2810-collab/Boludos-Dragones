# E2 — Resultado de la puerta de viabilidad

## E2a: orden de activaciones

Se compararon 10.000 muestras deterministas (semillas derivadas de 13013). Se recorrieron por igual las 25 parejas ordenadas de clases, con velocidades base de sus plantillas, factor de atributo (0,85–1,15) y multiplicadores de estado actuales (0,70–1,24). En cada caso se usaron actionCounts(carry=0) y buildQueue con el orden de tiradas real: una tirada de intención por acción enemiga, luego iniciativa del enemigo y del jugador. El prototipo recibió solo velocidad y progreso, según su contrato. La línea base motor 13 presente tiene 225 filas y 10 corridas por nivel.

| Medida | Resultado |
|---|---:|
| Velocidad muestreada | 5.655–14.972 |
| Razón entre velocidades | 1–2.489 |
| Cantidad de activaciones coincide | 10000/10000 (100 %) |
| Orden exacto coincide | 7642/10000 (76.42 %) |
| Órdenes distintas | 2358/10000 (23.58 %) |

### Desacuerdos por razón de velocidades

| Razón | Casos con orden distinto |
|---|---:|
| < 1,10 | 994 |
| 1,10–<1,50 | 1168 |
| 1,50–<2,00 | 46 |
| 2,00–<3,00 | 150 |
| ≥ 3,00 | 0 |

### Ejemplos reproducibles de orden distinto

| PJ (VEL) | Enemigo (VEL) | Motor 13 | Progreso |
|---|---|---|---|
| caballero (6.001) | picaro (6.401) | player → enemy | enemy → player |
| caballero (11.123) | berserker (12.793) | player → enemy | enemy → player |
| caballero (10.546) | clerigo (12.907) | player → enemy | enemy → player |
| caballero (9.667) | berserker (9.655) | enemy → player | player → enemy |
| caballero (12.526) | mago (11.498) | enemy → player | player → enemy |

## Recomendación: abortar E2 en esta forma

El contrato exige equivalencia exacta de orden en E2a. El planificador por umbrales conserva la cantidad de activaciones, pero no puede reproducir la iniciativa aleatoria del motor 13: su API solo recibe velocidad y progreso, sin la tirada de iniciativa. La diferencia observada excede el criterio de puerta, así que no se calibró E2b ni se ejecutó una comparación de victorias o duraciones. No conectar este prototipo al juego. Para continuar, revisar el contrato para decidir si la iniciativa aleatoria debe formar parte de la API y del modelo de progreso, o si se acepta formalmente un orden distinto.
