# Seguridad de Boludos & Dragones

Documento de diseño defensivo (investigado el 2026-10-05). Es para implementar después de crear Supabase; no hay código aún. Fuentes numeradas al final: [S1], [S2]...

**Idea central:** el navegador es del jugador, así que todo lo que él pueda editar (localStorage, consola, peticiones) es mentira hasta que el servidor lo compruebe. Hoy `profileStorage.ts` guarda monedas en localStorage: sirve para desarrollar, no para la nube. El motor de juego (`src/lib/game`) es puro y determinista, lo que permite **repetir en el servidor** cada run para comprobarla.

## 1. Modelo de amenazas

| Activo | Por qué importa |
|---|---|
| Cuentas (nombre + PIN) | Suplantar a un amigo |
| Monedas, colección, estrellas, pity | Es el progreso de la semana |
| Fichas, apuestas | Rivalidad de la noche; hacer trampa arruina la gracia |
| Rankings (piso máximo, semana, noche) | El motivo de jugar |
| Claves de Supabase | La `secret` salta toda la seguridad |

| Atacante | Qué intenta |
|---|---|
| Amigo curioso con devtools | Editar monedas, mandar piso 99 falso, repetir una tirada, leer filas ajenas |
| Fuerza bruta de PIN | Adivinar 10.000 PIN de un nombre |
| Adivinador de salas | 26^4 = 456.976 códigos |
| Extraño que rasca la web | Listar jugadores, usar la clave pública contra la base |

**Se puede dejar en el cliente:** animaciones, sonido, sprites, vista previa de probabilidades y daño (solo informativo).
**Debe ser autoritativo en servidor:** tiradas, monedas, estrellas, pity, resultado de runs, fichas, apuestas, quién es anfitrión, tiempo (diario/semanal), ranking.

Pecados típicos de apps Supabase: tablas sin RLS, `service_role` expuesta, funciones `security definer` sin control [S12][S2][S5]. OWASP Top 10:2025 pone Broken Access Control primero y Authentication Failures en séptimo [S11]; este diseño ataca esos dos.

## 2. Autenticación: nombre + PIN fijo de 4 dígitos (decisión del usuario)

Un PIN de 4 dígitos tiene 10.000 combinaciones: ningún hash lo protege si alguien obtiene la base (se prueban todas en segundos). Por eso la seguridad descansa en **dos cosas**: (a) límite de intentos en servidor, (b) un secreto "pepper" que **no está en la base de datos**.

**Opciones evaluadas**

| Opción | Veredicto |
|---|---|
| Supabase Auth con email sintético + contraseña derivada con pepper (recomendada) | Sesiones, JWT, RLS y Realtime funcionan sin inventar nada; Supabase guarda bcrypt con sal [S4] |
| Tabla propia con argon2/pgcrypto | Hay que construir sesiones y JWT a mano y RLS/Realtime no ven `auth.uid()`; más código y más riesgo |
| PIN directo como contraseña en Supabase Auth | Mínimo por defecto 6 caracteres [S3-nota]; un PIN de 4 no pasa, y la base filtrada = PIN trivial |

**Diseño recomendado**

1. El navegador **nunca** habla con Supabase Auth para entrar. Llama a `POST /api/auth/login {nombre, pin}` (Route Handler).
2. El servidor normaliza el nombre (`name_key` = minúsculas, sin acentos), valida con zod (nombre 2-16 caracteres, PIN `^\d{4}$`).
3. Contraseña derivada: `HMAC-SHA256(PEPPER, "bd1:" + name_key + ":" + pin)` en hex = 64 caracteres. Esto resuelve el mínimo de contraseña de Supabase y hace que el PIN solo exista en memoria del servidor. El email es sintético: `<name_key>@players.invalid`. Bcrypt acepta hasta 72 bytes [S8]; 64 caben.
4. `PEPPER` solo vive en las variables de entorno de Vercel (y `.env.local`). Nunca en la base ni en el repo. Si se pierde la base pero no el pepper, los PIN siguen a salvo; si se filtran ambos, caen los 10.000 en segundos, por eso el pepper se rota si hay duda (obliga a resetear todos los PIN).
5. Registro: solo con **código de la casa** (`SIGNUP_CODE`, secreto compartido entre los 7 amigos) y con el registro público de Supabase desactivado (panel Auth, "allow new users to sign up" en off; verificar la opción en el panel). El servidor crea al usuario con la API de administración y confirmación de email omitida. Sin esto, cualquiera crea cuentas.
6. Sesión: `@supabase/ssr` guarda cookies `sb-<ref>-auth-token`; en servidor verificar con `getClaims()`, no con `getSession()` ni confiando en la cookie [S7]. Nota honesta: el cliente de navegador necesita leer el token para Realtime, así que la cookie no es httpOnly; se compensa con CSP estricta (sección 6).

