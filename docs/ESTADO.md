# Estado de traspaso (leer junto con CLAUDE.md)

Última actualización: 2026-10-06, tras publicar en Vercel y añadir salas reales, racha diaria, votación de sala y mercado.

## Hecho y verificado
- Etapas 1-3 jugables (`/prueba` solo admin, `/run`, `/gacha`, `/coleccion`), combate v2 (`ENGINE_VERSION = 2`), pasivos de clase, velocidad, guardia perfecta, habilidad 3, modo rápido, 1-3 enemigos, tooltips, fondos por mundo.
- Producción: https://boludos-dragones.vercel.app (repo GitHub `joerojas2810-collab/Boludos-Dragones`, rama `main`; cada push despliega). 6 variables de entorno cargadas en Vercel. Login con pantalla de título y fondo de montañas (`GameTitle`, `TitleScene`).
- Supabase real con 9 migraciones ejecutadas (`supabase/setup.sql`; 0007 votación + descuento al último, 0008 racha diaria, 0009 mercado). Interruptores de Supabase (registro, confirmar email, canales públicos) apagados. Cuenta admin "Pol".
- Salas reales: servidor `/api/rooms/**`, pantallas `/sala`, `/sala/[code]`, demo `/sala/demo`. Polling cada 2 s (5 s en lobby/resumen, 15 s con pestaña oculta); vida de rivales, apuestas ajenas y emotes viajan en el snapshot (vida/emotes en memoria del servidor: pueden fallar con varias instancias). Temporizador por turno, expulsar, premios (`awards.ts`), títulos por noche, votación de piso 3 y 7 (cofre maldito, `vote.ts`), interferir a 20 si eres el último (≥3 jugadores, ≥50 de diferencia).
- Racha diaria (+50 día 3, +100 día 7; `streak.ts`), sonido y sacudida en crítico/guardia perfecta/legendario/jefe, mercado de trueque `/mercado` (una estrella por trueque, solo repetidas, 5 ofertas, 7 días).
- Balance de nivel: `XP_BASE 165`, `XP_GROWTH 1.2`, `UPGRADE_POWER 4.8`, `STORM_POWER 0.8` (Tormenta del Mago bajada de 1.1). Simulación 300 runs: mediana 13-14, p90 ~33; jefe del piso 10 aún mata ~22% al bot "smart".
- 342 tests Vitest, pglite: rooms 271, run 450, market 47.

## Pendiente
1. Probar en vivo con dos cuentas: tirada diaria con racha, sala completa (temporizador, apuestas, votación), `/mercado`. Nada de lo nuevo se ha visto en navegador.
2. Balance: jefe del piso 10 muy letal; p90 aún sobre el objetivo (~30); Tormenta aún no medida contra Escudo arcano por separado; la DEF casi no sirve en pisos profundos.
3. Limitaciones de salas: `missedTurns` no se guarda (turno perdido = timeout, no "2 seguidos = huida"); sin Realtime real; sin pruebas de integración contra Supabase real (`scripts/rooms-smoke.ts` sin ejecutar).
4. Ideas aprobadas por hacer: títulos/apodos persistentes semanales, racha ya hecha. Ideas candidatas: fantasmas de amigos como enemigos, jefe cooperativo con roles y traición, misiones diarias, temporadas con reglas rotativas.
5. Pendientes menores: revisión visual de accesorios y jefes de Tormenta/Cavernas, pantallas de mercader/evento/habilidad en celular; confirmar CSP `unsafe-inline`; vigilar uso de Vercel (Usage).

## Después
Semilla de la semana (pantalla), modo nivelado en la sala (probar), jefe cooperativo, "Crear legendario" (al final), repasar celular.

## Reglas de trabajo vigentes
Ahorro de tokens (CLAUDE.md): `tsc`, `eslint`, `vitest` siempre; simulaciones cortas solo si cambia el balance; pocas capturas; máximo 2 agentes en paralelo con archivos distintos; modelo por tarea. Nunca leer ni imprimir valores de `.env.local`. Push a `main` despliega: antes ejecutar `setup.sql` en Supabase si hay migraciones nuevas.
