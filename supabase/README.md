# supabase/

Base de datos de Boludos & Dragones. Contrato con Next.js: `CONTRACT.md`. Guía para el usuario: `../docs/SUPABASE_SETUP.md`.

- `migrations/0001_schema` tablas y constantes · `0002_rls` RLS (denegar por defecto) · `0003_functions` funciones solo `service_role` · `0004_realtime` canales privados `room:<uuid>`.
- `setup.sql` = las 4 migraciones juntas (generado). Se pega en el SQL Editor de Supabase. Regenerar: `npx tsx scripts/build-setup-sql.ts`; verificar: `... --check`.
- `tests/database/*.test.sql` pruebas pgTAP del plan de ataques (SEGURIDAD.md sec. 7). Con Docker: `supabase start && supabase test db`.
- `config.toml` solo para desarrollo local (registro público apagado).
- No hay buckets de Storage (no se usan archivos).
- Estado: el SQL se validó con el parser de Postgres y se ejecutó en PGlite (Postgres 17 en WASM) con roles simulados; **no** contra un proyecto Supabase real ni con `supabase test db`.
