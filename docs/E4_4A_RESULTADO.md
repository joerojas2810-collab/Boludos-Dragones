# E4 4a — Aguante y Quiebre

## Cambios

- `ENGINE_VERSION` sube a 15. Elite/final otorgan Aguante solo a su líder; los enemigos comunes y escoltas no tienen barra. Los jefes con `bossId` y el Gólem Colosal también reciben Aguante.
- Aguante máximo = 30 % de la vida máxima. Los golpes del PJ restan el 25 % del daño real a vida; Quebrar Aguante usa el 100 % y aplica los ganchos de clase aprobados en §6.2.
- Al llegar a cero, el enemigo recupera Aguante, queda Expuesto (−15 % DEF hasta su siguiente activación) y recibe resistencia por dos activaciones. Quebrar que produce Quiebre cancela la Carga pendiente del Gólem Colosal. Defender conserva la mitigación y guardia perfecta del golpe fuerte.
- Quebrar está activo en combate contra objetivos con Aguante. El selector `attackDisabledReason` ofrece una razón cuando el objetivo elegido no tiene la barra; los duelos lo rechazan porque sus rivales no tienen Aguante. El replay de etapa lo acepta.

## Balance

La auditoría completa usó `scripts/sim-stage3.ts`, seed `13013`, 100 corridas por nivel, 5 clases × 5 elementos × armas legales × 9 rangos: 50 combinaciones y 77.000 intentos por clase. Duró 188,08 s. El resultado reproducible está en [`scripts/baseline/e4-4a.json`](../scripts/baseline/e4-4a.json). La comparación histórica del script usa motor 13; además se contrastó con el artefacto v14 de 3c, con la misma semilla y dimensiones, para aislar mejor el cambio 4a.

| Clase | Victoria v14 | Victoria v15 | Δ v15−v14 | Δ duración media |
|---|---:|---:|---:|---:|
| Caballero | 67,89 % | 67,89 % | 0,00 pp | 0,00 % |
| Mago | 64,12 % | 64,12 % | 0,00 pp | 0,00 % |
| Pícaro | 58,54 % | 58,54 % | 0,00 pp | 0,00 % |
| Clérigo | 57,11 % | 70,65 % | +13,54 pp | +13,10 % |
| Berserker | 59,82 % | 65,44 % | +5,62 pp | −1,20 % |

Los combates comunes no reciben Aguante. En la matriz agregada, Caballero, Mago y Pícaro no cambiaron frente a v14; Clérigo y Berserker sí muestran una variación clara en encuentros con élites/jefes. Sus cambios exceden el piso de ruido registrado para las clases en el contrato E2, así que no se afirma que pasen esa tolerancia: Clérigo mejora su tasa de victoria pero tarda más, mientras Berserker mejora sin alargar los combates. Se mantienen los valores iniciales de 4a y se recomienda revisar estas derivas antes de continuar 4b; no se hizo calibración fuera del alcance de este subpaso.

Contra motor 13, las mayores diferencias absolutas de victoria por clase × rango fueron: Caballero 1,58 pp; Mago 4,60 pp; Pícaro 3,00 pp; Clérigo 6,80 pp; Berserker 2,73 pp. Las mayores diferencias absolutas de duración fueron 3,24 %, 2,83 %, 4,83 %, 36,09 % y 15,42 %, respectivamente. Esta comparación incluye los cambios anteriores de E3; no atribuye esa deriva histórica a 4a.

## Verificación

- Pruebas focales de combate, explicación, replay de etapa y duelo: 60/60 pasaron.
- Suite completa Vitest: 57 archivos, 550/550 pruebas pasaron (una ejecución completa).
- `tsc --noEmit` y `eslint src scripts`: sin errores. ESLint deja dos advertencias preexistentes de `<img>` en `src/components/fx/Vfx.tsx`.
- PGlite de duelos: `19 passed, 0 failed`. No se modificaron SQL ni Supabase.
