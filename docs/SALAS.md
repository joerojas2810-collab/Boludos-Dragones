# SALAS — diseño de la noche de viernes (Etapa 4)

Estado: propuesta para revisar. Sin código. Constantes marcadas `[K]` van en un solo archivo (`lib/game/room.ts`) para ajustarlas tras la primera noche.

## 1. La noche, minuto a minuto

**Min 0-8, lobby.** El anfitrión crea la sala, elige modo (nivelado por defecto), tiempo por turno (30 s) y comparte el código de 4 letras. La gente entra cuando llega; con 2 jugadores ya se puede empezar. Cada uno ve a los demás con su héroe elegido.
**Min 8-28, ronda 1.** 10 pisos, todos en el mismo piso a la vez. Cada piso dura ~2 min: puertas (15 s) → apuestas/interferir (15 s) → peleas (hasta ~75 s) → revelación (10 s). Hay jefe en el piso 5 y en el 10.
**Ronda 2 a 5.** Entre rondas, 3 min de descanso (ranking, premios parciales, la gente que llega se une). Cada ronda tiene semilla nueva y arranca 3 pisos más difícil que la anterior (`offset = 3 × (ronda-1)`, `[K]`).
**Cierre.** Tras la ronda 4 (o a la 2 h 15 min de noche) el anfitrión ve el botón "Jefe final". Jefe cooperativo ~12 min, luego resumen con premios.

Números `[K]`: ronda = 10 pisos **o** todos eliminados **o** tope de 25 min (lo primero). Noche objetivo = 8 lobby + 4 × (20 + 3) + 12 jefe + 5 resumen ≈ 2 h; con 5 rondas, 2 h 30. Para 2 jugadores las peleas terminan antes y la ronda baja a ~15 min; el tope de 25 min solo importa si alguien se cuelga.

Vidas: cada ronda arranca con 3 vidas (como la run). Quien llega a 0 queda **eliminado de la ronda**: sigue viendo, apostando e interfiriendo (lo mantiene en el juego) y vuelve a jugar en la ronda siguiente. Así nadie "se queda sin nada que hacer".

## 2. Máquina de estados de la sala

```
lobby ─start_round─▶ round_setup ─▶ floor_intro ─▶ doors ─▶ betting ─▶ fighting ─▶ reveal ─┐
                       (elegir héroe)  (3 s)       (15 s)   (15 s)    (≤ tope)    (10 s)  │
                          ▲                                                               │
                          │   ┌── piso < 10 y queda alguien vivo ─────────────────────────┘ (floor+1)
                          │   └── fin de ronda ─▶ round_end (3 min) ─┐
                          └──────────────────────────────────────────┤
                                                coop_boss ◀──(host)──┘ ─▶ night_summary ─▶ closed
```

| Fase | Duración | Qué puede hacer cada quien |
|---|---|---|
| lobby | libre | Host: modo, tiempo por turno, iniciar, cerrar. Todos: elegir héroe, salir. |
| round_setup | 30 s | Elegir héroe (clase + personaje de su colección; en nivelado se normaliza). Quien no elige: héroe Común aleatorio de la semilla. |
| floor_intro | 3 s | Nada. Banner con piso, mundo, jefe si toca. |
| doors | 15 s | Cada vivo elige su puerta. Sin elegir = la primera pelea (`easy`). |
| betting | 15 s | Quien NO pelea apuesta/interfiere sobre los que sí pelean. Los que pelean ven quién apostó contra ellos (chismes = diversión). |
| fighting | tope de piso 90 s `[K]` (+30 s en jefe) | Los que pelean juegan; el resto mira. 30 s por turno; al vencer el turno se aplica Defender. |
| reveal | 10 s | Nadie actúa. Se liquidan apuestas, se muestran pagos, premios del piso y ranking. |
| round_end | 3 min | Ver ranking de la ronda, reentrar, host puede iniciar antes si todos pulsan "listo". |
| coop_boss | ≤ 5 min | Todos los conectados pelean contra el mismo jefe (ver §9, fase 2). |
| night_summary | libre | Premios, ranking final de fichas y de piso máximo. |

**Quién avanza.** No hay proceso residente: cualquier cliente llama `POST /api/rooms/[id]/advance` al vencer `deadline` (más un jitter de 0-1 s), o cuando ya terminaron todos. El servidor solo cambia de fase si `phase_seq` coincide y `now() >= deadline` o se cumplió la condición "todos listos" → idempotente; el primero gana, los demás reciben el estado vigente.

