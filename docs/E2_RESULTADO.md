# E2 — Resultado de la puerta de viabilidad

## E2a: orden de activaciones

Se compararon 10.000 muestras deterministas (semillas derivadas de 13013). Se recorrieron por igual las 25 parejas ordenadas de clases, con velocidades base de sus plantillas, factor de atributo (0,85–1,15) y multiplicadores de estado actuales (0,70–1,24). En cada caso se usaron actionCounts(carry=0) y buildQueue con el orden de tiradas real: una tirada de intención por acción enemiga, luego iniciativa del enemigo y del jugador; el mismo roll se convirtió en progreso inicial mediante 100 × (1 − 0,7 / (roll / velocidad)). La línea base motor 13 presente tiene 225 filas y 100 corridas por nivel.

| Medida | Resultado |
|---|---:|
| Velocidad muestreada | 5.655–14.972 |
| Razón entre velocidades | 1–2.489 |
| Cantidad de activaciones coincide | 10000/10000 (100 %) |
| Reloj libre coincide en cantidad | 9830/10000 (98.3 %) |
| Orden exacto coincide | 9955/10000 (99.55 %) |
| Órdenes distintas | 45/10000 (0.45 %) |

### Desacuerdos por razón de velocidades

| Razón | Casos con orden distinto |
|---|---:|
| < 1,10 | 0 |
| 1,10–<1,50 | 0 |
| 1,50–<2,00 | 0 |
| 2,00–<3,00 | 45 |
| ≥ 3,00 | 0 |

### Ejemplos reproducibles de orden distinto

| PJ (VEL) | Enemigo (VEL) | Motor 13 | Progreso |
|---|---|---|---|
| caballero (6.798) | mago (14.109) | enemy → player → enemy | enemy → enemy → player |
| caballero (11.623) | caballero (5.727) | player → enemy → player | player → player → enemy |
| caballero (6.137) | clerigo (12.437) | enemy → player → enemy | enemy → enemy → player |
| picaro (14.312) | clerigo (6.552) | player → enemy → player | player → player → enemy |
| picaro (6.898) | berserker (14.215) | enemy → player → enemy | enemy → enemy → player |

## Recomendación E2a

Las cuotas actionCounts conservan el número de activaciones; el reloj libre por sí solo difiere en 170 casos y se documenta, porque la nueva API conserva las cuotas del motor mientras progreso inicial del roll ordena las acciones. El desacuerdo restante de orden se reporta como diferencia del planificador por progreso frente al intercalado por rondas del motor 13.

## Piso de ruido del motor 13

Se comparó la muestra de referencia (semilla 13013) con 4 muestras independientes del motor 13, cada una con 100 corridas por nivel (semillas 13014, 13015, 13016, 13017). El piso de ruido es el percentil 95 de las diferencias absolutas agregadas por rango y clase; las tolerancias para E2b son ese piso + 2 pp.

| Rango | Piso ruido | Tolerancia E2b |
|---|---:|---:|
| f | 0.40 pp | 2.40 pp |
| e | 0.66 pp | 2.66 pp |
| d | 1.51 pp | 3.51 pp |
| c | 1.02 pp | 3.02 pp |
| b | 0.40 pp | 2.40 pp |
| a | 3.23 pp | 5.23 pp |
| s | 2.67 pp | 4.67 pp |
| ss | 4.04 pp | 6.04 pp |
| ssr | 0.64 pp | 2.64 pp |

| Clase | Piso ruido | Tolerancia E2b |
|---|---:|---:|
| caballero | 0.18 pp | 2.18 pp |
| mago | 0.60 pp | 2.60 pp |
| picaro | 1.23 pp | 3.23 pp |
| clerigo | 0.31 pp | 2.31 pp |
| berserker | 0.54 pp | 2.54 pp |

## E2b: balance con temporizadores por activación

Se comparó la matriz completa de 225 celdas con 100 corridas por nivel, mismas semillas y mismo perfil de héroes que la primera muestra del motor. Un ciclo del prototipo conserva las cuotas de acción de actionCounts; progreso acumulado y el progreso inicial derivado del roll ordenan las ranuras. Cooldowns, estados, reflect, defensa y Quemadura usan relojes por portador con conversiones fraccionales. La simulación reusa step de motor 13 como ejecutor aislado y ajusta los relojes después de cada segmento entre activaciones; combat.ts permanece intacto.

