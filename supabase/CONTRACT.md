# Contrato SQL <-> Next.js (v1)

Estable. Si cambia algo, se actualiza aquí. Ids de juego = los de `src/lib/game` (en español):
class `caballero|mago|picaro|clerigo`, element `agua|fuego|viento|tierra|rayo`,
rarity `comun|pococomun|raro|epico|legendario`, weapon type `espada|hacha|lanza|arco|baston|daga`,
banner `character|weapon`. Id de personaje = `c-<class>-<element>-<rarity>`, de arma = `w-<type>-<element>-<rarity>` (el SQL los calcula, no confía en el cliente).

## Variables de entorno
| Variable | Dónde | Nota |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente+servidor | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente+servidor | clave publicable (`sb_publishable_...`) o anon legacy |
| `SUPABASE_SERVICE_ROLE_KEY` | SOLO servidor | clave secreta (`sb_secret_...`) o service_role legacy. `import "server-only"` |
| `PIN_PEPPER` | SOLO servidor | `openssl rand -hex 32` |
| `HOUSE_CODE` | SOLO servidor | código de la casa para registrarse (el doc lo llama SIGNUP_CODE) |
| `ADMIN_NAME` | SOLO servidor | nombre que al registrarse recibe `is_admin = true` (se pasa a `create_player`) |

Zona horaria fija: `America/Argentina/Buenos_Aires` (constante en SQL `public.game_tz()`; usar la misma en TS solo para mostrar).

## Cómo se llaman
Todas las funciones: `supabase.rpc(name, args)` con el cliente **service_role** (único rol con `execute`). Los args son los nombres `p_*` exactos. Devuelven `jsonb` (salvo `void`). Un `anon`/`authenticated` recibe `42501 permission denied`.
Errores = excepción con `message` igual al código (supabase-js: `error.message`), SQLSTATE `P0001` salvo `conflict` = `40001`.
Excepción: `join_room`, `auth_*` y `rate_limit_hit` NO lanzan por fallos esperados (devuelven JSON) porque el fallo debe persistir el contador.

## Tablas (lectura de cliente con RLS; escritura NUNCA desde cliente)
`players(id=auth.users.id, name, name_key, best_floor, is_admin, created_at)` (cliente: solo columnas id,name,best_floor) ·
`player_state(player_id, coins>=0, version)` · `gacha_state(player_id, banner, pity 0..30)` ·
`characters(player_id,class,element,rarity,key[gen],stars 0..5,data jsonb)` ·
`weapons(player_id,type,element,rarity,key[gen],stars 0..5,data jsonb)` · `equipment(player_id,character_key,weapon_key)` ·
`fragments(player_id,class,rarity,qty>=0)` · `pulls(player_id,idempotency_key,banner,cost,daily,seed,items,result)` ·
`daily_claims(player_id,day)` · `weekly_seeds(week,seed)` · `weekly_scores(week,player_id,max_floor)` ·
`runs(id,player_id,seed,hero,state,log_len,max_floor,coins_earned,status open|closed|expired)` · `run_submissions(run_id,...)` (nadie) ·
`rooms(id,code,host_id,status open|closed,expires_at,turn_seconds)` · `room_players(room_id,player_id,chips>=0,left_at)` ·
`room_battles(room_id,battle_key,fighter_id,status open|locked|settled,outcome)` · `bets` · `interferences` · `chip_ledger` ·
`game_constants(key,value)` (nadie) · `auth_attempts`, `rate_limit_hits`, `audit_log` (nadie).
Vista `leaderboard(id,name,best_floor)` (authenticated). Realtime: canal privado `room:<rooms.id uuid>`.

