# Entrega local del estado ideal (2026-10-15)

Rama `ideal-state`, sin push ni operaciones remotas.

## Listo (local, verificado)
- Motor por turnos individuales, 20 habilidades y cuatro botones, recurso 0–3, elementos por consumo, nueve jefes por turno propio, IA de utilidad, tres políticas automáticas (`contextual`, `naive`, `basic`).
- Maestría de clase y selección de habilidades (cliente + `POST /api/loadout` + SQL 0058); validación servidor de skillId, clase, duplicados y bloqueos; replays/rondas de motor viejo rechazados (`engine_outdated`).
- Duelos sobre el mismo motor (turnos alternados, 30 s, preparación 45 s).
- Verificación: `tsc` 0 errores, `eslint` 0 errores, `vitest` 723/723, `next build` OK, PGlite OK (salvo `upgrade.mts`, que necesita un archivo manual `/tmp/old_setup.sql`). Revisión visual rápida en `/prueba` (escritorio y 375 px sin desbordes, sin errores de consola).

## Decisiones tomadas durante la calibración (dentro de los rangos permitidos)
| Cambio | Antes | Ahora | Motivo |
|---|---|---|---|
| Avance, Juicio, Embestida: genera recurso | 1 | 2 | con 1 quedaban dominadas por el Básico (P1,0, +1) |
| Avance P / Rompeguardia P | 0,85 / 1,35 | 0,85 / 1,25 | Caballero 93 % frente a 76 % |
| Juicio P / Consagrar P | 0,85 / 1,30 | 1,05 / 1,65 | Clérigo el más débil |
| Finta P / Remate P (expuesto) | 0,65 / 1,45 (1,75) | 0,80 / 1,80 (2,15) | Pícaro por debajo |
| Pasivo Caballero | −15 % daño | −10 % | brecha de clases |
| Pasivo Clérigo | 0,5 % PV/turno | 0,8 % PV/turno | idem |
Resultado: brecha de clases 17,4 → 8,4 pp (umbral de alerta 10). Con 2–3 semillas por celda hay ruido de ±3 pp.

## Límites conocidos
- La política Básico vence a la contextual con el Mago (84 % frente a 79 %): o el bot infravalora sus habilidades o están flojas. No se afirma balance sin pruebas humanas.
- No se recalibraron la economía, `ROUTE_FIT` ni las escalas de torre/sala con el motor nuevo (la dificultad ya no coincide con las metas de CLAUDE.md anteriores: ~83 % de victoria en jefes de rango D con héroe de referencia 3★).
- `ROOM_K.fightCapMs` = 90 s puede quedarse corto; `grant_starter` excluye Berserker; el reinicio también borra `chip_ledger`, salas y `tutorial`.
- Arte final pendiente (`ART_FALTANTES.md`); los eventos de Quiebre/consumo se muestran como texto sin audio.
- Diversión y claridad no están demostradas: faltan las pruebas humanas del documento 01 §10.
- Mejora menor: Protector y Ritualista ofrecen 4 candidatas (el contrato dice 2–3).
