# Phase 4 — Hero integration

Approved by Felipe on 2026-10-09. Integrates the four approved painted heroes (200 animated sheets and 20 large portraits) and the pixel Assassin (50 sheets). Static portraits now use opaque bounds to fill their display boxes; hero URLs and combat preload URLs share a version token to invalidate older cached images. Unused legacy body accessory sheets are no longer preloaded; trait corner badges remain.

The other 150 pixel hero sheets are unchanged. Gameplay, player data, class identifiers and animation contracts are unchanged; Berserker still shares the Knight appearance provisionally. Barbarian production remains deferred at Felipe's request.

Development review: /galeria-px/actualizacion-heroes. Includes real HeroSprite components and a comparative catalog. This route is unavailable in production.

Validation: all 270 served asset hashes match; 52 test files / 526 tests pass; source TypeScript passes excluding stale generated caches; responsive review at 1920×1080, 2560×1440 and 390×844 shows no horizontal overflow. Full-project lint retains 11 pre-existing errors and 5 warnings; default TypeScript retains four pre-existing missing-route references in generated caches. No new findings in changed source files.
