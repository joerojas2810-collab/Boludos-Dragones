> Historial: describe el motor anterior por rondas; vigente: docs/ideal/

# CONTRATOS_H1 — Héroes con Factor de atributo (etapas H1a, H1b, H1c)

**Estado:** contrato para el programador (ChatGPT/Codex). Rama `v2`. Diseño: `HEROES_V2.md`; plan: `PLAN_EJECUCION_V2.md`. Lo que no esté aquí o en el diseño es decisión del dueño: se deja como pregunta en `CRUCE_IAS.md`, no se inventa.
**Hay reset de progreso:** sin compatibilidad con datos antiguos (no migrar héroes ni copias viejas).

## 0. Hechos del código (verificados)
- `generateCharacter` (`characters.ts`) sortea con `rollStat` (±`STAT_VARIANCE` 0,15) hp, atk, def, crit, accuracy, speed **en ese orden**, pero luego **descarta el accuracy** (`accuracy: 0`) y aplica los rasgos (`applyTraits`). Por eso `Character.stats` guardado **ya incluye el efecto del rasgo**.
- `OwnedCharacter` (`profile.ts`) = `Character` + `id` (= `characterKey` c-clase-elemento-rango), `rarity`, `stars`, `factors`, `copies?: HeroProfile[]`, `legacy?`.
- Rango, ★ y nivel se aplican al leer (`heroFromOwned` → `scaleStats`); lo guardado es la base.
- El pull duplicado guarda un `HeroProfile`; `swapCopy` y `fuseHeroes` mueven el perfil completo (rasgo + factores) y recalculan los stats.
- BD antes de H1b: `characters.copies text[]` (máx. 50, migración 0050); `apply_pull`, `apply_hero_change`, `get_profile` y el mercado la tocan. El servidor corre el mismo TS y la BD aplica un write-set atómico.

## 1. Tipos (H1a, `src/lib/game/`)

```ts
// characters.ts
export interface HeroFactors { hp: number; atk: number; def: number; crit: number; speed: number } // each 0.85 … 1.15 (1 = base)
export const FACTOR_MIN = 0.85, FACTOR_MAX = 1.15; // = 1 ∓ STAT_VARIANCE
export const FACTOR_POWER_CAP = 0.10;              // joint cap (see capFactors)

// profile.ts
export interface HeroProfile { trait: TraitId; factors: HeroFactors } // the unit that travels together
export type OwnedCharacter = Character & {
  /* … existing fields … */
  factors: HeroFactors;          // NEW, required (reset: no legacy)
  copies?: HeroProfile[];        // was TraitId[]
};
```
- `Character.traits[0]` + `factors` son el perfil del héroe principal; `stats` es **derivado** y se mantiene sincronizado siempre con `buildStats`.
- `accuracy` no entra en los factores (hoy se descarta). Conservar el consumo del `rng` del accuracy en `generateCharacter` o documentar el cambio de orden (los tests con valores fijos se actualizan).

## 2. Funciones puras (H1a)

| Función | Contrato |
|---|---|
| `rollFactors(rng): HeroFactors` | Sortea los 5 factores uniformes en [0,85; 1,15] en el orden hp, atk, def, crit, speed; luego `capFactors`. Mismo `rng` → mismo resultado |
| `capFactors(f): HeroFactors` | `m` = media de hp, atk, def, speed. Si \|m−1\| > `FACTOR_POWER_CAP`, multiplica **todas** las desviaciones (f−1, incluida crit) por `FACTOR_POWER_CAP / \|m−1\|`. Nunca saca un factor de [0,85; 1,15]. Sin tiradas extra. *(Métrica propuesta; si el auditor halla una mejor, se cambia solo aquí.)* |
| `buildStats(classId, factors, traits): Stats` | `applyTraits` sobre `CLASSES[classId].stats × factors` (accuracy 0, resist 0, critDmg/regen/lifesteal de la clase). Es la **única** fuente de `stats` |
| `withProfile(hero, p: HeroProfile): OwnedCharacter` | Devuelve el héroe con `traits=[p.trait]`, `factors=p.factors`, `stats=buildStats(...)`; conserva nivel, ★, rango, equipo, `copies` |
| `profileOf(hero): HeroProfile` | `{trait: hero.traits[0], factors: hero.factors}` |
| `factorLabel(f): { perStat: Record<keyof HeroFactors, string>; summary: "bajo"\|"estándar"\|"alto" }` | `perStat` = `ATQ +12 %`, `DEF −6 %`… (redondeado al entero); `summary` por la media (p. ej. < −3 % bajo, > +3 % alto; umbrales en constantes) |
| `previewProfileChange(hero, newProfile): { before: Stats; after: Stats; diff: Partial<Record<keyof Stats, number>> }` | Para la vista lado a lado de la Forja: stats **ya escalados** (rango, ★, nivel) antes y después |

