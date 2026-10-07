# Línea de arte pixel: traspaso a otra IA

Rama de trabajo: `design/pixel-art` (sale de `main` en `4d23f57`). Commits de esta línea: `e969c0b`, `b896a25`, `c485230`, `c56f862`, `b2cddf9`.
Tú (la otra IA) integras el arte que llegue y **subes el git** (commit, push, PR). Yo no he empujado nada.

Reglas del proyecto que siguen valiendo (ver `CLAUDE.md`): textos de UI en español, código y commits en inglés, componentes sin lógica de juego, `tsc` + `eslint` siempre antes de cerrar, capturas pocas y a escala 0.5, preferir `read_page`/DOM a imágenes. Commits pequeños, uno por cambio lógico, con la línea `Co-Authored-By` que indique tu entorno.

## 0. Dónde está el código y cómo obtenerlo

- Repositorio: `https://github.com/joerojas2810-collab/Boludos-Dragones.git` (remoto `origin`). En GitHub **solo existe `main`**.
- La rama `design/pixel-art` está **solo en la carpeta local** `/Users/josephrojas/Desktop/Nuevo Juego` y **nunca se ha empujado**. Tiene 5 commits propios y archivos sin versionar (los dos `.md` de arte).
- Caso A, trabajas en esta misma computadora (lo más simple): abre esa carpeta, `git checkout design/pixel-art` y sigue desde ahí. Ahí ya están `node_modules`, `.env.local` y `.claude/launch.json`. Después `git push -u origin design/pixel-art`.
- Caso B, trabajas en otra máquina o en la nube: antes hay que empujar la rama desde esta carpeta (`git add docs/PEDIDO_ARTE_3.md docs/PIXEL_ART_HANDOFF.md && git commit && git push -u origin design/pixel-art`). Solo entonces `git clone` + `git checkout design/pixel-art` la trae.
- No viven en el repo y hay que tenerlos aparte: `.env.local` (secretos de Supabase; no hace falta para el modo local de esta línea de arte), `node_modules` (`npm install --legacy-peer-deps`, ver `CLAUDE.md`) y las carpetas con el arte de origen en `Downloads/heroes` y `Downloads/enemies` (solo para volver a correr el importador; los PNG finales ya están en `public/art/*-px/`).

## 1. Qué es esto

Una línea de arte **alterna** al arte pintado actual (`public/art/*.webp`). Reemplaza al pintado cuando esté aprobada, pero mientras tanto **conviven** y se elige con un interruptor de compilación:

```
NEXT_PUBLIC_ART=pixel   -> héroes y enemigos en pixel art
(sin variable)          -> arte pintado, igual que antes
```

Pedido de arte completo por fases: `docs/PEDIDO_ARTE_3.md` (archivo sin versionar aún; súbelo). Una fase por vez, sin avanzar sin aprobación del usuario.

## 2. Estado por fase

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Héroes (4 clases × 10 acciones, 64×96) | Entregada, integrada, aprobada |
| 2 | Enemigos (5 familias × normal/élite/jefe + 9 jefes finales) | Entregada, integrada, aprobada con ajustes (sin brillo) |
| 3 | Armas, equipo, partes, núcleos, marcos de carta | Pendiente |
| 4 | Íconos del sistema | Pendiente |
| 5 | Interfaz (9-slice, botones, barras, logos) | Pendiente |
| 6 | Fondos (5 capas) | Pendiente |
| 7 | Efectos | Pendiente |

Mientras no lleguen las fases 3 a 7, la pantalla mezcla pixel (héroes y enemigos) con arte pintado (resto). Es esperado.

## 3. Datos de las entregas

- Fase 1 y 2: PNG por tira horizontal, cuadro **64×96**, sin escalar (`scale: 1`), alfa binario, luz arriba-izquierda, anclaje de pies en `(32, 90)`. Solo en Fuego; los otros 4 elementos los generamos por recoloreo exacto de la rampa de 4 tonos del `manifest.json`:
  `#8F2035 #D94728 #F88636 #FFD36B` (oscuro, base, claro, brillo).
- Héroes: `hero_<clase>_<acción>.png`, clases `knight mage rogue cleric`, acciones `idle attack_1 attack_2 attack_3 defend perfect_guard hit dodge defeat victory`.
- Enemigos: `enemy_<familia>_<normal|elite|boss>_fire_<acción>.png` y `boss_<id>_fire_<acción>.png`. Familias `slime imp harpy golem specter`. Acciones `idle attack hit defeat entrance` (entrance solo en jefes). Jefes finales por rango (del manifest): f great_devourer, e ash_king, d withered_queen, c hollow_colossus, b eternal_watcher, a mother_hydra, s lord_of_flies, ss faceless_one, ssr thunder_king.
- fps y cuadros por acción: héroes en `src/lib/art/heroes.ts` (`HERO_ACTIONS`); enemigos en `PX_ACTIONS` de `src/lib/art/enemies.ts` (idle 4/6 loop, attack 4/10, hit 2/12, defeat 4/8 queda, entrance 4/10).
- Origen en esta máquina: `/Users/josephrojas/Downloads/heroes/` y `/Users/josephrojas/Downloads/enemies/` (fuera del repo; no subir originales).

## 4. Archivos que tocan esta línea

| Archivo | Rol |
|---|---|
| `scripts/import-pixel.mjs` | Importador de héroes y enemigos: recoloreo, quita brillo en enemigos, agrega margen |
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
node scripts/import-pixel.mjs "/Users/josephrojas/Downloads/heroes"  heroes
node scripts/import-pixel.mjs "/Users/josephrojas/Downloads/enemies" enemies

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
3. **Fases 3 a 7**, en ese orden, una por vez y con revisión visual antes de seguir. Nombres de archivo y carpetas de referencia están en `docs/PEDIDO_ARTE_3.md` y en `public/art/<lote>/`. Para cada fase: importador nuevo o extensión de `import-pixel.mjs`, interruptor `PIXEL` en el componente que hoy lee ese arte (`Icon`, `ItemCard`, `Panel`/9-slice, `ArenaBackground`, `Vfx`/`BattleFx`), y entrada en la galería de desarrollo si tiene sentido.
4. **Accesorios de rasgo** (fase 1b): sin arte de capas, los 24 rasgos no se ven sobre el héroe en pixel. Hoy se ignoran en `HeroSprite`. Pedir las capas al artista o mostrar el rasgo con un chip.
5. Revisar con el usuario las paletas de Agua, Tierra y Viento.
6. Revisión visual que no hicimos: celular, salas en vivo (`/sala`), podio, jefe cooperativo y las animaciones `entrance` de los jefes en una pelea real. Quedó una "+" mínima de brillo en el limo élite.
7. Cuando una fase quede aprobada y la línea pase a ser la oficial: quitar el interruptor, borrar el arte pintado equivalente y el código de respaldo, y actualizar `CLAUDE.md` (sección "Arte"). **No antes de que el usuario lo apruebe.**

## 9. Para subir el git

- Rama `design/pixel-art`; PR contra `main` solo cuando el usuario lo pida. No fusionar sola.
- Antes de commitear: `git status`. Archivos sin versionar que **son parte del trabajo**: `docs/PEDIDO_ARTE_3.md`, `docs/PIXEL_ART_HANDOFF.md`. `docs/PROPUESTA_RUN_V2.md` es del usuario, de otro tema: no la toques ni la incluyas sin preguntar.
- No subir las carpetas de origen (`Downloads/heroes`, `Downloads/enemies`) ni nada de `.next*`.
- Vercel despliega cada push a `main`; en esta rama no hay despliegue a producción, pero genera preview por rama.