## RPC (todas `service_role`)
Perfil / cuentas
- `create_player(p_user uuid, p_name text, p_name_key text, p_is_admin boolean=false)` -> `{player_id}`. Errores: `invalid_name`, `name_taken`. (El usuario de Auth ya fue creado con la API admin; el nombre lo valida zod antes.)
- `get_profile(p_player uuid)` -> `{name,isAdmin,stateVersion,coins,pity:{character,weapon},characters:[{id,classId,element,rarity,stars,data}],weapons:[{id,type,element,rarity,stars,data}],equipped:{charId:weaponId},fragments:{"class:rarity":n},bestFloor}`. `data` es lo que el servidor guardó al ganar el ítem (nombre, stats, rasgos...). `atkBonus` de armas se recalcula en TS con `weaponAtk(rarity,stars,type)` (como `migrate`). Error `player_not_found`.
- `auth_check(p_name_key text, p_ip text)` / `auth_fail(p_name_key, p_ip)` -> `{allowed:bool, reason:'ok'|'wait'|'locked'|'ip_limited', retry_after:int}`. Llamar `auth_check` ANTES de verificar el PIN; `auth_fail` tras PIN malo (también si el nombre no existe). Cliente ve siempre "Nombre o PIN incorrecto"/"Espera un momento".
- `auth_success(p_name_key, p_ip)` -> `{ok:true}` (borra contador del nombre).
- `admin_reset_pin(p_admin uuid, p_name_key text)` -> `{player_id}`; borra bloqueos y audita. Errores `forbidden`, `player_not_found`. Next después cambia la contraseña en Auth.
- `log_audit(p_actor uuid, p_event text, p_detail jsonb='{}')` -> void.
- `rate_limit_hit(p_key text, p_max int, p_window_seconds int)` -> `{allowed:bool, hits:int}` (cuenta y decide; clave libre, p. ej. `pull:<uid>`).
- `game_clock()` -> `{now, day:'YYYY-MM-DD', week:'YYYY-MM-DD(lunes)', tz}`.
- `get_weekly_seed(p_seed bigint)` -> `{week, seed}` (guarda la primera semilla de la semana; el servidor la genera con crypto).

Gacha / colección
- `apply_pull(p_player uuid, p_version int, p_idem text, p_banner text, p_cost int, p_pity int, p_seed bigint, p_daily boolean, p_items jsonb)` ->
  `{replayed:bool, coins, version, pity, refundTotal, results:[{status:'new'|'star'|'refund', id, stars, refund, fragmentGain, fragmentKey|null}]}`.
  `p_items` (1..10): personaje `{"class","element","rarity","data":{...}}`, arma `{"type","element","rarity","data":{...}}`. `p_pity` = pity DESPUÉS de las tiradas (el SQL valida coherencia: sin legendario = pity anterior + n, con legendario 0..n-1). `p_cost` debe igualar el precio esperado (constantes: 150 c/u, 10 tiradas = 1350) o 0 si `p_daily` (1 ítem; una vez por día de la zona fija).
  Idempotente por `(player, p_idem)`: repetida devuelve lo guardado con `replayed:true`. `data` solo se guarda al crear; las estrellas las suma el SQL. Reembolso por duplicado en máx. estrellas: 75 (lo calcula SQL).
  Errores: `conflict`(40001, versión vieja: recargar y reintentar), `insufficient_coins`, `invalid_cost`, `invalid_pity`, `invalid_items`, `already_claimed` (diaria), `player_not_found`.
- `spend_fragments(p_player, p_character_id text)` -> `{stars, fragments}`. Errores `character_not_found`, `max_stars`, `insufficient_fragments`. (3 fragmentos por estrella.)
- `equip_weapon(p_player, p_character_id, p_weapon_id)` -> `{ok:true}` (mueve el arma si estaba en otro héroe). Error `not_owned`.
- `unequip_weapon(p_player, p_character_id)` -> `{ok:true}`.

Runs
- `start_run(p_player, p_character_id text /* NULL = héroe Común al azar */, p_seed bigint, p_hero jsonb)` -> `{run_id}`. Errores `character_not_found`, `run_open` (hay otra abierta de < 6 h; las más viejas se marcan `expired`).
- `save_run_state(p_player, p_run_id uuid, p_state jsonb, p_log_len int, p_max_floor int, p_coins int)` -> `{ok:true}`. Errores `run_not_open`, `state_too_big`.
- `bank_run(p_player, p_run_id uuid, p_coins int, p_max_floor int, p_log jsonb=null, p_verdict text='accepted', p_reason text=null)` -> `{coinsAdded, coins, bestFloor, capped:bool}`. Una sola vez por run; segunda: `duplicate_run`. Inexistente/ajena: `run_not_found`. Tope: monedas <= pisos*120 + 15*pisos*(pisos+1)/2 (tabla `game_constants`), se recorta y audita; piso tope 500.

