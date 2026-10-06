export type Guide = {
  title: string;
  what: string;
  needs: string;
  gives: string;
  example: string;
};

export const GUIDE: Record<
  "craft" | "merge" | "refine" | "dismantle" | "shortcuts",
  Guide
> = {
  craft: {
    title: "Armar",
    what: "Construyes una pieza de equipo con partes de dungeons.",
    needs: "3 partes del tipo y rango + 1 núcleo del elemento + monedas.",
    gives: "1 pieza. Si ya la tienes, sube 1 estrella (hasta 5).",
    example: "3 Hoja de espada F + núcleo de fuego → Espada F de fuego.",
  },
  merge: {
    title: "Fusionar",
    what: "Subes de rango juntando lo repetido.",
    needs:
      "Partes: varias del mismo tipo y rango + 1 núcleo. Piezas: varias del mismo tipo y rango, de distinto elemento.",
    gives:
      "1 parte o pieza del rango siguiente. Las piezas pierden sus estrellas.",
    example: "4 partes F + núcleo → 1 parte E.",
  },
  refine: {
    title: "Refinar",
    what: "Cambias partes que te sobran por el tipo que necesitas.",
    needs: "3 partes cualquiera del mismo rango + monedas.",
    gives: "1 parte del tipo que elijas, mismo rango.",
    example: "3 partes C sueltas → 1 parte C del tipo que quieras.",
  },
  dismantle: {
    title: "Desmontar",
    what: "Conviertes una pieza que no usas en partes.",
    needs: "Una pieza sin equipar.",
    gives: "2 partes de su tipo y rango, +1 por estrella.",
    example: "Espada F de 1★ → 3 Hoja de espada F.",
  },
  shortcuts: {
    title: "Atajos",
    what: "Hacen lo mismo que las otras pestañas, pero en bloque.",
    needs: "Lo mismo que cada operación, repetido varias veces.",
    gives: "Una vista previa del resultado neto antes de ejecutar.",
    example: "Fusionar todo: sube de un golpe todo lo que alcance.",
  },
};
