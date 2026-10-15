"use client";

// "Habilidades" panel: the 4 class candidates, equip exactly 2. Nothing is ever replaced
// automatically: a newly unlocked skill only shows a notice until the player equips it.
import { useState } from "react";
import { CLASSES, type ClassId } from "@/lib/game/characters";
import { withSkill } from "@/lib/game/loadout";
import {
  isSkillUnlocked,
  loadoutHints,
  skillRoles,
  newlyUnlocked,
  RESOURCE_NAME,
  skillsOfClass,
  type Loadout,
  type SkillDef,
} from "@/lib/game/skills";

const SEEN_KEY = "bd-skill-seen";

function readSeen(): Record<string, number> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

const brief = (s: SkillDef, res: string) =>
  `${s.cost ? `Cuesta ${s.cost} ${res}` : "Sin costo"}${s.gen ? ` · da ${s.gen} ${res}` : ""} · ${
    s.cooldown ? "espera 1 turno" : "sin espera"
  }`;

export function SkillPicker({
  classId,
  mastery,
  value,
  onChange,
}: {
  classId: ClassId;
  mastery: number | null; // null = nivelado: all four available
  value: Loadout;
  onChange: (l: Loadout) => void;
}) {
  const res = RESOURCE_NAME[classId];
  const [, bump] = useState(0);
  const fresh = mastery === null ? [] : newlyUnlocked(classId, readSeen()[classId] ?? 0, mastery);
  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [classId]: mastery ?? 0 }));
    } catch {
      /* storage blocked: the notice just shows again */
    }
    bump((n) => n + 1);
  };
  return (
    <div className="space-y-2">
      <h3 className="font-bold">
        Habilidades de {CLASSES[classId].name} · elige 2 ({res})
      </h3>
      <p className="text-xs text-[#b9c7d4]">{mastery === null ? "Nivelado: las cuatro alternativas están disponibles." : `Maestría de clase ${mastery}: desbloqueos a nivel 5 y 12, compartidos por todos tus héroes de esta clase.`} Las nuevas habilidades son alternativas; no reemplazan automáticamente las anteriores.</p>
      {loadoutHints(value).map((hint) => <p key={hint} className="rounded border border-sky-400/30 bg-sky-950/30 p-2 text-xs" role="note">{hint}</p>)}
      {fresh.length > 0 && (
        <div role="status" className="rounded border border-amber-300 bg-amber-300/10 p-2 text-sm">
          <b>¡Desbloqueaste {fresh.map((s) => s.name).join(" y ")}!</b>{" "}
          {fresh.map((s) => s.description).join(" ")} No se equipa sola: elígela abajo.{" "}
          <button className="underline" onClick={dismiss}>
            Entendido
          </button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {skillsOfClass(classId).map((s) => {
          const open = isSkillUnlocked(s.id, mastery);
          const slot = value[0] === s.id ? 1 : value[1] === s.id ? 2 : 0;
          return (
            <div
              key={s.id}
              className={`rounded border p-2 text-sm ${slot ? "border-green-400 bg-green-400/10" : "border-white/20"} ${open ? "" : "opacity-60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <b>{s.name}</b>
                {slot > 0 && <span className="text-green-300">Equipada ({slot})</span>}
              </div>
              <div className="text-xs opacity-80">{brief(s, res)}</div>
              <div className="mt-1 text-xs font-semibold text-sky-200">{skillRoles(s).join(" · ")}</div>
              <p className="my-1">{s.description}</p>
              {open ? (
                <div className="flex gap-1">
                  {([0, 1] as const).map((i) => (
                    <button
                      key={i}
                      className="btn btn-gray"
                      disabled={value[i] === s.id}
                      onClick={() => onChange(withSkill(value, i, s.id))}
                    >
                      Ranura {i + 1}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-yellow-300">🔒 Requiere maestría {s.unlock}: alcanza ese nivel con cualquier {CLASSES[classId].name}.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
