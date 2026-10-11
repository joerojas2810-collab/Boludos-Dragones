# E2 — Resultado de la puerta de viabilidad

## E2a: orden de activaciones

Se compararon 10.000 muestras deterministas (semillas derivadas de 13013). Se recorrieron por igual las 25 parejas ordenadas de clases, con velocidades base de sus plantillas, factor de atributo (0,85–1,15) y multiplicadores de estado actuales (0,70–1,24). En cada caso se usaron actionCounts(carry=0) y buildQueue con el orden de tiradas real: una tirada de intención por acción enemiga, luego iniciativa del enemigo y del jugador; el mismo roll se convirtió en progreso inicial mediante 100 × (1 − 0,7 / (roll / velocidad)). La línea base motor 13 presente tiene 225 filas y 10 corridas por nivel.

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

## E2b: balance con temporizadores por activación

Se comparó la matriz completa de 225 celdas con 10 corridas por nivel y las mismas semillas que motor13.json. Un ciclo del prototipo conserva las cuotas de acción de actionCounts; progreso acumulado y el progreso inicial derivado del roll ordenan las ranuras. Cooldowns, estados, reflect, defensa y Quemadura usan relojes por portador con conversiones fraccionales. La simulación reusa step de motor 13 como ejecutor aislado y ajusta los relojes después de cada segmento entre activaciones; combat.ts permanece intacto.

| Iteración | Conversión | Diferencia de winrate por rango | Por clase | Duración | Máx. celda | Resultado |
|---:|---|---|---|---:|---:|---|
| 1 | cd/status/reflect/defend/burn = 1/1/1/1/1 | f: 1.00 pp, e: 1.47 pp, d: 0.06 pp, c: 1.90 pp, b: 0.80 pp, a: 3.29 pp, s: 6.52 pp, ss: 3.71 pp, ssr: 4.80 pp | caballero: 0.73 pp, mago: 1.43 pp, picaro: 3.19 pp, clerigo: 5.56 pp, berserker: 3.97 pp | 3.08 % | 17.50 pp | Falla |
| 2 | cd/status/reflect/defend/burn = 0.7/0.7/0.7/1/0.7 | f: 0.07 pp, e: 3.40 pp, d: 2.80 pp, c: 1.55 pp, b: 2.55 pp, a: 4.80 pp, s: 5.44 pp, ss: 4.58 pp, ssr: 5.17 pp | caballero: 2.18 pp, mago: 3.71 pp, picaro: 3.95 pp, clerigo: 3.82 pp, berserker: 4.68 pp | 0.59 % | 19.00 pp | Falla |
| 3 | cd/status/reflect/defend/burn = 0.5/0.5/0.5/1/0.5 | f: 0.53 pp, e: 4.53 pp, d: 4.17 pp, c: 2.95 pp, b: 3.85 pp, a: 7.33 pp, s: 9.44 pp, ss: 7.82 pp, ssr: 8.87 pp | caballero: 4.05 pp, mago: 5.30 pp, picaro: 5.84 pp, clerigo: 8.31 pp, berserker: 6.81 pp | 0.53 % | 27.78 pp | Falla |

### Celdas más alejadas en la iteración elegida

| Clase / elemento / rango | Diferencia |
|---|---:|
| berserker/fuego/s | 19.00 pp |
| picaro/viento/s | 15.00 pp |
| clerigo/fuego/s | 14.00 pp |
| picaro/rayo/e | 13.33 pp |
| berserker/tierra/d | 12.86 pp |

Duración media motor 13: 26.42 rondas por nivel; prototipo: 26.58 ciclos por nivel. Tolerancias: ±3 pp por rango y clase, ±10 % duración, máximo 15 pp por celda. Resultado final: **ABORTAR** tras las iteraciones permitidas.

### Lectura y limitaciones

La conversión se aplica al final del segmento que resuelve la acción del jugador y las ranuras enemigas hasta su siguiente acción. Por eso, cuando varias activaciones del mismo portador ocurren dentro del segmento, los tics se acumulan después de resolverlo; no se altera el orden interno de step ni sus reglas. Los ciclos de boss y regen que no están en la lista del contrato conservan el comportamiento de motor 13. El prototipo sigue aislado y no debe conectarse sin revisar la recomendación y estas limitaciones.
