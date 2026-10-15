"use client";

import { useState, type ReactNode } from "react";
import { MuteButton } from "@/components/MuteButton";
import { TOWER_LABEL, type TowerMode } from "@/lib/game/tower";
import { maxHpOf, type ExpState } from "@/lib/game/expedition";
import { hpPct, hudLine, PHASE_TITLE, SCOPE } from "@/lib/expeditionView";
import type { SaveStatus } from "@/lib/expeditionSync";
import { BuildPanel } from "./BuildPanel";
import { FragmentsChip, SaveIndicator } from "./parts";

const BTN = "btn btn-gray !min-h-0 !px-2 !py-0.5 text-center text-sm";

/** Top bar of every expedition screen: where you are, PV, fragments, the six relics, saving and exit. */
export function ExpHud({
  mode,
  s,
  save,
  onRetry,
  onExit,
  onRetire,
  extra,
}: {
  mode: TowerMode;
  s: ExpState;
  save: SaveStatus;
  onRetry: () => void;
  onExit?: () => void; // "Guardar y salir" (suspends)
  onRetire?: () => void;
  extra?: ReactNode;
}) {
  const [build, setBuild] = useState(false);
  const live = s.phase !== "preparation" && s.phase !== "ended";
  return (
    <div className="hud-float flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 text-sm md:text-base">
      <b className="min-w-0 text-yellow-300">
        {TOWER_LABEL[mode]} · {live ? hudLine(s) : PHASE_TITLE[s.phase]}
      </b>
      {live && (
        <>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap" aria-label={`PV ${s.hp} de ${maxHpOf(s)}`}>
            PV <b className="tabular-nums">{s.hp}/{maxHpOf(s)}</b>
            <span aria-hidden="true" className="inline-block h-2 w-16 overflow-hidden rounded bg-black/50">
              <span className="block h-full bg-emerald-400" style={{ width: `${hpPct(s)}%` }} />
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FragmentsChip value={s.fragments} />
            <span className="text-[11px] text-[#d9d2ca]">{SCOPE.expedicion}</span>
          </span>
          <button className={BTN} aria-haspopup="dialog" onClick={() => setBuild(true)}>
            Reliquias {s.relics.length}/6
          </button>
        </>
      )}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <SaveIndicator status={save} onRetry={onRetry} />
        {extra}
        {onExit && s.phase !== "ended" && (
          <button className={BTN} onClick={onExit}>
            Guardar y salir
          </button>
        )}
        {onRetire && live && (
          <button className={BTN} onClick={onRetire}>
            Retirarse
          </button>
        )}
        <MuteButton />
      </span>
      {build && <BuildPanel owned={s.relics} onClose={() => setBuild(false)} />}
    </div>
  );
}
