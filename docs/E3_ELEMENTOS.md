# E3 — resultado por elemento

Motor 14 se simuló con semilla 13013 y 100 corridas por nivel en los nueve rangos.
Se evaluaron las dos armas legales de cada clase: 50 combinaciones clase × elemento × arma.
La tabla resume las dos armas; la referencia motor 13 tiene un arma canónica por clase y elemento.
Frente a esa referencia, Rayo cae más en victoria (−6,76 pp) y los cinco elementos duran menos por nivel.
En 3c, Rayo acumula hasta tres cargas de Sobrecarga y perdió el estallido automático; Explotar queda para etapa 5.

La duración se mide en turnos por nivel intentado; la comparación de victoria es diferencia en puntos porcentuales.

| Elemento | Victoria v2 (2 armas) | Victoria motor 13 | Δ victoria | Turnos v2 | Turnos motor 13 | Δ duración |
|---|---:|---:|---:|---:|---:|---:|
| agua | 70,39 % | 73,06 % | -2,66 pp | 21,91 | 25,37 | -13,63 % |
| fuego | 65,95 % | 69,88 % | -3,93 pp | 21,78 | 25,09 | -13,21 % |
| viento | 62,37 % | 66,01 % | -3,64 pp | 22,74 | 26,59 | -14,49 % |
| tierra | 54,63 % | 58,59 % | -3,97 pp | 23,27 | 27,53 | -15,46 % |
| rayo | 54,14 % | 60,90 % | -6,76 pp | 23,88 | 28,20 | -15,32 % |

| Clase | Elemento | Victoria v2 (2 armas) | Victoria motor 13 | Δ victoria | Turnos v2 | Turnos motor 13 | Δ duración |
|---|---|---:|---:|---:|---:|---:|---:|
| Caballero | agua | 76,59 % | 75,29 % | +1,31 pp | 28,14 | 28,92 | -2,70 % |
| Caballero | fuego | 73,08 % | 73,19 % | -0,12 pp | 27,86 | 27,79 | +0,23 % |
| Caballero | viento | 68,25 % | 67,03 % | +1,22 pp | 29,64 | 30,25 | -2,02 % |
| Caballero | tierra | 61,08 % | 60,44 % | +0,64 pp | 30,63 | 30,84 | -0,66 % |
| Caballero | rayo | 60,44 % | 60,94 % | -0,50 pp | 31,68 | 31,76 | -0,25 % |
| Mago | agua | 73,36 % | 70,16 % | +3,20 pp | 15,79 | 16,22 | -2,68 % |
| Mago | fuego | 69,18 % | 67,48 % | +1,69 pp | 15,93 | 15,95 | -0,12 % |
| Mago | viento | 63,97 % | 63,05 % | +0,92 pp | 16,36 | 16,52 | -1,00 % |
| Mago | tierra | 58,10 % | 54,83 % | +3,27 pp | 16,57 | 16,68 | -0,68 % |
| Mago | rayo | 56,03 % | 57,96 % | -1,94 pp | 17,05 | 16,74 | +1,82 % |
| Pícaro | agua | 66,89 % | 65,34 % | +1,55 pp | 17,23 | 17,74 | -2,88 % |
| Pícaro | fuego | 62,38 % | 62,64 % | -0,25 pp | 17,41 | 17,71 | -1,70 % |
| Pícaro | viento | 59,75 % | 59,77 % | -0,01 pp | 17,63 | 17,95 | -1,74 % |
| Pícaro | tierra | 51,94 % | 53,61 % | -1,68 pp | 18,04 | 18,02 | +0,06 % |
| Pícaro | rayo | 51,71 % | 56,38 % | -4,66 pp | 18,43 | 18,13 | +1,71 % |
| Clérigo | agua | 67,00 % | 80,32 % | -13,32 pp | 26,40 | 39,68 | -33,48 % |
| Clérigo | fuego | 60,94 % | 75,39 % | -14,45 pp | 25,94 | 40,16 | -35,41 % |
| Clérigo | viento | 58,79 % | 73,14 % | -14,35 pp | 27,48 | 43,41 | -36,71 % |
| Clérigo | tierra | 49,18 % | 63,65 % | -14,47 pp | 28,10 | 46,73 | -39,86 % |
| Clérigo | rayo | 49,63 % | 64,17 % | -14,54 pp | 28,81 | 48,70 | -40,85 % |
| Berserker | agua | 68,14 % | 74,19 % | -6,06 pp | 22,01 | 24,29 | -9,39 % |
| Berserker | fuego | 64,16 % | 70,70 % | -6,54 pp | 21,75 | 23,84 | -8,79 % |
| Berserker | viento | 61,07 % | 67,06 % | -5,99 pp | 22,58 | 24,81 | -9,01 % |
| Berserker | tierra | 52,85 % | 60,44 % | -7,59 pp | 23,03 | 25,36 | -9,22 % |
| Berserker | rayo | 52,90 % | 65,06 % | -12,16 pp | 23,42 | 25,67 | -8,75 % |

Artefacto reproducible: [`scripts/baseline/e3-elementos.json`](../scripts/baseline/e3-elementos.json). Para repetir: compilar `scripts/sim-stage3.ts` con TypeScript local y ejecutar el JavaScript generado con `--runs=100 --seed=13013 --output=scripts/baseline/e3-elementos.json`.
