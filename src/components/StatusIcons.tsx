import { ElementIcon } from "@/components/ElementIcon";
import { statusTip } from "@/lib/game/explain";
import type { Combatant } from "@/lib/game/combat";
import type { Element } from "@/lib/game/elements";
import { STATUS_DATA, STATUS_OF_ELEMENT, type StatusId } from "@/lib/game/statuses";

// A status is drawn with the icon of its element (Escarcha = agua, Quemadura = fuego, ...).
const STATUS_ELEMENT = Object.fromEntries(
  Object.entries(STATUS_OF_ELEMENT).map(([el, id]) => [id, el]),
) as Record<StatusId, Element>;

// Floats over the fighter's sprite: one round icon per status with its stacks.
export function StatusIcons({ c }: { c: Combatant }) {
  if (!c.statuses?.length) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[14%] z-20 flex -translate-x-1/2 gap-1.5">
      {c.statuses.map((st) => (
        <span
          key={st.id}
          className={`relative inline-flex rounded-full p-0.5 shadow-[0_2px_6px_#000a] ${
            STATUS_DATA[st.id].negative
              ? "bg-[#5b1f1f]/85 ring-2 ring-[#e06b5a]"
              : "bg-[#1f4a2a]/85 ring-2 ring-[#6bd08a]"
          }`}
        >
          <ElementIcon element={STATUS_ELEMENT[st.id]} className="h-9" tip={statusTip(st)} />
          <span className="absolute -bottom-1 -right-1 rounded bg-black/85 px-1 text-[11px] font-bold leading-4 text-white">
            {st.stacks}
          </span>
        </span>
      ))}
    </div>
  );
}
