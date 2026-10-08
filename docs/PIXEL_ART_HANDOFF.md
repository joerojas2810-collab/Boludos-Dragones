# Línea de arte pixel: traspaso a otra IA

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