| Iteración | Conversión | Diferencia de winrate por rango (delta / tolerancia) | Por clase (delta / tolerancia) | Duración | Máx. celda diagnóstica | Resultado |
|---:|---|---|---|---:|---:|---|
| 1 | cd/status/reflect/defend/burn = 1/1/1/1/1 | f: 0.87 pp / 2.40 pp, e: 0.70 pp / 2.66 pp, d: 1.10 pp / 3.51 pp, c: 1.50 pp / 3.02 pp, b: 0.96 pp / 2.40 pp, a: 2.57 pp / 5.23 pp, s: 4.96 pp / 4.67 pp, ss: 4.08 pp / 6.04 pp, ssr: 5.21 pp / 2.64 pp | caballero: 0.61 pp / 2.18 pp, mago: 1.85 pp / 2.60 pp, picaro: 2.51 pp / 3.23 pp, clerigo: 5.64 pp / 2.31 pp, berserker: 3.48 pp / 2.54 pp | 3.07 % | 14.67 pp | Falla |
| 2 | cd/status/reflect/defend/burn = 0.7/0.7/0.7/1/0.7 | f: 0.46 pp / 2.40 pp, e: 2.69 pp / 2.66 pp, d: 2.74 pp / 3.51 pp, c: 2.45 pp / 3.02 pp, b: 2.51 pp / 2.40 pp, a: 4.58 pp / 5.23 pp, s: 6.62 pp / 4.67 pp, ss: 4.73 pp / 6.04 pp, ssr: 4.98 pp / 2.64 pp | caballero: 3.02 pp / 2.18 pp, mago: 3.41 pp / 2.60 pp, picaro: 4.25 pp / 3.23 pp, clerigo: 3.84 pp / 2.31 pp, berserker: 4.78 pp / 2.54 pp | 0.58 % | 13.22 pp | Falla |
| 3 | cd/status/reflect/defend/burn = 0.85/0.85/0.85/1/0.85 | f: 0.14 pp / 2.40 pp, e: 1.27 pp / 2.66 pp, d: 1.07 pp / 3.51 pp, c: 0.65 pp / 3.02 pp, b: 1.27 pp / 2.40 pp, a: 1.82 pp / 5.23 pp, s: 1.46 pp / 4.67 pp, ss: 0.82 pp / 6.04 pp, ssr: 0.59 pp / 2.64 pp | caballero: 1.81 pp / 2.18 pp, mago: 1.43 pp / 2.60 pp, picaro: 1.63 pp / 3.23 pp, clerigo: 1.16 pp / 2.31 pp, berserker: 1.38 pp / 2.54 pp | 2.04 % | 6.67 pp | Pasa |

### Diez celdas más alejadas (diagnóstico; no son criterio)

| Clase / elemento / rango | Diferencia |
|---|---:|
| berserker/fuego/a | 6.67 pp |
| caballero/fuego/s | 6.20 pp |
| clerigo/agua/ssr | 6.08 pp |
| caballero/fuego/ssr | 5.83 pp |
| berserker/fuego/s | 5.60 pp |
| caballero/fuego/a | 5.56 pp |
| picaro/fuego/s | 5.50 pp |
| picaro/viento/e | 5.00 pp |
| berserker/tierra/d | 5.00 pp |
| clerigo/fuego/a | 4.89 pp |

Duración media motor 13: 26.55 rondas por nivel; prototipo: 27.10 ciclos por nivel. Tolerancias: piso de ruido + 2 pp por rango y clase; duración ±10 %. Las celdas se muestran solo como diagnóstico. Resultado final: **CONTINUAR** con conversión {"cooldown":0.85,"status":0.85,"reflect":0.85,"defending":1,"burn":0.85}.

### Lectura y limitaciones

La conversión se aplica al final del segmento que resuelve la acción del jugador y las ranuras enemigas hasta su siguiente acción. Por eso, cuando varias activaciones del mismo portador ocurren dentro del segmento, los tics se acumulan después de resolverlo; no se altera el orden interno de step ni sus reglas. Los ciclos de boss y regen que no están en la lista del contrato conservan el comportamiento de motor 13. El prototipo sigue aislado y no debe conectarse sin revisar la recomendación y estas limitaciones.
