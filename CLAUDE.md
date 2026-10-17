# CLAUDE.md — Boludos & Dragones (RPG gacha de noche de juegos)

Resumen vigente. Reglas detalladas, estado y pendientes completos: `docs/CLAUDE_COMPLETO_2026-10-15.md` (leer solo la sección necesaria, nunca entero). Otros docs: `docs/ESTADO.md`, `FORJA_V9.md`, `SALAS.md`, `SEGURIDAD.md`, `COMBATE_V2.md`, `HABILIDADES_V27.md`, `torre/`, `ideal/`.

## Qué es
Juego web RPG por turnos con gacha para 7 amigos (reemplazo de LoL); debe funcionar con 2 a 7 jugadores, sin bloquear a nadie. Entre semana cada uno avanza solo; el viernes se juntan en una sala. PC primero, celular secundario. Producción en Vercel (cada push a `main` despliega); progreso en Supabase (nombre + PIN).
**Criterio ante dudas de diseño:** más risas, rivalidad sana, momentos compartidos, y parejos a quienes juegan menos.

## Forma de trabajar (obligatorio)
- Seguir el alcance y etapas autorizadas por el dueño; detenerse en las puertas de auditoría. No adelantar etapas.
- Respuestas concisas: sin saludos ni disculpas; al modificar código mostrar solo el fragmento cambiado.
- Confirmar antes de acciones irreversibles (reset de base, push, migraciones).
- Ahorro de tokens: verificar con `tsc`, `eslint` y `vitest`; durante el trabajo solo los tests del área tocada y la suite completa una vez antes de cada commit; simulaciones pesadas solo si cambió el balance. Revisión visual con `read_page`/`get_page_text`; capturas a escala 0.5 y pocas. Máx. 2 agentes en paralelo. Usar el modelo más barato que alcance (haiku/sonnet); informes de agentes breves.
- No leer `public/art*`, `public/audio`, `.next*`, `node_modules`, `.git` (bloqueado en settings).
- Idioma: textos del juego y UI en español; código, comentarios y commits en inglés. Commits pequeños, uno por cambio lógico.

## Stack y estructura
Next.js (App Router) + TypeScript estricto (sin `any`) + Tailwind · Supabase (Postgres, RLS, polling) · Vercel · Vitest. Secretos solo en `.env.local`.
- `src/lib/game/`: lógica de juego pura y testeable (sin React ni Supabase).
- `src/lib/server/`, `src/app/api/`: servicios y rutas. Dungeons y salas: el cliente informa el resultado y el servidor lo acota; torre y duelos usan el motor en servidor.
- `supabase/migrations/*.sql` (`0018_lockdown_functions.sql` siempre última), `supabase/setup.sql`, `upgrade_from_NNNN.sql` (`npx tsx scripts/build-setup-sql.ts [--from=NNNN]`), `reset_progress.sql` (destructivo).
- Todo azar por `rng.ts` con semilla (nunca `Math.random()` en la lógica). Motor con tablas precalculadas (sin `**`/`Math.pow`).
- Sin variables de Supabase el juego usa `localStorage`.
- Cada migración nueva: ejecutar `upgrade_from_NNNN.sql` en Supabase ANTES del push y revisar el Security Advisor.

## Reglas clave (detalle en el doc completo)
Combate por turnos con planificador entero (`combat.ts`, `skills.ts`, `brain.ts`, `auto.ts`; `ENGINE_VERSION` en código), 4 botones (Básico, 2 habilidades, Defender). 5 clases, 5 elementos en ciclo (×1,25 / ×0,75). Héroes: clase + elemento + rango F–S + rasgo + Factor de atributo. Equipo de 6 casillas. Forja (★, rango, tirada, Mejorar). Modo Progreso: 9 rutas, dificultades F–S con ascensiones +0…+5. Salas (código de 4 letras, nivelado/colección), Torre semanal endless, economía con topes anti-granja. Zona horaria America/Argentina/Buenos_Aires.

## Seguridad
Supabase Auth con email sintético y contraseña derivada en servidor; RLS en todas las tablas; funciones SQL cerradas (`0018`). La clave secreta nunca en el chat ni en el repo. Ver `docs/SEGURIDAD.md`.

## Verificación
`tsc`, `eslint src scripts`, `vitest`, y `node supabase/tests/pglite/*.mjs`. Simuladores en `scripts/`.
Modo local: `NEXT_DIST_DIR=.next-local NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev -p 3001`. Con `.env.local`, `npm run dev` usa la base real.

## Estado (2026-10-15)
- Estado ideal en `main` y publicado (`PROFILE_VERSION 8`, migración 0058).
- Torre endless implementada en local (rama `torre-endless`, sin push; migración 0059). Falta: validación humana, revisión visual 320/360 px, balance.
- Operativo solo con confirmación del dueño: backup → `upgrade_from_0058.sql` → Security Advisor → merge/push → tag (sugerida v11.0).
- Pendiente completo: ver "Estado y pendiente" en el doc completo.