**Desconexión.** Presence marca ausente a los 10 s. En `doors` el ausente toma la puerta por defecto; en `fighting` su turno se resuelve con Defender y a los 2 turnos perdidos seguidos la pelea se cierra como `fled` (sin costo de monedas ni vida). Sus fichas se conservan, puede reentrar (`join_room` ya lo permite); vuelve a jugar en el siguiente piso. Ausentes no cuentan para "todos terminaron" ni para el jefe final.
**Se une tarde.** Mientras `phase` ≠ `fighting` entra como espectador y juega desde el **siguiente piso** con las fichas iniciales (100, igual que `join_room` hoy) y los pisos de la ronda que se perdió = 0. En la ronda en curso compite con desventaja pero la desventaja cuenta solo en "piso máximo"; en fichas no.
**Se va el anfitrión.** `leave_room` ya pasa el mando al más antiguo. Si el host solo se desconecta (presence), a los 60 s el servidor transfiere al siguiente presente. El host solo tiene poderes de lobby/round_end; el avance de fases no depende de él.

## 3. Puertas sincronizadas y motor de run

Todos ven las **mismas puertas** (`doorsFor(seed, floor)` es pura) y cada uno elige la suya. Las peleas son idénticas para quien elige el mismo tipo (`enemyFor(seed, floor, kind)` depende solo de seed/piso/tipo; `battleSeed` también). Lo que cambia por jugador es el héroe, su vida y sus reliquias. Efectos: elegir `hard` vs `easy` es riesgo/recompensa y las apuestas se vuelven interesantes (se ve qué puerta tomó cada uno).

- **Semilla.** `round_seed` la genera el servidor (crypto) al iniciar la ronda. `Run` por jugador: `createRun(round_seed, hero)`.
- **Puertas que no son pelea** (cofre, descanso, mercader, evento): se resuelven en `doors` con el motor tal cual (`chooseDoor` → `resolveEvent`/`buyItem`/`leaveNode`). Quien las elige no pelea: no hay apuesta sobre él ese piso. Mercader y evento consumen tiempo: tienen su propio tope en `doors` (extendido a 30 s solo para quien lo abre) y al vencer se aplica `leaveNode`.
- **Reliquias/mejoras pendientes** (`pendingRelic`, `pendingPicks`): se eligen en `reveal` + `floor_intro` (13 s); al vencer, elección aleatoria determinista de la oferta.
- **Perder o huir.** En sala una pelea es un solo intento por piso: perder = −1 vida (`applyBattleResult`), huir = costo de monedas; en ambos el jugador **no avanza ese piso** (su `floor` no sube) pero el piso de la sala sí, y entra al siguiente con `floor` sala-consistente: `run.floor = room_floor` forzado con `nextFloor`. `maxFloor` solo sube con victorias, así el ranking de piso premia a quien gana. Las monedas de la run no se pagan en sala (las fichas son la economía de la noche); XP y subidas de nivel sí.

**Qué guarda el servidor por jugador y piso** (nueva tabla `room_floor`):
`(room_id, round, floor, player_id, door_kind, status[picked|fought|skipped|timeout], fight_seed, interference, actions jsonb[], outcome[won|lost|fled|timeout], run_after jsonb, submitted_at)`. `run_after` es el `Run` serializado tras el piso (es serializable por diseño), así reentrar o recuperarse de un cierre de pestaña es trivial. `actions` es la lista de `RunAction` de la pelea.

**Verificación.** Al terminar una pelea, el cliente envía `{floor, actions}`; el servidor reproduce con `applyRunAction`/`replayRun` desde `run_after` del piso anterior y obtiene el resultado real. Eso decide `outcome` (nunca lo dice el cliente). Si el cliente miente, la repetición no coincide y se marca `timeout`.

## 4. Mirar mientras otros pelean

Un jugador con apuesta quiere ver. Cada peleador emite **eventos por turno**, no cuadros: `{t:"turn", n, actor, kind:"hit|crit|miss", dmg, pHp, eHp}` (≈60 bytes). Los demás ven:
- **Tira de peleas** (siempre visible a la derecha): una fila por peleador con sprite pequeño, barra de vida en texto (`████░░ 62%`), turno, y el rival (clase + elemento). Es lo que necesitan las apuestas; costo casi nulo.
- **Botón "Ver"**: abre una réplica de `BattleArena` en modo solo lectura alimentada por esos eventos (se reconstruye con la semilla y `actions` acumuladas usando el motor; no se transmite el frame). Un solo espectado a la vez.
- **Momento épico**: banner global cuando un peleador mata con crítico o gana con <10% de vida; sale del mismo evento.

