"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { BattleArena } from "@/components/BattleArena";
import { DoorIcon } from "@/components/DoorIcon";
import { ElementIcon } from "@/components/ElementIcon";
import { EnemySprite } from "@/components/EnemySprite";
import { LogPanel } from "@/components/LogPanel";
import { MuteButton } from "@/components/MuteButton";
import { Panel } from "@/components/Panel";
import { Chip } from "@/components/Chip";
import { ItemCard } from "@/components/ItemCard";
import { RarityFrame } from "@/components/RarityFrame";
import { Sprite } from "@/components/Sprite";
import { StarRow } from "@/components/StarRow";
import { Tooltip } from "@/components/Tooltip";
import {
  classStatTip,
  coinsTip,
  DOOR_LABEL,
  doorHint,
  doorTip,
  eventChoiceTip,
  floorTip,
  levelTip,
  livesTip,
  MOD_LABEL,
  modTip,
  passiveTip,
  previewCombatant,
  RELIC_RARITY_COLOR,
  RELIC_RARITY_LABEL,
  relicTip,
  runHpTip,
  shopItemTip,
  upgradeTip,
} from "@/lib/game/explain";
import { CLASSES, CLASS_IDS, type ClassId } from "@/lib/game/characters";
import {
  bestOfClass,
  charactersOfClass,
  heroFromOwned,
  type Profile,
} from "@/lib/game/profile";
import { RARITIES } from "@/lib/game/rarity";
import { Notice } from "@/components/Notice";
import { proceedRun, type RunAction } from "@/lib/game/replay";
import { pushNotice, repo, useProfile } from "@/lib/useProfile";
import { characterView, filterSortCharacters } from "@/lib/viewModels";
import { autoBlockReason, autoResolve } from "@/lib/game/auto";
import { step, type Action, type Battle } from "@/lib/game/combat";
import { SkillChoice } from "@/components/SkillChoice";
import { useTargeting } from "@/components/useTargeting";
import type { GameEvent } from "@/lib/game/events";
import { UPGRADES, upgradeLabel, xpToNext } from "@/lib/game/progression";
import { SKILLS } from "@/lib/game/skills";
import { RELICS } from "@/lib/game/relics";
import type { Rng } from "@/lib/game/rng";
import {
  applyBattleResult,
  buyItem,
  chooseDoor,
  chooseRelic,
  chooseSkill,
  isVictory,
  MAX_FLOOR,
  createRun,
  eventCost,
  fleeCost,
  getFloor,
  itemUseless,
  maxHp,
  pickUpgrade,
  relicOffer,
  resolveEvent,
  runScore,
  skillOffer,
  startFight,
  START_LIVES,
  upgradeOffer,
  type DoorKind,
  type FightNode,
  type Run,
} from "@/lib/game/run";
import { FLOORS_PER_WORLD, WORLDS, worldOf } from "@/lib/game/worlds";
import { playEvents } from "@/lib/sfx";

type Screen =
  | { t: "doors" }
  | {
      t: "fight";
      node: FightNode;
      battle: Battle;
      rng: Rng;
      result: Run | null; // run after applying the finished battle
    }
  | { t: "shop" }
  | { t: "event"; event: GameEvent; text: string | null }
  | { t: "toast"; kind: DoorKind; title: string; text: string }
  | { t: "picks"; advance: boolean }
  | { t: "relic" };

// Relic rarity colours (project palette): común gris, rara azul, legendaria dorado.
const RARITY_BORDER = {
  comun: "!border-gray-400",
  rara: "!border-blue-400",
  legendaria: "!border-yellow-400",
} as const;

