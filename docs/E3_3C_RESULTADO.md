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

En la entrega inicial de 3c, `autoPolicy` comparaba el valor esperado de Golpe y Barrido, y contaba la curación limitada por los topes de clase. Se conservó también el bono de guardia perfecta del Berserker como una activación menos de recarga para su siguiente habilidad. La calibración posterior, autorizada por el dueño, queda documentada a continuación; sus resultados reemplazan la recomendación inicial de detenerse.

## Calibración de Clérigo y Berserker

Se hicieron tres corridas de calibración con semilla `13013` y 100 corridas por nivel. Tras la corrección del dueño, la decisión de Berserker se basa solo en Agua, Fuego, Viento y Tierra; Rayo se muestra aparte y no se usó para elegir los bonos. Para comparar, también se filtró la línea base del motor 13 a esos mismos elementos. Las filas por clase agregan las dos armas legales actuales; la tabla por rango usa el arma canónica del comparador.

| Iteración | Clérigo | Berserker | Resultado agregado sin Rayo (victorias / duración vs motor 13) |
|---:|---|---|---|
| 1 | Golpe cura 3 % al acertar; Barrido cura hasta 3 % por uso | Umbral 60 %; bonos originales +20 % Golpe / +10 % Barrido | Clérigo −1,13 pp / −29,06 %; Berserker −6,04 pp / −9,37 % |
| 2 | Mismos topes; `autoPolicy` valora la cura realizada a 1 PV por PV curado | Umbral 60 %; +30 % Golpe / +20 % Barrido | Clérigo −0,65 pp / −28,56 %; Berserker −4,33 pp / −9,59 % |
| 3 | Sin cambios; ya está en el máximo permitido | Umbral 60 %; +50 % Golpe / +30 % Barrido | Solo Berserker: −1,02 pp / −10,22 % |

Clérigo queda dentro de la tolerancia agregada de victorias (2,31 pp), pero su duración no: la mejor corrida queda 28,56 % por debajo de la línea base, pese a usar el máximo de curación permitido. La tarea no autoriza elevar la cura por encima del 3 % ni cambiar otras fuentes de supervivencia; queda como pregunta para el dueño.

Berserker sin Rayo queda dentro de la tolerancia agregada de victorias (2,54 pp), y la duración falla por 0,22 puntos porcentuales. En la comparación por rango, los cambios son: F −1,04 pp; E −1,21; D −1,21; C −0,03; B −0,78; A −0,58; S +3,38; SS +4,27; SSR +4,10. Frente a las tolerancias por rango de `E2_RESULTADO.md` (piso + 2 pp), SSR excede su límite de 2,64 pp. No se hicieron bonos por rango porque exceden los controles autorizados.

El informe elemental de 3c registró Berserker/Rayo en −12,16 pp frente a motor 13 antes de esta calibración. Rayo no se incluyó en las corridas usadas para decidir los bonos: su estallido de Sobrecarga se recupera en etapa 5. No se volvió a medir Rayo con los bonos provisionales nuevos.

Los artefactos de las tres corridas están en `scripts/baseline/e3-3c-calibration-1.json`, `scripts/baseline/e3-3c-calibration-2.json` y `scripts/baseline/e3-3c-calibration-3-no-rayo.json`. La tercera comparación de línea base se recalculó filtrando exactamente los cuatro elementos simulados; el muestreo de 100 corridas no se alteró.

Resultado: **no se cumplen todos los criterios autorizados**. Los valores quedan como calibración provisional en la rama para auditoría; Q14 en `CRUCE_IAS.md` pide dirección para las brechas que requieren parámetros fuera del alcance acordado.