Ancho de banda: ~7 jugadores × ~10 turnos × 60 B ≈ 4 KB por piso. Broadcast privado `room:<uuid>`.

## 5. Apuestas e interferir: UX y casos borde

Panel en `betting`: tarjeta por peleador con puerta elegida, **Ganará / Perderá**, monto (10, 25, 50, todo) y total ya apostado en cada lado; botón "Interferir (30)" con dos opciones (enemigo +20 % / elemento adverso). Interferir es secreto hasta `fighting` (el peleador ve el aviso "alguien te la tiene jurada" sin saber quién; la identidad se revela en `reveal`).

| Caso | Regla |
|---|---|
| Solo 2 jugadores | Cada uno apuesta sobre el otro. Si el peleador no tiene a nadie que apueste, no hay pozo; el peleador puede apostar sobre sí mismo? **No** (`self_bet`). Con 2 jugadores el "dado" es el interferir: se vuelve el duelo de la noche. |
| Nadie acierta | `settle_battle` ya devuelve todo si un lado no tiene apuestas. Si apostaron solo perdedores: el pozo pasa a un bote que se **suma a la apuesta del siguiente piso del mismo peleador** (riesgo de complejidad: fase 2). MVP: se devuelve la apuesta. |
| Peleador muere en el piso | `outcome=lose`. Eliminado de la ronda: no se apuesta sobre él hasta la siguiente. |
| Empate (no existe en combate) | `timeout` (tope de piso o desconexión) cuenta como `lose` para apuestas, salvo `fled` que se **anula y devuelve** (nadie ganó ni perdió). |
| Apostador/peleador se desconecta | Apuestas ya hechas siguen en pie. Si el peleador ya está en `fighting` y desaparece, `timeout`. Si cae antes de `betting`, no hay pelea y `lock_battle` + `settle_battle(void)` devuelven todo. |
| Interferir fallida | Si el objetivo huye o muere, igual se cobran los 30; solo se compensan los 15 si gana. |
| Fichas insuficientes | UI deshabilita; el SQL decide (`insufficient_chips`). |

La compensación de 15 al objetivo que gana igual **no existe aún en SQL** (ver §7).

## 6. Ideas baratas (por valor/costo)

1. **Reacciones rápidas** (6 emotes: 😂 🔥 💀 👏 🤡 🍀, broadcast, 1 por 2 s): casi gratis, muy divertido.
2. **Banner "Momento épico"** (crítico mata, victoria con 1 HP): derivado del evento de turno; sin tablas.
3. **Premios de fin de noche** calculados al cerrar: "El Gafe" (más derrotas), "El Apostador" (más fichas ganadas), "El Saboteador" (más interferencias), "El Tanque" (más daño recibido), "Racha" (victorias seguidas). Una consulta SQL.
4. **Ranking de rivalidades**: quién te interfirió más / a quién ganas más apuestas; se alimenta de `interferences` y `bets`.
5. **Apodo del héroe visible** en la tira (el nombre generado ya es gracioso).
6. **Piso "maldito" sorpresa** (1 por ronda, aleatorio por semilla): pelea con modificador extra y pago doble en fichas de apuesta.

## 7. Datos y protocolo en tiempo real

**Autoridad.** Servidor (Route Handlers con service_role) para toda transición y todo movimiento de fichas. Clientes solo envían intenciones. Postgres = verdad; Realtime = espejo rápido.

**Postgres** (ya existe): `rooms`, `room_players`, `room_battles`, `bets`, `interferences`, `chip_ledger`.
**Realtime** (broadcast efímero + presence): reacciones, eventos de turno, ping de presencia. Postgres Changes ya publica `rooms`, `room_players`, `room_battles`, `bets`, `interferences` (0004).

Mensajes (zod-friendly; todos con `v:1`, `room`, `seq`):
- `phase`: `{type:"phase", phase, phase_seq, deadline_ms, round, floor}` — escrito vía tabla `room_state`, el cliente lo recibe por Changes.
- `turn`: `{type:"turn", fighter, n, actor, kind, dmg, pHp, eHp}` — broadcast del peleador; solo informativo.
- `emote`: `{type:"emote", from, id}` — broadcast; límite 1 por 2 s por cliente.
- `presence`: `{player, ready, hero, state}`.

