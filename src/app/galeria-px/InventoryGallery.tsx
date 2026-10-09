import { ItemCard } from "@/components/ItemCard";
import { PIXEL_ICON_NAMES, pixelIconSize } from "@/lib/art/pixel";
import { RARITY_IDS } from "@/lib/game/rarity";
import { DUNGEON_THEMES as DUNGEONS } from "@/lib/game/levels";
import artIds from "@/lib/artIds.json";
import pixelItems from "@/lib/art/pixel-items.generated.json";

const NATIVE_SIZES = pixelItems as Record<string, { width: number; height: number }>;

const RELIC_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(artIds.relic).map(([id, name]) => [name, id]),
);
const RELIC_RARITY_LABELS: Record<string, string> = { common: "Común", rare: "Rara", legendary: "Legendaria" };

function relicLabel(id: string) {
  if (id.startsWith("rarity_")) return "Rareza " + (RELIC_RARITY_LABELS[id.slice(7)] ?? id.slice(7));
  if (id.startsWith("variant_")) {
    const match = id.slice(8).match(/^(.*)_(common|rare|legendary)$/);
    if (match) return `${RELIC_LABELS[match[1]] ?? match[1]} · ${RELIC_RARITY_LABELS[match[2]]}`;
  }
  return RELIC_LABELS[id] ?? id;
}

const ELEMENTS = [
  ["fire", "Fuego"], ["water", "Agua"], ["earth", "Tierra"],
  ["lightning", "Rayo"], ["wind", "Viento"],
] as const;
const ITEMS = [
  ["sword", "Espada"], ["axe", "Hacha"], ["spear", "Lanza"], ["bow", "Arco"],
  ["staff", "Bastón"], ["dagger", "Daga"], ["mace", "Maza"], ["wand", "Varita"], ["book", "Libro"],
  ["helmet", "Casco"], ["chest", "Peto"], ["legs", "Piernas"], ["boots", "Botas"], ["necklace", "Collar"],
] as const;
const FAMILY_LABELS: Record<string, string> = {
  element: "Elementos", class: "Clases", rank: "Rangos", asc: "Ascensión", enemy_modifier: "Modificadores de enemigos", door: "Puertas",
  passive: "Pasivos", skill: "Habilidades", trait: "Rasgos", upgrade: "Mejoras", event: "Eventos", dungeon: "Dungeons", stat: "Estadísticas", system: "Sistema", relic: "Reliquias", part: "Partes de forja", core: "Núcleos",
};
const LABELS: Record<string, string> = {
  fire: "Fuego", water: "Agua", earth: "Tierra", lightning: "Rayo", wind: "Viento",
  knight: "Caballero", mage: "Mago", rogue: "Pícaro", cleric: "Clérigo",
  accuracy: "Precisión", attack: "Ataque", critical: "Crítico", defense: "Defensa",
  dodge: "Esquive", hp: "Vida", speed: "Velocidad",
  coin: "Moneda", fragment: "Fragmento", heart_empty: "Corazón vacío",
  heart_full: "Corazón lleno", heart_half: "Medio corazón", locked: "Bloqueado",
  potion: "Poción", star: "Estrella", token: "Ficha", unlocked: "Desbloqueado",
  stars_0: "Sin estrellas", stars_1: "Una estrella", stars_2: "Dos estrellas",
  stars_3: "Tres estrellas", stars_4: "Cuatro estrellas", stars_5: "Cinco estrellas",
  changing_element: "Elemento cambiante",
  shield: "Escudo",
  regeneration: "Regeneración",
  double_attack: "Doble ataque",
  shining_fountain: "Fuente brillante",
  suspicious_beggar: "Mendigo sospechoso",
  spike_trap: "Trampa de pinchos",
  forgotten_altar: "Altar olvidado",
  abandoned_bag: "Bolsa tirada",
  whispering_book: "Libro susurrante",
  abandoned_campfire: "Fogata abandonada",
  ruby_statue: "Estatua con ojos de rubí",
  oak_skin: "Piel de roble",
  sharp_edge: "Filo afilado",
  firm_shield: "Escudo firme",
  eagle_eye: "Ojo de águila",
  light_feet: "Pies ligeros",
  steady_hand: "Pulso firme",
  cold_blood: "Sangre fría",
  good_runner: "Buen corredor",
  fury: "Furia",
  colossus: "Coloso",
  bloodlust: "Sed de sangre",
  dragon_skin: "Piel de dragón",
  mastery: "Maestría",
  shadow_dance: "Danza de sombras",
  iron_will: "Voluntad de hierro",
  stubborn: "Terco",
  thirsty: "Sediento",
  jinxed: "Gafe",
  swift: "Veloz",
  furious: "Furioso",
  lucky: "Afortunado",
  sturdy: "Robusto",
  cowardly: "Cobarde",
  accurate: "Certero",
  glutton: "Glotón",
  fragile: "Frágil",
  armored: "Blindado",
  elusive: "Escurridizo",
  bloodthirsty: "Sanguinario",
  patient: "Paciente",
  reckless: "Temerario",
  brawny: "Fornido",
  cautious: "Cauteloso",
  tenacious: "Tenaz",
  lucid: "Lúcido",
  chance_edge: "Filo del azar",
  last_breath: "Último aliento",
  thorns: "Espinas",
  gambler: "Apostador",
  wall: "Muralla",
  arcane_focus: "Foco arcano",
  deadly_edge: "Filo mortal",
  blessing: "Bendición",
  slash: "Tajo",
  shield_bash: "Golpe de escudo",
  spark: "Chispa",
  cataclysm: "Cataclismo",
  stab: "Puñalada",
  low_blow: "Golpe bajo",
  mace_strike: "Mazazo",
  prayer: "Plegaria",
  sweep: "Barrido",
  counterattack: "Contraataque",
  storm: "Tormenta",
  arcane_shield: "Escudo arcano",
  double_strike: "Golpe doble",
  execute: "Ejecutar",
  sanctuary: "Santuario",
  smite: "Castigo",
  defend: "Defender",
  flee: "Huir",
  easy_fight: "Combate fácil", hard_fight: "Combate difícil", boss: "Jefe",
  chest: "Cofre", merchant: "Mercader", rest: "Descanso", event: "Evento",
  ...Object.fromEntries(ITEMS),
};
const DOOR_LABELS: Record<string, string> = {
  easy_fight: "Combate fácil", hard_fight: "Combate difícil", boss: "Jefe",
  chest: "Cofre", merchant: "Mercader", rest: "Descanso", event: "Evento",
};

