# API de salas (v1) — contrato servidor <-> cliente

Tipos y esquemas zod: `src/lib/rooms/api.ts` (respuestas y eventos) y `src/lib/rooms/messages.ts` (peticiones). Todo es JSON, sesión por cookie, `Origin` propio obligatorio en POST. Errores: `{ "error": { "code", "message", "retryAfter?" } }` (códigos en `ROOM_ERROR_CODES`). Toda petición de sala actualiza tu presencia (latido) y barre ausentes; `404/403 not_member` si no eres miembro.

## Endpoints
| Método y ruta | Cuerpo (`messages.ts`) | Respuesta |
|---|---|---|
| POST `/api/rooms` | `createRoomMsg` | `CreateRoomRes` |
| POST `/api/rooms/join` | `joinRoomMsg` | `JoinRoomRes` (reentrar permitido) |
| GET `/api/rooms/{id}` | — | `RoomSnapshot` (resincronizar; úsalo al conectar y tras reconectar) |
| GET `/api/rooms/{id}/run` | — | `RunView` (tu Run autoritativo al INICIO del piso) |
| GET `/api/rooms/{id}/summary` | — | `SummaryRes` (solo `night_summary`/`closed`) |
| POST `/api/rooms/{id}/{type}` | `clientMsg` con `type == {type}` y `room == {id}` | ver abajo |

`{type}`: `leave, start_round, advance, door, submit, bet, interfere, hero, ready, set_mode, set_turn_seconds, kick, transfer_host, close, end_night, start_coop, heartbeat`. Cuerpo máx. 8 KB (`submit`: 200 KB). Respuesta por defecto `ActionRes {ok, state: PhaseView}`; excepciones: `advance` -> `AdvanceRes`; `door` -> `doorRes`; `bet`/`interfere` -> `chipsRes`; `submit` -> `SubmitRes`.

Reglas por fase: ver `can()` en `room.ts`. Cualquiera puede llamar `advance` (con `phaseSeq` que vio) al vencer `deadlineMs` o si todos terminaron; el primero gana, los demás reciben `advanced:false` + estado vigente (`reason: stale|not_due`). Sugerido: esperar `advanceJitterMs(playerId)`.

## Heroe, puertas y pisos (importante para el cliente)
- `hero {heroId}`: id de personaje de tu colección o `"seed_default"` (héroe Común del servidor). Fases lobby/round_setup/round_end. En modo `nivelado` el servidor aplica `normalizeHero`.
- `door {floor, door}`: el `kind` debe estar en `doorsFor(round_seed, floor)` (si no, `invalid_door`). `round_seed` viaja en `GET /run` (`seed`) y en `room_state`.
- **Run por piso.** El servidor guarda tu Run entre pisos. `GET /run` devuelve el Run al inicio del piso (puntos de mejora/reliquia pendientes que no elegiste se resuelven solos con la primera oferta; la oferta de reliquia vigente SÍ la puedes elegir con `{t:"relic"}` como primera acción del log). Tu log de ese piso empieza **desde ese Run**:
  - Pelea: `[relic?] door{i}` (i = índice de la puerta elegida en `doorsFor`) `act/auto/skill... fin pick/skill...`. Se envía con `submit` en fase `fighting`.
  - Cofre/descanso/mercader/evento: `[relic?] door{i} buy/event/leave...`; se envía con `submit` en fase `betting` o `fighting`. Lo que no envíes a tiempo se pierde (el piso cuenta como saltado).
  - `submit {floor, actions}` NO lleva resultado: el servidor repite el log con el motor (ENGINE_VERSION 2, varios enemigos, `target`, `{t:"auto"}`, habilidades) y decide `won|lost|fled|timeout`. Log ilegal/manipulado/incompleto en una pelea = `timeout` (cuenta como derrota) y queda auditado. Idempotente: repetir devuelve lo guardado (`replayed:true`).
  - Si en `fighting` te interfirieron, `RunView.enemyBoost` trae el tipo; aplícalo con `applyEnemyBoost` (`src/lib/game/interference.ts`) al nodo del enemigo antes de pelear o la repetición no coincidirá.
  - Perder/huir: no avanzas de piso en tu Run, pero la sala sí; al empezar el siguiente piso el servidor te alinea (`run.floor` = piso de la sala).
- `bet {fighter, prediction, stake}`: solo en `betting`, mínimo 10, no sobre ti, no sobre eliminados/sin pelea, una por pelea. `interfere {fighter, kind}`: 30 fichas, secreto hasta `reveal`.
- `kick`, `transfer_host`, `set_mode` (solo lobby), `set_turn_seconds`, `close`, `end_night`, `start_round`: solo anfitrión. `start_coop` responde `coop_disabled`.
- `heartbeat {present}`: cada ~5 s mientras la pestaña esté abierta (a los 10 s sin latido eres "ausente").

## Realtime (canal privado `room:<roomId>`)
Servidor -> canal (API REST de broadcast, rol de servicio). Nombre de evento = `payload.type`, ≤ 200 B, validar con `parseServerEvent()`:
- `phase` (`phaseMsg`): tras cada cambio de fase. `seq = phaseSeq`.
- `rank` (`rankEv`): al entrar a `reveal` y `round_end`; `by: "chips"|"floor"`; `r` = primeros 8 caracteres de los uuid, mejor primero.
- `settle` (`settleEv`): una por pelea al liquidar (`reveal`): `{fighter, out: win|lose|void}`.

Cliente -> canal (solo miembros; el resto del estado va por la API): `turn` (`turnMsg`, eventos informativos del peleador, ≤ ~100 B de datos), `emote` (`emoteMsg`, 1 cada 2 s) y presencia. Valida todo con `parseRealtime()`. El estado de verdad (fichas, apuestas, fases) también llega por Postgres Changes (`room_state`, `room_players`, `room_battles`, `bets`, `room_floor`); el canal es solo un espejo rápido: ante cualquier duda, `GET /api/rooms/{id}`.