**Límites de intentos** (tabla `auth_attempts`, solo servidor; cuenta también nombres que no existen, para que "no existe" y "bloqueado" se vean idénticos y no se pueda listar usuarios [S9]):

| Regla | Valor propuesto |
|---|---|
| Por nombre | 5 fallos: espera 1 min; cada 5 fallos más duplica la espera (hasta 1 h). Contador se borra tras éxito |
| Bloqueo duro por nombre | 20 fallos acumulados: cuenta bloqueada hasta reset por admin. Un atacante logra como mucho 20 de 10.000 intentos = 0,2 % |
| Por IP | 20 fallos en 15 min: 429. Primera capa extra: regla de rate limit de Vercel sobre `/api/auth/*` (IP) [S10] |
| Mensaje | Siempre "Nombre o PIN incorrecto" (o "Espera un momento"), mismo código HTTP y tiempo parecido (hacer el HMAC aunque el nombre no exista) |

El límite por nombre es el importante (OWASP: contar por cuenta, no solo por IP, y espera creciente [S9]). Costo aceptado: un atacante puede bloquear la cuenta de un amigo; se arregla con el reset. Los límites propios de Supabase (150 peticiones/5 min por IP en `/token`) son red de seguridad, no la defensa [S6].

**Recuperación de PIN sin email:** solo la persona con `is_admin` (el dueño del proyecto) puede resetear, nunca "cualquier amigo" (si cualquiera pudiera, cualquiera tomaría cuentas ajenas). Flujo: el amigo lo pide en persona o por voz, el admin ejecuta `POST /api/admin/reset-pin {nombre}` (verifica `is_admin` con `getClaims`) o un script local con la clave secreta; el servidor genera un PIN nuevo aleatorio, limpia bloqueos, registra en `audit_log` y se lo dice al amigo por fuera del juego. El PIN viejo deja de valer. Cambiar PIN estando dentro: pedir el PIN actual [S9].

## 3. Base de datos

Reglas de oro: RLS activado en **todas** las tablas; quitar permisos a `anon` y `authenticated` y devolver solo lo mínimo, porque una tabla sin RLS en un esquema expuesto es legible y escribible por cualquiera [S1]; **ningún cliente escribe** monedas, colección, pity, fichas ni runs: escribe solo el servidor con la clave secreta (rol `service_role`, salta RLS [S2]) a través de funciones.

| Tabla | Lectura por cliente | Escritura |
|---|---|---|
| `players` (id, name, best_floor, is_admin) | Todos los autenticados (ranking) | Solo servidor |
| `player_state` (coins, version) | Solo la propia fila | Solo servidor; `check (coins >= 0)` |
| `gacha_state` (player, banner, pity) | Propia | Solo servidor; pity 0..100 |
| `characters`, `weapons` (class/type, element, rarity, stars 0..5, data jsonb) | Propias (y de compañeros de sala para ver el combate) | Solo servidor; único `(player, class, element, rarity)` |
| `fragments` | Propia | Solo servidor; `count >= 0` |
| `runs` (seed, hero, state jsonb, status, log_len) | Propia | Solo servidor; una sola `open` por jugador |
| `run_submissions` (log, veredicto, motivo) | Ninguna | Servidor (auditoría) |
| `pulls` (seed, resultado, idempotency_key) | Propia | Servidor; único `(player, idempotency_key)` |
| `daily_claims`, `weekly_scores` | Propia / todos | Servidor |
| `rooms`, `room_players` | Solo miembros | Servidor (RPC) |
| `chip_ledger`, `bets`, `interferences` | Miembros de la sala | Servidor; `chips >= 0` |
| `auth_attempts`, `audit_log`, `rate_limit_hits` | Ninguna | Servidor |

