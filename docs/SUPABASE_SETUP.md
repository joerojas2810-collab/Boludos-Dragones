# Preparar Supabase (mínimo de pasos)

Tiempo: ~15 minutos. Las claves secretas se pegan **solo** en `.env.local` o en Vercel, nunca en el chat.

## 1. Crear el proyecto
1. Entra a https://supabase.com/dashboard → **New project** (plan Free).
2. Región: **South America (São Paulo)**. Contraseña de la base: larga y aleatoria, guárdala en tu gestor de contraseñas (no la usa el juego).
3. Recomendado: activa MFA en tu cuenta de Supabase (foto de perfil → Account preferences / Security).

## 2. Crear las tablas (un clic)
1. En el proyecto: **SQL Editor** → **New query**.
2. Copia el archivo completo `supabase/setup.sql` (en Mac: `pbcopy < supabase/setup.sql` y pega) → **Run**.
3. Debe terminar en "Success. No rows returned". Si lo corres otra vez no pasa nada malo.

*Alternativa con terminal (2 comandos tras `supabase login`):* `supabase link --project-ref <REF>` y `supabase db push`.

## 3. Ajustes del panel (3 interruptores)
- **Authentication → Sign In / Providers**: apaga **Allow new users to sign up**. Así nadie crea cuentas por fuera del juego; el servidor las crea con el código de la casa.
- Mismo lugar → proveedor **Email**: apaga **Confirm email** (las cuentas usan correos falsos `@players.invalid`).
- **Realtime → Settings**: apaga **Allow public access** (solo canales privados de sala).

## 4. Variables en `.env.local`
1. `cp .env.local.example .env.local`
2. **Project Settings → API Keys**: copia *Project URL* → `NEXT_PUBLIC_SUPABASE_URL`, la *publishable key* (`sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y la *secret key* (`sb_secret_...`) → `SUPABASE_SERVICE_ROLE_KEY`.
3. `PIN_PEPPER`: ejecuta `openssl rand -hex 32` y pega el resultado. Guárdalo también en tu gestor de contraseñas: si se pierde hay que resetear todos los PIN.
4. `HOUSE_CODE`: una frase que solo sepan tus amigos (se la dices en persona).
5. `ADMIN_NAME`: el nombre con el que jugarás tú (podrá resetear PIN de otros).

## 5. Primera cuenta
`npm run dev` → abre http://localhost:3000 → regístrate con el nombre de `ADMIN_NAME`, un PIN de 4 dígitos y el código de la casa.

## 6. Cómo sé que quedó bien
1. **Database → Advisors (Security Advisor)**: 0 errores. Pueden aparecer avisos *informativos* "RLS enabled, no policy" en `game_constants`, `run_submissions`, `auth_attempts`, `rate_limit_hits`, `audit_log`: es lo esperado (nadie del navegador las toca).
2. **Table Editor**: cada tabla dice *RLS enabled*.
3. En la consola del navegador (F12) de cualquier página, con tu URL y la clave publicable:
   ```js
   fetch("https://<REF>.supabase.co/rest/v1/player_state?select=*", {headers:{apikey:"<PUBLISHABLE>"}}).then(r=>r.json()).then(console.log)
   ```
   Debe responder `permission denied` (o `[]`), nunca monedas de nadie. Lo mismo con `/rest/v1/rpc/get_profile` (POST): denegado.
4. Registrarse sin el código de la casa debe fallar, y llamar a `https://<REF>.supabase.co/auth/v1/signup` directo debe responder "Signups not allowed".

## Variables para Vercel (más adelante)
Project → Settings → Environment Variables (Production y Preview). Marca como *Sensitive* las que no llevan `NEXT_PUBLIC_`:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PIN_PEPPER`, `HOUSE_CODE`, `ADMIN_NAME`.
