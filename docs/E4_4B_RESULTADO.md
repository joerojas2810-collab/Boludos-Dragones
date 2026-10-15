> Historial: describe el motor anterior por rondas; vigente: docs/ideal/

# E4 4b — Canalización e intenciones

## Implementación

- El motor declara las categorías Golpe, Carga, Preparación, Represalia, Canalización y Ataque múltiple. En esta etapa solo Carga y Canalización se usan como intenciones nuevas.
- La Reina Marchita anuncia el ritual como Canalización cada `RITUAL_EVERY` rondas. Mientras la intención siga pendiente, Interrumpir inflige daño bajo y cancela el ritual antes de Ruptura y del recorte de curas. Defender con guardia perfecta continúa siendo una respuesta válida. Fuera de esa ventana, Interrumpir muestra un motivo y el motor rechaza la acción.
- Una intención fuerte que iba a actuar antes de la primera activación del jugador se mueve una sola vez detrás de esa activación. Esto aplica a golpes fuertes, Cargas y Canalizaciones, y da la ventana de decisión definida en `COMBATE_V2.md` §4 sin tiradas nuevas.
- El Rey de Ceniza conserva Presión y su golpe fuerte anunciado. La guardia perfecta lo reduce y apaga la presión acumulada, como antes.
- `autoPolicy` usa Interrumpir ante una Canalización elegible y considera Quebrar para producir un Quiebre oportuno o cancelar una Carga, con la misma regla para las cinco clases.

## Balance sin recalibración

La comparación exacta es contra `scripts/baseline/e4-4a.json` (ENGINE_VERSION 15). La corrida usa seed 13013, 100 corridas por nivel, ascensión 0, héroe de 3★ nivel 20 y equipo de rango igual al héroe; cubre los nueve rangos, cinco elementos y las dos armas permitidas por clase. Se midieron solo Caballero, Mago y Pícaro: 77.000 intentos de nivel por clase, 132,79 s. No se cambiaron sus valores de clase.

| Clase | 4a victoria | 4b victoria | Cambio | 4a turnos medios | 4b turnos medios | Cambio de duración |
|---|---:|---:|---:|---:|---:|---:|
| Caballero | 67,89 % | 68,22 % | +0,33 pp | 29,59 | 29,74 | +0,51 % |
| Mago | 64,12 % | 64,31 % | +0,19 pp | 16,34 | 16,41 | +0,40 % |
| Pícaro | 58,54 % | 58,58 % | +0,04 pp | 17,75 | 17,82 | +0,41 % |

El cambio del Caballero (+0,33 pp) supera su piso E2 de 0,18 pp en 0,15 pp; no se considera que pase esa tolerancia. Mago (+0,19 pp) y Pícaro (+0,04 pp) quedan bajo sus pisos (0,60 y 1,23 pp). La duración cambia menos de 0,6 % en los tres. Se conservan los valores, sin calibrar; conviene vigilar el aumento del Caballero en la siguiente medición. Esta primera corrida reducida quedó complementada con Clérigo y Berserker en la sección siguiente.

## Verificación

- Pruebas focales: combate, policy automática, explicación, replay de etapa e intenciones.
- Suite completa Vitest: 57 archivos, 557/557 pruebas pasaron (una ejecución completa, antes del commit).
- Los diez runners PGlite `.mjs`: todos pasaron, incluyendo `run.mjs` (570/570) y `tutorial.mjs`; `duel.mjs`: 19/19. `upgrade_0044.mts` pasó con Node 24 y su opción de quitar tipos. `forge_v9.mts` y `levels.mts` están preparados con `npx tsx`, pero no se ejecutaron porque `tsx` no está instalado y la descarga requiere red. No se ejecutó SQL contra Supabase.
- `npx tsx` no está instalado y la descarga quedó bloqueada por falta de red. La simulación se ejecutó sin instalar dependencias: un test temporal de Vitest cargó `scripts/sim-stage3.ts` mediante el transformador TypeScript del proyecto; el test y la simulación terminaron correctamente.
- No se ejecutó SQL ni se modificó Supabase.

## Medición complementaria: Clérigo y Berserker

Se completó la matriz que faltaba con `scripts/sim-stage3.ts`: seed `13013`, 100 corridas por nivel, ascensión 0, héroes de 3★ nivel 20 y las dos armas legales de cada clase. Cada clase acumula 77.000 intentos (5 elementos × 2 armas × 77 niveles); la corrida tardó 104,61 s. El resultado reproducible está en [`scripts/baseline/e4-4b.json`](../scripts/baseline/e4-4b.json). Para aislar 4b, se comparó con [`scripts/baseline/e4-4a.json`](../scripts/baseline/e4-4a.json), con la misma semilla y dimensiones; los datos cubren motor 15 en ambos lados.

| Clase | 4a victoria | 4b victoria | Δ victoria | 4a turnos medios | 4b turnos medios | Δ duración | Piso E2 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Clérigo | 70,65 % | 73,10 % | +2,45 pp | 30,93 | 31,30 | +1,22 % | 0,31 pp |
| Berserker | 65,44 % | 65,47 % | +0,03 pp | 22,29 | 22,43 | +0,63 % | 0,54 pp |

| Rango | Clérigo Δ victoria | Δ duración | Berserker Δ victoria | Δ duración |
|---|---:|---:|---:|---:|
| F | +0,63 pp | +0,54 % | −0,13 pp | +0,80 % |
| E | +0,83 pp | +0,92 % | +0,07 pp | +0,47 % |
| D | +1,40 pp | +1,45 % | +0,14 pp | +1,07 % |
| C | +1,17 pp | +1,12 % | −0,72 pp | +0,71 % |
| B | +1,32 pp | +0,74 % | +0,38 pp | +0,66 % |
| A | +3,31 pp | +1,35 % | +0,09 pp | +0,73 % |
| S | +5,26 pp | +2,08 % | +0,44 pp | +0,66 % |
| SS | +3,67 pp | +0,96 % | +0,16 pp | +0,18 % |
| SSR | +2,22 pp | +1,35 % | −0,12 pp | +0,31 % |

La ganancia agregada del Clérigo (+2,45 pp) supera su piso de ruido E2 (0,31 pp); también sube en los nueve rangos, con el máximo en S (+5,26 pp). Su duración apenas aumenta 1,22 %. El Berserker queda estable en agregado (+0,03 pp frente a un piso de 0,54 pp), aunque el rango C baja 0,72 pp; la duración agregada aumenta 0,63 %. Rayo del Berserker varía +0,12 pp y +0,58 % de duración frente a 4a, sin señal destacada frente a sus otros elementos.

La diferencia observada coincide con el cambio de `autoPolicy` que hace que las cinco clases aprovechen Quebrar e Interrumpir. Se informa como deriva de la política automática, no como ajuste del motor o de valores de clase. No se calibró ni se modificó el balance; los datos quedan para revisión antes de decidir si corresponde hacerlo.