Reglas de `security definer`: usar `set search_path = ''` y nombres con esquema [S3]; quitar `execute` a `public`, `anon` y `authenticated` porque toda función es llamable por `/rest/v1/rpc` [S3]; dar `execute` solo a `service_role`; validar propiedad dentro de la función. Las vistas con `security_invoker = on` [S5]. Nunca usar `user_metadata` en políticas [S5]. Indexar columnas de políticas y envolver `(select auth.uid())` [S1].

```sql
-- Adaptar nombres de clase/elemento a los ids reales de TypeScript.
create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 16),
  name_key text not null unique,
  best_floor int not null default 0 check (best_floor >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.player_state (
  player_id uuid primary key references public.players(id) on delete cascade,
  coins int not null default 0 check (coins >= 0),
  version int not null default 0
);
create table public.gacha_state (
  player_id uuid references public.players(id) on delete cascade,
  banner text check (banner in ('character','weapon')),
  pity int not null default 0 check (pity between 0 and 100),
  primary key (player_id, banner)
);
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  class text not null check (class in ('knight','mage','rogue','cleric')),
  element text not null check (element in ('fire','water','earth','lightning','wind')),
  rarity text not null check (rarity in ('common','uncommon','rare','epic','legendary')),
  stars int not null default 0 check (stars between 0 and 5),
  data jsonb not null check (pg_column_size(data) < 4096),
  unique (player_id, class, element, rarity)
);
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  seed bigint not null check (seed between 0 and 4294967295),
  hero jsonb not null, state jsonb, log_len int not null default 0,
  max_floor int not null default 0, coins_earned int not null default 0,
  status text not null default 'open' check (status in ('open','closed','expired')),
  started_at timestamptz not null default now(), finished_at timestamptz
);
create unique index one_open_run on public.runs(player_id) where status = 'open';

-- RLS: denegar por defecto, leer solo lo propio, cero escrituras de cliente.
do $$ declare t text; begin
  foreach t in array array['players','player_state','gacha_state','characters','runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop; end $$;
create policy players_read on public.players for select to authenticated using (true);
create policy state_own on public.player_state for select to authenticated using (player_id = (select auth.uid()));
create policy gacha_own on public.gacha_state for select to authenticated using (player_id = (select auth.uid()));
create policy chars_own on public.characters for select to authenticated using (player_id = (select auth.uid()));
create policy runs_own  on public.runs  for select to authenticated using (player_id = (select auth.uid()));

-- Miembro de sala (evita políticas recursivas [S1]).
create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_players
                 where room_id = p_room and player_id = (select auth.uid()) and left_at is null) $$;
revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

-- Tirada atómica: versión optimista + idempotencia + CHECK de coins >= 0.
create function public.apply_pull(p_player uuid, p_version int, p_idem text, p_banner text,
  p_cost int, p_pity int, p_seed bigint, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.player_state set coins = coins - p_cost, version = version + 1
   where player_id = p_player and version = p_version;     -- sobregiro aborta por CHECK
  if not found then raise exception 'conflict' using errcode = '40001'; end if;
  insert into public.pulls(player_id, idempotency_key, banner, cost, seed, result)
   values (p_player, p_idem, p_banner, p_cost, p_seed, p_result); -- repetida: error 23505
  update public.gacha_state set pity = p_pity where player_id = p_player and banner = p_banner;
  -- aquí: upsert de characters/weapons/fragments desde p_result
end $$;
revoke execute on function public.apply_pull(uuid,int,text,text,int,int,bigint,jsonb) from public, anon, authenticated;
grant  execute on function public.apply_pull(uuid,int,text,text,int,int,bigint,jsonb) to service_role;

-- Realtime privado: solo miembros leen el canal "room:<uuid>" [S13].
create policy room_read on realtime.messages for select to authenticated
using (realtime.messages.extension = 'broadcast'
       and public.is_room_member(nullif(split_part((select realtime.topic()), ':', 2), '')::uuid));
```
Falta (mismo patrón): `rooms`, `room_players` (`chips check >= 0`), `chip_ledger`, `bets`, `interferences`, `daily_claims`, `weekly_scores`, `auth_attempts`, `audit_log`, `pulls`.

## 4. Flujos autoritativos