**Idempotencia.** Toda RPC lleva `p_idem` o una clave natural: `battle_key = "r<ronda>f<piso>:<fighter_id>"` (única por sala); `choose_door` y `submit_floor` usan `(room, round, floor, player)` como PK, repetir devuelve lo guardado; `advance` usa `phase_seq`.

**Mapeo a lo existente**

| Elemento | SQL/tabla existente |
|---|---|
| Crear/unirse/salir/cerrar, host y turno | `create_room`, `join_room`, `leave_room`, `close_room`, `set_turn_seconds` |
| Pelea apostable | `open_battle(p_room,p_fighter,p_battle_key)`, `lock_battle` |
| Apuesta / interferir / liquidar | `place_bet`, `interfere`, `settle_battle` |
| Fichas | `chip_ledger`, `room_players.chips` |
| Canal privado | `is_room_topic_member` + políticas de 0004 |

**Falta** (migración `0005_rooms_flow.sql`; todas `service_role`):
```sql
-- estado de la sala
create table room_state (room_id uuid pk references rooms, mode text check (mode in ('nivelado','completo')),
  phase text, phase_seq int, round int, floor int, round_seed bigint, deadline timestamptz);
create table room_floor (room_id uuid, round int, floor int, player_id uuid, door_kind text, status text,
  fight_seed bigint, interference text, actions jsonb, outcome text, run_after jsonb,
  submitted_at timestamptz, primary key (room_id, round, floor, player_id));

start_round(p_player uuid, p_room uuid, p_seed bigint) returns jsonb
advance_phase(p_room uuid, p_expected_seq int, p_now timestamptz default now()) returns jsonb
set_room_mode(p_player uuid, p_room uuid, p_mode text) returns jsonb          -- solo host, solo en lobby
choose_door(p_player uuid, p_room uuid, p_floor int, p_door int) returns jsonb
submit_floor(p_player uuid, p_room uuid, p_floor int, p_actions jsonb, p_outcome text, p_run_after jsonb) returns jsonb
mark_presence(p_player uuid, p_room uuid, p_present boolean) returns void
settle_floor(p_room uuid, p_floor int) returns jsonb   -- settle_battle por cada peleador + compensación
night_summary(p_room uuid) returns jsonb               -- premios y rankings
```
Además: añadir `'interfere_comp'` y `'night_start'` a `chip_ledger.reason`, y que `settle_battle` pague 15 al objetivo si ganó con interferencia (hoy no lo hace); `settle_battle` debe aceptar `p_outcome 'void'` para anular (huida/desconexión).

## 8. Modo nivelado

Función pura nueva `normalizeHero(hero, mode)` (`lib/game/nivelado.ts`):
- Base de clase sin rareza ni estrellas; variación personal comprimida a ±7,5 % (la mitad del ±15 %).
- Bono por rareza y estrellas: `bono = 0,15 × (m − 1) / (2,7 − 1)` con `m = multRareza × (1 + 0,1 × estrellas)`. Común 0★ = 0 %, Épico 3★ ≈ +9 %, Legendario 5★ = +15 %.
- Arma: ATQ plano limitado a +10 % del ATQ base; su elemento sigue valiendo.
- Elemento, rasgos, sprite, marco de rareza y nombre se conservan (estilo, no poder).
- Nivel 1, sin reliquias; durante la ronda suben con las mejoras normales.
Constante `NIVELADO_MAX_BONUS = 0,15`.

## 9. MVP del primer viernes vs después

**MVP (divertido ya):** lobby con código, misma semilla, ronda de 10 pisos sincronizada (puertas + tope por turno 30 s), ranking en vivo (piso y fichas), apuestas simples (ganar/perder, mínimo 10), tira de peleas con vida en vivo, 2 reacciones, resumen final. Modo nivelado fijo (más simple y justo para quien jugó menos). **Después:** interferir con compensación, mirar en detalle ("Ver"), jefe cooperativo, premios, rivalidades, ronda 2+, elección de poder completo, piso maldito.

**Tareas independientes (agentes en paralelo, sin tocar los mismos archivos):**

