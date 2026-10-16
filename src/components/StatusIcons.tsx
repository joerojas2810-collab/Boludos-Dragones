import type { Combatant } from "@/lib/game/combat";
import "./combat-status-icons.css";

// Elemental states (Escarcha, Quemadura, Impulso, Ruptura, Sobrecarga) are drawn as envelopes around the
// sprite (ElementalStatusOverlay) and read in the combatant's detail. What stays here are the marks that
// change how the next hit lands: Expuesto, next-hit mitigation and Defender. Small, off the face, no clicks.
const TILE = "combat-status-tile relative inline-flex flex-col items-center";
const LABEL = "combat-status-label mt-0.5 rounded bg-black/75 px-1 text-[9px] font-bold leading-3 tracking-wide text-white";

export function StatusIcons({ c, side = "right" }: { c: Combatant; side?: "left" | "right" }) {
  if (!c.exposed && !c.defending && !c.nextHitReduction) return null;
  return (
    <div className="combat-status-icons" data-side={side}>
      {c.exposed && (
        <span className={TILE} role="img" aria-label="Expuesto: DEF −15 % hasta su siguiente turno">
          {/* Cracked shield: a different silhouette from the resource diamonds. */}
          <svg viewBox="0 0 40 44" className="h-7 w-6 drop-shadow-[0_2px_4px_#000a]" aria-hidden="true">
            <path d="M20 2 L37 8 V22 C37 32 29 39 20 42 C11 39 3 32 3 22 V8 Z" fill="#5b3a12" stroke="#fcd34d" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M22 4 L16 17 L24 22 L15 41" fill="none" stroke="#fff1d0" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span className={LABEL}>EXPUESTO</span>
        </span>
      )}
      {!!c.nextHitReduction && (
        <span className={TILE} role="img" aria-label={`Mitigación: el próximo impacto recibido hace ${Math.round(c.nextHitReduction * 100)} % menos`}>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-t-full rounded-b-sm bg-[#12315b]/90 px-0.5 text-xs font-bold text-sky-200 ring-2 ring-sky-300">
            ↷−{Math.round(c.nextHitReduction * 100)}
          </span>
          <span className={LABEL}>PRÓX. GOLPE</span>
        </span>
      )}
      {c.defending && (
        <span className={TILE} role="img" aria-label="Defendiendo: recibe la mitad de daño">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-b-full rounded-t-sm bg-[#12315b]/90 text-base font-bold text-sky-200 ring-2 ring-sky-300">
            ◧
          </span>
          <span className={LABEL}>DEFIENDE</span>
        </span>
      )}
    </div>
  );
}