**Dónde correr la validación:** Route Handler de Next.js en runtime Node (Vercel). Importa `src/lib/game` tal cual, sin mapa de importaciones de Deno. Las Edge Functions de Supabase tienen 2 s de CPU por petición en plan gratis [S14], poco margen para repetir una run larga. Medir el tiempo de repetir una run de piso 40 antes de decidir; los límites de duración de Vercel no se verificaron en esta investigación.

**(a) Tirada**
1. `POST /api/gacha/pull {banner, count, idemKey}` (el cliente genera `idemKey` UUID).
2. Servidor: `getClaims()` → `player_id` (nunca del cuerpo), valida con zod, rate limit.
3. Carga perfil y versión; semilla fresca de `crypto.randomInt`/`randomBytes` (no se envía al cliente); ejecuta `pullCharacter/pullWeapon` existentes con `createRng(seed)`.
4. Llama `apply_pull` en una transacción (versión, débito, pity, ítems, `pulls`). Conflicto de versión: reintentar. `idemKey` repetida: devolver el resultado guardado. Doble clic o repetir la petición no cobra dos veces.

**(b) Run con repetición determinista**
1. `POST /api/run/start {class, characterId}`: el servidor lee el héroe de la base (no confía en el del cliente), **elige la semilla** (o la semanal), crea `runs` abierta. Sin esto el cliente podría fabricar semillas favorables y precalcular.
2. El cliente juega y registra acciones compactas: puerta, ataque 1/2, defender, huir, mejora, reliquia, compra, evento, siguiente piso.
3. En cada fin de piso (y al terminar/abandonar) `POST /api/run/checkpoint {runId, nuevasAcciones}`: el servidor retoma `runs.state` (el `Run` es serializable), aplica las acciones con `createRun/chooseDoor/applyBattleResult/...`; cada función ya rechaza jugadas ilegales (`null`). Límite de tamaño (p. ej. 200 KB) y de acciones.
4. Si una acción es ilegal o el estado diverge, se **corta en la última acción válida** (no se castiga a un jugador legítimo). Monedas y piso son los que calculó el servidor; se ignora lo que diga el cliente.
5. Al cerrar: `update runs set status='closed' where id=$1 and status='open' returning` (una sola entrega por run), tope de monedas por piso, y recién ahí se suman monedas y `best_floor` (`bankRun` movido al servidor).
6. Aviso técnico: `**` (`FLOOR_SCALE ** floor` en `progression.ts`) y `Math.pow` están "aproximados por implementación" y pueden variar entre motores [S15]. Un teléfono con Safari y un servidor V8 podrían diferir en el último bit y volcar un redondeo. Mitigación: tablas precalculadas de potencias (o enteros), y probar logs de ejemplo en Chrome, Safari y Node.

**(c) Salas, apuestas, fichas, interferir**
- `chip_ledger` registra cada movimiento; `room_players.chips` se actualiza en la misma transacción con `for update` y `check (chips >= 0)`.
- Apostar: solo antes de que la pelea esté "bloqueada" por el servidor, no sobre uno mismo, mínimo 10, ≤ fichas, una apuesta por (pelea, apostador).
- Liquidar: el resultado de la pelea sale de la repetición del servidor; `update bets set status='settled' where status='open' returning` evita pagar dos veces.
- Interferir: RPC que descuenta 30 fichas e inserta en `interferences` (único por pelea); el servidor, no el cliente, añade el +20 % o el elemento adverso al enemigo al repetir.
- Acciones de anfitrión (cerrar sala, modo nivelado, tiempo por turno): el servidor compara `rooms.host_id` con el `player_id` de la sesión. Si el anfitrión se va, el servidor traspasa al jugador más antiguo.

**(d) Jefe cooperativo:** cada jugador envía su log contra la misma semilla del jefe; el servidor repite cada uno y suma el daño verificado; la vida del jefe escala con los presentes (2 a 7). El ranking se actualiza solo desde pisos verificados.

**(e) Semanal y diaria:** semana y día se calculan con `now()` del servidor en una zona horaria fija del proyecto (decisión abierta). Diaria: `insert into daily_claims(player_id, day)` con clave primaria `(player_id, day)`; si choca, ya la usó. Semanal: `weekly_scores` con clave `(week, player_id)` y `greatest()` del piso verificado.

