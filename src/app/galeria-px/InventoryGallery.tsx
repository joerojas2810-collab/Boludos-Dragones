import { ItemCard } from "@/components/ItemCard";
import { PIXEL_ICON_NAMES } from "@/lib/art/pixel";
import { RARITY_IDS } from "@/lib/game/rarity";

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
  element: "Elementos", class: "Clases", rank: "Rangos", door: "Puertas",
  passive: "Pasivos", skill: "Habilidades", trait: "Rasgos", upgrade: "Mejoras", event: "Eventos", part: "Partes de forja", core: "Núcleos",
};
const LABELS: Record<string, string> = {
  fire: "Fuego", water: "Agua", earth: "Tierra", lightning: "Rayo", wind: "Viento",
  knight: "Caballero", mage: "Mago", rogue: "Pícaro", cleric: "Clérigo",
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

function PixelImage({ path, label, width, height = width, bg }: {
  path: string; label: string; width: number; height?: number; bg: string;
}) {
  return (
    <div className="flex items-center justify-center p-2" style={{ background: bg }}>
      {/* Native PNG shown only at integer zoom in the development gallery. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={"/art/" + path + ".png"} alt={label} draggable={false}
        width={width} height={height} style={{ imageRendering: "pixelated" }} />
    </div>
  );
}

export function InventoryGallery({ lot, zoom, bg }: { lot: "items" | "icons" | "frames"; zoom: number; bg: string }) {
  if (lot === "items") return (
    <section className="space-y-5">
      <h2 className="text-lg font-bold">Armas y equipo</h2>
      <div className="grid items-center gap-1" style={{ gridTemplateColumns: `8rem repeat(5, ${32 * zoom + 16}px)` }}>
        <div />{ELEMENTS.map(([id, label]) => <div key={id} className="text-center text-xs">{label}</div>)}
        {ITEMS.map(([id, label], i) => <ItemRow key={id} id={id} label={label} gear={i >= 9} zoom={zoom} bg={bg} />)}
        <div className="text-xs">Núcleos</div>
        {ELEMENTS.map(([id, label]) => <PixelImage key={id} path={`icons-px/icon_core_${id}`} label={label} width={32 * zoom} bg={bg} />)}
      </div>
      <h2 className="text-lg font-bold">Partes de forja</h2>
      <div className="flex flex-wrap gap-3">
        {ITEMS.map(([id, label]) => <figure key={id}>
          <PixelImage path={`icons-px/icon_part_${id}`} label={label} width={32 * zoom} bg={bg} />
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
          <PixelImage path={`frames-px/card_${rank}`} label={"Rango " + rank.toUpperCase()} width={60 * zoom} height={80 * zoom} bg={bg} />
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
        return <section key={family}>
          <h2 className="mb-2 text-lg font-bold">{label}</h2>
          <div className="flex flex-wrap gap-3">
            {names.map((name) => {
              const id = name.slice(family.length + 1);
              const title = family === "rank" ? id.toUpperCase() : (family === "door" ? DOOR_LABELS[id] : LABELS[id]) ?? id;
              return <figure key={name}>
                <PixelImage path={"icons-px/icon_" + name} label={title} width={32 * zoom} bg={bg} />
                <figcaption className="mt-1 text-center text-xs">{title}</figcaption>
              </figure>;
            })}
          </div>
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
    {ELEMENTS.map(([element]) => <PixelImage key={element} path={`${folder}-px/icon_${prefix}_${id}_${element}`} label={label} width={32 * zoom} bg={bg} />)}
  </>;
}
