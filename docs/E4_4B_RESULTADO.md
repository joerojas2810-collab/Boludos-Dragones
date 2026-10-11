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

El cambio del Caballero (+0,33 pp) supera su piso E2 de 0,18 pp en 0,15 pp; no se considera que pase esa tolerancia. Mago (+0,19 pp) y Pícaro (+0,04 pp) quedan bajo sus pisos (0,60 y 1,23 pp). La duración cambia menos de 0,6 % en los tres. Se conservan los valores, sin calibrar; conviene vigilar el aumento del Caballero en la siguiente medición. Los datos describen esta corrida reducida y no son una afirmación sobre Clérigo/Berserker.

## Verificación

- Pruebas focales: combate, policy automática, explicación, replay de etapa e intenciones.
- Suite completa Vitest: 57 archivos, 557/557 pruebas pasaron (una ejecución completa, antes del commit).
- PGlite `duel.mjs`: 19/19. El barrido de runners `.mjs` también alcanzó un fallo ajeno a este cambio: `run.mjs` recibe `invalid_items` de `apply_pull`; 4b no modifica SQL. No se ejecutaron migraciones contra Supabase.
- `npx tsx` no está instalado y la descarga quedó bloqueada por falta de red. La simulación se ejecutó sin instalar dependencias: un test temporal de Vitest cargó `scripts/sim-stage3.ts` mediante el transformador TypeScript del proyecto; el test y la simulación terminaron correctamente.
- No se ejecutó SQL ni se modificó Supabase.