function Hud({ run }: { run: Run }) {
  const world = worldOf(run.floor);
  const hero = run.hero;
  return (
    <div className="pixel-frame flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 text-base">
      <Tooltip tip={floorTip(run)}>
        <span className="flex cursor-help items-center gap-1.5">
          <b className="text-yellow-300">Piso {run.floor}</b>
          <span className="text-[#d9d2ca]">{world.name}</span>
          <ElementIcon element={world.element} className="h-5" bare />
        </span>
      </Tooltip>
      <Tooltip tip={livesTip(run)}>
        <span
          aria-label={`Vidas: ${run.lives}`}
          className="cursor-help whitespace-nowrap text-xl leading-none"
        >
          {Array.from({ length: Math.max(START_LIVES, run.lives) }, (_, i) => (
            <span
              key={i}
              className={i < run.lives ? "text-red-500" : "opacity-30"}
            >
              ♥
            </span>
          ))}
        </span>
      </Tooltip>
      <Tooltip tip={coinsTip(run)}>
        <span className="cursor-help font-semibold text-yellow-300">
          ● {run.coins} monedas
        </span>
      </Tooltip>
      <Tooltip tip={levelTip(run)}>
        <span className="flex cursor-help items-center gap-1.5 text-green-300">
          <RarityFrame rarity={hero.rarity ?? "comun"} size={26}>
            <Sprite
              classId={hero.classId}
              element={hero.element}
              traits={hero.traits}
              className="w-[85%]"
            />
          </RarityFrame>
          <span>
            <span style={{ color: RARITIES[hero.rarity ?? "comun"].color }}>
              {hero.name}
            </span>{" "}
            · Nv {hero.level} · XP {hero.xp}/{xpToNext(hero.level)}
          </span>
          {(hero.stars ?? 0) > 0 && (
            <StarRow stars={hero.stars ?? 0} className="h-2" />
          )}
        </span>
      </Tooltip>
      <Tooltip tip={runHpTip(run)}>
        <span className="cursor-help text-[#d9d2ca]">
          PV {Math.round(run.hp)}/{maxHp(run)}
        </span>
      </Tooltip>
      {run.relics.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {run.relics.map((id) => (
            <Chip
              key={id}
              tone="passive"
              tip={relicTip(id, run.relics, hero)}
              className={RARITY_BORDER[RELICS[id].rarity]}
            >
              {RELICS[id].name}
            </Chip>
          ))}
        </span>
      )}
    </div>
  );
}

const Center = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
);

export default function RunPage() {
  return (
    <>
      <Notice />
      <RunScreen />
    </>
  );
}