| # | Agente | Archivos propios | Entrega |
|---|---|---|---|
| A | Lógica pura | `src/lib/game/room.ts`, `nivelado.ts`, `roomFloor.ts` (+ tests) | Constantes `[K]`, `normalizeHero`, `applyDefaultDoor`, `settlePool`, reducers de fase puros (`nextPhase(state, now)`), `RoomState`/`RoomMsg` tipos y esquemas zod. Sin React ni Supabase. |
| B | SQL | `supabase/migrations/0005_rooms_flow.sql`, `supabase/tests/rooms_flow.sql`, actualizar `CONTRACT.md` | Tablas y RPC de §7. |
| C | Servidor | `src/app/api/rooms/**`, `src/lib/supabase/rooms.ts` | Route Handlers (`create`, `join`, `door`, `submit`, `advance`, `bet`, `interfere`); validan con zod de A, llaman RPC de B, repiten la pelea con `replayRun`. Usa un `RoomStore` (interfaz) para poder fingirlo. |
| D | UI | `src/app/sala/**`, `src/components/{Lobby,FightStrip,BetPanel,RoomRanking,EmoteBar}.tsx`, `src/lib/useRoom.ts` | Pantallas de sala, tira de peleas, reutiliza `BattleArena` y `ActionPanel` sin modificarlos (el wrapper en `sala/` los usa). |
| E (fase 2) | Jefe coop e interferir en motor | cambios en `run.ts`/`combat.ts` | `enemyFor(..., boost?)` y modificador de elemento adverso; jefe cooperativo con pozo de vida compartido. Único que toca motor. |

Orden: A y B en paralelo → C (depende de ambos) → D (usa tipos de A y la API de C, con un `FakeRoomStore` hasta que C esté listo) → E.

**Pruebas sin Supabase:** C y D usan `FakeRoomStore` (en memoria, mismas reglas: fichas, fases, `phase_seq`). Vitest: reducers de fase, liquidación de apuestas (pozo, devolución, anulación), normalización, desconexión (turnos perdidos), unión tardía y traspaso de host. Un test "noche de 3 jugadores" avanza 10 pisos con acciones scripteadas y comprueba fichas sumando constante.
**Humo manual con 2 navegadores** (A = host, B = otro perfil/incógnito): (1) A crea sala, B entra con el código. (2) A inicia; ambos ven el mismo piso 1 y las mismas puertas. (3) B elige `hard`, A `easy`; B ve a A en la tira. (4) A apuesta 20 a que B pierde; B pierde a propósito. (5) Verificar fichas: A +apuesta, B igual, total constante. (6) Cerrar la pestaña de B en plena pelea: A sigue sin esperar. (7) Reabrir B: vuelve al siguiente piso. (8) A sale: B es host.

## 10. Riesgos y preguntas

1. **Desfase de piso por derrota.** Recomendado: la sala avanza el piso aunque el jugador pierda (no se espera a nadie) y el ranking de piso cuenta solo victorias.
2. **Dureza de rondas de 10 pisos.** Los pisos 1-10 de una run se ganan fácil con héroes buenos; recomendado empezar con el offset de +3 por ronda y medir.
3. **Tope de 90 s por piso.** Puede cortar peleas largas (Clérigo vs Clérigo). Recomendado 90 s con +30 s en jefes; `timeout` cuenta como `lose`.
4. **¿Elegir héroe por ronda o fijo para la noche?** Recomendado: elegir por ronda (variedad y gacha de la semana importa).
5. **Interferir secreto vs público.** Recomendado: secreto hasta el reveal (más risas, más drama).


## 10. Premios de fin de noche y ayuda al último (hecho)

Premios (`lib/game/awards.ts`, `computeAwards`): Oráculo (mejor neto apostando), Mecenas (peor neto), Saboteador (más interferencias lanzadas), Gafe (más derrotas), Intocable (victorias sin derrotas), Escalador (piso máximo), Rey de las Fichas. Reparto: se prioriza a quien menos premios lleva; tope `maxAwardsPerPlayer` = 2 `[K]`; con 2 a 7 jugadores. Pendiente (el servidor aún no guarda el dato, `night_summary` solo da wins/losses/bet_net/interferences): Blanco Favorito (interferencias recibidas), Mártir (muertes), Valiente (victorias con poca vida), Gafe de las Apuestas (apuestas perdidas). Ya están en la lógica como campos opcionales (`interfered`, `deaths`, `braveWins`, `betsLost`): se activan solos cuando el resumen los incluya.

Ayuda al último en fichas: interferir cuesta `interfereCost − catchUpDiscount` = 30 − 10 = 20 si eres el último en fichas, vas al menos `catchUpMinGap` = 50 fichas detrás del líder y hay `catchUpMinPlayers` = 3+ jugadores (`interfereCostFor`). El reembolso al anular usa el costo realmente pagado. Aplicado en el modelo de referencia y en la sala demo; la RPC SQL `interfere` sigue cobrando 30 fijo (pendiente: migración nueva que lea el descuento; hasta entonces el cliente real muestra 30).
