> Historial: describe el motor anterior por rondas; vigente: docs/ideal/

# Etapa 6b — medición

Medición reproducible, sin ajustar el balance. El preset común es `niveladoHero`: rango D, 0★, nivel 1, sin rasgo, Factor ni equipo. Los simuladores `coop-sim.ts` y `duel-sim.ts` aceptan `--quick` (20 muestras/duelos por celda), `--seed` y `--workers`; el valor completo predeterminado es 200 salas cooperativas y 100 duelos por cruce. La división por workers conserva las semillas y el orden de resultados, como `sim-stage3.ts`.

## Auditoría de simuladores

- `duel-sim.ts` usa `duelRound` del motor actual, ahora cubre la matriz ordenada 25×25 de clase×elemento y reporta victorias, empate, timeout, duración y cinco pares más disparejos. El duelo no tiene Aguante: `Quebrar` está deshabilitado; además `duelRound` no aplica la mecánica de `Interrumpir` ni `Explotar`. Por eso la política de esta medición usa las acciones válidas que el duelo sí resuelve: Básico, Golpe, Barrido y Defender. Incorporar las otras tres requiere cambiar el motor, fuera del alcance de 6b. Ya no quedan referencias a Ataque 2/3 como acciones.
- `coop-sim.ts` usa `autoPolicy` y `step` del motor actual, que seleccionan las cinco habilidades universales y Defender donde corresponda. Antes normalizaba héroes generados al vuelo; ahora emplea el preset exacto, con clase y elemento rotados de forma determinista entre los jugadores. Mide 2–7 participantes.
- `balance.ts` ya usa `autoPolicy` + `startBattle/step` del motor actual; no usa las acciones retiradas Ataque 2/3. Su objetivo es una matriz PvE de clase aliada contra clase enemiga con personajes generados, no el duelo nivelado ni el jefe cooperativo de 6b, así que se conserva sin ampliar ese balance.

## Corrida completa

Duelos: `node --import tsx/esm scripts/duel-sim.ts --workers=2`, semilla 61013; 100 duelos por cada uno de los 625 cruces (62.500 duelos), 5,94 s. Global: 0,09 % empates, 0 % timeout y 7,76 rondas promedio. En los cinco pares más disparejos, A ganó todos sus cruces:

| Cruce (A vs B) | Victorias A/B | Empates | Rondas promedio |
|---|---:|---:|---:|
| Berserker/Fuego vs Berserker/Viento | 100/0 % | 0 % | 5,9 |
| Caballero/Agua vs Caballero/Fuego | 100/0 % | 0 % | 12,2 |
| Caballero/Fuego vs Berserker/Rayo | 100/0 % | 0 % | 8,7 |
| Caballero/Fuego vs Berserker/Viento | 100/0 % | 0 % | 7,4 |
| Caballero/Fuego vs Caballero/Viento | 100/0 % | 0 % | 10,7 |

Cooperativo: `node --import tsx/esm scripts/coop-sim.ts --workers=2`, rango F, semillas 1000–1199; 1,30 s. Daño medio por jugador: 1,88–1,91 unidades de jefe. Por pozo `poolPerPlayer` de 0,8 / 1,0 / 1,2 / 1,4 / 1,7 / 2,0, las victorias fueron:

| Jugadores | 0,8 | 1,0 | 1,2 | 1,4 | 1,7 | 2,0 |
|---:|---:|---:|---:|---:|---:|---:|
| 2 | 98 % | 95 % | 87 % | 78 % | 56 % | 40 % |
| 3 | 99 % | 94 % | 89 % | 77 % | 59 % | 43 % |
| 4 | 100 % | 98 % | 90 % | 82 % | 60 % | 38 % |
| 5 | 100 % | 98 % | 90 % | 83 % | 62 % | 39 % |
| 6 | 100 % | 96 % | 91 % | 83 % | 63 % | 38 % |
| 7 | 100 % | 97 % | 91 % | 84 % | 61 % | 37 % |

Los resultados de las corridas paralelas y secuenciales rápidas coinciden. La corrida completa confirma los extremos observados en los duelos; estas mediciones documentan el estado y no aprueban ajustes de balance. En este entorno `npx tsx` falla al iniciar su canal IPC (`listen EPERM`), por eso se usó `node --import tsx/esm` para lanzar la misma instrumentación.

## Verificación

- `eslint src scripts`: sin errores; quedan dos advertencias preexistentes de `<img>` en `src/components/fx/Vfx.tsx`.
- `tsc --noEmit`: aprobado tras `npx next typegen`, que generó los tipos globales faltantes en `.next` sin cambios en archivos fuente.
- `npx tsx …` también falló al iniciar por el mismo bloqueo IPC del entorno; la ejecución equivalente con `node --import tsx/esm` sí completó ambas mediciones.
