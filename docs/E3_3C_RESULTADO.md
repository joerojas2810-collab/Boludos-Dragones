# E3 3c — resultado y balance

## Cambios entregados

- `Action` y `StageAction` registran Básico, Golpe, Barrido, Quebrar, Interrumpir, Explotar y Defender. El motor y el replay rechazan `attack2` y `attack3` como acciones del jugador; los duelos convierten picks inválidos en Defender. El `attack2` interno que permanece es únicamente el perfil de golpe fuerte telegrafiado por enemigos.
- Se retiraron la habilidad de clase seleccionable y Detonar del perfil, la interfaz de expedición y sus endpoints. Los perfiles antiguos ignoran `skill`; no se cambiaron ni ejecutaron columnas o funciones SQL.
- Se retiró el especial de arma. Cada arma conserva su perfil de básico; el elemento del PJ se aplica a los ataques y estados.
- Golpe y Barrido aplican los ganchos aprobados de `COMBATE_V2.md` §6.2. Las curas y escudos de clase comparten topes de 3 % por activación y 6 % por ronda. Clérigo cura al acertar aunque el escudo absorba el daño.
- Guardia perfecta del Caballero concede una Resolución, que se consume en su siguiente Golpe. Se conserva entre rondas y también funciona en duelo; Barrido no concede la reducción del Caballero en 1v1 porque requiere dos enemigos.
- `autoPolicy` compara el valor esperado de Golpe y Barrido antes de elegir, incluidos sus ganchos, curas y reducción próxima. Quemadura/estados siguen acumulándose; Sobrecarga de Rayo llega a 3 cargas y ya no causa un estallido automático. Explotar continúa deshabilitado hasta etapa 5.

## Medición

Se comparó `ENGINE_VERSION` 14 con `scripts/baseline/motor13.json` (motor 13), usando semilla `13013` y 100 corridas por nivel. La comparación equivalente usa el arma canónica de la línea base por clase (`espada`, `bastón`, `daga`, `maza`, `mandoble`); en la misma corrida se evaluaron además las dos armas legales de cada clase: 50 combinaciones clase × elemento × arma. El artefacto reproducible está en `scripts/baseline/e3-3c.json`; tardó 174,75 s.

| Clase | Victoria línea base | Victoria 3c | Diferencia | Duración media | Máx. Δ victoria por rango | Máx. abs. Δ duración | Piso de ruido |
|---|---:|---:|---:|---:|---:|---:|---:|
| Caballero | 67,38 % | 68,29 % | +0,92 pp | −1,5 % | 1,58 pp | −3,24 % | 0,18 pp |
| Mago | 62,70 % | 64,94 % | +2,24 pp | −1,0 % | 4,60 pp | −2,83 % | 0,60 pp |
| Pícaro | 59,55 % | 59,92 % | +0,38 pp | −1,7 % | 3,00 pp | −4,83 % | 1,23 pp |
| Clérigo | 71,34 % | 55,84 % | −15,50 pp | −37,3 % | 24,74 pp | −50,13 % | 0,31 pp |
| Berserker | 67,49 % | 61,95 % | −5,55 pp | −10,1 % | 8,22 pp | −16,23 % | 0,54 pp |

El resultado **no conserva el balance de la línea base**: las cinco clases exceden su piso de ruido en al menos un rango. Clérigo y Berserker tienen la mayor caída; ambos también exceden la variación de duración de ±10 %. El descenso del Clérigo coincide con retirar Rezo, que curaba 9 % al usarlo, y reemplazarlo por el gancho aprobado de 1 % al acertar; la simulación no justifica cambiar ese porcentaje por cuenta propia. El Berserker también pierde rendimiento pese a su bono bajo 50 % de vida.

| Arma | Victoria | Duración media |
|---|---:|---:|
| Espada | 68,29 % | 29,45 |
| Hacha | 67,48 % | 29,73 |
| Bastón | 64,94 % | 16,27 |
| Varita | 63,31 % | 16,41 |
| Daga | 59,92 % | 17,60 |
| Arco | 57,15 % | 17,89 |
| Maza | 55,84 % | 27,42 |
| Libro | 58,38 % | 27,27 |
| Mandoble | 61,95 % | 22,29 |
| Martillo | 57,70 % | 22,82 |

Las armas dentro de cada clase tienen resultados distintos, pero la matriz completa no elimina la brecha del Clérigo. Los pisos de ruido de E2 son referencias muy estrechas —medidos en el motor anterior—, así que sirven para detectar cambios y no como prueba de que un rediseño deba conservar el mismo winrate.

## Ajustes y recomendación

Los ajustes de la política automática fueron comparar el valor de Golpe y Barrido antes de elegir y contar la curación real permitida por los topes de clase. El bono de guardia perfecta del Berserker también se conservó como una activación menos de recarga para su siguiente habilidad. No se ajustaron los coeficientes de clase aprobados. Recomendación: **detener la calibración de balance aquí y revisar creativamente el coste de supervivencia de Clérigo y Berserker antes de pasar a la siguiente etapa**. Cualquier cambio a la curación del Clérigo contradice el valor aprobado de §6.2, por lo que requiere decisión del dueño del diseño. El resto de la implementación de 3c queda listo para auditoría técnica.
