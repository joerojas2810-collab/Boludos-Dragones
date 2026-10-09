export type Guide = {
  title: string;
  what: string;
  needs: string;
  gives: string;
  example: string;
  steps: string[]; // short tutorial, start to finish
};

export const GUIDE: Record<"ascend" | "heroes" | "upgrade", Guide> = {
  ascend: {
    title: "Ascender",
    what: "Subes de rango una pieza de equipo o un héroe gastando repetidos.",
    needs: "La base + otras del mismo rango (cualquier tipo o elemento) + monedas.",
    gives: "La base sube un rango y vuelve a 0★ y +0. Conserva tipo, elemento y nombre.",
    example: "5 piezas C + 160 monedas → 1 pieza B.",
    steps: [
      "Equipo son las armas y la armadura. Ascender es subir el rango de una pieza.",
      "Paso 1: elige la pieza base, la que quieres conservar.",
      "Paso 2: marca otras piezas del mismo rango como material. Sirve cualquier tipo y elemento, pero no las equipadas. El contador te dice cuántas faltan.",
      "Paso 3: revisa el resultado y pulsa Ascender. Las de material desaparecen.",
      "Ojo: la base vuelve a 0★ y +0. Por eso conviene ascender primero, y completar estrellas y mejorar al final.",
      "Los héroes tienen su propia sección: Héroes.",
    ],
  },
  heroes: {
    title: "Héroes",
    what: "Tu héroe crece de tres formas: estrellas, rango y rasgo.",
    needs: "Material = héroes del mismo rango (1 unidad cada uno) y copias sobrantes (1 unidad cada una).",
    gives: "★: +1★ por 3 unidades. Rango: sube al siguiente y conserva rasgo y nivel. Rasgo: cambia el principal por el de una copia.",
    example: "3 héroes B cualesquiera → tu B pasa de 1★ a 2★. 4 héroes B + 320 monedas → tu B pasa a rango A.",
    steps: [
      "Una tirada repetida no sube la estrella sola: queda como copia y guarda el rasgo que le tocó.",
      "Rasgos: si te gusta más el rasgo de una copia, úsalo como principal. El que tenías pasa a ser una copia, así que no se pierde.",
      "Subir ★: elige el héroe y 3 unidades de material. El material desaparece (las copias primero; un héroe se va solo cuando gastas todas sus unidades).",
      "Subir de rango: elige el héroe y el material que pide el rango. El héroe conserva clase, elemento, nombre, rasgo, nivel y habilidad; sus ★ se convierten (mira la tabla).",
      "Si ya tienes a ese héroe en el rango siguiente, se fusionan: tú eliges qué rasgo queda y te quedas con las ★ más altas.",
      "Ojo: gastar un héroe que ya tiene ★ o nivel pierde esa inversión. La pantalla te avisa.",
      "El rango S es el techo: ahí solo se suben ★.",
    ],
  },
  upgrade: {
    title: "Mejorar",
    what: "Subes el +N de una pieza con Escamas. Cada nivel suma +4% a sus stats (hasta +40%).",
    needs: "Una pieza de rango S o más con 5★, y Escamas (un Dado cargado es opcional).",
    gives: "+1 nivel si sale bien. Si falla pierdes las Escamas, no la pieza.",
    example: "Subir a +5: 60% de éxito, cuesta 5 Escamas.",
    steps: [
      "Mejorar es para el final del juego: solo piezas de rango S o más con 5 estrellas.",
      "Subir a +1 nunca falla. Desde el +2 puede fallar: pierdes las Escamas del intento, pero la pieza queda como estaba.",
      "Costo en Escamas = el nivel al que subes (+5 cuesta 5). Éxito: +1 100%, +2 90%, +3 80%, +4 70%, +5 60%, +6 50%, +7 45%, +8 40%, +9 35%, +10 30%.",
      "Dado cargado: opcional, uno por intento, suma 20 puntos de éxito. Es difícil de conseguir; úsalo en los niveles altos.",
      "Cada fallo seguido en un nivel suma 5 puntos al siguiente intento. Se reinicia al acertar.",
      "Las Escamas salen de dungeons S, SS y SSR. No se venden ni se intercambian.",
      "Si ascendes la pieza, vuelve a 0★ y +0: sube de rango primero y mejora al final.",
    ],
  },
};
