# PLAN_EJECUCION_V2 — pasos de ejecución (rama `v2`)

**Estado:** aprobado por el dueño (2026-10-10). Documentos de diseño: `COMBATE_V2.md`, `HEROES_V2.md`; decisiones en `CRUCE_IAS.md`. Trabajo en la rama **`v2`** (sale de `main` en `7bbbd38`); `main` despliega a producción, así que nada se mezcla ni se sube sin confirmación del dueño.

## Reglas
- Un commit por etapa; funciones puras en `src/lib/game/` con tests; el motor (`combat.ts`) lo toca una sola persona a la vez.
- Programa ChatGPT/Codex a partir de los contratos; Claude Code audita cada etapa (`tsc`, `eslint`, `vitest` del área; suite completa antes de cada commit) y puede rechazar.
- **Irreversible = confirmación del dueño:** migraciones SQL (`upgrade_from_NNNN.sql` antes del push), `reset_progress.sql`, push, merge a `main`, tags.
- Se hará un **reset de progreso**: no hay compatibilidad con datos antiguos.

## Pasos
| Paso | Qué | Puerta |
|---|---|---|
| 0 | Línea base en `v2`: `tsc`, `eslint`, `vitest`, `pglite` | Todo en verde (o fallos conocidos anotados) |
| C1 | Claude escribe los **contratos** de H1: `CONTRATOS_H1.md` | Hecho; aprobación del dueño |
| H1a | Héroes: `copies` con perfil, `swapCopy`, `fuseHeroes` con perfil completo, tope ±10 % en el sorteo; tests | Tests verdes + auditoría |
| H1b | Persistencia: migración 0054, modo local, `build-setup-sql`, `pglite` | **OK del dueño para ejecutar el SQL** |
| H1c | UI: Factor en gacha y Forja; vista lado a lado de cambios | Prueba manual |
| H3 | Equipo: sin resonancia ni afinidad de sets; autoequipar por poder bruto con botones ordenados | Tests + prueba manual |
| H2a | Modos nivelado/colección en torre y salas (preset D 0★, elegir clase+elemento) | Tests de torre y salas |
| H2b | Ranking con clase y elemento (migración 0055); preparación del duelo con "Listo" | **OK del dueño para el SQL** |
| E1 | Cola visual de la ronda | Prueba manual |
| E2 | Prototipo del acumulador de progreso vs motor 13 | Aborta si no iguala la tolerancia |
| E3+ | Habilidades, Aguante/Quiebre, Explotar, recalibración, `ENGINE_VERSION` | Puertas de `COMBATE_V2.md` §9 |
| Cierre | Backup, `upgrade_from_NNNN.sql`, `reset_progress.sql`, merge a `main`, tag | Confirmaciones del dueño |

## Pendientes de diseño que NO bloquean H1/H3/H2
Efectos de Explotar de 4 estados, escala del progreso y tolerancia de E2, efecto defensivo del Caballero, tiempo límite del duelo.

## Decisión del dueño: reset total (2026-10-10)
El reset es **total** con `supabase/reset_progress.sql` (manual y destructivo, solo con confirmación del dueño), después de ejecutar `upgrade_from_NNNN.sql`. La migración 0054 no es el reset: el `delete from public.characters` que incluye debe quitarse o quedar como no-op documentado. `reset_progress.sql` debe revisarse para cubrir todas las tablas y columnas nuevas (copias con perfil, `tower_scores` con clase y elemento).