function PixelImage({ path, label, zoom, width = 32, height = width, bg }: {
  path: string; label: string; zoom: number; width?: number; height?: number; bg: string;
}) {
  const iconSize = path.startsWith("icons-px/icon_") ? pixelIconSize(path.slice("icons-px/icon_".length)) : undefined;
  const native = NATIVE_SIZES[path] ?? iconSize ?? { width, height };
  return (
    <div className="flex items-center justify-center p-2" style={{ background: bg }}>
      {/* Native PNG shown only at integer zoom in the development gallery. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={"/art/" + path + ".png"} alt={label} draggable={false}
        width={native.width * zoom} height={native.height * zoom} style={{ imageRendering: "pixelated" }} />
    </div>
  );
}

export function InventoryGallery({ lot, zoom, bg }: { lot: "items" | "icons" | "frames"; zoom: number; bg: string }) {
  const itemWidth = Math.max(32, ...Object.entries(NATIVE_SIZES).filter(([path]) => /^(weapons|equipment)-px\//.test(path) || path.startsWith("icons-px/icon_core_")).map(([, size]) => size.width));
  if (lot === "items") return (
    <section className="space-y-5">
      <h2 className="text-lg font-bold">Armas y equipo</h2>
      <div className="grid items-center gap-1" style={{ gridTemplateColumns: `8rem repeat(5, ${itemWidth * zoom + 16}px)` }}>
        <div />{ELEMENTS.map(([id, label]) => <div key={id} className="text-center text-xs">{label}</div>)}
        {ITEMS.map(([id, label], i) => <ItemRow key={id} id={id} label={label} gear={i >= 9} zoom={zoom} bg={bg} />)}
        <div className="text-xs">Núcleos</div>
        {ELEMENTS.map(([id, label]) => <PixelImage key={id} path={`icons-px/icon_core_${id}`} label={label} zoom={zoom} bg={bg} />)}
      </div>
      <h2 className="text-lg font-bold">Partes de forja</h2>
      <div className="flex flex-wrap gap-3">
        {ITEMS.map(([id, label]) => <figure key={id}>
          <PixelImage path={`icons-px/icon_part_${id}`} label={label} zoom={zoom} bg={bg} />
          <figcaption className="mt-1 text-center text-xs">{label}</figcaption>
        </figure>)}
      </div>
    </section>
  );
  if (lot === "frames") return (
    <section className="space-y-5">
      <h2 className="text-lg font-bold">Marcos de tarjeta</h2>
      <div className="flex flex-wrap gap-3">
        {RARITY_IDS.map((rank) => <figure key={rank}>
          <PixelImage path={`frames-px/card_${rank}`} label={"Rango " + rank.toUpperCase()} width={60} height={80} zoom={zoom} bg={bg} />
          <figcaption className="mt-1 text-center text-xs">{rank.toUpperCase()}</figcaption>
        </figure>)}
      </div>
      <h2 className="text-lg font-bold">Tarjetas dentro del juego</h2>
      <div className="flex flex-wrap gap-3">
        {RARITY_IDS.map((rarity) => <ItemCard key={rarity} size={96}
          item={{ kind: "weapon", type: "espada", name: "Espada de fuego", element: "fuego", rarity, stars: 3 }} />)}
      </div>
    </section>
  );
  return (
    <section className="space-y-5">
      {Object.entries(FAMILY_LABELS).map(([family, label]) => {
        const names = PIXEL_ICON_NAMES.filter((name) => name.startsWith(family + "_"));
        if (!names.length) return null;
        const groups = family === "relic" ? [
          { title: "Diseños base", names: names.filter((name) => !name.startsWith("relic_variant_") && !name.startsWith("relic_rarity_")) },
          { title: "Variantes por rareza", names: names.filter((name) => name.startsWith("relic_variant_")) },
          { title: "Distintivos de rareza", names: names.filter((name) => name.startsWith("relic_rarity_")) },
        ] : [{ title: "", names }];
        return <section key={family}>
          <h2 className="mb-2 text-lg font-bold">{label}</h2>
          {groups.map((group) => <div key={group.title} className="mb-4">
          {group.title && <h3 className="mb-2 text-sm font-bold">{group.title}</h3>}
          <div className="flex flex-wrap gap-3">
            {group.names.map((name) => {
              const id = name.slice(family.length + 1);
              const dungeon = family === "dungeon" ? RARITY_IDS.find((rank) => id === "rank_" + rank) : undefined;
              const title = family === "relic" ? relicLabel(id) : dungeon ? DUNGEONS[dungeon].name : family === "asc" ? (id === "max_star" ? "Estrella máxima" : "Ascensión " + id) : family === "rank" ? id.toUpperCase() : family === "system" && id === "chest" ? "Cofre" : family === "stat" && id === "flee" ? "Huida" : (family === "door" ? DOOR_LABELS[id] : LABELS[id]) ?? id;
              return <figure key={name}>
                <PixelImage path={"icons-px/icon_" + name} label={title} zoom={zoom} bg={bg} />
                <figcaption className="mt-1 text-center text-xs">{title}</figcaption>
              </figure>;
            })}
          </div>
          </div>)}
        </section>;
      })}
    </section>
  );
}

function ItemRow({ id, label, gear, zoom, bg }: { id: string; label: string; gear: boolean; zoom: number; bg: string }) {
  const folder = gear ? "equipment" : "weapons";
  const prefix = gear ? "equipment" : "weapon";
  return <>
    <div className="text-xs">{label}</div>
    {ELEMENTS.map(([element]) => <PixelImage key={element} path={`${folder}-px/icon_${prefix}_${id}_${element}`} label={label} zoom={zoom} bg={bg} />)}
  </>;
}
