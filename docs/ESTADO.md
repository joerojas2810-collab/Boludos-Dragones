# Estado de traspaso (leer junto con CLAUDE.md)

Última actualización: tras mover las funciones de RLS a `private` y mientras se afina el ritmo de niveles.

## Hecho y verificado
- Etapas 1-3 jugables (`/prueba`, `/run`, `/gacha`, `/coleccion`), combate v2 (`ENGINE_VERSION = 2`), pasivos de clase, velocidad con acciones extra, guardia perfecta, habilidad 3, modo rápido, 1-3 enemigos con objetivo, tooltips (`explain.ts`), fondos por mundo.
- Supabase real creado, `.env.local` válido, `setup.sql` ejecutado una vez (versión de 5 migraciones). Cuenta admin "Pol" creada y con login funcionando.
- Lógica y SQL de salas listos (room.ts, nivelado.ts, 0005). pglite: run.mjs 420/420, rooms.mjs 257/257 tras el cambio a `private`.

## Pendiente inmediato
1. **Usuario: volver a ejecutar `supabase/setup.sql`** en el SQL Editor (ahora con 6 migraciones: 0006 mueve `is_room_member`/`is_room_topic_member` al esquema `private` y añade políticas deny_all). Es reejecutable. Luego refrescar el Security Advisor: deben desaparecer los 2 avisos de SECURITY DEFINER y los 5 de "RLS sin política". El aviso "Leaked password protection" se ignora a propósito (las contraseñas son HMAC del servidor).
2. **Usuario: apagar 3 interruptores** si no lo hizo: Allow new users to sign up, Confirm email (Authentication > Sign In / Providers) y Allow public access to channels (Realtime > Settings).
3. **Ritmo de niveles (en curso)**: el usuario pidió que subir de nivel cueste al menos 3 peleas fáciles y que cada nivel cueste exponencialmente más. Valores actuales de prueba (NO definitivos): `XP_BASE 165`, `XP_GROWTH 1.28`, `UPGRADE_POWER 2.8` (progression.ts), `LEVEL_UP_HEAL 0.4`, `EARLY_EASE_START 0.6 / EARLY_EASE_FLOORS 9` (run.ts). Última simulación (`npx tsx scripts/run-sim.ts 500`): demasiado lento (mediana piso 9-10, nivel ~4, muertes concentradas en pisos 8-10, jefe 10 mata 31-48%). Objetivo de CLAUDE.md: mediana 16-18, p90 ~30, ningún jefe > ~14% de las muertes, pocos pisos 1-4. Probar subir `UPGRADE_POWER` y/o `EARLY_EASE`, o suavizar el crecimiento, y reejecutar una simulación corta cada vez. Al terminar actualizar CLAUDE.md y los tests (`xpToNext`).
4. **Agentes de salas cortados por límite de uso** (se reinicia 1:50 am Buenos Aires): reanudar con SendMessage, de a uno: primero el del servidor (`/api/rooms/**`, contrato en `docs/API_SALAS.md` y `src/lib/rooms/api.ts`; agente `ab2deb9a2c690f0ad`), después el de las pantallas (`/sala/**`, demo simulada en `/sala/demo`; agente `aba66292ba626687d`). Sin servidor de salas no se pueden probar en real; el script `scripts/rooms-smoke.ts` está pedido en la tarea del servidor.
5. Pendientes menores: revisión visual de accesorios en Mago/Pícaro/Clérigo, jefes de Tormenta y Cavernas, pantallas de mercader/evento/habilidad en celular; unir `Battle.enemy` viejo en cualquier código de salas a `enemies`; confirmar el límite CSP `unsafe-inline`.

## Después
Semilla de la semana y tirada diaria (pantallas), modo nivelado en la sala, jefe cooperativo, "Crear legendario" (al final), publicar en Vercel, git.

## Reglas de trabajo vigentes
Ahorro de tokens (CLAUDE.md): comprobaciones baratas (`tsc`, `eslint`, `vitest`), simulaciones cortas solo si cambia el balance, pocas capturas, máximo 2 agentes (mejor 1) y modelo por tarea. Nunca leer ni imprimir valores de `.env.local`.