## 5. Salas y tiempo real

- **Códigos:** 4 letras son pocas (456.976). Defensas: hay que tener sesión (cuentas cerradas por código de la casa); `join_room` por servidor con límite de 10 fallos por jugador cada 10 min; la tabla `rooms` no es legible para no miembros (no se puede listar ni sondear); salas expiran (p. ej. 12 h) y el código solo se reutiliza cuando la sala está cerrada (índice único parcial); límite de salas abiertas por anfitrión; opcional: el anfitrión aprueba entradas.
- **Canal:** nombre `room:<uuid>` (no el código de 4 letras), privado (`private: true`) con RLS en `realtime.messages` y acceso público desactivado en los ajustes de Realtime [S13]. Las políticas se cachean por conexión: tras expulsar a alguien, forzar reconexión o renovar el JWT [S13].
- **Qué viaja por el canal:** solo cosas sociales (emotes, presencia). El estado real (pisos, fichas, apuestas) se escribe en tablas por servidor y los clientes lo reciben con Postgres Changes, que respeta RLS [S13]. Validar con zod todo mensaje recibido (tipo, tamaño ≤ 200 bytes) y limitar la frecuencia por jugador.
- **Desconexión:** `room_players.left_at`, el jugador pierde el turno cuando se agota el tiempo (decidido), conserva sus fichas y puede reentrar; la sala sigue con 2 a 7 jugadores.

## 6. Checklist web (Next.js y Vercel)

- **Secretos:** `.env.local` en `.gitignore` (hoy no hay git: hacerlo antes del primer commit). Publicable/anon en `NEXT_PUBLIC_*`; secreta (`sb_secret_...`), `PEPPER` y `SIGNUP_CODE` solo en Vercel/`.env.local` sin prefijo `NEXT_PUBLIC_`. Importar `server-only` en los módulos que los usen. Nunca pegarlos en el chat, URLs ni logs; si se filtra, corregir la causa, crear otra clave, actualizar y borrar la vieja [S2]. Las claves legacy `anon/service_role` se retiran a fines de 2026 [S2].
- **Cabeceras:** CSP con nonce en `proxy.ts` (obliga a render dinámico; aceptable para este juego) [S16]: `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'nonce-…'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. Los SVG de sprites inline renderizados por React no necesitan permisos; los atributos `style={{}}` sí (`style-src-attr 'unsafe-inline'`, probar). `next/font/google` descarga la fuente en el build, así que `font-src 'self'`. Más: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` vacío (sin cámara ni micrófono).
- **CSRF/origen:** las mutaciones son POST y las Server Actions comparan `Origin` con `Host` [S17]; en Route Handlers hacer lo mismo a mano. Cookies SameSite. Sin CORS abierto (`*`).
- **Entradas:** zod en cada Route Handler (tipos, longitudes, enums); las rutas dinámicas son entrada del usuario. Nombres y frases: React escapa, pero igual se limitan caracteres y largo.
- **Server Actions/Handlers:** reautenticar y comprobar propiedad en cada uno (IDOR) [S17]; devolver solo lo que la UI necesita.
- **Rate limiting:** WAF de Vercel disponible en todos los planes, Hobby con 1 regla por proyecto, ventana fija de 10 s a 10 min por IP, y contadores por región [S10]: usarla en `/api/auth/*`. El resto (por nombre, unirse a sala, tiradas, checkpoints) con contadores en Postgres (`rate_limit_hits`) vía función de servidor. Upstash y similares no se investigaron; no hacen falta para 7 amigos.
- **Dependencias:** `package-lock.json` versionado, `npm audit` en cada cambio de dependencias, evitar paquetes nuevos sin necesidad (Software Supply Chain Failures es A03 en OWASP 2025 [S11]).
- **Errores y logs:** al cliente solo códigos genéricos; el detalle va a `audit_log`: login fallido repetido, bloqueo, log de run imposible o cortado, tope de monedas alcanzado, tirada con conflicto, reset de PIN, intentos de unirse a sala. Nunca registrar PIN ni claves.

## 7. Plan de pruebas de hacking ético (sobre nuestro entorno local o de pruebas, jamás el de otros)

