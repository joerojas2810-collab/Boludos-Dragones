export type Guide = {
  title: string;
  what: string;
  needs: string;
  gives: string;
  example: string;
  steps: string[]; // long tutorial, start to finish
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
    steps: [
      'De dónde salen las partes: los dungeons las sueltan al ganar peleas, abrir cofres y vencer jefes. Cada parte tiene un tipo (por ejemplo "Hoja de espada") y un rango (F a SSR). Las partes de una run solo se aseguran al vencer a un jefe; si caes antes, se pierden.',
      "Los núcleos también salen de dungeons (sobre todo de jefes) y los hay de 5 elementos. El núcleo que gastes decide el elemento de la pieza.",
      "Paso 1: elige el tipo de pieza que quieres (espada, casco, peto…).",
      "Paso 2: elige el elemento. Solo puedes armar si tienes ese núcleo.",
      "Paso 3: elige el rango. Usa partes de ese mismo rango, así que una pieza SSR pide partes SSR.",
      "Paso 4: revisa el costo. Son 3 partes del tipo y rango, 1 núcleo del elemento y unas monedas (la mitad de lo que cuesta fusionar hasta ese rango).",
      "Paso 5: pulsa Armar. La pieza aparece en tu colección. Si ya tenías esa misma pieza (tipo, elemento y rango), en vez de repetirse sube 1 estrella, hasta un máximo de 5.",
      "Después: equípala en Héroes, en el muñeco de 6 casillas. Cada estrella suma bonos, y las piezas del mismo elemento dan bonos de set (2 piezas, 4 piezas).",
    ],
  },
  merge: {
    title: "Fusionar",
    what: "Subes de rango juntando lo repetido.",
    needs:
      "Partes: varias del mismo tipo y rango + 1 núcleo. Piezas: varias del mismo tipo y rango, de distinto elemento.",
    gives:
      "1 parte o pieza del rango siguiente. Las piezas pierden sus estrellas.",
    example: "4 partes F + núcleo → 1 parte E.",
    steps: [
      "Fusionar sirve para subir de rango lo que te sobra. Hay dos modos: de partes y de piezas.",
      "Partes, paso 1: elige el tipo de parte y su rango. Mira cuántas necesitas: 4 en F y E, 3 de D a B, y 2 de A a SS.",
      "Partes, paso 2: elige un núcleo del elemento que quieras gastar (se consume 1).",
      "Partes, paso 3: pulsa Fusionar. Pagas las partes, el núcleo y las monedas, y recibes 1 parte del rango siguiente. Las monedas suben mucho con el rango (3 en F, 2.100 en SS).",
      "Piezas, paso 1: junta piezas del mismo tipo y rango pero de distinto elemento. Debes marcar exactamente la cantidad que pide ese rango.",
      "Piezas, paso 2: elige el elemento del resultado. Tiene que ser el de una de las piezas marcadas, y gastas 1 núcleo de ese elemento.",
      "Piezas, paso 3: ojo, las piezas marcadas se consumen y pierden sus estrellas. No puedes usar piezas equipadas. Recibes 1 pieza del rango siguiente.",
      "Consejo: si tienes partes sueltas de tipos distintos, pásalas primero por Refinar para completar las que necesitas.",
    ],
  },
  refine: {
    title: "Refinar",
    what: "Cambias partes que te sobran por el tipo que necesitas.",
    needs: "3 partes cualquiera del mismo rango + monedas.",
    gives: "1 parte del tipo que elijas, mismo rango.",
    example: "3 partes C sueltas → 1 parte C del tipo que quieras.",
    steps: [
      "Refinar es para cuando tienes partes de más de un tipo y te falta de otro.",
      "Paso 1: elige el rango. Las 3 partes deben ser de ese mismo rango.",
      "Paso 2: marca 3 partes cualquiera de ese rango. Pueden ser de tipos distintos o repetidos, solo cuenta que sean exactamente 3.",
      'Paso 3: elige el tipo de parte que quieres recibir (por ejemplo "Hoja de espada").',
      "Paso 4: pulsa Refinar. Pagas las 3 partes más unas monedas (la mitad de lo que cuesta armar a ese rango) y recibes 1 parte del tipo elegido, del mismo rango.",
      "Perdiste 2 partes por el cambio, así que úsalo solo para lo que de verdad te sobra.",
    ],
  },
  dismantle: {
    title: "Desmontar",
    what: "Conviertes una pieza que no usas en partes.",
    needs: "Una pieza sin equipar.",
    gives: "2 partes de su tipo y rango, +1 por estrella.",
    example: "Espada F de 1★ → 3 Hoja de espada F.",
    steps: [
      "Desmontar convierte una pieza que no usas en partes para la forja.",
      "Paso 1: elige una pieza de tu lista. Las equipadas no se pueden desmontar: desequípalas primero en Héroes.",
      "Paso 2: mira cuántas partes te da: 2 partes de su tipo y rango, más 1 por cada estrella que tenga.",
      "Paso 3: pulsa Desmontar. La pieza desaparece para siempre y las partes llegan a tu inventario. No cuesta monedas ni núcleos.",
      "Cuándo conviene: con piezas de rango bajo o de un elemento que no juegas. Cuidado con las que tienen estrellas: desmontarlas deshace tu progreso.",
      'Si vas a desmontar muchas, mira Atajos: "Desmontar lo que no usas" lo hace en bloque.',
    ],
  },
  shortcuts: {
    title: "Atajos",
    what: "Hacen lo mismo que las otras pestañas, pero en bloque.",
    needs: "Lo mismo que cada operación, repetido varias veces.",
    gives: "Una vista previa del resultado neto antes de ejecutar.",
    example: "Fusionar todo: sube de un golpe todo lo que alcance.",
    steps: [
      "Los atajos hacen lo mismo que las otras pestañas, pero en bloque. Antes de ejecutar siempre ves una vista previa del resultado neto: lo intermedio se cancela y solo ves lo que ganas y lo que gastas.",
      "Fusionar todo: elige un rango y fusiona todo lo que alcance de ese rango al siguiente.",
      'Subir en cadena: elige un rango meta. Va fusionando rango por rango hasta llegar. Puedes marcar "refinar sobrantes primero" para aprovechar partes sueltas.',
      "Refinar sobrantes: junta de a 3 las partes que no completan nada y las cambia por tipos que sí te sirven.",
      "Desmontar lo que no usas: elige rango máximo y estrellas máximas. Se desmontan hasta 60 piezas sin equipar, y pide confirmación porque no se puede deshacer.",
      "Armar al máximo: eliges una pieza (tipo, elemento y rango) y la arma una y otra vez hasta que se acaben las partes, los núcleos o las estrellas (máximo 5).",
      "Todo se paga con monedas, partes y núcleos igual que a mano. Si falta algo, la vista previa lo dice antes de que gastes nada.",
      "Teclas: 1 a 5 cambian de pestaña (Armar, Fusionar, Refinar, Desmontar, Atajos).",
    ],
  },
};