function RunScreen() {
  const [run, setRun] = useState<Run | null>(null);
  const [screen, setScreen] = useState<Screen>({ t: "doors" });
  const [msgs, setMsgs] = useState<string[]>([]);
  const targeting = useTargeting(screen.t === "fight" ? screen.battle : null);

  const [seed, setSeed] = useState<number | null>(null);
  const [chooseClass, setChooseClass] = useState<ClassId | null>(null);
  const { profile, ready } = useProfile();

  // Banking: exactly once per run. The runId guard lives in the ref (this
  // page) and in bankRun/lastBankedRunId (profile), so strict-mode double
  // effects, double clicks, pagehide and unmount cannot double credit.
  const runRef = useRef<Run | null>(null);
  const runIdRef = useRef<string | null>(null);
  const bankedRef = useRef<string | null>(null);
  const actionsRef = useRef<RunAction[]>([]);
  const rec = (a: RunAction) => void actionsRef.current.push(a);
  const bank = useCallback(() => {
    const r = runRef.current;
    const id = runIdRef.current;
    if (!r || !id || bankedRef.current === id) return;
    bankedRef.current = id;
    repo
      .submitRun(
        id,
        actionsRef.current,
        { coins: r.coins, maxFloor: r.maxFloor },
        true,
      )
      .then((info) => {
        if (info.verdict === "truncated" || info.verdict === "mismatch")
          pushNotice(
            "El servidor ajustó tu run: no pudo repetir todas tus jugadas. Se pagó solo lo verificado.",
          );
        else if (info.capped)
          pushNotice(
            "El servidor recortó las monedas de tu run (tope por piso).",
          );
      })
      .catch((e: unknown) =>
        pushNotice(
          `El servidor rechazó tu run: ${e instanceof Error ? e.message : "error"}`,
        ),
      );
  }, []);
  useEffect(() => {
    runRef.current = run;
    if (run?.status === "over") bank();
  }, [run, bank]);
  useEffect(() => {
    window.addEventListener("pagehide", bank);
    return () => {
      window.removeEventListener("pagehide", bank);
      bank(); // leaving the page mid-run (menu, back button)
    };
  }, [bank]);
  const confirmLeave = () =>
    !run ||
    run.status === "over" ||
    window.confirm("¿Abandonar? Conservas las monedas ganadas");

  const [starting, setStarting] = useState(false);
  const start = async (classId: ClassId, characterId: string | null) => {
    if (seed === null || starting) return;
    setStarting(true);
    try {
      const info = await repo.startRun(classId, characterId, seed);
      runIdRef.current = info.runId;
      actionsRef.current = [];
      setChooseClass(null);
      setRun(createRun(info.seed, info.hero));
      setScreen({ t: "doors" });
      setMsgs([
        `Semilla ${info.seed}. ${info.hero.name} (${CLASSES[info.hero.classId].name}) entra a la mazmorra.`,
      ]);
    } catch (e) {
      pushNotice(
        `El servidor no pudo iniciar la run: ${e instanceof Error ? e.message : "error"}`,
      );
    } finally {
      setStarting(false);
    }
  };
  const pickClass = (classId: ClassId) => {
    if (seed === null || !profile) return;
    if (charactersOfClass(profile, classId).length > 0) setChooseClass(classId);
    else void start(classId, null);
  };
  const toSelect = () => {
    bank();
    setRun(null);
    setSeed(Date.now());
  };
  useEffect(() => {
    // client-only seed avoids SSR hydration mismatch; ?seed=N replays a run
    const q = Number(new URLSearchParams(location.search).get("seed"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeed(Number.isFinite(q) && q > 0 ? Math.floor(q) : Date.now());
  }, []);
  if (seed === null || !ready || !profile) return null;
  if (!run && chooseClass)
    return (
      <CharacterSelect
        classId={chooseClass}
        profile={profile}
        onPick={(id) => void start(chooseClass, id)}
        onBack={() => setChooseClass(null)}
      />
    );
  if (!run) return <ClassSelect onPick={pickClass} />;

  const log = (...lines: string[]) => setMsgs((m) => [...m, ...lines]);

  // Leaves a finished node: owed level-ups first, then (if advance) next floor + relic offer.
  const proceed = (r0: Run, advance: boolean) => {
    const { run: n, next } = proceedRun(r0, advance);
    setRun(n);
    if (next === "over" || next === "doors") setScreen({ t: "doors" });
    else if (next === "picks") setScreen({ t: "picks", advance });
    else setScreen({ t: "relic" });
    if (advance && n.floor !== r0.floor) log(`— Piso ${n.floor} —`);
  };

  const openDoor = (i: number) => {
    const r = chooseDoor(run, i);
    if (!r) return;
    rec({ t: "door", i });
    const { node } = r;
    setRun(r.run);
    switch (node.type) {
      case "fight": {
        const started = startFight(r.run);
        if (!started) return;
        setRun(started.run);
        setScreen({
          t: "fight",
          node,
          battle: started.battle,
          rng: started.rng,
          result: null,
        });
        break;
      }
      case "chest":
        log(`Cofre: +${node.coins} monedas.`);
        setScreen({
          t: "toast",
          kind: "chest",
          title: "Cofre",
          text: `Encuentras ${node.coins} monedas.`,
        });
        break;
      case "rest":
        log(`Descanso: +${node.healed} de vida.`);
        setScreen({
          t: "toast",
          kind: "rest",
          title: "Descanso",
          text:
            node.healed > 0
              ? `Recuperas ${node.healed} de vida.`
              : "Ya estás en plena forma.",
        });
        break;
      case "shop":
        setScreen({ t: "shop" });
        break;
      case "event":
        setScreen({ t: "event", event: node.event, text: null });
        break;
    }
  };

  const settle = (s: Extract<Screen, { t: "fight" }>, next: Battle) => {
    playEvents(next.events, next.status, {
      guard: next.guardEarned,
      boss: s.node.kind === "boss",
    });
    const result =
      next.status === "ongoing" ? null : applyBattleResult(run, next, s.node);
    setScreen({ ...s, battle: next, result });
  };
  const act = (
    s: Extract<Screen, { t: "fight" }>,
    a: Action,
    target: number,
  ) => {
    const next = step(s.battle, a, s.rng, target);
    if (next !== s.battle)
      rec({ t: "act", a, ...(target > 0 ? { target } : {}) });
    settle(s, next);
  };
  // Quick resolve: ONE log entry; the server replays it with the same policy.
  const quick = (s: Extract<Screen, { t: "fight" }>) => {
    if (autoBlockReason(s.battle, s.node.kind)) return;
    rec({ t: "auto" });
    settle(s, autoResolve(s.battle, s.rng));
  };

  const finishFight = (s: Extract<Screen, { t: "fight" }>) => {
    const r = s.result;
    if (!r) return;
    const st = s.battle.status;
    rec({ t: "fin" });
    log(fightSummary(run, r, st));
    if (r.status === "over") log(`Fin de la run. Piso máximo: ${runScore(r)}.`);
    proceed(r, st === "won");
  };

  // ---- Screens ----
  let main: ReactNode;
  let logLines = msgs;
  let logExtra: ReactNode = null;

  if (run.status === "over" && screen.t !== "fight") {
    main = (
      <Center>
        <Panel title="Fin de la run" className="text-center">
          {isVictory(run) ? (
            <div className="text-2xl text-yellow-300">
              ¡Victoria! Completaste los {MAX_FLOOR} pisos
            </div>
          ) : (
            <div className="text-2xl text-red-400">Caíste en la mazmorra</div>
          )}
          <div className="mt-2 text-yellow-300">
            Puntaje (piso máximo): {runScore(run)}
          </div>
          <div className="mt-1 text-sm opacity-80">
            {run.hero.name} · Nv {run.hero.level} · {run.coins} monedas ·{" "}
            {run.relics.length} reliquias
          </div>
          <div className="mt-2 text-green-300">
            +{run.coins} monedas guardadas
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button className="btn text-center" onClick={toSelect}>
              Nueva run
            </button>
            <Link href="/gacha" className="btn text-center">
              Ir al gacha
            </Link>
            <Link href="/" className="btn btn-gray text-center">
              Menú
            </Link>
          </div>
        </Panel>
      </Center>
    );
  } else if (screen.t === "fight") {
    const { battle: b, node, result } = screen;
    logLines = b.log;
    const fam = worldOf(run.floor).family;
    const mods = b.mods ?? [];
    main = (
      <>
        <BattleArena
          b={b}
          enemyExtra={(i, c) =>
            `${node.kind === "boss" && i === 0 ? "JEFE · " : ""}Nv ${c.char.level}`
          }
          playerExtra={`Nv ${run.hero.level} · XP ${run.hero.xp}/${xpToNext(run.hero.level)}`}
          enemyArt={(i, c) => (
            <EnemySprite
              family={fam}
              element={c.char.element}
              boss={node.kind === "boss" && i === 0}
              flip
            />
          )}
          enemy={targeting.enemy}
          onTarget={targeting.select}
          playerExtraTip={levelTip(run)}
          inRun
          world={Math.floor((run.floor - 1) / FLOORS_PER_WORLD) % WORLDS.length}
          boss={node.kind === "boss"}
          enemyChips={(_, c) =>
            mods
              .filter((m) => m !== "escudo")
              .map((m) => (
                <Chip key={m} tone="danger" tip={modTip(m, c)}>
                  {MOD_LABEL[m]}
                </Chip>
              ))
          }
        />
        <ActionPanel
          b={b}
          target={targeting.target}
          onAct={(a, t) => act(screen, a, t)}
          fleeCost={fleeCost(run)}
          auto={
            node.kind === "easy"
              ? {
                  reason: autoBlockReason(b, node.kind),
                  onAuto: () => quick(screen),
                }
              : undefined
          }
        >
          {result && (
            <>
              <div className="text-sm">
                {fightSummary(run, result, b.status)}
              </div>
              <button
                className="btn btn-gray w-full text-center"
                onClick={() => finishFight(screen)}
              >
                {result.status === "over" ? "Ver resultado" : "Continuar"}
              </button>
            </>
          )}
        </ActionPanel>
      </>
    );
  } else if (screen.t === "picks" && run.pendingSkill) {
    main = (
      <Center>
        <Panel title="¡Subes de nivel!">
          <SkillChoice
            classId={run.hero.classId}
            ids={skillOffer(run)}
            onPick={(id) => {
              log(`Habilidad: ${SKILLS[id].name}.`);
              rec({ t: "skill", id });
              proceed(chooseSkill(run, id), screen.advance);
            }}
          />
        </Panel>
      </Center>
    );
  } else if (screen.t === "picks") {
    main = (
      <Center>
        <Panel title="¡Subes de nivel!">
          <div className="mb-3 text-center text-base text-yellow-300">
            Elige una mejora ({run.pendingPicks} pendiente
            {run.pendingPicks > 1 ? "s" : ""})
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {upgradeOffer(run).map((id) => (
              <Tooltip
                key={id}
                tip={upgradeTip(id, run.hero, run.ups[id] ?? 0)}
                className="block"
                focusable={false}
              >
                <button
                  className="btn h-full w-full"
                  onClick={() => {
                    log(
                      `Mejora: ${UPGRADES[id].name} (${upgradeLabel(id, run.ups[id] ?? 0)}).`,
                    );
                    rec({ t: "pick", id });
                    proceed(pickUpgrade(run, id), screen.advance);
                  }}
                >
                  <div className="font-semibold">{UPGRADES[id].name}</div>
                  <div className="text-sm">
                    {upgradeLabel(id, run.ups[id] ?? 0)}
                  </div>
                </button>
              </Tooltip>
            ))}
          </div>
        </Panel>
      </Center>
    );
  } else if (screen.t === "relic") {
    main = (
      <Center>
        <Panel title="Reliquia">
          <div className="mb-3 text-center text-base text-yellow-300">
            Elige una reliquia (dura solo esta run)
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(run.pendingRelic ?? []).map((id) => (
              <Tooltip
                key={id}
                tip={relicTip(id, run.relics, run.hero)}
                className="block"
                focusable={false}
              >
                <button
                  className={`btn h-full w-full ${RARITY_BORDER[RELICS[id].rarity]}`}
                  onClick={() => {
                    log(`Reliquia: ${RELICS[id].name}.`);
                    rec({ t: "relic", id });
                    setRun(chooseRelic(run, id));
                    setScreen({ t: "doors" });
                  }}
                >
                  <div className="font-semibold">{RELICS[id].name}</div>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: RELIC_RARITY_COLOR[RELICS[id].rarity] }}
                  >
                    {RELIC_RARITY_LABEL[RELICS[id].rarity]}
                  </div>
                  <div className="text-sm">{RELICS[id].description}</div>
                </button>
              </Tooltip>
            ))}
          </div>
        </Panel>
      </Center>
    );
  } else if (screen.t === "shop" && run.node?.type === "shop") {
    const items = run.node.items;
    const reroll = items.find((it) => it.kind === "reroll");
    main = (
      <Center>
        <Panel title="Mercader">
          <div className="mb-3 text-center text-base text-yellow-300">
            Tienes {run.coins} monedas
          </div>
          <div className="space-y-2">
            {items.map((it) => {
              const bought = run.bought.includes(it.id);
              const useless = itemUseless(run, it);
              const poor = run.coins < it.price;
              const desc =
                it.kind === "stat"
                  ? `${UPGRADES[it.stat].name}: ${upgradeLabel(it.stat, run.ups[it.stat] ?? 0)}`
                  : it.label;
              const note =
                useless && it.kind === "life"
                  ? "Ya tienes el máximo de vidas"
                  : useless
                    ? "Ya tienes la vida llena"
                    : null;
              return (
                <div key={it.id} className="flex items-center gap-3">
                  <Tooltip
                    tip={shopItemTip(it, run)}
                    className="min-w-0 flex-1"
                  >
                    <span className="cursor-help text-base">
                      {desc}
                      {note && (
                        <span className="block text-sm text-[#d9d2ca]">
                          {note}
                        </span>
                      )}
                    </span>
                  </Tooltip>
                  <button
                    className="btn w-32 shrink-0 text-center text-base"
                    disabled={bought || poor || useless}
                    onClick={() => {
                      const r = buyItem(run, it.id);
                      if (r) {
                        rec({ t: "buy", id: it.id });
                        setRun(r);
                        log(`Compras: ${desc} (-${it.price}).`);
                      }
                    }}
                  >
                    {bought ? "Comprado" : `● ${it.price}`}
                  </button>
                </div>
              );
            })}
          </div>
          {reroll && (
            <div className="mt-3 text-center text-sm text-[#d9d2ca]">
              Ofrenda al salir:{" "}
              {(relicOffer(run.seed, run.floor, run.rerolls, run.relics) ?? [])
                .map((id) => RELICS[id].name)
                .join(", ") || "ninguna"}
            </div>
          )}
          <button
            className="btn btn-gray mt-4 w-full text-center"
            onClick={() => {
              rec({ t: "leave" });
              proceed(run, true);
            }}
          >
            Salir de la tienda
          </button>
        </Panel>
      </Center>
    );
  } else if (screen.t === "event") {
    const ev = screen.event;
    main = (
      <Center>
        <Panel title={ev.title}>
          <div className="mb-3 text-center">{ev.text}</div>
          {screen.text === null ? (
            <div className="grid gap-2">
              {ev.choices.map((c, i) => {
                const cost = eventCost(run, c);
                const price = [
                  cost.coins > 0 ? `${cost.coins} monedas` : "",
                  cost.hp > 0 ? `${cost.hp} de vida` : "",
                ]
                  .filter(Boolean)
                  .join(" y ");
                return (
                  <Tooltip
                    key={i}
                    tip={eventChoiceTip(run, c)}
                    className="block"
                    focusable={false}
                  >
                    <button
                      className="btn w-full"
                      disabled={!cost.affordable}
                      onClick={() => {
                        const r = resolveEvent(run, i);
                        if (!r) return;
                        rec({ t: "event", i });
                        setRun(r.run);
                        log(`${ev.title}: ${r.text}`);
                        setScreen({ t: "event", event: ev, text: r.text });
                      }}
                    >
                      {c.label}
                      {price && (
                        <span className="block text-sm">
                          Cuesta {price}
                          {!cost.affordable && " · no te alcanza"}
                        </span>
                      )}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          ) : (
            <>
              <div className="mb-3 text-center text-yellow-300">
                {screen.text}
              </div>
              <button
                className="btn btn-gray w-full text-center"
                onClick={() => {
                  rec({ t: "leave" });
                  proceed(run, true);
                }}
              >
                Continuar
              </button>
            </>
          )}
        </Panel>
      </Center>
    );
  } else if (screen.t === "toast") {
    main = (
      <Center>
        <Panel title={screen.title} className="text-center">
          <DoorIcon kind={screen.kind} className="mx-auto h-16" />
          <div className="my-3 text-yellow-300">{screen.text}</div>
          <button
            className="btn btn-gray w-full text-center"
            onClick={() => {
              rec({ t: "leave" });
              proceed(run, true);
            }}
          >
            Continuar
          </button>
        </Panel>
      </Center>
    );
  } else {
    const { isBoss, doors, world } = getFloor(run);
    main = (
      <Center>
        <Panel
          title={isBoss ? "¡Piso de jefe!" : "Elige una puerta"}
          titleClass={isBoss ? "text-red-400" : ""}
        >
          <div className="mb-3 text-center text-base text-[#d9d2ca]">
            Piso {run.floor} · {world.name}
          </div>
          <div
            className={`grid gap-3 ${isBoss ? "" : doors.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
          >
            {doors.map((d, i) => (
              <Tooltip
                key={i}
                tip={doorTip(d.kind, run)}
                className="block"
                focusable={false}
              >
                <button
                  onClick={() => openDoor(i)}
                  className={`pixel-frame flex h-full w-full flex-col items-center gap-1 p-3 text-center hover:brightness-125 active:translate-y-0.5 ${
                    d.kind === "boss" ? "animate-pulse !border-red-700" : ""
                  }`}
                >
                  <DoorIcon kind={d.kind} className="h-14 md:h-16" />
                  <span
                    className={`text-base font-semibold ${d.kind === "boss" ? "text-red-400" : d.kind === "hard" ? "text-orange-300" : ""}`}
                  >
                    {DOOR_LABEL[d.kind]}
                  </span>
                  <span className="text-sm text-[#d9d2ca]">
                    {doorHint(d.kind, run)}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        </Panel>
      </Center>
    );
  }

  logExtra = (
    <>
      <button
        className="btn btn-gray mt-3 w-full text-center"
        onClick={() => confirmLeave() && toSelect()}
      >
        Nueva run
      </button>
      <Link
        href="/"
        className="btn btn-gray mt-2 block w-full text-center"
        onClick={(e) => {
          if (!confirmLeave()) e.preventDefault();
        }}
      >
        Menú
      </Link>
      <MuteButton />
    </>
  );

  return (
    <main className="flex flex-col gap-3 p-3 pt-6 text-base md:h-screen md:overflow-hidden">
      <div className="mx-auto w-full max-w-4xl">
        <Hud run={run} />
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-col-reverse gap-4 md:min-h-0 md:flex-1 md:flex-row-reverse">
        <LogPanel lines={logLines}>{logExtra}</LogPanel>
        <div className="flex min-w-0 flex-1 flex-col gap-4 md:min-h-0">
          {main}
        </div>
      </div>
    </main>
  );
}

const CLASS_BLURB: Record<ClassId, string> = {
  caballero: "Vida alta. Aguanta lo que sea.",
  mago: "Ataque alto. Frágil pero letal.",
  picaro: "Crítico y huida. Rápido y escurridizo.",
  clerigo: "Cura. Resiste con paciencia.",
};

function ClassSelect({ onPick }: { onPick: (c: ClassId) => void }) {
  return (
    <main className="flex flex-col justify-center gap-4 p-3 pt-8 md:h-screen md:overflow-hidden">
      <Panel title="Elige tu clase" className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-center text-base text-[#d9d2ca]">
          Elemento, rasgos y stats se sortean al empezar.
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          {CLASS_IDS.map((id) => {
            const c = CLASSES[id];
            const pv = previewCombatant(id);
            return (
              <div
                key={id}
                className="pixel-frame flex flex-col items-center gap-1 p-2 text-center"
              >
                <Sprite
                  classId={id}
                  element="tierra"
                  className="w-20 md:w-24"
                />
                <span className="text-lg font-semibold text-yellow-300">
                  {c.name}
                </span>
                <span className="text-sm">{CLASS_BLURB[id]}</span>
                <span className="flex flex-wrap justify-center gap-x-2 text-sm">
                  {(["hp", "atk", "def"] as const).map((k) => (
                    <Tooltip key={k} tip={classStatTip(id, k)}>
                      <span className="stat-cell">
                        <span className="stat-k">
                          {k === "hp" ? "PV" : k === "atk" ? "ATQ" : "DEF"}
                        </span>
                        <span className="stat-v text-orange-300">
                          {c.stats[k]}
                        </span>
                      </span>
                    </Tooltip>
                  ))}
                </span>
                <span className="text-sm text-[#d9d2ca]">
                  {c.attack1.name} / {c.attack2.name}
                </span>
                <Chip tone="passive" tip={passiveTip(pv)}>
                  {c.passive.name}
                </Chip>
                <span className="text-sm text-cyan-300">
                  {c.passive.description}
                </span>
                <button
                  onClick={() => onPick(id)}
                  className="btn mt-auto w-full text-center font-semibold"
                >
                  Elegir {c.name}
                </button>
              </div>
            );
          })}
        </div>
        <Link href="/" className="btn btn-gray mt-3 block text-center">
          Menú
        </Link>
      </Panel>
    </main>
  );
}

function fightSummary(
  before: Run,
  after: Run,
  status: Battle["status"],
): string {
  if (status === "won") {
    const lv = after.hero.level - before.hero.level;
    return `Victoria: +${after.coins - before.coins} monedas${lv > 0 ? ` · ¡sube a nivel ${after.hero.level}!` : "."}`;
  }
  if (status === "fled")
    return `Huiste. Pagas ${before.coins - after.coins} monedas.`;
  return after.status === "over"
    ? "Derrota: perdiste tu última vida."
    : `Derrota: pierdes una vida (te quedan ${after.lives}).`;
}

function CharacterSelect({
  classId,
  profile,
  onPick,
  onBack,
}: {
  classId: ClassId;
  profile: Profile;
  onPick: (ownedId: string | null) => void;
  onBack: () => void;
}) {
  const owned = filterSortCharacters(charactersOfClass(profile, classId), {
    classId: "all",
    rarity: "all",
    sort: "rarity",
  });
  const [sel, setSel] = useState(bestOfClass(profile, classId)?.id ?? null);
  const chosen = owned.find((c) => c.id === sel);
  return (
    <main className="flex flex-col justify-center gap-4 p-3 pt-8">
      <Panel
        title={`Elige tu ${CLASSES[classId].name}`}
        className="mx-auto w-full max-w-4xl"
      >
        <p className="mb-3 text-center text-base text-[#d9d2ca]">
          Tus personajes de esta clase (el mejor viene preseleccionado).
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] justify-items-center gap-x-2 gap-y-4">
          {owned.map((c) => {
            const hero = heroFromOwned(profile, c.id);
            return (
              <button
                key={c.id}
                aria-label={c.name}
                aria-pressed={sel === c.id}
                onClick={() => setSel(c.id)}
              >
                <ItemCard
                  item={characterView(c, { stats: hero?.stats })}
                  size={80}
                  selected={sel === c.id}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            className="btn text-center"
            disabled={!chosen}
            onClick={() => onPick(sel)}
          >
            {chosen ? `Empezar con ${chosen.name}` : "Elige un personaje"}
          </button>
          <button
            className="btn btn-gray text-center"
            onClick={() => onPick(null)}
          >
            Personaje al azar (Común)
          </button>
          <button className="btn btn-gray text-center" onClick={onBack}>
            Cambiar de clase
          </button>
        </div>
      </Panel>
    </main>
  );
}