Salas / fichas
- `create_room(p_player, p_code text)` (código 4 letras A-Z generado en servidor) -> `{room_id, code, expiresAt}`. Errores `invalid_code`, `code_taken` (reintentar con otro), `room_limit` (1 abierta por anfitrión). Expira a las 12 h. Fichas iniciales 100.
- `join_room(p_player, p_code text)` -> `{ok:true, room_id, code, host_id}` o `{ok:false, error:'rate_limited'|'room_not_found'|'room_full'}` (sala cerrada/expirada = `room_not_found`; 10 fallos / 10 min por jugador; máx. 7 jugadores; reentrar permitido).
- `leave_room(p_player, p_room uuid)` -> `{host_id}` (si se va el anfitrión pasa al más antiguo; sala vacía se cierra).
- `close_room(p_player, p_room uuid)`, `set_turn_seconds(p_player, p_room uuid, p_seconds int)` -> `{ok:true}`; solo anfitrión, si no `forbidden`. `p_seconds` 10..120.
- `open_battle(p_room uuid, p_fighter uuid, p_battle_key text)` -> `{battle_id}`; `lock_battle(p_room, p_battle_key)` -> `{ok:true}` (cierra apuestas/interferencias).
- `place_bet(p_room, p_bettor, p_battle_key, p_prediction 'win'|'lose', p_stake int)` -> `{chips}`. Errores `not_member`, `battle_not_found`, `battle_locked`, `self_bet`, `stake_too_low`(<10), `insufficient_chips`, `duplicate_bet`.
- `interfere(p_room, p_from, p_battle_key, p_kind 'stronger_enemy'|'adverse_element')` -> `{cost:30, chips}`. Errores `not_member`, `battle_locked`, `self_interfere`, `insufficient_chips`, `already_interfered`.
- `settle_battle(p_room, p_battle_key, p_outcome 'win'|'lose')` -> `{settled:int, voided:bool}`. Pozo compartido (el que acierta reparte lo perdido); si un lado no tiene apuestas, se devuelven. Segunda llamada: `battle_settled`.

## Auth (lado Next)
Código de la casa inválido = `invalid_house_code` (lo decide Next, no el SQL). Registro: Next verifica `HOUSE_CODE`, crea el usuario con la API admin (`email=<name_key>@players.invalid`, `email_confirm:true`), llama `create_player` (con `p_is_admin = name_key == normalize(ADMIN_NAME)`); si falla, borra el usuario de Auth.

## Rooms flow (0005, v1)
Todas `service_role`, mismos errores-excepción. TS decide (semillas, resultados, siguiente fase); SQL persiste, valida y hace idempotente. Modelo de referencia: `src/lib/game/room.ts` (`advance`, `ROOM_K`). Ids de jugador `p_player`/`p_host`/`p_from` = uuid de `players`. Claves de pelea: `battle_key = "r<ronda>f<piso>:<fighter_uuid>"` (SQL: `room_battle_key(round,floor,fighter)`).

Tablas nuevas (cliente: solo SELECT con RLS de miembro; Realtime las publica): `room_state(room_id,mode nivelado|completo,phase,phase_seq,round 0..5,floor 0..10,round_seed,deadline,round_started_at,night_started_at)` · `room_floor(room_id,round,floor,player_id,door_kind,status picked|fought|skipped|timeout,outcome won|lost|fled|timeout,submitted_at)`; columnas `fight_seed,actions,run_after` NO legibles por clientes. `room_state` se crea sola con cada sala (trigger). Columnas nuevas en `room_players`: `present,last_seen_at,ready,eliminated,active_from_floor,hero_key`; en `room_battles`: `interfered` (público), `void_reason`. `chip_ledger.reason` suma `interfere_comp`, `interfere_refund`, `night_start` (reservado). `room_battles.outcome` suma `void`.
Fases: `lobby, round_setup, floor_intro, doors, betting, fighting, reveal, round_end, coop_boss, night_summary, closed`. Privacidad: `interferences` y filas `interfere*` del ledger solo las ve quien interfirió hasta que la pelea se liquida (reveal). No hay topics Realtime nuevos (siguen `room:<uuid>`).

