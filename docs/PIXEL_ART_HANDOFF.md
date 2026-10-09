# Línea de arte pixel: traspaso a otra IA

**Estado vigente, 9 de octubre de 2026:** trabajar en `main`, donde se fusionó `design/pixel-art`. Héroes, enemigos, objetos, fondos e interfaz están adaptados a HD. La Fase 5 usa **Acero y Oro**, elegida por el usuario: 130 PNG, cortes 9-slice de fuente separados del grosor visible y paquete externo `phase_5_ui.zip`. La Fase 4 tiene 238 íconos HD de 64×64 completados e integrados. Solo falta adaptar la Fase 7 de efectos. El usuario autorizó commit y push al terminar cada fase después de la revisión. La información de rama y tamaños originales que aparece más abajo es histórica; para continuar usar las actualizaciones HD del final y `docs/PIXEL_ART_PRODUCTION_PLAN.md`.

Rama de trabajo: `design/pixel-art` (sale de `main` en `4d23f57`). Commits de esta línea: `e969c0b`, `b896a25`, `c485230`, `c56f862`, `b2cddf9`.
Actualización del 7 de octubre de 2026: Fases 1 a 5 entregadas e integradas. Fase 4 completa: 238 íconos en doce lotes, incluidos 24 diseños base de reliquia, 72 variantes y 3 distintivos. Fase 5 completa: 130 recursos de interfaz, con estados compartidos y cortes 9-slice. Fase 6 tiene un primer lote integrado: 90 capas de combate y el menú (91 de 96 archivos previstos). Hay 557 PNG estáticos finales en `design/pixel-art`. El usuario autorizó continuar sin detenerse hasta terminar una fase y trabajar con un segundo agente para inventario, exportaciones, integración y pruebas. Las pruebas se ejecutaron al cierre de Fases 4 y 5. Los últimos tres lotes se publican juntos como un cambio lógico de cierre. No se fusiona con `main` ni se crea PR sin solicitud explícita. Plan de continuación: `docs/PIXEL_ART_PRODUCTION_PLAN.md`.

Reglas del proyecto que siguen valiendo (ver `CLAUDE.md`): textos de UI en español, código y commits en inglés, componentes sin lógica de juego, capturas pocas y a escala 0.5, preferir `read_page`/DOM a imágenes. Por instrucción posterior del usuario, `tsc`, `eslint` y `vitest` se ejecutan al cierre de cada fase, no de cada lote. Commits pequeños, uno por cambio lógico, con la línea `Co-Authored-By` que indique tu entorno.

## 0. Dónde está el código y cómo obtenerlo

- Repositorio: `https://github.com/joerojas2810-collab/Boludos-Dragones.git`. La rama remota `design/pixel-art` ya existe; este trabajo parte de `de2e3f7`.
- Copia local de Felipe: `C:/Users/Felipe/OneDrive/Escritorio/Proyecto de Juego/Boludos-Dragones`.
- Arte entregado, fuera del repositorio: `../Pedido de Arte Pixel Art/`. Solo PNG finales y manifiestos se importan a `public/art/*-px/`.
- Preparación: clonar, seleccionar `design/pixel-art` e instalar con `npm install --legacy-peer-deps`. `.env.local` no es necesario para revisar el modo local y nunca debe subirse.

## 1. Qué es esto

Una línea de arte **alterna** al arte pintado actual (`public/art/*.webp`). Reemplaza al pintado cuando esté aprobada, pero mientras tanto **conviven** y se elige con un interruptor de compilación:

```
NEXT_PUBLIC_ART=pixel   -> recursos pixel disponibles; el resto conserva el arte pintado
(sin variable)          -> arte pintado, igual que antes
```

Pedido de arte completo por fases: `docs/PEDIDO_ARTE_3.md`. Una fase por vez, sin avanzar sin aprobación del usuario.

## 2. Estado por fase

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Héroes (4 clases × 10 acciones, 64×96) | Entregada, integrada, aprobada |
| 2 | Enemigos (5 familias × normal/élite/jefe + 9 jefes finales) | Entregada, integrada, aprobada con ajustes (sin brillo) |
| 3 | Armas, equipo, partes, núcleos, marcos de carta | Entregada e integrada localmente: 42 originales, 98 PNG de juego |
| 4 | Íconos del sistema | Completa e integrada: 238 PNG en doce lotes; últimos tres lotes de 33, con 99 reliquias. Completada y autorizada la continuación por el usuario |
| 5 | Interfaz (9-slice, botones, barras, logos) | Completa e integrada: 130 PNG y manifiesto; pendiente revisión del usuario antes de Fase 6 |
| 6 | Fondos | Parcial: 90 capas de combate y menú entregados e integrados (91/96). Faltan colección, gacha, lobby, mercado y forja por límite diario de imágenes; el usuario eligió esperar al reinicio |
| 7 | Efectos | Pendiente |

Mientras no se completen las fases 6 y 7, la pantalla mezcla pixel (héroes y enemigos) con arte pintado (resto). Es esperado.

## 3. Datos de las entregas

- Fase 1 y 2: PNG por tira horizontal, cuadro **64×96**, sin escalar (`scale: 1`), alfa binario, luz arriba-izquierda, anclaje de pies en `(32, 90)`. Solo en Fuego; los otros 4 elementos los generamos por recoloreo exacto de la rampa de 4 tonos del `manifest.json`:
  `#8F2035 #D94728 #F88636 #FFD36B` (oscuro, base, claro, brillo).
- Héroes: `hero_<clase>_<acción>.png`, clases `knight mage rogue cleric`, acciones `idle attack_1 attack_2 attack_3 defend perfect_guard hit dodge defeat victory`.
- Enemigos: `enemy_<familia>_<normal|elite|boss>_fire_<acción>.png` y `boss_<id>_fire_<acción>.png`. Familias `slime imp harpy golem specter`. Acciones `idle attack hit defeat entrance` (entrance solo en jefes). Jefes finales por rango (del manifest): f great_devourer, e ash_king, d withered_queen, c hollow_colossus, b eternal_watcher, a mother_hydra, s lord_of_flies, ss faceless_one, ssr thunder_king.
- fps y cuadros por acción: héroes en `src/lib/art/heroes.ts` (`HERO_ACTIONS`); enemigos en `PX_ACTIONS` de `src/lib/art/enemies.ts` (idle 4/6 loop, attack 4/10, hit 2/12, defeat 4/8 queda, entrance 4/10).
- Origen en esta máquina: `../Pedido de Arte Pixel Art/heroes/` y `../Pedido de Arte Pixel Art/enemies/` (fuera del repo; no subir originales). Las tiras de enemigos ya integradas conservan los ajustes aprobados de brillo; no se regeneraron en este traspaso.

