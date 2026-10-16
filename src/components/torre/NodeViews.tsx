"use client";

// Screens between fights: route, offer, shop, rest, event and sanctuary (docs/torre/02 UI15-UI16).
// Every one is "select, then confirm" (Choices); the fight-less nodes never run on a timer.
import { useMemo } from "react";
import { DoorIcon } from "@/components/DoorIcon";
import { ElementIcon } from "@/components/ElementIcon";
import { Icon } from "@/components/Icon";
import { Panel } from "@/components/Panel";
import {SecondaryPanel} from "@/components/SecondaryPanel";
import {combatScene} from "@/lib/art/backgrounds";
import { SkillPicker } from "@/components/SkillPicker";
import {
  EVENT_ICON,
  eventChoices,
  goodView,
  needsReplace,
  offerView,
  restOptionsView,
  riskText,
  ROUTE_DOOR,
  ROUTE_KIND_LABEL,
  ROUTE_PURPOSE,
  sanctuaryOptionsView,
  SCOPE,
  TIER_LABEL,
} from "@/lib/expeditionView";
import type { ExpActionInput } from "@/lib/expeditionSync";
import { ELEMENT_LABEL } from "@/lib/game/elements";
import {
  expeditionFight,
  EVENT_TITLE,
  nodeInfo,
  NODES_PER_SECTOR,
  routeOptions,
  sectorBossRoute,
  TOWER_PAID_SECTORS,
  TOWER_PAY,
  PACT_DAMAGE,
  PACT_FRAGMENTS,
  type ExpState,
  type RouteOption,
} from "@/lib/game/expedition";
import { BOSS_RULE } from "@/lib/game/bossRules";
import { BOSS_TEXT, MOD_LABEL } from "@/lib/game/explain";
import { DUNGEON_THEMES } from "@/lib/game/levels";
import { RELICS, upgradable, type OwnedRelic } from "@/lib/game/relics";
import { Choices, FragmentsChip, RelicIcon, ScopeTag, useConfirmGuard, type ChoiceItem, type PickOption } from "./parts";
import { RelicRows } from "./BuildPanel";
import type { Loadout } from "@/lib/game/skills";

export interface NodeProps {
  s: ExpState;
  act: (input: ExpActionInput) => void;
  guard: ReturnType<typeof useConfirmGuard>;
  error: string | null;
}

const ErrorLine = ({ error }: { error: string | null }) =>
  error ? (
    <p role="alert" className="mb-2 rounded border border-rose-400/70 bg-rose-950/60 p-2 text-center text-sm text-rose-100">
      {error}
    </p>
  ) : null;

const replaceOptions = (relics: readonly OwnedRelic[]): PickOption[] =>
  relics.map((r, i) => ({
    value: String(i),
    label: (
      <span className="flex min-w-0 items-center gap-2">
        <RelicIcon id={r.id} className="h-8 w-8 shrink-0" />
        <span className="min-w-0 break-words">
          Reemplazar <b>{RELICS[r.id].name}</b> ({TIER_LABEL[r.tier]})
        </span>
      </span>
    ),
  }));
const upgradeOptions = (relics: readonly OwnedRelic[]): PickOption[] =>
  upgradable(relics).map((r) => ({
    value: r.id,
    label: (
      <span className="flex min-w-0 items-center gap-2">
        <RelicIcon id={r.id} className="h-8 w-8 shrink-0" />
        <span className="min-w-0 break-words">
          Mejorar <b>{RELICS[r.id].name}</b> a nivel II
        </span>
      </span>
    ),
  }));

// ---- boss preview ------------------------------------------------------------------------------

