"use client";

// Metagame views of the tower hub: the codex of 18 relics and 6 events (undiscovered entries still show
// their mechanics: nobody is locked out of information) and the build history with the personal record.
import { Icon } from "@/components/Icon";
import { ElementIcon } from "@/components/ElementIcon";
import { CLASSES } from "@/lib/game/characters";
import type { ExpCodex as Codex } from "@/lib/repo";
import type { ExpHistoryEntry } from "@/lib/localExpedition";
import { categoryLabel, END_REASON_TEXT, EVENT_ICON, eventMechanics, relicEffect, scoreLine, TIER_LABEL } from "@/lib/expeditionView";
import { EVENT_IDS, EVENT_TITLE } from "@/lib/game/expedition";
import { RELIC_IDS, RELICS } from "@/lib/game/relics";
import { RelicIcon } from "./parts";

export function CodexView({ codex }: { codex: Codex }) {
  return (
    <div className="space-y-4">
      <section aria-label="Reliquias">
        <h3 className="mb-1 font-bold">
          Reliquias · descubiertas {codex.relics.length}/{RELIC_IDS.length}
        </h3>
        <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RELIC_IDS.map((id) => {
            const d = RELICS[id];
            const found = codex.relics.includes(id);
            return (
              <li key={id} className={`tile-art flex min-w-0 gap-2 p-2 text-sm ${found ? "" : "opacity-75"}`}>
                <RelicIcon id={id} className={`h-12 w-12 shrink-0 ${found ? "" : "grayscale"}`} />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <b className="break-words">{d.name}</b>
                    <span className="text-xs">{categoryLabel(d.category)}</span>
                    <span className="rounded bg-black/30 px-1 text-[11px]">{found ? "Descubierta" : "Sin descubrir"}</span>
                  </div>
                  <p className="break-words text-xs leading-snug [overflow-wrap:anywhere]">
                    {TIER_LABEL[1]}: {relicEffect(id, 1)}
                  </p>
                  <p className="break-words text-xs leading-snug [overflow-wrap:anywhere]">
                    {TIER_LABEL[2]}: {relicEffect(id, 2)}
                  </p>
                  {d.cap && <p className="text-[11px] text-[#d9d2ca]">{d.cap}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-label="Eventos">
        <h3 className="mb-1 font-bold">
          Eventos · descubiertos {codex.events.length}/{EVENT_IDS.length}
        </h3>
        <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EVENT_IDS.map((id) => {
            const found = codex.events.includes(id);
            return (
              <li key={id} className={`tile-art flex min-w-0 gap-2 p-2 text-sm ${found ? "" : "opacity-75"}`}>
                <Icon name={EVENT_ICON[id]} className={`h-12 w-12 shrink-0 ${found ? "" : "grayscale"}`} />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <b>{EVENT_TITLE[id]}</b>
                    <span className="rounded bg-black/30 px-1 text-[11px]">{found ? "Descubierto" : "Sin descubrir"}</span>
                  </div>
                  {eventMechanics(id).map((o) => (
                    <p key={o.id} className="break-words text-xs leading-snug [overflow-wrap:anywhere]">
                      {o.id.toUpperCase()}: {o.label}
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function HistoryRow({ h }: { h: ExpHistoryEntry }) {
  return (
    <li className="tile-art min-w-0 space-y-1 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <b>{h.heroName}</b>
        {h.classId && <span>{CLASSES[h.classId]?.name}</span>}
        {h.element && <ElementIcon element={h.element} className="h-5" />}
        <span>{scoreLine(h.nodes, h.turns)}</span>
        <span>{h.combats} combates</span>
        {h.weekKey && <span className="text-xs opacity-80">Semana {h.weekKey}</span>}
      </div>
      <p className="text-xs">
        {END_REASON_TEXT[h.reason]}
        {h.killer.length > 0 && ` Te derrotó: ${h.killer.join(", ")}.`}
      </p>
      {h.relics.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Build final">
          {h.relics.map((r) => (
            <li key={r.id} className="inline-flex items-center gap-1 rounded bg-black/30 px-1 text-xs">
              <RelicIcon id={r.id} className="h-5 w-5" /> {RELICS[r.id].name} {r.tier === 2 ? "II" : "I"}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function HistoryView({ codex }: { codex: Codex }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Récord personal:{" "}
        <b>{codex.best ? scoreLine(codex.best.nodes, codex.best.turns) : "todavía no tienes expediciones terminadas"}</b>
      </p>
      {codex.history.length === 0 ? (
        <p className="text-sm opacity-80">El historial guarda la build final y la causa de cada expedición terminada.</p>
      ) : (
        <ul className="space-y-2">
          {codex.history.map((h) => (
            <HistoryRow key={h.id} h={h} />
          ))}
        </ul>
      )}
    </div>
  );
}
