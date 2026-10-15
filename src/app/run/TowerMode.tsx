"use client";

// Weekly tower as an expedition (docs/torre): sectors of 10 nodes with routes, relics, shop, rests and
// events. The state lives in useExpedition (local reducer + batched server sync). Leaving this screen
// never settles anything: "Guardar y salir" suspends, "Retirarse" asks and then ends it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArenaBackground } from "@/components/ArenaBackground";
import { Notice } from "@/components/Notice";
import { Panel } from "@/components/Panel";
import { CombatView } from "@/components/torre/CombatView";
import { ExpHud } from "@/components/torre/ExpHud";
import { EndView, HeroPick, PrepView, SummaryView, SuspendedView } from "@/components/torre/FlowViews";
import { EventView, OfferView, RestView, RouteView, SanctuaryView, ShopView, type NodeProps } from "@/components/torre/NodeViews";
import { useConfirmGuard, useNoKeyRepeat } from "@/components/torre/parts";
import { askConfirm } from "@/lib/dialogs";
import type { ExpActionInput } from "@/lib/expeditionSync";
import type { ExpStartOpts } from "@/lib/repo";
import type { Action } from "@/lib/game/combat";
import { masteryOf } from "@/lib/game/loadout";
import { SKILLS } from "@/lib/game/skills";
import type { TowerMode as Mode } from "@/lib/game/tower";
import { WORLDS } from "@/lib/game/worlds";
import { playEvents } from "@/lib/sfx";
import { useExpedition } from "@/lib/useExpedition";
import { pushNotice, useProfile } from "@/lib/useProfile";

function Frame({ world, hud, banner, children }: { world: number; hud?: ReactNode; banner?: ReactNode; children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-screen flex-col gap-3 p-3 pt-6">
      <div className="fixed inset-0 -z-10">
        <ArenaBackground world={world} />
      </div>
      <Notice />
      {hud && <div className="mx-auto w-full max-w-5xl">{hud}</div>}
      {banner}
      <div className="flex flex-1 flex-col justify-center gap-3">{children}</div>
    </main>
  );
}

const BackLink = ({ className = "btn btn-gray text-center" }: { className?: string }) => (
  <Link href="/torre" className={className}>
    Volver a la torre
  </Link>
);