| # | Ataque | Resultado esperado |
|---|---|---|
| 1 | Security Advisor / `supabase db advisors` [S5] | Cero hallazgos de RLS desactivada, `security definer` ejecutable por anon, `search_path` mutable |
| 2 | pgTAP: como `anon` y como otro usuario, `select`/`update` a `player_state`, `characters` ajenos [S18] | Cero filas / error de permisos |
| 3 | Con la clave publicable: `update player_state set coins=999999` | Denegado |
| 4 | `rpc('apply_pull', ...)` con la clave publicable | Denegado (execute revocado) |
| 5 | Editar localStorage/consola con monedas 999999 | La nube no cambia; el juego muestra lo del servidor |
| 6 | Enviar `/api/run/checkpoint` con log inventado (piso 99, puerta inexistente, acciones fuera de orden) | Corte en la última acción válida; `audit_log` lo anota |
| 7 | Enviar el mismo cierre de run dos veces | Segundo envío no suma monedas |
| 8 | Repetir la petición de tirada (misma `idemKey`) y 20 en paralelo con monedas justas | Un solo cobro; sin saldo negativo |
| 9 | Fuerza bruta de PIN por nombre real, nombre inexistente y desde muchas IP | Bloqueo a los 5 y 20 intentos; mensajes idénticos; mismo tiempo aproximado |
| 10 | Registrar cuenta sin código de la casa o llamando directo a `/auth/v1/signup` | Rechazado |
| 11 | Probar 1.000 códigos de sala | 429; no hay lista de salas; no se revelan miembros |
| 12 | Suscribirse al canal de otra sala (con y sin sesión) | Sin mensajes; canal rechazado |
| 13 | Apostar con más fichas de las que se tienen, sobre uno mismo, o después de iniciar la pelea | Rechazado |
| 14 | Reclamar diaria dos veces o cambiando la hora del teléfono | Una sola |
| 15 | Acción de anfitrión siendo invitado | 403 |
| 16 | `npm audit`; OWASP ZAP baseline (`docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t <url>`, escaneo pasivo, sin ataques [S19]) | Sin altos; revisar avisos de cabeceras |
| 17 | Buscar `sb_secret` y `PEPPER` en el bundle (`.next/static`) y en el repo | No aparecen |
| 18 | Mismo log de ejemplo reproducido en Chrome, Safari y Node | Mismo resultado final |

**Aprender (opcional):** Web Security Academy de PortSwigger, gratis, con laboratorios de control de acceso y autenticación [S20] · OWASP Juice Shop, app deliberadamente vulnerable para practicar [S21]. No se verificaron videos específicos.

## 8. Hoja de ruta

| Paso | Quién | Para el primer viernes |
|---|---|---|
| 1. Crear proyecto Supabase (plan gratis), desactivar registro público, activar SSL y MFA de la cuenta [S22] | **Usuario** | Sí |
| 2. Copiar URL + clave **publicable** a `.env.local`. La secreta la pega el usuario directo en Vercel/`.env.local`, nunca en el chat | **Usuario** | Sí |
| 3. Inventar `PEPPER` (32 bytes aleatorios) y `SIGNUP_CODE`, ponerlos en `.env.local` y Vercel | **Usuario** | Sí |
| 4. Migraciones SQL: tablas, RLS, revocaciones; tests pgTAP | Equipo | Sí |
| 5. `/api/auth/login`, registro, límites de intentos, reset por admin | Equipo | Sí |
| 6. Tirada y banco de run por servidor (primero banco con tope; luego repetición) | Equipo | Tirada sí; repetición completa puede ir después con tope de monedas por piso |
| 7. Cabeceras + CSP, `.gitignore`, `npm audit` | Equipo | Sí |
| 8. Salas: RPC de unirse, canal privado, rate limit | Equipo | Sí |
| 9. Apuestas, fichas, interferir, diaria, semanal, jefe cooperativo | Equipo | Parcial |
| 10. Repetición determinista completa, checkpoints, tablas de potencias | Equipo | Después |
| 11. Pruebas de la sección 7 completas, `audit_log` revisado | Equipo + usuario | Después |

**Mínimo para el primer viernes:** pasos 1 a 5, 7 y 8, más tirada en servidor y límite de monedas por run (sin repetición completa aún: se acepta el riesgo de amigos con trampa moderada, acotado por el tope). Todo lo demás se endurece en las semanas siguientes.

