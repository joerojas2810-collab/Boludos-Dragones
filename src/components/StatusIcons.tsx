import { ElementIcon } from "@/components/ElementIcon";
import { Tooltip } from "@/components/Tooltip";
import { MAX_ELEMENT_CHARGES } from "@/lib/game/statuses";
import { statusTip } from "@/lib/game/explain";
import type { Combatant } from "@/lib/game/combat";
import type { Element } from "@/lib/game/elements";
import { STATUS_DATA, STATUS_OF_ELEMENT, type StatusId } from "@/lib/game/statuses";

// A status is drawn with the icon of its element (Escarcha = agua, Quemadura = fuego, ...).
const STATUS_ELEMENT = Object.fromEntries(
  Object.entries(STATUS_OF_ELEMENT).map(([el, id]) => [id, el]),
) as Record<StatusId, Element>;

// Shape + text, never colour alone: debuffs are squares marked ▼, buffs are circles marked ▲.
const SHORT: Record<StatusId, string> = { escarcha: "ESC", quemadura: "QUE", impulso: "IMP", ruptura: "RUP" };

const TILE = "relative inline-flex flex-col items-center";
const BADGE = "absolute -bottom-1 -right-1 rounded bg-black/85 px-1 text-[11px] font-bold leading-4 text-white";
const LABEL = "mt-0.5 rounded bg-black/75 px-1 text-[9px] font-bold leading-3 tracking-wide text-white";

// Floats over the fighter's sprite: one icon per status with its stacks, plus the marks that
// change how the next hit lands (Sobrecarga, Expuesto, Defender).
export function StatusIcons({ c }: { c: Combatant }) {
  const rayo = c.char.element === "rayo" && (c.charge ?? 0) > 0;
  if (!c.statuses?.length && !rayo && !c.exposed && !c.defending) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[14%] z-20 flex max-w-full -translate-x-1/2 flex-wrap justify-center gap-1.5">
      {c.statuses?.map((st) => {
        const neg = STATUS_DATA[st.id].negative;
        return (
          <span key={st.id} className={TILE} role="img" aria-label={`${STATUS_DATA[st.id].label} ${st.stacks}, ${neg ? "negativo" : "positivo"}`}>
            <span
              className={`relative inline-flex p-0.5 shadow-[0_2px_6px_#000a] ${
                neg
                  ? "rounded-md bg-[#5b1f1f]/85 ring-2 ring-[#e06b5a]"
                  : "rounded-full bg-[#1f4a2a]/85 ring-2 ring-[#6bd08a]"
              }`}
            >
              <ElementIcon element={STATUS_ELEMENT[st.id]} className="h-9" tip={statusTip(st)} />
              <span className={BADGE}>{neg ? "▼" : "▲"}{st.stacks}</span>
            </span>
            <span className={LABEL}>{SHORT[st.id]}</span>
          </span>
        );
      })}
      {rayo && (
        <Tooltip
          tip={{
            title: `Sobrecarga ${c.charge}/${MAX_ELEMENT_CHARGES}`,
            kind: "info",
            lines: ["Con 3 cargas sube tu daño; una habilidad que consume la descarga sobre el objetivo."],
            source: "Estado de Rayo",
          }}
        >
          <span className={TILE}>
            <span className="inline-flex h-10 min-w-10 items-center justify-center bg-[#3b3a12]/90 px-1 text-base font-bold text-yellow-200 shadow-[0_2px_6px_#000a] ring-2 ring-yellow-300 [clip-path:polygon(25%_0,75%_0,100%_50%,75%_100%,25%_100%,0_50%)]">
              ⚡{c.charge}
            </span>
            <span className={LABEL}>SOB</span>
          </span>
        </Tooltip>
      )}
      {c.exposed && (
        <span className={TILE} role="img" aria-label="Expuesto: DEF −15 % hasta su siguiente turno">
          <span className="inline-flex h-10 w-10 rotate-45 items-center justify-center rounded-sm bg-[#5b3a12]/90 ring-2 ring-amber-300">
            <span className="-rotate-45 text-lg font-bold text-amber-200">◇</span>
          </span>
          <span className={`${LABEL} mt-1`}>EXPUESTO</span>
        </span>
      )}
      {c.defending && (
        <span className={TILE} role="img" aria-label="Defendiendo: recibe la mitad de daño">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-b-full rounded-t-sm bg-[#12315b]/90 text-lg font-bold text-sky-200 ring-2 ring-sky-300">
            ◧
          </span>
          <span className={LABEL}>DEFIENDE</span>
        </span>
      )}
    </div>
  );
}