## 3. Cambios de comportamiento (H1a)

1. **Sorteo (`generateCharacter`)**: rasgo y factores nuevos; `stats = buildStats(...)`.
2. **Pull duplicado (`pull` en `profile.ts`)**: la copia guarda **su** `HeroProfile` (el rasgo y los factores que le salieron), no solo el rasgo.
3. **`swapTrait` → `swapCopy(p, {id, index})`**: el perfil completo de la copia reemplaza al principal y el del principal ocupa su lugar. Mismos errores que hoy ("Esa copia no existe.").
4. **`fuseHeroes`** (`keep: "base" | "existing"`): decide el **perfil completo** (rasgo + factores) del héroe resultante; el otro perfil pasa a `copies`. Sin fusión (el destino no existe), el base conserva su perfil. Nivel/equipo: como hoy.
5. **`starUpHero` / materiales (`units.ts`, `spendUnits`)**: las copias consumidas se descuentan con su perfil; el recorte (`trim`) trabaja con `HeroProfile[]`. Una copia = una unidad, igual que hoy.
6. **Mercado (`market.ts`)**: la copia que viaja lleva su `HeroProfile`; `TRADE_VALUE` no cambia; quien la recibe la guarda como copia con ese perfil.
7. **`MAX_COPIES = 50`** se mantiene.

## 4. Persistencia (H1b — acordada con reset de héroes)
- Migración **0054**: descarta héroes/copias antiguos y ofertas abiertas de héroes, pasa `characters.copies` a `jsonb` (lista de `{trait, factors}`, máx. 50) y guarda los factores principales en `data.factors`. Actualiza `get_profile`, `apply_pull`, `apply_hero_change` y las funciones del mercado que mueven copias. `0018_lockdown_functions.sql` siempre se ejecuta última.
- Regenerar `supabase/setup.sql` y `upgrade_from_0053.sql` con `npx tsx scripts/build-setup-sql.ts`. Probar con `supabase/tests/pglite/*`.
- Modo local (`localStorage`): mismo modelo; `PROFILE_VERSION` sube y un perfil antiguo se descarta/reinicia (reset).
- Revisar el Security Advisor tras el SQL.

## 5. Interfaz (H1c)
- Gacha: el resultado de un héroe muestra rango, clase, elemento, rasgo y `factorLabel` (etiquetas por stat + resumen bajo/estándar/alto). Una copia también muestra su perfil.
- Forja > Héroes: elegir una copia (intercambio), un `keep` (fusión) o confirmar un ascenso muestra **lado a lado perfil actual y resultante** con `previewProfileChange`; solo después se confirma.
- Colección: el héroe muestra su Factor. Sin texto largo; el arte manda; sin desbordes en celular.

## 6. Pruebas obligatorias (H1a)
- `rollFactors`: determinista por semilla; todo factor en [0,85; 1,15]; \|media(hp,atk,def,speed)−1\| ≤ 0,10 en ≥ 10 000 semillas; `capFactors` idempotente.
- `buildStats`: igual que `generateCharacter` actual para factores y rasgo dados; sincronía `stats` ↔ `factors`/`traits` tras `withProfile`.
- Pull duplicado guarda perfil; `swapCopy` intercambia perfil completo (rasgo **y** factores) y es reversible; `fuseHeroes` con fusión y sin ella conserva el perfil elegido y manda el otro a copia; `starUpHero` consume copias con su perfil.
- Mercado: la copia viaja con su perfil.
- `previewProfileChange`: `diff` = `after − before`; cambiar a un perfil idéntico da diff 0.
- Suite completa en verde (`tsc`, `eslint src scripts`, `vitest`); los tests con valores fijos de sorteo se actualizan con el motivo explicado.

## 7. Archivos que se tocan (H1a–H1c)
`characters.ts`, `profile.ts`, `heroFusion.ts`, `units.ts`, `market.ts`, `server/services.ts`, `server/testkit.ts`, `viewModels.ts`, `app/forja/HeroFusion.tsx`, `app/forja/MaterialPicker.tsx`, `app/forja/page.tsx`, `app/coleccion/page.tsx`, `components/ItemCard.tsx`, gacha (pantalla de resultado), `supabase/migrations/0054_*.sql`, `supabase/setup.sql`, `supabase/upgrade_from_0053.sql`, tests de `heroFusion`, `gacha`, `market`, `server`, `pglite`.

## 8. Reglas de entrega
- Por decisión Q12, cerrar H1a+H1b juntos en un commit, incluida la serialización del servidor y 0054.
- No tocar `combat.ts` ni el motor. No tocar `main`. Nada de push, SQL contra Supabase ni reset sin confirmación del dueño.
- Cualquier ambigüedad: pregunta en `CRUCE_IAS.md` (sección *Preguntas para el dueño*), no se decide en silencio.