export function TowerMode({ mode }: { mode: Mode }) {
  const { profile, ready } = useProfile();
  const router = useRouter();
  const x = useExpedition(mode);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = x.state;
  // A new view (any state change) blocks keyboard-made confirmations for a moment: no carried-over Enter/Space.
  const guard = useConfirmGuard(s ? `${s.revision}:${s.phase}:${x.lastFight ? "f" : ""}` : "none");
  useNoKeyRepeat();

  if (!ready || !profile) return null;
  const world = s ? (s.sector - 1) % WORLDS.length : 0;

  if (!x.loaded)
    return (
      <Frame world={0}>
        <Panel className="mx-auto w-full max-w-md text-center">Cargando expedición…</Panel>
      </Frame>
    );
  if (x.loadError)
    return (
      <Frame world={0}>
        <Panel title="No se pudo cargar" className="mx-auto w-full max-w-md space-y-3 text-center">
          <p className="text-sm text-[#d9d2ca]">{x.loadError}</p>
          <div className="flex justify-center gap-2">
            <button className="btn text-center" onClick={() => void x.reload()}>
              Reintentar
            </button>
            <BackLink />
          </div>
        </Panel>
      </Frame>
    );

  const act = (input: ExpActionInput): boolean => {
    const r = x.dispatch(input);
    setErr(r.error ?? null);
    if (!r.error && r.battle && (input.type === "combat_action" || input.type === "combat_auto")) {
      const b = r.battle;
      playEvents(b.events, b.status, { guard: b.guardEarned, boss: s?.fight ? s.fight.kind !== "combat" : false });
    }
    return !r.error;
  };
  const exit = async () => {
    if (s && s.phase !== "suspended" && !act({ type: "suspend" })) return;
    const saved = await x.flushNow();
    if (!saved) pushNotice("Tu expedición se guardó en este dispositivo y se enviará cuando haya conexión.");
    router.push("/torre");
  };
  const retire = () =>
    void askConfirm(
      "¿Retirarte? La expedición termina: se conserva tu puntuación y lo ya confirmado, pero pierdes reliquias y fragmentos.",
      "Retirarse",
    ).then((ok) => {
      if (ok) act({ type: "retire" });
    });
  const start = async (opts: ExpStartOpts) => {
    if (starting) return;
    setStarting(true);
    setErr(null);
    try {
      await x.start(opts);
    } catch (e) {
      pushNotice(`No se pudo iniciar la expedición: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setStarting(false);
    }
  };

  // ---- nothing running: pick the hero ----
  if (!s)
    return (
      <Frame world={0}>
        <HeroPick mode={mode} profile={profile} starting={starting} onStart={(o) => void start(o)} back={<BackLink />} />
      </Frame>
    );

  const hud = (extra?: ReactNode) => (
    <ExpHud mode={mode} s={s} save={x.save} onRetry={x.retry} onExit={() => void exit()} onRetire={retire} extra={extra} />
  );
  const banner = x.notice && (
    <button role="alert" className="mx-auto w-full max-w-5xl rounded border border-amber-300 bg-amber-950/80 p-2 text-center text-sm" onClick={x.clearNotice}>
      {x.notice} (toca para cerrar)
    </button>
  );

  // ---- a fight just ended: show its last state, then move on ----
  const lf = x.lastFight;
  if (lf) {
    const b = lf.before;
    return (
      <>
        <CombatView
          s={s}
          ctx={{ sector: b.sector, node: b.node, fight: b.fight! }}
          battle={lf.battle}
          over
          hud={(log) => <ExpHud mode={mode} s={b} save={x.save} onRetry={x.retry} extra={log} />}
          onAct={() => undefined}
          onAuto={() => undefined}
          footer={
            <>
              {lf.won && (
                <p className="text-sm">
                  +{lf.fragments} fragmentos <span className="rounded border border-amber-300/70 px-1 text-[11px] uppercase">Esta expedición</span>
                </p>
              )}
              <button className="btn btn-gray w-full text-center" onClick={guard(x.dismissFight)}>
                {lf.won ? "Continuar" : "Ver resultado"}
              </button>
            </>
          }
        />
      </>
    );
  }

  // ---- fight ----
  if (s.phase === "combat" && s.battle && s.fight)
    return (
      <CombatView
        s={s}
        ctx={{ sector: s.sector, node: s.node, fight: s.fight }}
        battle={s.battle}
        over={false}
        hud={hud}
        onAct={(a: Action, t) => act({ type: "combat_action", a, ...(t > 0 ? { target: t } : {}) })}
        onAuto={() => act({ type: "combat_auto" })}
        footer={null}
      />
    );

  const props: NodeProps = { s, act: (i) => void act(i), guard, error: err };
  const mastery = s.mode === "nivelado" ? null : masteryOf(profile, s.hero.classId);
  let view: ReactNode;
  switch (s.phase) {
    case "preparation":
      view = (
        <PrepView s={s} profile={profile} act={props.act} guard={guard} error={err} loadoutNames={s.loadout.map((id) => SKILLS[id].name).join(" + ")} />
      );
      break;
    case "initial_relic":
    case "reward":
      view = <OfferView {...props} />;
      break;
    case "route":
      view = <RouteView {...props} />;
      break;
    case "shop":
      view = <ShopView {...props} />;
      break;
    case "rest":
      view = <RestView {...props} />;
      break;
    case "event":
      view = <EventView {...props} />;
      break;
    case "sanctuary":
      view = <SanctuaryView {...props} mastery={mastery} />;
      break;
    case "sector_summary":
      view = <SummaryView s={s} act={props.act} guard={guard} />;
      break;
    case "suspended":
      view = <SuspendedView s={s} act={props.act} guard={guard} back={<BackLink />} onRetire={retire} />;
      break;
    case "ended":
      view = <EndView s={s} save={x.save} pending={x.pending} onRetry={x.retry} onNew={x.reset} />;
      break;
    default:
      view = (
        <Panel className="mx-auto w-full max-w-md space-y-2 text-center">
          <p>No hay nada que mostrar en esta fase.</p>
          <BackLink />
        </Panel>
      );
  }
  return (
    <Frame world={world} hud={s.phase === "ended" ? undefined : hud()} banner={banner}>
      {view}
    </Frame>
  );
}
