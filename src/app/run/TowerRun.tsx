"use client";

import { iconFor, relicIcon } from "@/lib/art";
import { Confetti } from "@/components/Confetti";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionPanel } from "@/components/ActionPanel";
import { ArenaBackground } from "@/components/ArenaBackground";
import { BattleArena } from "@/components/BattleArena";
import { DoorIcon } from "@/components/DoorIcon";
import { ElementIcon } from "@/components/ElementIcon";
import { EnemySprite } from "@/components/EnemySprite";
import { FightLog, LogPanel } from "@/components/LogPanel";
import { MuteButton } from "@/components/MuteButton";
import { EventResult } from "@/components/EventResult";
import { isTowerMode, TOWER_LABEL, type TowerMode } from "@/lib/game/tower";
import { Panel } from "@/components/Panel";
import { Chip } from "@/components/Chip";
import { ItemCard } from "@/components/ItemCard";
import { RarityFrame } from "@/components/RarityFrame";
import { dropsText } from "@/components/PartsList";
import { partCount } from "@/lib/game/parts";
import { HeroSprite } from "@/components/HeroSprite";
import { StarRow } from "@/components/StarRow";
import { Icon } from "@/components/Icon";
import { RankIcon } from "@/components/RankIcon";
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
import { heroFromOwned, heroPower, type Profile } from "@/lib/game/profile";
import { RARITIES, RARITY_IDS } from "@/lib/game/rarity";
import { Notice } from "@/components/Notice";
import { proceedRun, type RunAction } from "@/lib/game/replay";
import {
  ASC_RULES,
  DUNGEONS,
  MAX_ASCENSION,
  UNLOCK_MIN_LIVES,
  maxAscension,
  powerVerdict,
  recommendedPower,
  lockReason,
  type Ascensions,
  type Clears,
} from "@/lib/game/dungeons";
import type { RarityId } from "@/lib/game/rarity";
import { canUseWeapon, isGearType, slotOf } from "@/lib/game/weapons";
import { pieceSummary } from "@/lib/game/loot";
import { WeaponSprite } from "@/components/WeaponSprite";
import { pushNotice, repo, useProfile } from "@/lib/useProfile";
import { EquipmentEditor } from "@/components/EquipmentEditor";
import { characterView } from "@/lib/viewModels";
import { autoBlockReason, autoResolve } from "@/lib/game/auto";
import { step, type Action, type Battle } from "@/lib/game/combat";
import { SkillChoice } from "@/components/SkillChoice";
import { useTargeting } from "@/components/useTargeting";
import { EVENTS, type GameEvent } from "@/lib/game/events";
import { UPGRADES, upgradeLabel, xpToNext } from "@/lib/game/progression";
import { SKILLS } from "@/lib/game/skills";
import { RELICS } from "@/lib/game/relics";
import type { Rng } from "@/lib/game/rng";
import {
  applyBattleResult,
  chooseLoot,
  buyItem,
  chooseDoor,
  chooseRelic,
  chooseSkill,
  isVictory,
  topFloor,
  createRun,
  eventCost,
  getFloor,
  itemUseless,
  maxHp,
  pickUpgrade,
  relicOffer,
  resolveEvent,
  type EventChange,
  runScore,
  skillOffer,
  startFight,
  START_LIVES,
  upgradeOffer,
  type DoorKind,
  type FightNode,
  type Run,
} from "@/lib/game/run";
import { FLOORS_PER_WORLD, WORLDS } from "@/lib/game/worlds";
import { playEvents } from "@/lib/sfx";
import { Vfx } from "@/components/fx/Vfx";

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
  | {
      t: "event";
      event: GameEvent;
      text: string | null;
      paid?: EventChange[];
      changes?: EventChange[];
    }
  | { t: "toast"; kind: DoorKind; title: string; text: string }
  | { t: "picks"; advance: boolean }
  | { t: "relic" };

// Relic rarity colours (project palette): común gris, rara azul, legendaria dorado.
const RARITY_BORDER = {
  comun: "!border-gray-400",
  rara: "!border-blue-400",
  legendaria: "!border-yellow-400",
} as const;