## 4. Archivos que tocan esta línea

| Archivo | Rol |
|---|---|
| `scripts/import-pixel.mjs` | Importador de héroes y enemigos: recoloreo, quita brillo en enemigos, agrega margen |
| `scripts/import-pixel-static.mjs` | Importador de Fases 3 y 4; valida tamaño/alfa y recolorea por RGB exacto sin escalar |
| `scripts/import-pixel-ui.mjs` | Importador de Fase 5: 130 nombres exactos, dimensiones, alfa y cortes; copia PNG sin escalar |
| `public/art/ui-px/` y `src/lib/art/pixel-ui.generated.json` | 130 recursos de interfaz y metadatos para revisión nativa |
| `scripts/import-pixel-backgrounds.mjs` | Importador de fondos: final exige 96 archivos, `--partial` exige exactamente las 90 capas de combate más el menú |
| `public/art/backgrounds-px/` y `src/lib/art/pixel-backgrounds.generated.json` | 91 fondos disponibles; registro evita rutas inexistentes y conserva el respaldo pintado de las 5 pantallas pendientes |
| `src/lib/art.ts`, `layout.tsx`, `globals.css` y `shell.css` | Selección de UI, logos, favicon y cofres; tema pixel y cortes 9-slice por `body[data-art=pixel]` |
| `src/lib/art/pixel-palettes.json` | Rampas canónicas de cinco elementos; Rayo amarillo |
| `src/lib/art/pixel.ts` y `pixel-icons.generated.json` | Interruptor, catálogo disponible y abertura de cartas pixel |
| `public/art/weapons-px/` y `equipment-px/` | 45 armas y 25 piezas de equipo: 5 variantes de cada base |
| `public/art/icons-px/` y `frames-px/` | 257 íconos y 9 marcos (336 PNG estáticos en total con armas/equipo) |
| `src/components/Icon.tsx`, `WeaponSprite.tsx`, `RarityFrame.tsx`, `ItemCard.tsx` | Selección del arte alterno y render pixelado; abertura pixel 44×58 dentro de 60×80 |
| `public/art/heroes-px/` | 200 tiras (4 clases × 5 elementos × 10 acciones), ~1 MB |
| `public/art/enemies-px/` | 550 tiras, ~3 MB |
| `src/components/HeroSprite.tsx` | Rama `PIXEL` (usa `heroes-px`, sin accesorios de rasgo) |
| `src/components/EnemySprite.tsx` | Envoltorio con relación de aspecto y `image-rendering: pixelated` |
| `src/lib/art/enemies.ts` | Exporta `PIXEL`, `PX_ASPECT`, `PX_ACTIONS`; `enemyAnim` elige la ruta pixel |
| `src/app/galeria-px/` | Visor solo-dev en `/galeria-px` (404 en producción) |
| `next.config.ts` | `distDir` por variable de entorno y `/art` sin caché en desarrollo |
| `.gitignore` | Ignora `/.next-pixel/` |
| `.claude/launch.json` | Config `dev-pixel` (puerto 3112, `NEXT_PUBLIC_ART=pixel`, `NEXT_DIST_DIR=.next-pixel`); puede estar ignorado por git |

`tsconfig.json` aparece modificado en `git status` sin que lo hayamos tocado (lo reescribe Next al arrancar). Revísalo y no lo incluyas a ciegas en los commits.

## 5. Cómo correrlo

```bash
# regenerar el arte (idempotente, sobrescribe)
node scripts/import-pixel.mjs "../Pedido de Arte Pixel Art/heroes" heroes
node scripts/import-pixel.mjs "../Pedido de Arte Pixel Art/enemies" enemies
node scripts/import-pixel-static.mjs "../Pedido de Arte Pixel Art" all
node scripts/import-pixel-ui.mjs "../Pedido de Arte Pixel Art"
# lote parcial de Fase 6; al completar los 96, quitar --partial
node scripts/import-pixel-backgrounds.mjs "../Pedido de Arte Pixel Art" --partial

# ver en el navegador (segundo servidor, no choca con el principal)
NEXT_PUBLIC_ART=pixel NEXT_DIST_DIR=.next-pixel NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npx next dev -p 3112
# galería: http://localhost:3112/galeria-px
# juego en modo local (sin Supabase): http://localhost:3112/run?seed=1234

npx tsc --noEmit && npx eslint src
```

Para jugar sin Supabase hay que vaciar las dos variables `NEXT_PUBLIC_SUPABASE_*` (como arriba). En modo local el gacha da una tirada gratis diaria para tener héroes.

**Caché de imágenes:** en producción `/art/*` se cachea 7 días con el mismo nombre. En desarrollo ya va `no-store`, pero un navegador que haya visto la versión anterior puede conservarla. Fuerza con `fetch(url, {cache: "reload"})` o borra la caché del sitio.

## 6. Decisiones que ya se tomaron (no reabrir)

- **Brillo de enemigos fuera**, por completo: lo pidió el usuario dos veces. No reintroducir tonos claros ni puntos crema sobre el cuerpo. Los héroes conservan sus brillos.
- **Rayo es amarillo**, no morado (el primer intento mezclaba un oscuro violeta con luces amarillas y se veía mal).
- Paletas de Agua, Tierra y Viento son **nuestras** (el artista solo dio Fuego). Siguen sujetas a lo que diga el usuario.
- Sin accesorios por rasgo en pixel: no vinieron con la fase 1. Hoy los rasgos no se dibujan sobre el héroe en pixel.
- Margen transparente de **3 px por lado** en cada cuadro (tira final de 70×96 por cuadro) para que los jefes anchos no sangren el cuadro vecino al escalar. Si el artista entrega más resolución, reajustar `PAD` y las constantes de aspecto (ver 8).

## 7. Código clave

### 7.1 Importador (`scripts/import-pixel.mjs`)

Recolorea por reemplazo exacto de RGB, y para enemigos oscurece/desatura y borra los puntos crema aislados. Cada cuadro recibe margen transparente.