/** The sector's boss, consultable at any time (it is announced from the start of the sector). */
export function BossPreview({ s, sector = s.sector }: { s: ExpState; sector?: number }) {
  const route = sectorBossRoute(s.seed, sector);
  const theme = DUNGEON_THEMES[route];
  const spec = useMemo(() => expeditionFight(s.seed, sector, NODES_PER_SECTOR, 0), [s.seed, sector]);
  const rule = BOSS_RULE[theme.bossId];
  const mech = rule ? BOSS_TEXT[rule] : null;
  const boss = spec.enemies[0];
  return (
    <details className="tile-art p-2 text-sm">
      <summary className="cursor-pointer font-semibold">
        Jefe del sector {sector}: {theme.bossName} <span className="font-normal opacity-80">(consultar)</span>
      </summary>
      <div className="mt-2 space-y-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <ElementIcon element={theme.bossElement} className="h-5" /> Elemento {ELEMENT_LABEL[theme.bossElement]} · {boss ? `${Math.round(boss.stats.hp)} PV` : ""} · {theme.name}
        </p>
        {mech && (
          <p>
            <b>{mech.title}.</b> {mech.line}
          </p>
        )}
        {spec.mods.length > 0 && <p>Modificador del sector: {spec.mods.map((m) => MOD_LABEL[m]).join(", ")}.</p>}
        <p className="text-xs text-[#d9d2ca]">Puedes cambiar tus dos habilidades gratis en el santuario (nodo 9) antes de llegar.</p>
      </div>
    </details>
  );
}

// ---- route -------------------------------------------------------------------------------------

