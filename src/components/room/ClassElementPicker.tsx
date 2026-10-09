"use client";

// Choose a class and an element (nivelado heroes and balanced duels). The pick is
// sent as soon as both are chosen and again whenever either one changes.
import { useState } from "react";
import { HeroSprite } from "@/components/HeroSprite";
import { CLASS_IDS, CLASSES, type ClassId } from "@/lib/game/characters";
import { ELEMENT_LABEL, ELEMENTS, type Element } from "@/lib/game/elements";

export function ClassElementPicker({
  value,
  onPick,
}: {
  value: { classId: ClassId; element: Element } | null; // what the server already has
  onPick: (classId: ClassId, element: Element) => void;
}) {
  const [cls, setCls] = useState<ClassId | null>(null);
  const [el, setEl] = useState<Element | null>(null);
  const c = cls ?? value?.classId ?? null;
  const e = el ?? value?.element ?? null;
  const choose = (nc: ClassId | null, ne: Element | null) => {
    setCls(nc);
    setEl(ne);
    if (nc && ne) onPick(nc, ne);
  };
  return (
    <>
      <p className="mb-1 text-center text-sm opacity-80">1. Clase</p>
      <div className="flex flex-wrap justify-center gap-2">
        {CLASS_IDS.map((id) => (
          <button
            key={id}
            aria-pressed={c === id}
            className={`pixel-frame relative p-2 text-sm transition ${c === id ? "scale-105 bg-green-400/20 ring-4 ring-green-400" : "opacity-80"}`}
            onClick={() => choose(id, e)}
          >
            {c === id && (
              <span className="absolute right-1 top-1 z-10 grid h-6 w-6 place-items-center rounded-full bg-green-400 text-sm font-bold text-black">
                ✓
              </span>
            )}
            <HeroSprite classId={id} element={e ?? "fuego"} className="mx-auto w-20" crop />
            {CLASSES[id].name}
          </button>
        ))}
      </div>
      <p className="mb-1 mt-3 text-center text-sm opacity-80">2. Elemento</p>
      <div className="flex flex-wrap justify-center gap-2">
        {ELEMENTS.map((id) => (
          <button
            key={id}
            className={`btn ${e === id ? "" : "btn-gray"}`}
            onClick={() => choose(c, id)}
          >
            {ELEMENT_LABEL[id]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-sm">
        {c && e ? (
          <>
            Elegido: <b>{CLASSES[c].name}</b> de <b>{ELEMENT_LABEL[e]}</b> ✓
          </>
        ) : (
          <span className="text-yellow-300">
            Falta elegir {c ? "el elemento" : e ? "la clase" : "clase y elemento"}.
          </span>
        )}
      </p>
    </>
  );
}