```js
// Importer: pixel-art strips (fire only, 64x96 PNG) -> public/art/<heroes|enemies>-px/ for all 5 elements.
// Usage: node scripts/import-pixel.mjs "<dir>" <heroes|enemies>   (dir has manifest.json + the strips)
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const lot = process.argv[3];
if (!dir || !["heroes", "enemies"].includes(lot)) throw new Error("usage: <dir> <heroes|enemies>");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));

// Tone order: dark, main, light, highlight. Fire comes from the manifest; the rest are ours.
const RAMPS = {
  fire: manifest.recolor.exclusive_ramp_hex,
  water: ["#1F4E8C", "#2F86D9", "#5CC0F0", "#B8EEFF"],
  earth: ["#2F5A34", "#4F9448", "#8CCB5A", "#D4F08A"],
  lightning: ["#7A5412", "#D9A621", "#F8D84A", "#FFF7B0"],
  wind: ["#1F6F6A", "#33B5A0", "#7BE0C0", "#D2FFEA"],
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const key = ([r, g, b]) => (r << 16) | (g << 8) | b;
const src = RAMPS.fire.map(rgb);

// Enemies glow too much: pull the light tones toward the dark one and desaturate a bit (heroes untouched).
const DIM = [0, 0.12, 0.3, 0.45];
const SAT = 0.8;
const dim = (ramp) => ramp.map((h, i) => {
  const c = rgb(h), d = rgb(ramp[0]);
  const mixed = c.map((v, k) => v * (1 - DIM[i]) + d[k] * DIM[i]);
  const gray = mixed.reduce((a, b) => a + b, 0) / 3;
  return "#" + mixed.map((v) => Math.round(gray + (v - gray) * SAT).toString(16).padStart(2, "0")).join("");
});
// No shine at all: the two light tones collapse into one close to the base colour.
const flat = (ramp) => {
  const [a, b] = [rgb(ramp[1]), rgb(ramp[2])];
  const m = "#" + a.map((v, k) => Math.round(v * 0.6 + b[k] * 0.4).toString(16).padStart(2, "0")).join("");
  return [ramp[0], ramp[1], m, m];
};
if (lot === "enemies") for (const k of Object.keys(RAMPS)) RAMPS[k] = dim(flat(RAMPS[k]));

const FW = manifest.frame_width;
const PAD = 3;
const out = `public/art/${lot}-px`;
mkdirSync(out, { recursive: true });
let n = 0;
for (const { file } of manifest.files) {
  const { data, info } = await sharp(join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Enemy shine: isolated bright non-ramp pixels sitting on the body colour (teeth and horns are clusters, so they stay).
  const sparkle = new Set();
  if (lot === "enemies") {
    const work = Buffer.from(data); // removed sparkles are painted as body colour so a second pass can take the rest of a "+"
    const at = (x, y) => (y * info.width + x) * 4;
    const isRamp = (p) => work[p + 3] > 0 && src.some((c) => c[0] === work[p] && c[1] === work[p + 1] && c[2] === work[p + 2]);
    const isBright = (p) => work[p + 3] > 0 && !isRamp(p) && (work[p] + work[p + 1] + work[p + 2]) / 3 >= 190;
    for (let pass = 0; pass < 2; pass++) {
      const found = [];
      for (let y = 1; y < info.height - 1; y++) for (let x = 1; x < info.width - 1; x++) {
        const p = at(x, y);
        if (!isBright(p)) continue;
        let ramp = 0, bright = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const q = at(x + dx, y + dy);
          if (isRamp(q)) ramp++; else if (isBright(q)) bright++;
        }
        if (ramp >= 5 || (ramp >= 3 && bright <= 1)) found.push(p);
      }
      for (const p of found) { sparkle.add(p); [work[p], work[p + 1], work[p + 2]] = src[1]; }
    }
  }
  for (const [el, ramp] of Object.entries(RAMPS)) {
    const map = new Map(src.map((c, i) => [key(c), rgb(ramp[i])]));
    const buf = Buffer.from(data);
    for (const p of sparkle) [buf[p], buf[p + 1], buf[p + 2]] = rgb(ramp[2]);
    for (let p = 0; p < buf.length; p += 4) {
      const to = map.get(key([buf[p], buf[p + 1], buf[p + 2]]));
      if (to) [buf[p], buf[p + 1], buf[p + 2]] = to;
    }
    // PAD transparent columns around every frame so scaling never bleeds the neighbour frame in.
    const cells = info.width / FW;
    const frames = await Promise.all(Array.from({ length: cells }, (_, i) =>
      sharp(buf, { raw: info }).extract({ left: i * FW, top: 0, width: FW, height: info.height })
        .extend({ left: PAD, right: PAD, top: 0, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()));
    await sharp({ create: { width: cells * (FW + 2 * PAD), height: info.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(frames.map((input, i) => ({ input, left: i * (FW + 2 * PAD), top: 0 })))
      .png({ compressionLevel: 9 })
      .toFile(join(out, file.includes("_fire_") ? file.replace("_fire_", `_${el}_`) : file.replace(/^(hero_[a-z]+)_/, `$1_${el}_`)));
    n++;
  }
}
console.log({ written: n });
```

### 7.2 Rama pixel de `HeroSprite` (`src/components/HeroSprite.tsx`)

Constantes arriba del archivo y bloque dentro de `Hero`, justo después de `const cls = CLASS_ART[classId];`:

```tsx
// Alternate art line: NEXT_PUBLIC_ART=pixel swaps the painted heroes for 64x96 pixel art.
const PIXEL = process.env.NEXT_PUBLIC_ART === "pixel";
const PX_ASPECT = 70 / 96; // 64 px frame + 3 px padding per side

const notHoldOf = (action: HeroAction) =>
  !HERO_ACTIONS[action].loop && !("hold" in HERO_ACTIONS[action] && HERO_ACTIONS[action].hold);

// ...dentro de Hero():
if (PIXEL) {
  // ponytail: no trait accessories in pixel art yet (needs a phase 1b layer set).
  const src = `/art/heroes-px/hero_${cls}_${ELEMENT_ART[element]}_${a}.png`;
  const anim = { ...sheet(src, a), aspect: PX_ASPECT };
  const frame = animated ? (
    <AnimSheet anim={anim} onDone={notHoldOf(action) ? () => setDone(true) : undefined} />
  ) : (
    <div
      className="h-full w-full"
      style={{
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${HERO_ACTIONS.idle.frames * 100}% 100%`,
      }}
    />
  );
  return (
    <div
      role="img"
      aria-hidden="true"
      className={`relative aspect-square ${flip ? "-scale-x-100" : ""} ${className}`}
      style={{ imageRendering: "pixelated" }}
    >
      <div
        className="absolute bottom-0 left-1/2 h-full -translate-x-1/2"
        style={{ aspectRatio: PX_ASPECT, transform: `translateX(-50%) ${crop ? "scale(1.22)" : ""}`, transformOrigin: "50% 94%" }}
      >
        {frame}
      </div>
    </div>
  );
}
```

### 7.3 Enemigos (`src/lib/art/enemies.ts` y `src/components/EnemySprite.tsx`)

```ts
// enemies.ts, arriba de EnemyAction
export const PIXEL = process.env.NEXT_PUBLIC_ART === "pixel";
export const PX_ASPECT = 70 / 96; // 64 px frame + 3 px transparent padding per side (scripts/import-pixel.mjs)
export const PX_ACTIONS = {
  idle: { frames: 4, fps: 6, loop: true },
  attack: { frames: 4, fps: 10, loop: false },
  hit: { frames: 2, fps: 12, loop: false },
  defeat: { frames: 4, fps: 8, loop: false },
  entrance: { frames: 4, fps: 10, loop: false },
} as const;

