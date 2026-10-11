# 6a-3 — Economía por dificultad

## Decisiones aplicadas

- Pago base por nivel F–S: 60, 75, 95, 120, 150, 180 y 210 monedas.
- La ascensión suma 4 % por nivel: +0/+4/+8/+12/+16/+20 %.
- El primer pago completo de cada índice de nivel se comparte entre rutas. Una repetición paga 60 %, con el contador diario común y multiplicadores 100 % (1–20), 50 % (21–40), 20 % (41–80) y 10 % después.
- El cofre se paga una vez por escalón: completo en +0 y al 50 % en +1…+5. Total de los 42 cofres: 43.050 monedas.
- Escamas solo en S: base de 2 por nivel, +10 % por ascensión; el máximo de S+5 es 12 por limpieza completa. Límite diario común: 12. Dado cargado: tirada del 5 % en el jefe final de S, con límite común de 1 al día.
- Las piezas no superan la dificultad de la dungeon. Cofres, primeras limpiezas y materiales no se multiplican por cambiar de ruta.

## Simulación de régimen

`node --import tsx scripts/economy-sim.ts` usa 250 monedas por tirada, 2.250 por diez tiradas, conserva las recompensas diarias actuales modeladas por el simulador (misiones: 454 monedas/día, torre: 50, tirada diaria: 250) y aplica el pago real de repetición en S+5.

| Limpiezas de dungeon al día | Dungeon | Recompensas fijas | Total | Tiradas de 10 equivalentes |
|---:|---:|---:|---:|---:|
| 20 | 3.020 | 754 | 3.774 | 1,68 |
| 30 | 3.780 | 754 | 4.534 | 2,01 |

El objetivo de aproximadamente dos tiradas de diez se alcanza con 30 niveles completados diarios en S+5. Con 20 niveles, el resultado baja a 1,68; por tanto, la meta depende de una actividad diaria alta y no se garantiza a quien juega menos. Las rutas adicionales no elevan esos pagos: los primeros niveles, cofres y contadores son compartidos.

El primer avance por los 42 escalones entrega 66.546 monedas entre pagos de nivel y cofres, una vez en toda la escalera; no forma parte del ingreso de régimen. El total de cofres dentro de esa cifra es 43.050.

## Verificación

- El simulador reproduce 2,01 tiradas de diez equivalentes por día a 30 niveles, y muestra explícitamente el descenso con 20.
- Los tests de progreso y de banca comprueban que una segunda ruta conserva su propio avance, pero recibe pago de repetición y no vuelve a entregar el cofre del escalón.
- PGlite verifica el mismo comportamiento contra `bank_level`, la única fila de `step_clears` compartida y la inicialización del contador diario común.

## Riesgo abierto

La meta de dos diez-tiradas diarias supone completar 30 niveles cada día en el rango máximo. Si el ritmo objetivo real es menor, habría que revisar las recompensas fijas o el pago de repetición; esta implementación no compensa automáticamente la menor actividad.