function Hud({ run, float = false }: { run: Run; float?: boolean }) {
  const world = getFloor(run).world;
  const hero = run.hero;
  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 text-base ${float ? "hud-float" : "pixel-frame"}`}
    >
      <Tooltip tip={floorTip(run)}>
        <span className="flex cursor-help items-center gap-1.5">
          <b className="text-yellow-300">
            Piso {run.floor}/{topFloor(run)}
          </b>
          <span className="text-[#d9d2ca]">
            {run.rank ? DUNGEONS[run.rank].name : world.name}
          </span>
          <ElementIcon element={world.element} className="h-5" bare />
        </span>
      </Tooltip>
      <Tooltip tip={livesTip(run)}>
        <span
          aria-label={`Vidas: ${run.lives}`}
          className="inline-flex cursor-help items-center whitespace-nowrap"
        >
          {Array.from({ length: Math.max(START_LIVES, run.lives) }, (_, i) => (
            <Icon
              key={i}
              name={i < run.lives ? "system_heart_full" : "system_heart_empty"}
              className="h-7"
            />
          ))}
        </span>
      </Tooltip>
      <Tooltip tip={coinsTip(run)}>
        <span className="cursor-help font-semibold text-yellow-300">
          <Icon name="system_coin" className="h-5" /> {run.coins}
        </span>
      </Tooltip>
      <Tooltip tip={levelTip(run)} className="ml-auto inline-flex">
        <span className="flex cursor-help items-center gap-1.5 text-green-300">
          <RarityFrame rarity={hero.rarity ?? "f"} size={26}>
            <HeroSprite
              classId={hero.classId}
              element={hero.element}
              traits={hero.traits}
              className="w-[85%]"
            />
          </RarityFrame>
          <span className="min-w-0">
            <span style={{ color: RARITIES[hero.rarity ?? "f"].color }}>
              {hero.name}
            </span>{" "}
            · Nv {hero.level} · XP {hero.xp}/{xpToNext(hero.level)}
            {float && (
              <span className="hud-meter mt-0.5 block">
                <i
                  className="bg-[#4aa8e8]"
                  style={{
                    width: `${Math.min(100, (hero.xp / xpToNext(hero.level)) * 100)}%`,
                  }}
                />
              </span>
            )}
          </span>
          {(hero.stars ?? 0) > 0 && (
            <StarRow stars={hero.stars ?? 0} className="h-2" />
          )}
        </span>
      </Tooltip>
      <Tooltip tip={runHpTip(run)}>
        <span className="cursor-help text-[#d9d2ca]">
          PV {Math.round(run.hp)}/{maxHp(run)}
          {float && (
            <span className="hud-meter ml-2 inline-block w-28 align-middle">
              <i
                className="bg-[#46b04f]"
                style={{
                  width: `${Math.max(0, (run.hp / maxHp(run)) * 100)}%`,
                }}
              />
            </span>
          )}
        </span>
      </Tooltip>
      {run.lootEnabled &&
        run.secured.length +
          run.bag.length +
          partCount(run.partSecured) +
          partCount(run.partBag) >
          0 && (
          <Tooltip
            tip={{
              title: "Mochila de la run",
              kind: "info",
              lines: [
                `${run.secured.length} piezas y ${partCount(run.partSecured)} partes aseguradas (ya son tuyas).`,
                `${run.bag.length} piezas y ${partCount(run.partBag)} partes sin asegurar: se pierden si caes o abandonas antes de vencer al próximo jefe.`,
              ],
              source: "Botín",
            }}
          >
            <span className="cursor-help text-[#d9d2ca]">
              🎒 {run.secured.length + partCount(run.partSecured)}
              {run.bag.length + partCount(run.partBag) > 0 && (
                <span className="text-red-300">
                  {" "}
                  +{run.bag.length + partCount(run.partBag)}
                </span>
              )}
            </span>
          </Tooltip>
        )}
      {Object.values(run.loot).length > 0 && (
        <span className="flex flex-wrap gap-1">
          {Object.values(run.loot).map((p) => (
            <Chip
              key={p.type}
              tone="passive"
              tip={{
                title: p.name,
                kind: "info",
                lines: [
                  pieceSummary(p),
                  "La llevas puesta en la run. Pasa a tu colección cuando un jefe la asegure.",
                ],
                source: "Mochila de la run",
              }}
            >
              <span style={{ color: RARITIES[p.rarity].color }}>
                {p.name} · {RARITIES[p.rarity].label}
              </span>
            </Chip>
          ))}
        </span>
      )}
      {run.relics.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {run.relics.map((id) => (
            <Chip
              key={id}
              tone="passive"
              icon={iconFor("relic", id)}
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
  const [randomHero, setRandomHero] = useState(false); // classic run: no collection hero
  const [dungeon, setDungeon] = useState<RarityId | null>(null);
  const [asc, setAsc] = useState(0);
  const [tower, setTower] = useState<TowerMode | null>(null); // weekly tower (?torre=)
  const router = useRouter();
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
        {
          // The weekly tower pays nothing per run (the server ignores it anyway).
          coins: tower ? 0 : r.coins,
          maxFloor: r.maxFloor,
          loot: tower ? [] : r.secured,
          parts: tower ? {} : r.partSecured,
          clear:
            !tower && r.rank && isVictory(r)
              ? { rank: r.rank, lives: r.lives, asc: r.ascension }
              : undefined,
        },
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
      const info = await repo.startRun(
        classId,
        characterId,
        seed,
        dungeon ?? "f",
        asc,
        tower ?? undefined,
      );
      runIdRef.current = info.runId;
      actionsRef.current = [];
      setRandomHero(false);
      setRun(
        createRun(info.seed, info.hero, true, info.rank, null, info.ascension),
      );
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

  const toSelect = () => {
    bank();
    setRun(null);
    setDungeon(null);
    setRandomHero(false);
    setSeed(Date.now());
  };
  useEffect(() => {
    // client-only seed avoids SSR hydration mismatch; ?seed=N replays a run
    const q = Number(new URLSearchParams(location.search).get("seed"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeed(Number.isFinite(q) && q > 0 ? Math.floor(q) : Date.now());
    const t = new URLSearchParams(location.search).get("torre");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isTowerMode(t)) setTower(t);
  }, []);
  if (seed === null || !ready || !profile) return null;
  if (!run && !dungeon && !tower)
    return (
      <DungeonSelect
        clears={profile.dungeons}
        ascensions={profile.ascensions}
        onPick={(r, a) => {
          setAsc(a);
          setDungeon(r);
        }}
      />
    );
  if (!run && !randomHero && profile.characters.length > 0)
    return (
      <CharacterSelect
        profile={profile}
        dungeon={dungeon ?? "f"}
        tower={tower}
        onPick={(id) => {
          const c = profile.characters.find((x) => x.id === id);
          if (c) void start(c.classId, id);
        }}
        onRandom={() => setRandomHero(true)}
        onBack={() => (tower ? router.push("/torre") : setDungeon(null))}
      />
    );
  if (!run)
    return (
      <ClassSelect
        dungeon={dungeon ?? "f"}
        tower={tower}
        onPick={(c) => void start(c, null)}
        onBack={() =>
          profile.characters.length > 0
            ? setRandomHero(false)
            : tower
              ? router.push("/torre")
              : setDungeon(null)
        }
      />
    );

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
        log(
          `Cofre: +${node.coins} monedas${dropsText(r.run.lastDrops) ? ` y ${dropsText(r.run.lastDrops)}` : ""}.`,
        );
        setScreen({
          t: "toast",
          kind: "chest",
          title: "Cofre",
          text: `Encuentras ${node.coins} monedas${dropsText(r.run.lastDrops) ? ` y ${dropsText(r.run.lastDrops)}` : ""}.`,
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
    if (autoBlockReason(s.battle)) return;
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
  let fightScene: ReactNode = null;
  let logLines = msgs;
  let logExtra: ReactNode = null;

  if (run.status === "over" && screen.t !== "fight") {
    main = (
      <Center>
        <Panel title="Fin de la run" className="text-center">
          {tower ? (
            <div className="text-xl text-yellow-300">
              {TOWER_LABEL[tower]}: llegaste al piso {runScore(run)}
            </div>
          ) : isVictory(run) ? (
            <>
              <Confetti />
              <div className="text-2xl text-yellow-300">
                ¡Victoria! Completaste los {topFloor(run)} pisos
              </div>
            </>
          ) : (
            <div className="text-xl text-[#d9d2ca]">Caíste en la mazmorra</div>
          )}
          {!tower && (
            <div className="mt-2 text-yellow-300">
              Puntaje (piso máximo): {runScore(run)}
            </div>
          )}
          <div className="mt-1 text-sm opacity-80">
            {run.hero.name} · Nv {run.hero.level} · {run.coins} monedas ·{" "}
            {run.relics.length} reliquias
          </div>
          {tower ? (
            <div className="mt-2 text-sm text-green-300">
              Cuenta tu mejor piso de la semana. Intentos ilimitados.
            </div>
          ) : (
            <div className="mt-2 text-green-300">
              +{run.coins} monedas guardadas
            </div>
          )}
          {!tower && run.lootEnabled && (
            <div className="mt-1 text-sm">
              <span className="text-green-300">
                {run.secured.length} piezas y {partCount(run.partSecured)}{" "}
                partes a tu colección
              </span>
              {run.bag.length > 0 && (
                <span className="text-red-300">
                  {" "}
                  · {run.bag.length} piezas y {partCount(run.partBag)} partes
                  perdidas (sin jefe que las asegure)
                </span>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button className="btn text-center" onClick={toSelect}>
              {tower ? "Otro intento" : "Nueva run"}
            </button>
            {tower ? (
              <Link href="/torre" className="btn text-center">
                Ver ranking
              </Link>
            ) : (
              <Link href="/gacha" className="btn text-center">
                Ir al gacha
              </Link>
            )}
            <Link href="/" className="btn btn-gray text-center">
              Menú
            </Link>
          </div>
        </Panel>
      </Center>
    );
  } else if (run.pendingLoot && screen.t !== "fight" && screen.t !== "picks") {
    const offer = run.pendingLoot;
    main = (
      <Center>
        <Panel title="Botín">
          <div className="mb-3 text-center text-base text-yellow-300">
            {offer.length > 1
              ? "Solo puedes llevarte UNA de estas piezas. Elige cuál: se asegura al vencer al próximo jefe"
              : "Encuentras una pieza: la conservas al vencer al próximo jefe"}
            {run.floor >= topFloor(run) &&
              " (este es el último jefe: va a tu colección)"}
          </div>
          <div
            className={`grid gap-2 ${offer.length > 1 ? "sm:grid-cols-2" : ""}`}
          >
            {offer.map((p, i) => {
              const worn = run.loot[slotOf(p.type)];
              const last = run.floor >= topFloor(run);
              const take = (wear: boolean) => {
                rec(wear ? { t: "loot", i } : { t: "loot", i, w: false });
                const n = chooseLoot(run, i, wear);
                log(`Botín: ${p.name} (${RARITIES[p.rarity].label}).`);
                setRun(n);
                if (n.secured.length > run.secured.length)
                  log(`Jefe vencido: ${n.secured.length} piezas aseguradas.`);
                if (n.pendingRelic) setScreen({ t: "relic" });
                else if (n.floor !== run.floor) {
                  log(`— Piso ${n.floor} —`);
                  setScreen({ t: "doors" });
                }
              };
              return (
                <div
                  key={i}
                  className="flex h-full flex-col gap-2 rounded border-2 p-2"
                  style={{ borderColor: RARITIES[p.rarity].color }}
                >
                  <div className="flex items-center gap-3">
                    <WeaponSprite
                      type={p.type}
                      element={p.element}
                      rarity={p.rarity}
                      className="w-14 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-sm">{pieceSummary(p)}</span>
                      {!last && (
                        <span className="block text-xs text-[#d9d2ca]">
                          {worn
                            ? `Reemplaza: ${worn.name} (${RARITIES[worn.rarity].label})`
                            : "Casilla libre en esta run"}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-auto flex gap-2">
                    {!last && (
                      <button
                        className="btn flex-1"
                        style={{ color: "#000", textShadow: "none" }}
                        onClick={() => take(true)}
                      >
                        Equipar y guardar
                      </button>
                    )}
                    <button
                      className={`btn flex-1 ${last ? "" : "btn-gray"}`}
                      style={{ color: "#000", textShadow: "none" }}
                      onClick={() => take(false)}
                    >
                      Guardar en mochila
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            className="btn btn-gray mt-3 w-full text-center"
            onClick={() => {
              rec({ t: "loot", i: -1 });
              const n = chooseLoot(run, -1);
              setRun(n);
              if (n.secured.length > run.secured.length)
                log(`Jefe vencido: ${n.secured.length} piezas aseguradas.`);
              if (n.pendingRelic) setScreen({ t: "relic" });
              else if (n.floor !== run.floor) {
                log(`— Piso ${n.floor} —`);
                setScreen({ t: "doors" });
              }
            }}
          >
            Descartar
          </button>
        </Panel>
      </Center>
    );
  } else if (screen.t === "fight") {
    const { battle: b, node, result } = screen;
    logLines = b.log;
    const fam = run.rank
      ? WORLDS[DUNGEONS[run.rank].world].family
      : getFloor(run).world.family;
    const finalRank =
      run.rank && run.floor === DUNGEONS[run.rank].floors ? run.rank : null;
    const mods = b.mods ?? [];
    fightScene = (
      <div className="fixed inset-0 -z-10">
        <ArenaBackground
          world={
            run.rank
              ? DUNGEONS[run.rank].world
              : Math.floor((run.floor - 1) / FLOORS_PER_WORLD) % WORLDS.length
          }
          boss={node.kind === "boss"}
          rank={run.rank}
        />
      </div>
    );
    main = (
      <div className="flex min-w-0 flex-1 flex-col gap-3 md:min-h-0 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
          <BattleArena
            bleed
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
                elite={node.kind === "hard"}
                finalRank={finalRank}
              />
            )}
            enemy={targeting.enemy}
            onTarget={targeting.select}
            playerExtraTip={levelTip(run)}
            inRun
            world={
              run.rank
                ? DUNGEONS[run.rank].world
                : Math.floor((run.floor - 1) / FLOORS_PER_WORLD) % WORLDS.length
            }
            rank={run.rank}
            finalRank={finalRank}
            boss={node.kind === "boss"}
            enemyChips={(_, c) =>
              mods
                .filter((m) => m !== "escudo")
                .map((m) => (
                  <Chip
                    key={m}
                    tone="danger"
                    icon={iconFor("enemy_modifier", m)}
                    tip={modTip(m, c)}
                  >
                    {MOD_LABEL[m]}
                  </Chip>
                ))
            }
          />
        </div>
        <div className="flex flex-col gap-2 max-md:contents md:min-h-0 md:w-[22rem]">
          <ActionPanel
            side
            float
            b={b}
            target={targeting.target}
            onAct={(a, t) => act(screen, a, t)}
            auto={{
              reason: autoBlockReason(b),
              onAuto: () => quick(screen),
            }}
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
          <FightLog lines={b.log} />
        </div>
      </div>
    );
  } else if (screen.t === "picks" && run.pendingSkill) {
    main = (
      <Center>
        <Panel title="¡Subes de nivel!">
          <Vfx
            id="level_up"
            className="pointer-events-none mx-auto -mt-2 -mb-6 w-40"
          />
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
          <Vfx
            id="level_up"
            className="pointer-events-none mx-auto -mt-2 -mb-6 w-40"
          />
          <div className="mb-3 text-center text-base text-yellow-300">
            Elige una mejora ({run.pendingPicks} pendiente
            {run.pendingPicks > 1 ? "s" : ""})
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {upgradeOffer(run).map((id) => (
              <Tooltip
                key={id}
                tip={upgradeTip(id, run)}
                className="block"
                focusable={false}
              >
                <button
                  className="btn choice-button h-full w-full"
                  onClick={() => {
                    log(
                      `Mejora: ${UPGRADES[id].name} (${upgradeLabel(id, run.ups[id] ?? 0)}).`,
                    );
                    rec({ t: "pick", id });
                    proceed(pickUpgrade(run, id), screen.advance);
                  }}
                >
                  <Icon
                    name={iconFor("upgrade", id) ?? "system_star"}
                    className="mx-auto h-12"
                  />
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
                  className={`btn choice-button h-full w-full ${RARITY_BORDER[RELICS[id].rarity]}`}
                  onClick={() => {
                    log(`Reliquia: ${RELICS[id].name}.`);
                    rec({ t: "relic", id });
                    setRun(chooseRelic(run, id));
                    setScreen({ t: "doors" });
                  }}
                >
                  <Icon name={relicIcon(id)} className="mx-auto h-16" />
                  <div className="name-title">{RELICS[id].name}</div>
                  <span
                    className="my-1 inline-block rounded-full border-2 border-[#1b1410] px-3 py-0.5 text-sm font-bold text-[#1b1410]"
                    style={{
                      background: RELIC_RARITY_COLOR[RELICS[id].rarity],
                    }}
                  >
                    {RELIC_RARITY_LABEL[RELICS[id].rarity]}
                  </span>
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
                <div
                  key={it.id}
                  className="choice-card flex items-center gap-3 p-2"
                >
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
                    className="btn choice-button w-32 shrink-0 text-center text-base"
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
          {iconFor("event", EVENTS.indexOf(ev)) && (
            <Icon
              name={iconFor("event", EVENTS.indexOf(ev))!}
              className="mx-auto mb-2 h-20"
            />
          )}
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
                      className="btn choice-button w-full"
                      disabled={!cost.affordable}
                      onClick={() => {
                        const r = resolveEvent(run, i);
                        if (!r) return;
                        rec({ t: "event", i });
                        setRun(r.run);
                        log(`${ev.title}: ${r.text}`);
                        setScreen({
                          t: "event",
                          event: ev,
                          text: r.text,
                          paid: r.paid,
                          changes: r.changes,
                        });
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
              <EventResult
                text={screen.text}
                paid={screen.paid ?? []}
                changes={screen.changes ?? []}
              />
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
          <DoorIcon kind={screen.kind} className="mx-auto h-24" />
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
            Piso {run.floor}/{topFloor(run)} ·{" "}
            {run.rank ? DUNGEONS[run.rank].name : world.name}
          </div>
          <div
            className={`grid gap-3 ${isBoss ? "" : doors.length === 3 ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}
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
                  className={`pixel-frame choice-card flex h-full w-full flex-col items-center gap-1 p-3 text-center ${
                    d.kind === "boss" ? "animate-pulse !border-red-700" : ""
                  }`}
                >
                  <DoorIcon kind={d.kind} className="h-24 md:h-28" />
                  <span
                    className={`choice-title text-base font-semibold ${d.kind === "boss" ? "!text-red-300" : d.kind === "hard" ? "!text-orange-200" : ""}`}
                  >
                    {DOOR_LABEL[d.kind]}
                  </span>
                  <span className="choice-detail text-sm">
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

  // Fights: width follows the available height (~16:9 stage) so the arena never becomes a wide strip.
  const wide =
    screen.t === "fight"
      ? "max-w-[min(100rem,calc((100vh-15rem)*1.78+23rem))] md:min-w-[48rem]"
      : "max-w-4xl";
  return (
    <main className="relative isolate flex flex-col gap-3 p-3 pt-6 text-base md:h-screen md:overflow-hidden">
      {fightScene}
      <div className={`mx-auto w-full ${wide}`}>
        <Hud run={run} float={screen.t === "fight"} />
      </div>
      <div
        className={`mx-auto flex w-full flex-col gap-3 md:min-h-0 md:flex-1 ${wide}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:min-h-0">
          {main}
        </div>
        <LogPanel lines={logLines}>{logExtra}</LogPanel>
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

function DungeonSelect({
  clears,
  ascensions,
  onPick,
}: {
  clears: Clears;
  ascensions: Ascensions;
  onPick: (r: RarityId, asc: number) => void;
}) {
  const [open, setOpen] = useState<RarityId | null>(null);
  return (
    <main className="flex flex-col justify-center gap-4 p-3 pt-10">
      <Panel title="Elige un dungeon" className="mx-auto w-full max-w-5xl">
        <p className="mb-3 text-center text-base text-[#d9d2ca]">
          Cada jefe que venzas asegura el botín que llevas. Vence el último para
          limpiar el dungeon y abrir el siguiente rango.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {RARITY_IDS.map((rank) => {
            const d = DUNGEONS[rank];
            const lock = lockReason(clears, rank);
            const color = RARITIES[rank].color;
            const best = clears[rank];
            return (
              <button
                key={rank}
                disabled={!!lock}
                onClick={() => setOpen(rank)}
                className="pixel-frame flex items-center gap-4 p-3 text-left enabled:hover:brightness-125 disabled:opacity-60"
                style={{ borderColor: color }}
              >
                <RankIcon
                  rank={rank}
                  letter
                  className="h-[min(101px,9vh)] w-[min(101px,9vh)]"
                />
                <span className="min-w-0 text-base">
                  <span className="name-title block text-yellow-300">
                    {d.name}
                  </span>
                  <span className="flex items-center gap-1">
                    {d.floors} pisos · {d.bosses.length} jefes
                    <ElementIcon
                      element={WORLDS[d.world].element}
                      className="h-4"
                      bare
                    />
                  </span>
                  {lock ? (
                    <span className="block text-red-300">
                      <Icon name="system_locked" className="h-4" /> Limpia{" "}
                      {RARITIES[lock.rank].label} con {lock.lives}{" "}
                      {lock.lives === 1 ? "vida" : "vidas"} o más
                    </span>
                  ) : best ? (
                    <span className="block text-green-300">
                      ✔ Limpiado · mejor: {best}{" "}
                      <Icon name="system_heart_full" className="h-4" />
                      {(ascensions[rank] ?? 0) > 0 && (
                        <>
                          {" · "}
                          <Icon
                            name={`asc_${ascensions[rank]}`}
                            className="h-5"
                          />{" "}
                          Ascensión +{ascensions[rank]}
                        </>
                      )}
                      {(ascensions[rank] ?? 0) >= MAX_ASCENSION && (
                        <Icon name="asc_max_star" className="ml-1 h-4" />
                      )}
                    </span>
                  ) : (
                    <span className="block text-[#d9d2ca]">Sin limpiar</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-center">
          <Link href="/" className="btn btn-gray inline-block text-center">
            ← Volver al menú
          </Link>
        </div>
        <p className="mt-2 text-center text-xs text-[#d9d2ca]">
          Vidas mínimas para entrar:{" "}
          {Object.entries(UNLOCK_MIN_LIVES)
            .map(([r, n]) => `${RARITIES[r as RarityId].label} ${n}`)
            .join(" · ")}
          .
        </p>
      </Panel>
      {open && (
        <AscensionModal
          rank={open}
          clears={clears}
          ascensions={ascensions}
          onPick={(a) => onPick(open, a)}
          onClose={() => setOpen(null)}
        />
      )}
    </main>
  );
}

// Over the (dimmed) dungeon list: the same dungeon with its ascension levels.
// +N opens only after clearing +N-1 (level 0 = the normal dungeon).
function AscensionModal({
  rank,
  clears,
  ascensions,
  onPick,
  onClose,
}: {
  rank: RarityId;
  clears: Clears;
  ascensions: Ascensions;
  onPick: (asc: number) => void;
  onClose: () => void;
}) {
  const d = DUNGEONS[rank];
  const color = RARITIES[rank].color;
  const top = maxAscension(clears, ascensions, rank);
  const cleared = (clears[rank] ?? 0) > 0 ? (ascensions[rank] ?? 0) : -1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${d.name}: ascensiones`}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-3 pt-10"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Panel title={`${RARITIES[rank].label} · ${d.name}`}>
          <p className="mb-3 text-center text-sm text-[#d9d2ca]">
            {d.floors} pisos · {d.bosses.length} jefes. Para abrir la +N tienes
            que haber pasado la anterior en este dungeon.
          </p>
          <div className="space-y-2">
            {Array.from({ length: MAX_ASCENSION + 1 }, (_, n) => {
              const locked = n > top;
              const done = n <= cleared;
              return (
                <button
                  key={n}
                  disabled={locked}
                  onClick={() => onPick(n)}
                  className="pixel-frame flex w-full items-center gap-3 p-2 text-left enabled:hover:brightness-125 disabled:opacity-60"
                  style={{ borderColor: color }}
                >
                  <span className="relative shrink-0">
                    <Icon name={`asc_${n}`} className="h-14 w-14" />
                    {n > 0 && (
                      <span
                        className="absolute -bottom-1 -right-1 rounded px-1 text-xs font-bold"
                        style={{ background: color, color: "#000" }}
                      >
                        +{n}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="name-title block text-yellow-300">
                      {n === 0 ? "Normal" : `Ascensión +${n}`}
                    </span>
                    <span className="block text-[#d9d2ca]">
                      {n === 0
                        ? "Sin reglas extra."
                        : `${ASC_RULES[n - 1]} · monedas de victoria +${n * 20}% · botín +${n * 10}%`}
                    </span>
                    {locked ? (
                      <span className="block text-red-300">
                        <Icon name="system_locked" className="h-4" /> Pasa la{" "}
                        {n - 1 === 0 ? "normal (0)" : `+${n - 1}`} para abrirla
                      </span>
                    ) : done ? (
                      <span className="block text-green-300">✔ Superada</span>
                    ) : (
                      <span className="block text-yellow-200">Disponible</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-center">
            <button className="btn btn-gray" onClick={onClose}>
              ← Volver
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ClassSelect({
  dungeon,
  tower,
  onPick,
  onBack,
}: {
  dungeon: RarityId;
  tower?: TowerMode | null;
  onPick: (c: ClassId) => void;
  onBack: () => void;
}) {
  return (
    <main className="flex flex-col justify-center gap-4 p-3 pt-8 md:h-screen md:overflow-hidden">
      <Panel title="Elige tu clase" className="mx-auto w-full max-w-4xl">
        <p className="mb-3 text-center text-base text-[#d9d2ca]">
          {tower
            ? `${TOWER_LABEL[tower]}.`
            : `Dungeon ${RARITIES[dungeon].label}: ${DUNGEONS[dungeon].name}.`}{" "}
          Elemento, rasgos y stats se sortean al empezar.{" "}
          <button className="text-cyan-300 underline" onClick={onBack}>
            Volver
          </button>
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
                <HeroSprite
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
                <Chip
                  tone="passive"
                  icon={iconFor("passive", c.passive.id)}
                  tip={passiveTip(pv)}
                >
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
    const got = dropsText(after.lastDrops);
    return `Victoria: +${after.coins - before.coins} monedas${lv > 0 ? ` · ¡sube a nivel ${after.hero.level}!` : "."}${got ? ` Botín: ${got}.` : ""}`;
  }
  return after.status === "over"
    ? "Derrota: perdiste tu última vida."
    : `Derrota: pierdes una vida (te quedan ${after.lives}).`;
}

function PowerWarning({
  power,
  dungeon,
}: {
  power: number;
  dungeon: RarityId;
}) {
  const v = powerVerdict(power, dungeon);
  const rec = recommendedPower(dungeon);
  return (
    <p
      className={`text-center text-sm ${v === "danger" ? "text-red-300" : v === "low" ? "text-yellow-300" : "text-green-300"}`}
    >
      Poder {power} · recomendado {rec}.
      {v === "danger" &&
        " Muy débil para este dungeon: los rivales casi no recibirán daño. Mejora el héroe o entra a un rango menor."}
      {v === "low" && " Algo justo: será una run difícil."}
    </p>
  );
}

// Step 1 of a dungeon: pick who goes in. Your heroes come first, strongest to
// weakest; the last tile starts a classic run with a random hero (then you pick a class).
function CharacterSelect({
  profile,
  dungeon,
  tower,
  onPick,
  onRandom,
  onBack,
}: {
  profile: Profile;
  dungeon: RarityId;
  tower?: TowerMode | null;
  onPick: (ownedId: string) => void;
  onRandom: () => void;
  onBack: () => void;
}) {
  const owned = [...profile.characters]
    .map((c) => ({ c, power: heroPower(profile, c.id) }))
    .sort((a, b) => b.power - a.power || a.c.name.localeCompare(b.c.name));
  const [sel, setSel] = useState<string | null>(owned[0]?.c.id ?? null);
  const [askWeapon, setAskWeapon] = useState(false);
  const chosen = profile.characters.find((c) => c.id === sel) ?? null;
  // Usable weapons not worn by another hero: offered when the hero has none.
  const usable = chosen
    ? profile.weapons.filter(
        (w) =>
          !isGearType(w.type) &&
          canUseWeapon(chosen.classId, w.type) &&
          !Object.values(profile.equipped).includes(w.id),
      )
    : [];
  const go = () =>
    chosen && !profile.equipped[chosen.id] && usable.length > 0
      ? setAskWeapon(true)
      : sel && onPick(sel);
  if (askWeapon && chosen) {
    const hero = heroFromOwned(profile, chosen.id);
    return (
      <main className="flex flex-col justify-center gap-4 p-3 pt-8">
        <Panel
          title={`Equipo · ${chosen.name}`}
          className="mx-auto w-full max-w-2xl space-y-3"
        >
          <p className="text-sm text-[#d9d2ca]">
            Arma y armadura que llevará en el dungeon. Poder{" "}
            {heroPower(profile, chosen.id)}
            {hero &&
              ` · PV ${Math.round(hero.stats.hp)} · ATQ ${hero.stats.atk} · DEF ${hero.stats.def}`}
            .{!profile.equipped[chosen.id] && " Todavía no tiene arma."}
          </p>
          <PowerWarning
            power={heroPower(profile, chosen.id)}
            dungeon={dungeon}
          />
          <EquipmentEditor
            c={chosen}
            profile={profile}
            act={(job) => void job()}
          />
          <div className="sticky bottom-0 z-10 flex flex-col gap-2 rounded bg-[#1c1917]/90 py-2 sm:flex-row sm:justify-center">
            <button
              className="btn text-center"
              onClick={() => onPick(chosen.id)}
            >
              Entrar al dungeon
            </button>
            <button
              className="btn btn-gray text-center"
              onClick={() => setAskWeapon(false)}
            >
              Volver
            </button>
          </div>
        </Panel>
      </main>
    );
  }
  return (
    <main className="flex flex-col justify-center gap-4 p-3 pt-8">
      <Panel
        title={
          tower
            ? `Elige héroe · ${TOWER_LABEL[tower]}`
            : `Elige héroe · ${RARITIES[dungeon].label}`
        }
        className="mx-auto w-full max-w-4xl"
      >
        <p className="mb-3 text-center text-base text-[#d9d2ca]">
          {tower
            ? tower === "nivelado"
              ? "Torre de la semana, la misma para todos. Aquí todos quedan con poder base parecido: elige el héroe que mejor sepas jugar."
              : "Torre de la semana, la misma para todos. Tu héroe entra con todo su poder."
            : `${DUNGEONS[dungeon].name}. Tus personajes, del más fuerte al más débil (el poder cuenta rango, estrellas, arma y equipo). El más fuerte viene preseleccionado.`}
        </p>
        <div className="grid max-h-[calc(100vh-22rem)] min-h-40 grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] justify-items-center gap-x-2 gap-y-4 overflow-y-auto pr-1">
          {owned.map(({ c, power }, i) => {
            const hero = heroFromOwned(profile, c.id);
            return (
              <button
                key={c.id}
                aria-label={c.name}
                aria-pressed={sel === c.id}
                onClick={() => {
                  setSel(c.id);
                  setAskWeapon(true);
                }}
              >
                <ItemCard
                  item={characterView(c, {
                    stats: hero?.stats,
                    lines: [`Poder ${power}${i === 0 ? " ★ mejor" : ""}`],
                  })}
                  size={96}
                  selected={sel === c.id}
                />
              </button>
            );
          })}
        </div>
        {chosen && !tower && (
          <div className="mt-3">
            <PowerWarning
              power={heroPower(profile, chosen.id)}
              dungeon={dungeon}
            />
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button className="btn text-center" disabled={!chosen} onClick={go}>
            {chosen ? `Empezar con ${chosen.name}` : "Elige un personaje"}
          </button>
          <button
            className="btn btn-gray text-center"
            disabled={!chosen}
            onClick={() => setAskWeapon(true)}
          >
            Equipamiento
          </button>
          <button className="btn btn-gray text-center" onClick={onRandom}>
            Personaje al azar (run clásica)
          </button>
          <button className="btn btn-gray text-center" onClick={onBack}>
            {tower ? "Volver a la torre" : "Cambiar de dungeon"}
          </button>
        </div>
      </Panel>
    </main>
  );
}