// enemies.ts, dentro de enemyAnim, justo después de const e = ELEMENT_ART[element];
if (PIXEL) {
  const a = action === "entrance" && tier !== "boss" ? "idle" : action;
  return { src: `/art/enemies-px/${design}_${e}_${a}.png`, ...PX_ACTIONS[a], aspect: PX_ASPECT };
}
```

```tsx
// EnemySprite.tsx: import { enemyAnim, PIXEL, PX_ASPECT, type EnemyAction } from "@/lib/art/enemies";
<div
  className={PIXEL ? "mx-auto h-full" : "h-full w-full"}
  style={PIXEL ? { aspectRatio: PX_ASPECT, imageRendering: "pixelated" } : undefined}
>
  <AnimSheet key={shown} anim={anim} flip={flip} last={cue?.held && !action && shown === "defeat"}
    className="h-full w-full" onDone={() => setDone(true)} />
</div>
```

### 7.4 `next.config.ts` (dos cambios)

```ts
const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next", // lets a second dev server (pixel art line) run beside the main one
  // ...
  // en el header de /art/:path*
  value: isDev ? "no-store" : "public, max-age=604800, stale-while-revalidate=2592000",
```

La galería `src/app/galeria-px/` (`page.tsx` con `notFound()` en producción y `Gallery.tsx` cliente con selectores de lote, acción, fondo y zoom) ya está en la rama; no la copio aquí.

## 8. Pendientes y mejoras conocidas (por prioridad)

1. **Calidad percibida de los héroes.** Los cuadros son de 64×96 y el usuario compara con una referencia mucho más detallada (≈4-5× la resolución). No se puede recuperar detalle escalando (Scale2x/xBR suavizan sin agregar; la IA rompe el recoloreo exacto y parpadea entre cuadros). Camino recomendado: pedir al artista los **mismos cuadros a 128×192 o 192×288** (o su archivo original). Cuando lleguen: cambiar `PAD` proporcionalmente, `PX_ASPECT` (hoy 70/96 en `HeroSprite.tsx`, `enemies.ts` y `Gallery.tsx`), la base 90/96 del anclaje y revisar que el recoloreo siga encontrando la rampa exacta.
2. **Escalado a números enteros.** Hoy el sprite se dibuja al tamaño que deja cada pantalla, que casi nunca es múltiplo de 64×96; con `pixelated` salen píxeles de distinto ancho. Mejora: calcular `k = max(1, floor(altoDisponible / 96))` y fijar el sprite a `96*k` px de alto. Probar en hub, combate, tarjetas de colección (`ItemCard`, modo `crop`), gacha, salas y podio.
3. **Fases 5 a 7**, en ese orden, una por vez y con revisión visual antes de seguir. Nombres de archivo y carpetas de referencia están en `docs/PEDIDO_ARTE_3.md` y en `public/art/<lote>/`. Para cada fase: importador nuevo o extensión de `import-pixel.mjs`, interruptor `PIXEL` en el componente que hoy lee ese arte (`Icon`, `ItemCard`, `Panel`/9-slice, `ArenaBackground`, `Vfx`/`BattleFx`), y entrada en la galería de desarrollo si tiene sentido.
4. **Accesorios de rasgo** (fase 1b): sin arte de capas, los 24 rasgos no se ven sobre el héroe en pixel. Hoy se ignoran en `HeroSprite`. Pedir las capas al artista o mostrar el rasgo con un chip.
5. Revisar con el usuario las paletas de Agua, Tierra y Viento.
6. Revisión visual que no hicimos: celular, salas en vivo (`/sala`), podio, jefe cooperativo y las animaciones `entrance` de los jefes en una pelea real. Quedó una "+" mínima de brillo en el limo élite.
7. Cuando una fase quede aprobada y la línea pase a ser la oficial: quitar el interruptor, borrar el arte pintado equivalente y el código de respaldo, y actualizar `CLAUDE.md` (sección "Arte"). **No antes de que el usuario lo apruebe.**

## 9. Para subir el git

**Actualización vigente, 8 de octubre de 2026:** la rama de pixel art fue fusionada; `main` es la rama actual. El usuario autorizó commit y push de cambios visuales al completar cada fase. Las instrucciones anteriores sobre `design/pixel-art` son históricas.

- Rama `design/pixel-art`; PR contra `main` solo cuando el usuario lo pida. No fusionar sola.
- Antes de commitear: `git status`. Los dos documentos de arte ya estaban versionados en la rama remota. `docs/PROPUESTA_RUN_V2.md` es del usuario, de otro tema: no la toques ni la incluyas sin preguntar.
- No subir las carpetas de origen (`Downloads/heroes`, `Downloads/enemies`) ni nada de `.next*`.
- Vercel despliega cada push a `main`; en esta rama no hay despliegue a producción, pero genera preview por rama.

## 10. Validación de este traspaso

- Cierre de Fases 4 y 5: TypeScript sin errores; ESLint sin errores y 7 advertencias preexistentes; Vitest aprobó los 37 archivos y 449 pruebas en una corrida completa. El primer intento aislado falló por archivos temporales SSR inexistentes; la repetición autorizada fuera del aislamiento pasó completa, sin modificar reglas ni tiempos de espera.
- Galería local: `/galeria-px` confirmó 257 íconos sin recursos faltantes y todos con render pixelado. Reliquias: 24 bases, 72 variantes y 3 distintivos, agrupados y etiquetados en español. Se comprobó que la importación de las 99 reliquias conserva exactamente sus píxeles.
- Todos los íconos son PNG nativos de 32×32, alfa binario, un cuadro, fps 0 y anclaje central `(16, 16)`. El manifiesto acumulado de `icons/` contiene 257 entradas: 19 de Fase 3 y 238 de Fase 4, con paleta efectiva por archivo. Los cinco núcleos y elementos usan rampas canónicas.
- Los doce ZIP por lote contienen respectivamente 25, 22, 24, 15, 8, 9, 7, 4, 25, 33, 33 y 33 PNG, cada uno con manifiesto. `phase_4_relics.zip` contiene 99 PNG; `phase_4_icons_complete.zip` contiene los 238 PNG de Fase 4. Se verificaron integridad de ZIP y coincidencia con los archivos finales.
- Las reliquias reutilizan cinco bases aprobadas y generan 19 objetos nuevos. Cada objeto mantiene la misma geometría entre sus tres variantes; los adornos de rareza difieren por forma. Los tres distintivos reutilizan símbolos de rango aprobados. No se entregan fuentes ni carpetas de trabajo.
- El arte pintado sigue disponible sin `NEXT_PUBLIC_ART=pixel`. La galería sigue siendo solo de desarrollo. No se verificaron partidas multijugador, móvil o despliegue de producción en este cierre.
- No subir originales, ZIP, borradores, `node_modules` ni `.next*`. Próximo paso: completar las 5 pantallas pendientes de Fase 6, ejecutar las pruebas de cierre y entregar el paquete completo de 96 archivos. No producir Fase 7 todavía. Fase 6 conserva la decisión del usuario: 90 capas de combate y 6 pantallas como imagen única.

### Cierre de Fase 5

- `phase_5_ui.zip`: 130 PNG y manifiesto, 131 entradas, integridad verificada; los 130 PNG importados coinciden byte por byte con la entrega. El manifiesto acumulado de `ui/` conserva 9 cartas de Fase 3 y añade 130 entradas de Fase 5 (139 total).
- Paneles 64×64, corte 8 px; botones, pestañas, título y campos 64×24, cortes 6/8/6/8; casillas 32×32, corte 6; barras 64×12, corte 4; controles y glifos pequeños a resolución nativa. Cada recurso declara tamaño, cuadro, fps, loop, anclaje central, paleta efectiva y cortes cuando corresponden.
- Emblema 64×64, wordmark 256×64, logo horizontal 320×96 y apilado 192×192; nueve tamaños de favicon derivados con vecino más próximo. Tres cofres 32×32 (cerrado, abierto con cristales azules, abierto con oro). Se conservan Nunito y Alegreya para los textos vivos, con tildes y ñ.
- Excepción intencional: `modal_scrim.png`, 8×8 con alfa uniforme 192, oscurece el fondo de un modal. Los otros 129 recursos tienen alfa binario. Sin sombras exteriores; contornos azul oscuro, acero y detalles dorados.
- Galería Interfaz: 130 imágenes completas y render pixelado, sin desbordamiento horizontal; muestra de los cinco botones, campos, checkbox/radio, slider y barra. Panel probado a 320 y 640 px con cortes constantes de 8 px. Los controles mantienen su estado seleccionado al recibir foco.
- Pruebas de cierre: TypeScript sin errores, ESLint sin errores con advertencias preexistentes y Vitest 37 archivos / 449 pruebas aprobados. La UI pintada sigue siendo el modo predeterminado; el kit pixel se activa con `NEXT_PUBLIC_ART=pixel`. No se cambió lógica de juego, sonido ni fondos o efectos.

### Fase 6 — lote 1 y bloqueo de cuota

**Estado actual:** Fase 6 terminada y subida a `main` en `0fb2750`. Después de integrar la actualización remota `b99ac88`, TypeScript y las 414 pruebas de 43 archivos pasaron. El bloqueo y los pendientes descritos más abajo corresponden al lote histórico.

**Cierre, 8 de octubre de 2026:** desbloqueada la herramienta integrada y completadas las cinco pantallas pendientes a 960×540 con el detalle HD aprobado. Total 96 PNG: 91 anteriores a 320×180 sin modificar y 5 nuevos a 960×540. Paquete `Pedido de Arte Pixel Art/phase_6_backgrounds_complete.zip` (97 entradas), 4,86 MB. Dimensiones por archivo, alfa binario y pantallas opacas verificados; PNG importados idénticos a la entrega y al ZIP. Importador sin `--partial`: 96 recursos / 24 escenarios. TypeScript y ESLint sin errores; Vitest 42 archivos / 412 pruebas aprobados. El primer intento de Vitest falló por temporales del aislamiento y la repetición local pasó. El usuario autorizó Fase 7 y pospuso mejorar las demás fases hasta cerrar las pendientes.

- El 7 de octubre de 2026 se completaron **91 PNG finales**: los 18 escenarios de combate en 5 capas (90 archivos) y `menu_desktop_composite.png`. `phase_6_backgrounds_batch_1.zip` contiene 91 PNG y manifiesto (92 entradas); integridad comprobada. Los 91 recursos de juego coinciden byte por byte con la entrega. La Fase 6 **no está terminada**.
- Las capas comparten lienzo nativo **320×180, 16:9**, sin suavizado ni exportaciones mobile o escaladas. Anclaje central `(160, 90)`, un cuadro, fps 0, loop falso. Suelo al 70 % (`y=126`). Cielo y menú opacos; las otras capas tienen alfa binario y RGB cero en píxeles transparentes. El manifiesto declara la paleta real, escena, capa y parallax de cada archivo.
- Se generaron 9 planos lejanos y 9 grupos de arquitectura transparentes, más el menú. Las parejas normal/jefe comparten cielo, plano lejano y primer plano; los jefes añaden altares con ornamentos de reliquias aprobadas y una marca de suelo. Suelo y primer plano usan texturas de píxeles y paletas coherentes con cada entorno.
- Galería: 19 escenarios disponibles, 91 rutas únicas, ninguna imagen faltante y todas pixeladas; control de capas verificado (5→4→5). La preferencia de movimiento reducido estaba activa y deshabilitó la animación al activar Movimiento. El parallax conserva sus factores y usa pasos de un píxel, sin el escalado suave del modo pintado.
- `bgSrc` usa la imagen desktop pixel también en celular solo si está registrada. Las 5 pantallas aún no entregadas conservan su arte pintado y sus variantes mobile; no aparecen como escenas vacías en la galería. El modo pintado predeterminado se conserva.
- **Bloqueo real:** la herramienta integrada devolvió `usage_limit_reached` para las últimas 5 imágenes. El usuario eligió esperar al reinicio, sin usar la API de pago. Reinicio comunicado por la herramienta: **8 de octubre de 2026, aproximadamente 13:37 Argentina (16:37 UTC)**. No volver a generar los 91 archivos terminados.
- Pendientes exactos: `collection_desktop_composite.png`, `gacha_desktop_composite.png`, `lobby_desktop_composite.png`, `market_desktop_composite.png`, `forge_desktop_composite.png`. Cada pantalla es una sola imagen opaca, por decisión del usuario. Continuar con el mismo estilo y paleta; conservar el manifiesto acumulado de fondos.
- Al reanudar: generar solo esos 5 recursos, ampliar el manifiesto a 96, ejecutar el importador sin `--partial`, verificar la galería de 24 escenarios, correr TypeScript/ESLint/Vitest una vez y hacer commit/push de cierre. No se ejecutaron esas pruebas de código en este lote parcial, conforme a la instrucción de probar al terminar la fase. Se hicieron validaciones de formato, ZIP, importación y revisión visual.
- Entrega solo de PNG finales, manifiesto y ZIP; carpetas temporales eliminadas. Los borradores y fuentes no entran al repositorio.

### Cierre de Fase 7 — efectos HD

- Completada el 8 de octubre de 2026: **71 efectos principales y 71 versiones reducidas**, 142 PNG nativos finales. ZIP `Pedido de Arte Pixel Art/phase_7_effects.zip`: 143 entradas y 1.999.074 bytes; integridad, dimensiones e importación idéntica verificadas. Entrega sin fuentes ni borradores.
- Diseños nuevos con detalle acorde a la referencia aprobada de Caballero 128×192 y fondos 960×540. Golpes 128×128; auras, forja e invocación 192×192; entradas por rango 384×192; resultados 384×128; emotes 64×64; glifos 32×48 (13 filas, avance 16); brillos 128×176; confeti 256×256; podio 384×256; esquive y crítico 128×64. Cada archivo declara su tamaño y anclaje central.
- Se conservaron frames, fps, loop, finish y glyphRow de `effects.generated.ts`; 426 cuadros por animación y 642 celdas incluyendo filas numéricas. Reduced usa una sola columna; las decoraciones suprimidas son transparentes conforme al catálogo original. Alfa binario, máximo 96 colores y RGB cero donde transparente. Finales remove vacíos, hold visibles y ciclos continuos.
- Cofres pasan de cerrado a abierto; portales, cofres y revelaciones usan máscaras y distintivos de rango aprobados, diferenciados por forma. Números y textos usan Nunito Bold libre (OFL), contorno 2 px y textos españoles. Se reutilizaron bases generadas y transformaciones de piezas, sin ampliar el arte pintado anterior.
- `import-pixel-effects.mjs` valida los 142 nombres y conserva el catálogo pintado; `effects.ts` selecciona PNG pixel o respaldo pintado. `Vfx` centra las imágenes a múltiplos enteros de su tamaño nativo, también en movimiento reducido; se conserva el ocultamiento remoto de efectos estáticos. Sin modificar reglas, sonido ni AnimSheet.
- Galería Efectos: 71 rutas principales y 71 reducidas cargadas sin archivos faltantes. Revisión de cofres, emotes y resultados; en `/prueba` se comprobó un efecto de 192×192 a 1× y glifos de daño de 48 px, con render pixelado. TypeScript sin errores, ESLint sin errores (dos advertencias de img nativo) y Vitest **43 archivos / 414 pruebas aprobados**.
- Fases 6 y 7 terminadas. Próximo paso: revisión del usuario y decisión sobre adaptar las fases anteriores al detalle HD; esa conversión todavía no está autorizada. La referencia estática del Caballero no sustituye sus tiras animadas actuales.

### Actualización posterior: Fase 1 — héroes HD

El usuario aprobó las cuatro clases y autorizó sus animaciones HD el 8 de octubre de 2026. Se completaron 40 bases / 144 cuadros nativos 128×192 y 200 variantes / 720 cuadros de reproducción 140×192, con padding 6 y anclaje (70,180). Armas incluidas; diez acciones con cuadros, fps, loop y hold originales. La rampa de Fuego se recolorea a Agua, Tierra, Rayo y Viento sin modificar los píxeles neutros ni el alfa. Entrega: Pedido de Arte Pixel Art/phase_1_heroes.zip y heroes/manifest.json; sin fuentes ni borradores.

import-pixel.mjs valida dimensiones y catálogo antes de reemplazar archivos y genera pixel-heroes.generated.json. HeroSprite y la galería consumen esas dimensiones, independientemente de los enemigos. La arena mantiene el héroe al menos a 192 px; tarjetas pequeñas a 96 px (mitad exacta). Se revisó /prueba?n=3 en 1920×1080, 2560×1440 y 390×844. En 2K, los cuatro personajes de prueba se muestran a 384 px de alto; en móvil, el protagonista a 192 y los rivales de prueba a 96. La preferencia de movimiento reducido sigue respetándose.

TypeScript y ESLint aprobados; 43 archivos / 414 pruebas aprobadas. La primera corrida de Vitest falló por los temporales del aislamiento; la repetición fuera del aislamiento pasó. Verificados los 200 PNG píxel por píxel contra las bases y rampas, alfa binario y márgenes transparentes. La comparación de desarrollo conserva los cuatro reposos anteriores en pixel-hd-sample/heroes/previous. Las Fases 2–5 todavía no se convirtieron a HD. La actualización posterior de fondos de combate se describe a continuación.

### Actualización posterior: Fase 6 — fondos de combate HD

Alcance autorizado el 8 de octubre de 2026: reemplazar las **90 capas de combate** por lienzos nativos **960×540**. Son nueve temas con salas normal y jefe, **18 escenas**, cada una con cielo, plano lejano, plano medio, suelo y primer plano. Los nombres existentes se conservan. Las seis pantallas completas de menú, colección, gacha, sala, mercado y forja ya están en HD y se mantienen sin cambios.

La muestra aprobada de Pantano aporta sus cinco capas nativas. Los otros ocho temas reciben nuevos planos lejanos y arquitectura, conservando iluminación superior izquierda y el detalle de píxel de la muestra. Normal y jefe comparten cielo, plano lejano y primer plano; la sala del jefe añade arquitectura ceremonial propia y detalles de suelo. Las texturas de suelo y primer plano se adaptan por máscaras de materiales a partir de la referencia nativa aprobada; no se amplían los fondos de 320×180.

Cada archivo declara un cuadro, fps 0, loop falso, anclaje central `(480,270)`, paleta real y factor de parallax: cielo 0, lejos 0.12, medio 0.28, suelo 0 y primer plano 0.5. Suelo desde el 70 % (`y=378`); cielo opaco y transparencia binaria con RGB cero en las otras capas. La entrega acumulada sigue siendo **96 PNG**, con manifiesto y `phase_6_backgrounds_complete.zip` fuera del repositorio.

El importador acepta dimensiones antiguas y HD, comprueba consistencia entre las cinco capas de cada escena y valida anclajes. `ArenaBackground` consume la altura nativa del manifiesto; el escalado entero utiliza 540 px para estas escenas. La galería mantiene miniaturas de 320×180 y permite inspeccionar el lienzo nativo y las capas individuales. Se preservan héroes HD, efectos, fondos pintados, recorte móvil y reglas del juego.

**Producción completa:** 90 capas HD exportadas e importadas, 18 escenas de combate y seis pantallas HD anteriores intactas. Validación exhaustiva aprobada para los 96 PNG: dimensiones 960×540, anclajes (480,270), paletas exactas, alfa binario, RGB transparente cero y suelo opaco desde y=378. Los PNG importados coinciden byte por byte con la entrega. Los seis composites coinciden con el respaldo anterior. ZIP completo de 97 entradas, 22.318.582 bytes, integridad e igualdad con la entrega verificadas. SHA-256 del paquete: `d81196916a382780491179351f214b6c6c665fd36018e3e1b55fdd05e51d8f10`.

**Código aprobado:** TypeScript sin errores, ESLint sin errores ni advertencias en los tres archivos modificados y Vitest **44 archivos / 421 pruebas aprobadas**. La primera revisión de TypeScript detectó referencias obsoletas en los tipos autogenerados de Next a una ruta retirada por la actualización remota; tras regenerar los tipos y reiniciar el servidor, la repetición pasó. ESLint se completó fuera del aislamiento después de que el primer proceso dejara de responder.

**Revisión visual completada:** las 18 escenas y sus capas cargan correctamente en la galería. Combate revisado en 1920×1080, 2560×1440 y 390×844, con capas nativas 960×540 y escalas enteras 2×, 3× y 1× respectivamente. Sin imágenes ausentes ni suavizado. En móvil permanece la distribución previa de tres rivales con el protagonista en la fila superior; no se modificó esa distribución en esta fase. Fase lista para commit y push a `main`.

### Actualización posterior: Fase 2 — enemigos y jefes HD

Producción completa: **24 diseños**, cinco familias con tres niveles y nueve jefes finales, **110 bases de Fuego / 392 cuadros**, importadas como **550 tiras / 1.960 cuadros** en cinco elementos. Cuadros nativos 128×192, pies (64,180); margen lateral 6 px y tamaño de reproducción 140×192, pies (70,180). Las 24 criaturas mantienen reposo, ataque, golpe y derrota; los cinco jefes de familia y nueve finales también tienen entrada. Nombres, cuadros, fps y loop se conservan del catálogo existente.

Ocho atlas aportan cuatro poses originales por diseño, con escala uniforme, alfa binario y máscara exclusiva elemental de cuatro tonos, incluidos los brillos cálidos del cuerpo y excluidos el marfil y el acero. Animaciones derivadas mediante movimiento de un píxel de la parte superior; entrada por revelado binario. Los píxeles neutros y la transparencia permanecen iguales entre elementos. Cada tira base contiene máximo 96 colores. Los filtros de brillo antiguos se conservan solo para recursos de 64×96, sin alterar el detalle HD nuevo.

`import-pixel.mjs` valida las 110 bases antes de reemplazar recursos y genera dimensiones independientes en `pixel-enemies.generated.json`. `EnemySprite`, estilos y galería consumen esa altura nativa. La galería usa reposo al seleccionar entrada de normales o élites. Se preservan los héroes HD, fondos HD, efectos, recursos pintados y lógica de juego. Paquete previsto: `phase_2_enemies.zip`, 110 bases más manifiesto; los atlas y vistas de revisión quedan fuera del repositorio.

**Activos completados y validados:** 110 bases / 392 cuadros nativos y 550 variantes / 1.960 cuadros importados. Verificados catálogo exacto, anclajes, comportamiento de animación, máximo 96 colores por base, alfa binario, RGB transparente cero y recoloreado píxel por píxel con margen 6. El ZIP de 111 entradas coincide byte por byte con las bases y manifiesto, integridad aprobada, 3.223.212 bytes; SHA-256 `a751d77dc3f9d315129c8f8c7fa55093bb1674fe76199f4919d02211b6f7affb`.

**Código aprobado:** tipos de rutas regenerados correctamente en `.next` y `.next-pixel` después de actualizar main. TypeScript y ESLint sin errores ni advertencias en los archivos modificados de integración. Vitest: **45 archivos / 423 pruebas aprobadas**. La revisión visual en 1080p pasó y los cuadros de 384 px en 2K fueron comprobados; la captura de 2K se demoró por las 120 animaciones simultáneas del catálogo. La galería ahora muestra primero el mapa y permite abrir u ocultar el catálogo de variantes para facilitar la revisión. Revisión final aprobada: catálogo desplegable, entrada de jefe que vuelve a reposo y derrota mantenida en el último cuadro. Muestra con componentes reales revisada a 1920×1080, 2560×1440 y 390×844, con actores a 192, 384 y 192 px respectivamente; las cuatro poses de los 24 diseños fueron inspeccionadas. Fase lista para commit y push.

### Actualización posterior: Fase 3 — objetos HD

Completada el 8 de octubre de 2026: 42 bases (nueve armas, cinco piezas de equipo, catorce partes, cinco núcleos y nueve marcos); 98 PNG importados, con las cinco variantes elementales de armas y equipo. Objetos, partes y núcleos nativos 64×64, marcos 120×160; anclajes centrales, un cuadro, fps 0, loop falso, alfa binario y máximo 96 colores. Rampa exclusiva de Fuego: #8F2035, #D94728, #F88636, #FFD36B. Recoloreado exacto sin alterar acero, oro, madera ni cuero neutros.

import-pixel-static.mjs prevalida nombres, dimensiones, anclajes y transparencia antes de sustituir archivos; pixel-items.generated.json registra los 98 tamaños para la galería. Los otros 238 íconos mantienen su tamaño. Las partes representan componentes sueltos; los marcos tienen la abertura común aprobada, con rieles registrados y ornamentos distintos por rango. La corrección previa de proporciones de héroes permanece intacta.

Paquete externo Pedido de Arte Pixel Art/phase_3_items.zip: 42 PNG y cuatro manifiestos filtrados, 46 entradas y 224.644 bytes. SHA-256 d0c29c9855fe0df7fa457aa5d984e3b306cd80a75473c63e6a32212be93840c2. ZIP, manifiestos, paletas, alfa, centro y recoloreado de los 98 recursos validados. Revisión de todas las variantes en galería, marcos en tarjetas reales e inventario móvil 390×844 sin desbordamiento ni imágenes faltantes. Main actualizado hasta 0c04658, preservando duelos remotos; TypeScript y ESLint aprobados y Vitest 49 archivos / 452 pruebas aprobadas. Sin fuentes, prompts ni borradores en el paquete o repo. Fase lista para commit y push; no avanzar a Fase 4 sin instrucción del usuario.

## Actualización de Fase 5: interfaz HD — Acero y Oro

Completada el 8 de octubre de 2026 con la primera dirección elegida por el usuario. Kit de 130 PNG con los nombres existentes: 25 botones, seis paneles, cinco casillas, cinco pestañas, cuatro campos, cuatro selectores, ocho barras, seis checkbox, seis radio, cuatro interruptores, cuatro deslizadores, dos barras de desplazamiento, 18 marcos cuadrados de rango, 14 símbolos, tres cofres, cuatro logos, nueve favicons, un separador, un título y un fondo de modal. Se conservan las nueve cartas HD de Fase 3 en el manifiesto acumulado de 139 entradas.

120 texturas duplican su tamaño nativo: botones 128×48, paneles 128×128 y casillas 64×64; `display_scale: 0.5` conserva las dimensiones visibles de los controles. Los nueve favicons mantienen la dimensión de su nombre y el modal sigue en 8×8. Los 80 recursos 9-slice tienen cortes de fuente duplicados, independientes del grosor visible: panel 16→8 px y botón 12/16→6/8 px. El importador prevalida el catálogo entero, centro, escala, alfa y cortes antes de copiar; genera el JSON y `pixel-ui.generated.css`, consumidos por estilos y galería. Los controles GameSelect también usan el skin pixel.

Estilo: acero azul, interiores navy, ribetes dorados y luz arriba a la izquierda; texto oscuro en botones principales y de oro, blanco cálido en acero/neutro/peligro, gris legible al deshabilitar. Foco cyan, oro para pestañas activas y selección. Los ornamentos de rango difieren por forma dentro de las esquinas fijas. Cofre 1 cerrado, cofres 2 azul y 3 dorado abiertos para conservar la señal de premio reclamado. Los logos conservan el dragón, escudo y espadas originales, con el nombre Boludos & Dragones y Alegreya ExtraBold local de licencia OFL.

Todos los PNG declaran un cuadro, fps 0, loop falso, centro y paleta exacta (máximo 76 colores por archivo). Alfa binario y RGB transparente cero; única excepción, scrim uniforme 192. PNG de entrega e importación idénticos; cartas anteriores verificadas contra el ZIP de Fase 3 y sin cambios en frames-px. Paquete externo `Pedido de Arte Pixel Art/phase_5_ui.zip`: 130 PNG y manifiesto filtrado, 131 entradas, 847.917 bytes. SHA-256 `b71923e74e13e87c69b8e1a517f08af9cb13855114bc12425368054077fe58f4`. Integridad, dimensiones, paletas, centros, escalas y 80 cortes aprobados. Fuentes, prompts, atlas y capturas de trabajo fuera de la entrega y del repositorio.

Revisión visual: los 130 recursos cargan en galería; paneles a 320 y 640 px, textos con tildes y ñ, selección y checkbox operativos, comparación de 25 estados. Galería y colección revisadas en 1920×1080, 2560×1440 y 390×844; galería también a 320 px, sin desbordamiento horizontal. Respaldo pintado comprobado al alternar el interruptor. No se cambian gameplay, héroes, enemigos, objetos, fondos ni otras fases. Main actualizado hasta `ed70b6b`, conservando la actualización remota de salas.

TypeScript y ESLint aprobados. Vitest: 50 archivos / 458 pruebas aprobadas; tres pruebas nuevas protegen catálogo, dimensiones visibles y los 80 cortes CSS. Tras los últimos ajustes de ornamentos y cofres se repitió la validación exhaustiva de recursos; la prueba específica de UI también pasó después del cambio de ornamentos. Fase lista para commit y push a main. Quedan por adaptar Fase 4 (íconos) y Fase 7 (efectos); esperar autorización del usuario.

## Actualización de Fase 4: íconos HD

Completada el 9 de octubre de 2026 por autorización del usuario. Catálogo exacto de 238 PNG estáticos nativos 64×64: 99 reliquias (24 bases, 72 variantes y tres distintivos), 24 rasgos, 18 habilidades, 17 símbolos de sistema, 15 mejoras, nueve rangos, nueve dungeons, ocho eventos, ocho estadísticas, siete puertas, siete ascensiones, cinco elementos, cuatro clases, cuatro pasivos y cuatro modificadores de enemigos. 138 diseños base producidos en siete atlas originales y 100 exportaciones derivadas comparten recursos aprobados de las otras fases. Estilo de aventura de fantasía, contornos oscuros, luz superior izquierda y acero/oro coherente con los objetos e interfaz HD.

Cada PNG declara un cuadro, fps 0, loop falso, centro (32,32) y paleta exacta de hasta 96 colores. Alfa binario y RGB transparente cero. Los nombres existentes se conservan. El manifiesto acumulado tiene 257 entradas: se verificaron intactas las 19 partes y núcleos de Fase 3. No se reescriben los 98 registros de objetos. El importador valida el catálogo completo antes de copiar y registra las dimensiones nativas, conservando compatibilidad con el registro histórico. Icon usa pixelated y mantiene los tamaños visibles de los controles; la galería muestra el tamaño nativo por escala entera. La versión de URL de íconos pixel pasa a v=3 para invalidar la caché anterior; el arte pintado conserva v=2.

Paquete externo Pedido de Arte Pixel Art/phase_4_icons.zip: 238 PNG y manifiesto filtrado, 239 entradas, 1.278.168 bytes. SHA-256 11f4c4563b6c0dd02a2e1196f1ec8c4e04de432417beef27f4c0568e1ddca520. Validación exhaustiva de nombres, dimensiones, paletas, transparencia, anclajes e integridad del ZIP. Los píxeles de entrega y runtime coinciden, aunque la compresión PNG difiere. Prompts y atlas originales conservados fuera del repositorio y de la entrega final.

Revisión visual de todos los grupos y galería con 257 íconos cargados, escalas x1/x2, 1920×1080, 2560×1440 y móvil 390×844 / 320×740, sin desbordamiento ni imágenes faltantes. Colección real revisada: clases, rasgos, elementos, rangos y estrellas usan PNG de 64×64 con proporción cuadrada y sus tamaños visibles existentes. TypeScript y ESLint aprobados; Vitest 51 archivos / 467 pruebas aprobadas, incluida cobertura de catálogo, dimensiones, respaldo y caché. La prueba específica volvió a pasar después de ajustar la versión de caché.

Main actualizado hasta 2cded81 antes de publicar, conservando las mejoras remotas de loot. Suposición de alcance: icon_material_loaded_die e icon_material_scales no pertenecen al catálogo aprobado de 238; mantienen su respaldo pintado. Fase lista para commit y push. Solo queda la actualización HD de Fase 7 (efectos); no avanzar sin instrucción del usuario.