function NodeStrip({ s }: { s: ExpState }) {
  const sym = { combat: "⚔", elite: "★", boss: "♛", service: "◇", sanctuary: "✦" } as const;
  const name = { combat: "Combate", elite: "Élite", boss: "Jefe", service: "Servicio", sanctuary: "Santuario" } as const;
  return (
    <ol aria-label="Nodos del sector" className="mx-auto flex max-w-full flex-wrap justify-center gap-1">
      {Array.from({ length: NODES_PER_SECTOR }, (_, i) => {
        const pos = i + 1;
        const t = nodeInfo(pos).type;
        const state = pos < s.node ? "hecho" : pos === s.node ? "ahora" : "pendiente";
        return (
          <li
            key={pos}
            aria-label={`Nodo ${pos}: ${name[t]}, ${state}`}
            aria-current={pos === s.node ? "step" : undefined}
            className={`grid h-8 min-w-8 place-items-center rounded border px-1 text-xs ${pos === s.node ? "border-yellow-300 bg-yellow-300/20 font-bold" : pos < s.node ? "border-emerald-400/60 opacity-70" : "border-white/25 opacity-80"}`}
          >
            <span aria-hidden="true">{pos < s.node ? "✓" : sym[t]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RouteCard({ o, sector }: { o: RouteOption; sector: number }) {
  const fight = o.kind === "combat" || o.kind === "elite" || o.kind === "boss";
  const payKind = o.kind === "combat" ? "normal" : o.kind === "elite" || o.kind === "boss" ? o.kind : null;
  const pay = payKind && sector <= TOWER_PAID_SECTORS ? TOWER_PAY[payKind] : 0;
  return (
    <div className="flex min-w-0 gap-2">
      <DoorIcon kind={ROUTE_DOOR[o.kind]} className="h-14 w-14 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <b className="break-words text-base">{o.label}</b>
          <span className="rounded bg-black/30 px-1 text-xs">{ROUTE_KIND_LABEL[o.kind]}</span>
        </div>
        {!fight && <p className="text-xs">{ROUTE_PURPOSE[o.kind]}</p>}
        {fight && (
          <>
            <ul className="space-y-0.5 text-xs leading-snug">
              {(o.enemies ?? []).map((e, i) => (
                <li key={i} className="break-words [overflow-wrap:anywhere]">
                  {e.name} · {ELEMENT_LABEL[e.element]} · PV {e.hp}
                </li>
              ))}
              {(o.enemies?.length ?? 0) > 1 && <li className="opacity-80">{o.tag} · PV total {o.totalHp}</li>}
            </ul>
            {o.mods && o.mods.length > 0 && <p className="text-xs">Modificador: {o.mods.map((m) => MOD_LABEL[m]).join(", ")}</p>}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <FragmentsChip value={o.fragments ?? 0} /> <ScopeTag scope="expedicion" />
            </p>
            <p className="text-xs">{o.relicReward ? "Al ganar: oferta de reliquia." : "Sin oferta de reliquia."}</p>
            {pay > 0 && (
              <p className="flex flex-wrap items-center gap-x-2 text-xs">
                <span>
                  Hasta {pay} <Icon name="system_coin" className="h-4" /> la primera vez esta semana
                </span>
                <ScopeTag scope="cuenta" />
              </p>
            )}
            <p className={`text-xs ${o.risk === "alto" ? "font-semibold text-amber-200" : ""}`}>{riskText(o)}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function RouteView({ s, act, guard, error }: NodeProps) {
  const options = useMemo(() => routeOptions(s), [s]);
  const items: ChoiceItem[] = options.map((o) => ({ id: o.id, node: <RouteCard o={o} sector={s.sector} /> }));
  const single = options.length === 1;
  return (
    <Panel title={`Sector ${s.sector} · nodo ${s.node} de ${NODES_PER_SECTOR}`} className="mx-auto w-full max-w-5xl space-y-3">
      <ErrorLine error={error} />
      <NodeStrip s={s} />
      {s.pact && (
        <p className="rounded border border-rose-400/60 bg-rose-950/40 p-2 text-sm">
          <ScopeTag scope="proximo" /> Pacto activo: los enemigos hacen +{Math.round(PACT_DAMAGE * 100)} % de daño; si ganas, +{PACT_FRAGMENTS} fragmentos extra. Expira tras ese combate, ganes o pierdas.
        </p>
      )}
      <p className="text-center text-sm text-[#d9d2ca]">
        {single ? "Este es tu único camino." : "Elige un camino: no podrás volver a ver el otro."} Los dos caminos cuentan como el mismo número de combate.
      </p>
      <Choices
        key={`${s.sector}:${s.node}`}
        name="route"
        items={items}
        className={single ? "mx-auto max-w-xl" : "sm:grid-cols-2"}
        confirmLabel={single ? "Entrar" : "Tomar este camino"}
        guard={guard}
        onConfirm={(id) => act({ type: "choose_route", optionId: id })}
      />
      <BossPreview s={s} />
    </Panel>
  );
}

// ---- offer -------------------------------------------------------------------------------------

const OFFER_SOURCE = {
  initial: "Reliquia inicial: elige una para empezar.",
  combat: "Recompensa de combate: elige una reliquia.",
  event: "Oferta del evento: elige una reliquia.",
  shop: "Oferta de la tienda.",
  sanctuary: "Oferta del santuario.",
} as const;

export function OfferView({ s, act, guard, error }: NodeProps) {
  const offer = s.offer;
  if (!offer) return null;
  const full = s.relics.length >= 6;
  const items: ChoiceItem[] = offer.options.map((o) => {
    const v = offerView(o);
    return {
      id: o.id,
      node: (
        <div className="flex min-w-0 gap-2">
          <RelicIcon id={o.relicId} className="h-14 w-14 shrink-0" />
          <div className="min-w-0 space-y-0.5">
            <b className="break-words text-base">{v.title}</b>
            <p className="text-xs">
              {v.tier} · {v.category}
            </p>
            <p className="break-words text-xs leading-snug [overflow-wrap:anywhere]">{v.effect}</p>
            <p className="text-[11px] text-[#d9d2ca]">Duración: {SCOPE.expedicion}</p>
          </div>
        </div>
      ),
      pick: needsReplace(s.relics, o) ? { title: "Tienes seis reliquias: elige cuál reemplazar", options: replaceOptions(s.relics) } : undefined,
    };
  });
  return (
    <SecondaryPanel scene={combatScene(DUNGEON_THEMES[sectorBossRoute(s.seed,s.sector)].world,false)} title={offer.source === "initial" ? "Reliquia inicial" : "Recompensa"} className="mx-auto w-full max-w-5xl space-y-3">
      <ErrorLine error={error} />
      <p className="text-center text-sm text-[#d9d2ca]">
        {OFFER_SOURCE[offer.source]}
        {offer.canDecline && ` Puedes rechazarla y recibir 10 fragmentos (${SCOPE.expedicion}).`}
        {full && " Elegir o rechazar nunca te bloquea."}
      </p>
      <Choices
        key={offer.id}
        name="offer"
        items={items}
        confirmLabel="Elegir"
        guard={guard}
        onConfirm={(id, pick) => act({ type: "choose_relic", offerId: offer.id, optionId: id, ...(pick !== undefined ? { replaceSlot: Number(pick) } : {}) })}
        extra={
          offer.canDecline && (
            <button className="btn btn-gray text-center" onClick={guard(() => act({ type: "decline_relic", offerId: offer.id }))}>
              Rechazar (+10 fragmentos)
            </button>
          )
        }
      />
      {s.relics.length > 0 && (
        <details className="tile-art p-2 text-sm">
          <summary className="cursor-pointer font-semibold">Tu build actual ({s.relics.length}/6)</summary>
          <div className="mt-2">
            <RelicRows owned={s.relics} compact />
          </div>
        </details>
      )}
    </SecondaryPanel>
  );
}

// ---- shop --------------------------------------------------------------------------------------

export function ShopView({ s, act, guard, error }: NodeProps) {
  if (!s.shop) return null;
  const bought = s.shop.bought;
  const items: ChoiceItem[] = s.shop.goods.map((g) => {
    const v = goodView(s, g);
    return {
      id: g.id,
      disabled: v.disabled,
      node: (
        <div className="flex min-w-0 gap-2">
          {v.relicId ? <RelicIcon id={v.relicId} className="h-12 w-12 shrink-0" /> : <Icon name="system_potion" className="h-12 w-12 shrink-0" />}
          <div className="min-w-0 space-y-0.5">
            <b className="break-words">{v.title}</b>
            <p className="break-words text-xs leading-snug [overflow-wrap:anywhere]">{v.text}</p>
            <p className="flex items-center gap-1 text-sm font-semibold">
              <Icon name="system_fragment" className="h-5" /> {v.price} <span className="text-xs font-normal">fragmentos</span>
            </p>
          </div>
        </div>
      ),
      pick: v.replace ? { title: "Tienes seis reliquias: elige cuál reemplazar", options: replaceOptions(s.relics) } : undefined,
    };
  });
  return (
    <SecondaryPanel scene={combatScene(DUNGEON_THEMES[sectorBossRoute(s.seed,s.sector)].world,false)} title="Tienda" className="mx-auto w-full max-w-5xl space-y-3">
      <ErrorLine error={error} />
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1">
          Tienes <FragmentsChip value={s.fragments} />
        </span>
        <ScopeTag scope="expedicion" />
      </div>
      <p className="text-center text-sm text-[#d9d2ca]">
        {bought ? "Ya hiciste tu compra: no se puede comprar más en esta visita." : "Una sola compra por visita. Puedes irte sin comprar."}
      </p>
      <Choices
        key={`${s.sector}:${s.node}:${bought}`}
        name="shop"
        items={items}
        confirmLabel={bought ? null : "Comprar"}
        guard={guard}
        onConfirm={(id, pick) => act({ type: "buy", itemId: id, ...(pick !== undefined ? { replaceSlot: Number(pick) } : {}) })}
        extra={
          <button className="btn btn-gray text-center" onClick={guard(() => act({ type: "continue" }))}>
            {bought ? "Continuar" : "Continuar sin comprar"}
          </button>
        }
      />
    </SecondaryPanel>
  );
}

// ---- rest / event / sanctuary ------------------------------------------------------------------

const choiceNode = (label: string, cost?: string) => (
  <div className="space-y-1">
    <p className="break-words text-sm leading-snug [overflow-wrap:anywhere]">{label}</p>
    {cost && (
      <p className="text-xs font-semibold text-amber-200">
        Costo: {cost} <span className="font-normal">({SCOPE.expedicion})</span>
      </p>
    )}
  </div>
);

export function RestView({ s, act, guard, error }: NodeProps) {
  const done = s.serviceDone;
  const items: ChoiceItem[] = restOptionsView(s).map((o) => ({
    id: o.id,
    node: choiceNode(o.label),
    disabled: done ? "Ya elegiste." : o.disabled,
  }));
  return (
    <SecondaryPanel scene={combatScene(DUNGEON_THEMES[sectorBossRoute(s.seed,s.sector)].world,false)} title="Descanso" className="mx-auto w-full max-w-3xl space-y-3">
      <ErrorLine error={error} />
      <div className="flex items-center justify-center gap-3">
        <DoorIcon kind="rest" className="h-16 w-16" />
        <p className="text-sm text-[#d9d2ca]">Un campamento tranquilo. Elige una sola cosa. PV actuales: {s.hp}.</p>
      </div>
      <Choices
        key={`${s.sector}:${s.node}:${done}`}
        name="rest"
        items={items}
        confirmLabel={done ? null : "Descansar"}
        guard={guard}
        className="sm:grid-cols-2"
        onConfirm={(id) => act({ type: "choose_rest", optionId: id as "heal" | "fragments" })}
        extra={
          done && (
            <button className="btn text-center" onClick={guard(() => act({ type: "continue" }))}>
              Continuar
            </button>
          )
        }
      />
    </SecondaryPanel>
  );
}

export function EventView({ s, act, guard, error }: NodeProps) {
  const ev = s.event;
  if (!ev) return null;
  const choose = ev.stage === "choose";
  const ups = upgradable(s.relics);
  const items: ChoiceItem[] = eventChoices(s).map((o) => ({
    id: o.id,
    node: choiceNode(o.label, o.cost),
    disabled: o.disabled,
    pick: ev.id === "book" && o.id === "a" && ups.length > 0 ? { title: "Elige qué reliquia mejorar", options: upgradeOptions(s.relics) } : undefined,
  }));
  return (
    <SecondaryPanel scene={combatScene(DUNGEON_THEMES[sectorBossRoute(s.seed,s.sector)].world,false)} title={EVENT_TITLE[ev.id]} className="mx-auto w-full max-w-3xl space-y-3">
      <ErrorLine error={error} />
      <div className="flex items-center justify-center gap-3">
        <Icon name={EVENT_ICON[ev.id]} className="h-20 w-20" />
        <p className="text-sm text-[#d9d2ca]">
          {choose ? "Cada respuesta muestra su costo antes de confirmar. Siempre hay una salida sin costo." : ev.note}
        </p>
      </div>
      {choose ? (
        <Choices
          key={`${s.sector}:${s.node}`}
          name="event"
          items={items}
          confirmLabel="Confirmar"
          guard={guard}
          className="sm:grid-cols-2"
          onConfirm={(id, pick) => act({ type: "choose_event", optionId: id as "a" | "b", ...(pick ? { relicId: pick } : {}) })}
        />
      ) : (
        <div className="flex justify-center">
          <button className="btn text-center" onClick={guard(() => act({ type: "continue" }))}>
            Continuar
          </button>
        </div>
      )}
    </SecondaryPanel>
  );
}

export function SanctuaryView({
  s,
  act,
  guard,
  error,
  mastery,
}: NodeProps & { mastery: number | null }) {
  const done = s.serviceDone;
  const ups = upgradable(s.relics);
  const items: ChoiceItem[] = sanctuaryOptionsView(s).map((o) => ({
    id: o.id,
    node: choiceNode(o.label),
    disabled: done ? "Ya elegiste." : o.disabled,
    pick: o.id === "upgrade" && ups.length > 0 ? { title: "Elige qué reliquia mejorar", options: upgradeOptions(s.relics) } : undefined,
  }));
  return (
    <SecondaryPanel scene={combatScene(DUNGEON_THEMES[sectorBossRoute(s.seed,s.sector)].world,false)} title="Santuario" className="mx-auto w-full max-w-5xl space-y-3">
      <ErrorLine error={error} />
      <p className="text-center text-sm text-[#d9d2ca]">
        Un solo beneficio, y cambio gratuito de tus dos habilidades antes de seguir (nunca clase, elemento, héroe ni equipo de cuenta).
      </p>
      <Choices
        key={`${s.sector}:${s.node}:${done}`}
        name="sanctuary"
        items={items}
        confirmLabel={done ? null : "Recibir beneficio"}
        guard={guard}
        onConfirm={(id, pick) =>
          act({ type: "choose_sanctuary", optionId: id as "heal" | "upgrade" | "fragments", ...(pick ? { relicId: pick } : {}) })
        }
        extra={
          <button className="btn text-center" onClick={guard(() => act({ type: "continue" }))}>
            {done ? "Continuar" : "Continuar sin beneficio"}
          </button>
        }
      />
      <details open className="tile-art p-2">
        <summary className="cursor-pointer font-semibold">Habilidades (cambio gratuito)</summary>
        <div className="mt-2">
          <SkillPicker
            classId={s.hero.classId}
            mastery={mastery}
            value={s.loadout}
            onChange={(l: Loadout) => act({ type: "set_loadout", loadout: l })}
          />
        </div>
      </details>
      <BossPreview s={s} />
    </SecondaryPanel>
  );
}

