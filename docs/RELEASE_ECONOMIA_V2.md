# Lanzamiento: equipo y economía v2 (migración 0024)

Orden obligatorio (la base primero, el código después):

1. Supabase > SQL Editor: pegar y ejecutar `supabase/setup.sql` (regenerado, 24 migraciones; seguro de repetir).
   - `0024_economy_v2.sql` hace **un solo reinicio** de `dungeon_clears` (desbloqueos, mejores vidas y ascensiones de todos). Personajes, armas, monedas, partes y pity no se tocan. Una marca en `migration_flags` evita que se repita al volver a ejecutar `setup.sql`.
   - Añade el cofre de primera vez a `bank_run`: primera limpieza de un rango = 4 x monedas de victoria; cada nivel de ascensión nuevo = 2 x (nivel + 1) x monedas de victoria.
2. Security Advisor: revisar que no haya funciones nuevas ejecutables por anon/authenticated (la firma de `bank_run` no cambia, así que el cierre de `0018` sigue vigente; `migration_flags` tiene RLS sin políticas).
3. `git push origin main` (Vercel despliega solo).
4. Probar en producción: empezar el dungeon F con una cuenta (debe estar desbloqueado solo F), limpiarlo y ver las monedas de la primera vez.

Qué cambia para los jugadores
- Equipo: piezas más fuertes, líneas extra por rango (C, A, SS), hitos a 3 y 5 estrellas, sets a 2/4/6 piezas (`gear.ts`, `GEAR_SCALE`).
- Monedas: pago decreciente por runs del día (10 al 100%, hasta 30 al 50%, hasta 60 al 20%, después 10%; sin tope duro), monedas de victoria nuevas, fusión más barata en C a SS.
- Dungeons reiniciados (hay que volver a limpiarlos para desbloquear rangos y ascensiones).

Pruebas: `node supabase/tests/pglite/economy_v2.mjs` (12 comprobaciones), `run.mjs`, `missions.mjs`, `tower.mjs`, `coop.mjs`, `rooms.mjs` pasan. `market.mjs` ya fallaba antes (pruebas viejas de equivalencia de trueque).