Estado / flujo
- `set_room_mode(p_player,p_room,p_mode)` -> `{ok,mode}`. `forbidden`, `wrong_phase` (solo lobby), `invalid_args`, `room_closed`, `room_not_found`.
- `choose_hero(p_player,p_room,p_hero_key text)` -> `{ok}`. Fases lobby/round_setup/round_end. `wrong_phase`, `not_member`, `invalid_args`. (La propiedad del héroe la valida Next.)
- `set_ready(p_player,p_room,p_ready bool)` -> `{ok}`. Fases round_setup/betting/round_end.
- `start_round(p_player,p_room,p_seed bigint, p_now=now(), p_setup_seconds=30)` -> estado (`room_state_json`: `{room_id,mode,phase,phase_seq,round,floor,round_seed,deadline,host_id,turn_seconds}`). Solo host, desde `lobby`/`round_end`; ronda+1, `round_setup`. Errores `forbidden`, `wrong_phase`, `not_enough_players` (<2 presentes), `max_rounds`, `invalid_args`, `room_closed`.
- `advance_phase(p_room,p_expected_seq int,p_to_phase text,p_deadline timestamptz,p_now=now(),p_early=false,p_round=null,p_floor=null,p_seed=null,p_fighters jsonb=null)` -> `{advanced:true,state}` | `{advanced:false,reason:'stale'|'not_due',state}`. CAS por `phase_seq`: el primero gana. Transiciones legales: round_setup→floor_intro, floor_intro→doors, doors→betting|reveal, betting→fighting|reveal, fighting→reveal, reveal→floor_intro|round_end, round_end→round_setup|coop_boss|night_summary, coop_boss→night_summary (lobby/closed no pasan por aquí). `p_early=true` = todos terminaron (si no, exige `p_now >= deadline`). Efectos: a `betting` exige `p_fighters=[{"player":uuid,"door_kind":"easy|hard|boss","fight_seed":n}]` (1..7; abre una pelea y fila `room_floor` por cada uno); a `fighting` bloquea apuestas y anula (`void no_fight`, reembolsa todo) las peleas cuyo peleador NO esté en `p_fighters` (array de uuid; null = todos); a `reveal` liquida el piso (`settle_floor`); a `round_setup` exige `p_seed`, ronda+1, resetea `eliminated/active_from_floor`; `p_floor` si se pasa debe ser el esperado. Errores `invalid_transition`, `invalid_args`, `not_member`, `max_rounds`, `room_closed`, `room_not_found`.
- `choose_door(p_player,p_room,p_floor,p_door_kind)` -> `{door_kind,replayed}`. Fase `doors`, piso vigente. Repetir igual = `replayed:true`; distinta = `door_locked`. Errores `wrong_phase`, `wrong_floor`, `not_member`, `not_active` (eliminado o se unió tarde), `invalid_args`. Sin puerta al vencer, el servidor pasa la puerta por defecto en `p_fighters`.
- `submit_floor_result(p_player,p_room,p_floor,p_outcome won|lost|fled|timeout,p_actions jsonb='[]',p_run_after jsonb=null,p_eliminated=false)` -> `{outcome,replayed}`. El resultado lo decide el servidor tras repetir la pelea; el cliente no lo envía. Idempotente (devuelve el primero guardado). Solo en `fighting` y peleas bloqueadas; errores `wrong_phase`, `not_fighting`, `invalid_args`, `room_closed`. Un peleador que no envía queda `timeout` (cuenta como perdida) al liquidar.
- `settle_floor(p_room,p_floor,p_round=null)` -> `{round,floor,battles:[{battle_key,fighter,outcome,void_reason}]}`. Idempotente; ya lo llama `advance_phase`. won→win, lost/timeout→lose, fled→void(fled).
- `place_bet` y `interfere` (0003) sin cambio de firma. `place_interference(p_room,p_from,p_battle_key,p_kind)` = alias de `interfere` (también marca `room_battles.interfered`). Coste 30, una por pelea, secreta hasta liquidar.
- `settle_battle(p_room,p_battle_key,p_outcome 'win'|'lose'|'void',p_void_reason=null)` -> `{settled,voided,comp,interference_refund}`. `void` exige `p_void_reason` `fled|no_fight|room_closed`: devuelve todas las apuestas; el interferir se reembolsa solo en `no_fight`/`room_closed`. Si gana el objetivo interferido: +15 (`interfere_comp`). Acepta solo 4 args con nombre; la versión de 3 args de 0003 se elimina. `battle_settled` si repite.
- `kick_player(p_host,p_room,p_target)` -> `{ok}`; `transfer_host(p_host,p_room,p_to)` -> `{host_id}` (`target_hosts_other_room` si el destino ya es host); `leave_room`/`close_room` mantienen firma y ahora anulan sus peleas abiertas (leave a mitad de pelea = `fled`; close = `room_closed` con reembolso total) y `close_room` pone `room_state.phase='closed'`. Tras echar a alguien, reconectar su Realtime.
- `mark_presence(p_player,p_room,p_present=true)` -> void (latido; `not_member`). `sweep_presence(p_room,p_stale_seconds=10,p_host_grace_seconds=60,p_now=now())` -> `{absent:[uuid],host_id,host_transferred}`; marca ausentes y pasa el host si lleva >60 s ausente. Idempotente: llamar en cada request de la sala.
- `night_summary(p_room)` -> `{phase,round,players:[{player_id,name,chips,max_floor,wins,losses,bet_net,interferences}],awards:{gafe,apostador,saboteador}}`. `max_floor` = piso+3·(ronda−1) solo victorias. Next debe comprobar membresía antes de devolverlo.
Conservación de fichas: `sum(chip_ledger.delta) = sum(room_players.chips)` siempre (el ledger registra reembolsos y compensaciones). Fichas se destruyen solo por: interferir no reembolsado (30) y polvo de división entera; se crean solo por compensación (15).
