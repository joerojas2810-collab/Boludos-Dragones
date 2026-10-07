# Línea base de balance (v7.0, antes de Run v2)

Medida en la rama `run-v2` (idéntica a `v7.0` salvo documentos), 2026-10-07. Sirve para comparar tras cada fase de [PLAN_RUN_V2.md](PLAN_RUN_V2.md).

## Verificación
- `tsc` (src y scripts): sin errores. `.next-pixel/` (de la rama `design/pixel-art`) da un error ajeno; se ignora.
- `eslint src scripts`: 0 errores, 9 avisos (igual en `v7.0`).
- `vitest`: 449 tests en verde.

## Simulaciones
| Comando | Resultado |
|---|---|
| `npx tsx scripts/balance.ts` (2000 por clase) | Caballero 48,4 · Mago 50,7 · Pícaro 51,3 · Clérigo 49,5 %; 8,7 rondas por pelea |
| `npx tsx scripts/run-sim.ts 100 smart` (run clásica) | mediana piso 18, p10 11, p90 22, p99 25; muertes en jefe 34 %; ~23 min |
| `DUNGEON=c HERO_STARS=3 npx tsx scripts/run-sim.ts 100 smart` | limpia 83 %; ~405 monedas; ~12,7 min |
| `npx tsx scripts/economy-sim.ts` | A (v7.0): 33,5 tiradas el día 1, 17,8/día en régimen · B (propuesta): 31,1 el día 1, 5,2/día en régimen |
