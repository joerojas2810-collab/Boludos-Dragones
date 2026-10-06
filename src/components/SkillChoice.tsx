import { Tooltip } from "@/components/Tooltip";
import type { ClassId } from "@/lib/game/characters";
import { CLASSES } from "@/lib/game/characters";
import { SKILL_LEVEL, SKILLS, type SkillId } from "@/lib/game/skills";

// Level-5 pick: 2 cards, each with what the skill does and its cooldown.
export function SkillChoice({
  classId,
  ids,
  onPick,
}: {
  classId: ClassId;
  ids: readonly SkillId[];
  onPick: (id: SkillId) => void;
}) {
  return (
    <div>
      <div className="mb-3 text-center text-base text-yellow-300">
        Nivel {SKILL_LEVEL}: aprende una habilidad de {CLASSES[classId].name}{" "}
        (será tu Ataque 3)
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {ids.map((id) => {
          const s = SKILLS[id];
          return (
            <Tooltip
              key={id}
              tip={{
                title: s.name,
                kind: s.power > 0 ? "damage" : "info",
                lines: [
                  s.description,
                  `Recarga: ${s.cooldown} rondas tras usarla.`,
                  "Se usa desde el botón Ataque 3 en combate.",
                ],
                source: `Habilidad de ${CLASSES[classId].name}`,
              }}
              className="block"
              focusable={false}
            >
              <button className="btn h-full w-full" onClick={() => onPick(id)}>
                <div className="font-semibold">{s.name}</div>
                <div className="text-sm text-yellow-200">
                  {s.area ? "Área · " : ""}
                  {s.power > 0 ? "Daño" : "Apoyo"} · recarga {s.cooldown}
                </div>
                <div className="mt-1 text-sm">{s.description}</div>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