## Fuentes

- [S1] https://supabase.com/docs/guides/database/postgres/row-level-security
- [S2] https://supabase.com/docs/guides/api/api-keys
- [S3] https://supabase.com/docs/guides/database/functions · [S3-nota] mínimo por defecto de 6 caracteres y configurable en el panel: resultados de búsqueda de las discusiones https://github.com/orgs/supabase/discussions/13315 y https://github.com/orgs/supabase/discussions/7181 (no está en la doc oficial consultada; verificar en el panel)
- [S4] https://supabase.com/docs/guides/auth/password-security (bcrypt con sal; mínimo recomendado 8)
- [S5] https://supabase.com/docs/guides/database/database-linter
- [S6] https://supabase.com/docs/guides/auth/rate-limits
- [S7] https://supabase.com/docs/guides/auth/server-side/nextjs
- [S8] https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html (límite de 72 bytes de bcrypt; pepper)
- [S9] https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- [S10] https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- [S11] https://top10.owasp.org/2025
- [S12] https://dev.to/victor_yrazusta/10-common-supabase-security-misconfigurations-and-how-to-fix-them-do8 (fuente comunitaria)
- [S13] https://supabase.com/docs/guides/realtime/authorization
- [S14] https://supabase.com/docs/guides/functions/limits
- [S15] https://bugs.webkit.org/show_bug.cgi?id=150403 y https://www.freecodecamp.org/news/i-found-a-bug-in-v8s-exponentiation-operator-dcddfa5b8482/ (diferencias de `pow` entre motores)
- [S16] https://nextjs.org/docs/app/guides/content-security-policy
- [S17] https://nextjs.org/docs/app/guides/data-security
- [S18] https://supabase.com/docs/guides/database/testing
- [S19] https://www.zaproxy.org/docs/docker/baseline-scan/
- [S20] https://portswigger.net/web-security
- [S21] https://owasp.org/www-project-juice-shop/
- [S22] https://supabase.com/docs/guides/deployment/going-into-prod
- Anti-trampa por repetición: patrón descrito en https://gigazine.net/gsc_news/en/20211110-open-hexagon-against-cheet y https://accelbyte.io/blog/server-authoritative-logic-to-prevent-cheating

## Auditoría 2026-10-06 (código + base)

**Revisado y sin hallazgos:** ningún cliente escribe en la base (RLS en todo, solo SELECT propio, `revoke` a anon/authenticated, funciones solo para `service_role` desde 0018); el servidor decide todo (tiradas con semilla propia, forja y mercado con el mismo código puro, monedas/botín/partes/limpiezas de la repetición, daño del jefe cooperativo de la repetición); entradas con zod estricto y tope de tamaño; CSRF por Origin; login con límites por nombre e IP y mensajes iguales; PIN derivado con secreto del servidor (llamar a Supabase Auth directo no sirve sin el secreto); sin secretos en git; CSP y cabeceras.

**Riesgo real encontrado (corregido):** el motor es determinista y el cliente conoce la semilla, así que un script con IA podía jugar runs a velocidad de CPU y entregarlas en bucle (granja de monedas/botín, o descartar semillas malas). Ahora (`services.ts`):
- una run no puede ser más rápida que `MIN_ACTION_MS` (400 ms) por acción registrada: se cierra sin pagar y se anota `run_too_fast`;
- pago decreciente por runs del día (`economy.ts`: 100% las primeras 10, 50% hasta 30, 20% hasta 60, 10% después); sin tope duro;
- límites: 20 inicios de run por hora y 60 runs entregadas por día;
- `clientIp` prefiere `x-vercel-forwarded-for` (no falsificable en Vercel).

**Riesgo aceptado (no se puede cerrar sin combate en el servidor):** una IA puede *jugar bien*, incluso mirar la semilla y elegir las mejores acciones; solo se la limita a ritmo humano y a los topes de arriba. Lo mismo vale para el daño del jefe cooperativo (acotado por el tiempo de la fase).

**Revisar a mano en Supabase tras cada migración:** ejecutar `supabase/tests/check_exposure.sql` (las 4 consultas deben devolver 0 filas); en Authentication desactivar "Allow new users to sign up"; en Realtime desactivar "Allow public access".
