# SQL de Run v2 (pasada final: HECHA en `0030_missions_tower_prizes.sql`)

Resuelto en 0030: `mission_claim` con `SCOPE_TIERS` (el servidor TS tira partes/piezas y SQL las valida), premios por piso y rey diario de la torre, desempate por rondas en `tower_settle`, `bank_run` solo paga monedas. El texto de abajo es el pedido original.

Hecho en `0025`-`0029` (ver cabeceras): campos de héroe/pieza, `dungeon_progress`, `apply_pull` (pity SSR 250), `apply_forge` con tiradas, `burn_*`, `choose_hero_skill`, `start_level`/`bank_level`/`grant_hero_xp`, torre con `rounds`. Falta, y depende de las constantes de `missions.ts` y `tower.ts`:

## Misiones (`mission_claim`, `0023`)
- Reemplazar los premios fijos por `SCOPE_TIERS` (puntos 30/60/90): diaria `{parts 2}`, `{cores 1}`, `250 monedas`; semanal `100 + 3 partes`, `100 + 1 pieza`, `500 + 1 núcleo`; evento `50`, `100`, `400 + 1 núcleo`.
- "partes" = N partes al azar (tipo y rango del dungeon más alto desbloqueado, ver `parts.ts`); "pieza" = 1 pieza con `roll`/`lines` tiradas por el SERVIDOR: la tirada no puede hacerse en SQL, así que `claimMissionService` debe calcular el premio con el rng del servidor y pasarlo como `p_parts`/`p_pieces` (validar con `grant_piece`, ya existe).
- `mission_bump` ya acepta las claves `levels`, `fights`, `bosses`, `dungeon`, `element:<el>` (las envía `finishLevelService` vía `missionDeltas`).

## Torre (`0022`, `tower_settle`)
- Desempate por rondas: `order by max_floor desc, rounds asc, updated_at, player_id` en `tower_settle` (ya está en `tower_state`).
- Premios por piso (`TOWER_FLOOR_PRIZES`: normal 5 monedas, piso 5 = 100 + 1 núcleo, piso 10 = 250 + 1 núcleo; cada piso se cobra una vez por semana) y premio diario `TOWER_DAILY_PRIZE` al #1 de cada ranking (ventana que termina 00:00 UTC). Necesitan tabla de pisos cobrados `(week, mode, player, floor)` y de premios diarios, y llamar desde `tower_record` o un `tower_claim`.
- Quitar/ajustar `TOWER_PRIZES` semanales si el diseño nuevo los reemplaza.

## Otros
- `bank_run` (0024) sigue vivo solo para la torre y para cerrar runs viejas; ya no se le pasa `p_clear`/`p_loot`/`p_parts`. `dungeon_clears` queda sin uso (auditoría). Se puede endurecer `bank_run` para rechazarlos.
- `ENGINE_VERSION` viaja en el json del héroe de `runs`; no hay migración de runs en curso más allá del cierre único de `0026`.
- Tras ejecutar `setup.sql` real: correr `supabase/tests/check_exposure.sql` (0018 va ahora al final del `setup.sql`).
