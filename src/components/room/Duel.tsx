"use client";

// 1v1 duels in a room: host panel, pick, bets, the secret-pick fight and the
// result. Pure view code: rules live in lib/game/{duel,room}.ts and the server.
import { useEffect, useState } from "react";
import { ClassElementPicker } from "@/components/room/ClassElementPicker";
import { SkillPicker } from "@/components/SkillPicker";
import { HealthBar } from "@/components/HealthBar";
import { HeroSprite } from "@/components/HeroSprite";
import { Icon } from "@/components/Icon";
import { Vfx } from "@/components/fx/Vfx";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import { basicIcon, eventVfx, heroActionFor, SKILL_FX, skillTag, stepNumbers } from "@/lib/art/skillFx";
import { skillMeta } from "@/lib/game/explain";
import type { ClassId } from "@/lib/game/characters";
import { skillBlockReason, type Action, type Combatant, type CombatEventType } from "@/lib/game/combat";
import type { Element } from "@/lib/game/elements";
import { heroKey, masteryOf } from "@/lib/game/loadout";
import { RESOURCE_MAX, RESOURCE_NAME, SKILLS, sanitizeLoadout, type Loadout } from "@/lib/game/skills";
import {
  DEFAULT_HERO,
  ROOM_K,
  settlePool,
  type DuelEnd,
  type DuelMode,
} from "@/lib/game/room";
import type { DuelView } from "@/lib/rooms/api";
import type { RoomClient, RoomView } from "@/lib/roomui/types";
import { errorText, formatCountdown, msLeft } from "@/lib/roomui/viewModels";
import { useNow } from "@/lib/useRoom";
import { equipSkills, useProfile } from "@/lib/useProfile";
import { characterView, filterSortCharacters } from "@/lib/viewModels";

type Match = DuelView["matches"][number];
type Props = {
  view: RoomView;
  client: RoomClient;
  onError: (e: string | null) => void;
};

const nameOf = (v: RoomView, id: string) =>
  v.players.find((p) => p.id === id)?.name ?? "?";
const mineOf = (v: RoomView) =>
  v.duel?.matches.find((m) => m.a === v.me || m.b === v.me) ?? null;
const END_TEXT: Record<DuelEnd, string> = {
  ko: "por KO",
  time: "por vida restante",
  forfeit: "por abandono",
  draw: "empate",
  no_fight: "no se jugó",
};
const MODE_TEXT: Record<DuelMode, string> = {
  balanceado: "Balanceado: eliges clase, elemento y 2 de 4 habilidades",
  real: "Héroes reales: tu héroe, a poder completo, con sus habilidades",
};
const STAKES = [10, 25, 50, 100];

/** Same tidy pairing as the server's suggestion: neighbours by chips. */
function suggestPairs(v: RoomView): [string, string][] {
  const ids = v.players
    .filter((p) => p.present)
    .sort((a, b) => b.chips - a.chips || (a.id < b.id ? -1 : 1))
    .map((p) => p.id);
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) out.push([ids[i], ids[i + 1]]);
  return out.slice(0, 3);
}

// ------------------------------------------------------------ host panel
export function DuelHostPanel({ view, client, onError }: Props) {
  const [mode, setMode] = useState<DuelMode>("balanceado");
  const [edited, setEdited] = useState<[string, string][] | null>(null);
  const present = view.players.filter((p) => p.present);
  const pairs = edited ?? suggestPairs(view);
  const ids = pairs.flat();
  const valid =
    pairs.length > 0 &&
    new Set(ids).size === ids.length &&
    ids.every((id) => present.some((p) => p.id === id));
  const setPair = (i: number, side: 0 | 1, id: string) =>
    setEdited(pairs.map((p, k) => (k === i ? (side ? [p[0], id] : [id, p[1]]) : p)) as [string, string][]);
  const free = present.filter((p) => !ids.includes(p.id));
  if (present.length < 2) return null;
  return (
    <Panel title="Duelos 1v1">
      <div className="mb-2 flex flex-wrap justify-center gap-2">
        {(["balanceado", "real"] as DuelMode[]).map((m) => (
          <button
            key={m}
            className={`btn ${mode === m ? "" : "btn-gray"}`}
            onClick={() => setMode(m)}
          >
            {m === "balanceado" ? "Balanceado" : "Héroes reales"}
          </button>
        ))}
      </div>
      <p className="mb-2 text-center text-sm opacity-80">{MODE_TEXT[mode]}</p>
      <ul className="mb-2 space-y-1">
        {pairs.map((pr, i) => (
          <li key={i} className="flex flex-wrap items-center justify-center gap-2">
            {([0, 1] as const).map((side) => (
              <select
                key={side}
                aria-label={`Duelista ${side + 1} del duelo ${i + 1}`}
                className="btn btn-gray"
                value={pr[side]}
                onChange={(e) => setPair(i, side, e.target.value)}
              >
                {present.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ))}
            <button
              className="btn btn-gray !px-2"
              aria-label="Quitar duelo"
              onClick={() => setEdited(pairs.filter((_, k) => k !== i))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-center gap-2">
        {free.length >= 2 && pairs.length < 3 && (
          <button
            className="btn btn-gray"
            onClick={() => setEdited([...pairs, [free[0].id, free[1].id]])}
          >
            + Duelo
          </button>
        )}
        <button
          className="btn"
          disabled={!valid}
          onClick={() =>
            void client.duelStart(mode, pairs).then((r) => onError(r.ok ? null : errorText(String(r.error))))
          }
        >
          Iniciar duelos
        </button>
      </div>
      {free.length > 0 && valid && (
        <p className="mt-2 text-center text-xs opacity-70">
          Miran y apuestan: {free.map((p) => p.name).join(", ")}
        </p>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------ pick
function RealPicker({ onPick, mine }: { onPick: (id: string) => void; mine: string | null }) {
  const { profile } = useProfile();
  const owned = profile
    ? filterSortCharacters(profile.characters, { classId: "all", rarity: "all", sort: "rarity" })
    : [];
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <button
        className={`pixel-frame p-2 text-sm ${mine === DEFAULT_HERO ? "!border-green-400" : ""}`}
        onClick={() => onPick(DEFAULT_HERO)}
      >
        Común al azar
      </button>
      {owned.map((c) => (
        <button key={c.id} aria-label={c.name} onClick={() => onPick(c.id)}>
          <ItemCard item={characterView(c)} size={64} selected={mine === c.id} />
        </button>
      ))}
    </div>
  );
}

export function DuelSetup({ view, client, onError }: Props) {
  const duel = view.duel;
  const mine = mineOf(view);
  const { profile } = useProfile();
  const [heroPicked, setHeroPicked] = useState<string | null>(null);
  const [bal, setBal] = useState<{ classId: ClassId; element: Element } | null>(null);
  const real = duel?.mode === "real";
  const owned = real && heroPicked && profile ? profile.characters.find((c) => c.id === heroPicked) : undefined;
  // the two skills that go with the pick: nivelado list (balanced) or the hero's own (collection)
  const loadout: Loadout | null =
    !real && bal && profile
      ? sanitizeLoadout(bal.classId, profile.levelLoadouts?.[bal.classId], null)
      : owned && profile
        ? sanitizeLoadout(owned.classId, profile.loadouts?.[heroKey(owned)], masteryOf(profile, owned.classId))
        : null;
  // (re)send the pick whenever class, element, hero or skills change; the server keeps the last one
  const pick = !mine
    ? null
    : real
      ? heroPicked
        ? { heroId: heroPicked, ...(loadout && { loadout: [loadout[0], loadout[1]] as [string, string] }) }
        : null
      : bal && loadout
        ? { ...bal, loadout: [loadout[0], loadout[1]] as [string, string] }
        : null;
  const sig = JSON.stringify(pick);
  useEffect(() => {
    if (pick)
      void client.duelPick(pick).then((r) => onError(r.ok ? null : errorText(String(r.error))));
    // `sig` is the content of `pick`; client/onError are stable for the screen's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  if (!duel) return null;
  const picked = new Set(duel.picked);
  return (
    <>
      <Panel title="Duelos 1v1">
        <p className="mb-2 text-center text-sm opacity-80">{MODE_TEXT[duel.mode]}</p>
        <ul className="space-y-1 text-center">
          {duel.matches.map((m) => (
            <li key={m.key}>
              <b>{nameOf(view, m.a)}</b> {picked.has(m.a) ? "✓" : "…"}{" "}
              <span className="opacity-70">vs</span> <b>{nameOf(view, m.b)}</b>{" "}
              {picked.has(m.b) ? "✓" : "…"}
            </li>
          ))}
        </ul>
      </Panel>
      {mine ? (
        <Panel title="Tu duelista">
          {duel.mode === "balanceado" ? (
            <ClassElementPicker
              value={null}
              onPick={(classId, element) => setBal({ classId, element })}
            />
          ) : (
            <>
              <RealPicker mine={heroPicked} onPick={setHeroPicked} />
              {owned && profile && loadout && (
                <div className="mt-3">
                  <SkillPicker
                    classId={owned.classId}
                    mastery={masteryOf(profile, owned.classId)}
                    value={loadout}
                    onChange={(l) => equipSkills({ key: heroKey(owned), classId: owned.classId }, l)}
                  />
                </div>
              )}
            </>
          )}
          <p className="mt-2 text-center text-sm">
            {picked.has(view.me)
              ? "Enviado ✓ Puedes cambiarlo hasta que acabe el tiempo."
              : duel.mode === "balanceado"
                ? "Si no eliges, entras de Caballero de Fuego con sus habilidades iniciales."
                : "Sin elegir, el servidor te da un duelista por defecto."}
          </p>
        </Panel>
      ) : (
        <Panel className="text-center">Esta vez miras y apuestas. Se elige en secreto.</Panel>
      )}
    </>
  );
}

// ------------------------------------------------------------ bets
export function DuelBets({ view, client, onError }: Props) {
  const [stake, setStake] = useState(STAKES[0]);
  const me = view.players.find((p) => p.id === view.me);
  const duel = view.duel;
  if (!duel) return null;
  const mine = mineOf(view);
  const bet = (key: string, side: "win" | "lose") =>
    void client.duelBet(key, side, stake).then((r) => onError(r.ok ? null : errorText(String(r.error))));
  return (
    <Panel title="Apuestas del duelo">
      {mine ? (
        <p className="text-center">Tu duelo empieza en cuanto cierren las apuestas.</p>
      ) : (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm">Apuesta:</span>
          {STAKES.filter((s) => s <= (me?.chips ?? 0)).map((s) => (
            <button key={s} className={`btn ${stake === s ? "" : "btn-gray"}`} onClick={() => setStake(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <ul className="space-y-2">
        {duel.matches
          .filter((m) => m.status === "open")
          .map((m) => {
            const my = m.bets.find((b) => b.bettor === view.me);
            const isDuelist = m.a === view.me || m.b === view.me;
            return (
              <li key={m.key} className="flex flex-wrap items-center justify-center gap-2">
                {isDuelist || my ? (
                  <span>
                    <b>{nameOf(view, m.a)}</b> vs <b>{nameOf(view, m.b)}</b>
                    {my &&
                      ` · apostaste ${my.stake} por ${nameOf(view, my.prediction === "win" ? m.a : m.b)}`}
                  </span>
                ) : (
                  <>
                    <button className="btn" onClick={() => bet(m.key, "win")}>
                      {nameOf(view, m.a)}
                    </button>
                    <span className="opacity-70">vs</span>
                    <button className="btn" onClick={() => bet(m.key, "lose")}>
                      {nameOf(view, m.b)}
                    </button>
                  </>
                )}
              </li>
            );
          })}
      </ul>
      {!mine && me && (
        <div className="mt-3 text-center">
          <button className="btn btn-gray" onClick={() => void client.ready(!me.ready)}>
            {me.ready ? "Esperando a los demás…" : "Listo"}
          </button>
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------ the fight
type Fight = NonNullable<Match["fight"]>;
type Side = "a" | "b";
const FOE: Record<Side, Side> = { a: "b", b: "a" };

/** Overlays of the last step for one side, from the same semantic events and skill map as the PvE arena. */
function sideFx(f: Fight, s: Side): { id: string; cls?: string; wide?: boolean }[] {
  const num = (x: Side | null | undefined) => (x === "a" ? 0 : x === "b" ? 1 : undefined);
  const out: { id: string; cls?: string; wide?: boolean }[] = [];
  const mine = num(s);
  for (const e of f.events) {
    const actor = num(e.actor);
    if (actor === undefined) continue;
    const v = eventVfx({ type: e.type as CombatEventType, actor, target: num(e.target), detail: e.detail });
    if (v && v.at === mine) out.push({ id: v.id, wide: true });
    if (e.type === "guardTriggered" && actor === mine) out.push({ id: "perfect_guard" });
    if (e.type === "shieldChanged" && actor === mine) out.push({ id: "shield" });
    if (e.type === "healed" && num(e.target) === mine) out.push({ id: "regeneration" });
  }
  // A shield skill that left no shieldChanged (capped) still shows its own look; Paso shows its half shield.
  const last = f.last;
  if (last && last.side === s && last.action !== "attack1" && last.action !== "defend") {
    const fx = SKILL_FX[last.action];
    if (fx.vfx === "shield" && !out.some((x) => x.id === "shield")) out.push({ id: "shield" });
    const shield = out.find((x) => x.id === "shield");
    if (shield && fx.vfx === "shield") shield.cls = fx.look;
  }
  return out;
}

/** The engine's own block reason for `id`, rebuilt from the public view (res, cooldowns, loadout). */
function blockReason(f: Fight, side: Side, id: Parameters<typeof skillBlockReason>[1]): string | null {
  const c = {
    char: { classId: f.heroes[side].classId },
    loadout: f.loadouts[side],
    cds: f.cds[side],
    res: f.res[side],
  } as unknown as Combatant;
  return skillBlockReason(c, id);
}

const actionName = (f: Fight, side: Side, a: Action) =>
  a === "defend" ? "Defender" : a === "attack1" ? "Básico" : SKILLS[a].name;

function ResourceMeter({ classId, value }: { classId: string; value: number }) {
  const name = RESOURCE_NAME[classId as ClassId];
  return (
    <div className="flex items-center justify-center gap-1 text-xs" role="img" aria-label={`${name}: ${value} de ${RESOURCE_MAX}`}>
      <span className="truncate opacity-80">{name}</span>
      {Array.from({ length: RESOURCE_MAX }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={`inline-block h-3 w-3 rotate-45 border border-yellow-300 ${i < value ? "bg-yellow-300" : "bg-transparent"}`}
        />
      ))}
    </div>
  );
}

function MatchFight({
  view,
  m,
  client,
  big,
  onError,
}: {
  view: RoomView;
  m: Match;
  client: RoomClient;
  big: boolean;
  onError: (e: string | null) => void;
}) {
  const now = useNow();
  const [sent, setSent] = useState<string | null>(null); // `${key}:${n}`: one click per decision
  const f = m.fight;
  if (!f) return null;
  const side: Side | null = m.a === view.me ? "a" : m.b === view.me ? "b" : null;
  const over = m.reported || m.status === "settled";
  const tag = `${m.key}:${f.n}`;
  const myTurn = !!side && !over && f.toMove === side;
  const act = (a: Action) => {
    setSent(tag);
    void client.duelMove(m.key, a, f.n).then((r) => {
      onError(r.ok ? null : errorText(String(r.error)));
      if (!r.ok) setSent(null);
    });
  };
  const idOf = (s: Side) => (s === "a" ? m.a : m.b);
  // Separate numbers from event amounts: hit, heal and self-damage never net each other out.
  const numbers = stepNumbers<Side>(f.events);
  const amount = (s: Side, kind: "dmg" | "heal" | "self") => numbers.find((n) => n.target === s && n.kind === kind)?.value ?? 0;
  const removed = (s: Side) => f.events.filter((e) => e.type === "statusRemoved" && e.target === s).map((e) => e.detail ?? "estado");
  const hero = (s: Side) => {
    const h = f.heroes[s];
    const moved = f.last?.side === s ? f.last : null;
    const dmg = amount(s, "dmg");
    const heal = amount(s, "heal");
    const self = amount(s, "self");
    const gone = removed(s);
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        <div className={`relative ${big ? "w-32 sm:w-56" : "w-20 sm:w-24"}`}>
          <HeroSprite
            key={`${s}${f.n}`}
            classId={h.classId as ClassId}
            element={h.element as Element}
            flip={s === "b"}
            animated
            action={dmg > 0 ? "hit" : moved ? heroActionFor(moved.action) : "idle"}
            className="w-full"
          />
          {sideFx(f, s).map((x, i) => (
            <Vfx
              key={`${f.n}-${x.id}-${i}`}
              id={x.id}
              delay={0.2}
              className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${x.cls ?? (x.wide ? "top-[-30%] w-44" : "top-[-10%] w-32")}`}
            />
          ))}
        </div>
        <div className="max-w-full truncate text-sm font-semibold">
          {f.toMove === s && !over ? "▶ " : ""}
          {nameOf(view, idOf(s))}
        </div>
        <div className="w-full max-w-60">
          <HealthBar hp={f.hp[s]} max={f.maxHp[s]} />
        </div>
        <div className="flex min-h-5 flex-wrap items-center justify-center gap-x-2 text-xs">
          {f.shield[s] > 0 && <span>🛡 {f.shield[s]}</span>}
          {f.defending[s] && <span>Defiende</span>}
          {f.statuses[s].map((st) => (
            <span key={st.id} className="capitalize">
              {st.id} ×{st.stacks}
            </span>
          ))}
          {dmg > 0 && <span className="font-bold text-red-400 motion-safe:animate-bounce">−{dmg}</span>}
          {heal > 0 && <span className="font-bold text-green-300 motion-safe:animate-bounce">+{heal}</span>}
          {self > 0 && <span className="font-bold text-orange-400">−{self} (propio)</span>}
          {gone.length > 0 && <span className="font-semibold text-sky-200">✧ Purificado: {gone.join(", ")}</span>}
        </div>
        <ResourceMeter classId={h.classId} value={f.res[s]} />
      </div>
    );
  };
  const myClass = side ? (f.heroes[side].classId as ClassId) : null;
  const buttons: { id: Action; name: string; sub: string; meta: string; icon: string; tip: string; reason: string | null }[] = side && myClass
    ? [
        { id: "attack1", name: "Básico", sub: skillTag("attack1"), meta: `Sin costo · +1 ${RESOURCE_NAME[myClass]}`, icon: basicIcon(myClass), tip: "Ataque básico del arma: nunca falla y genera 1 de recurso si hace daño.", reason: null },
        ...f.loadouts[side].map((id) => {
          const k = id as Parameters<typeof skillBlockReason>[1];
          const d = SKILLS[k];
          return { id: k as Action, name: d.name, sub: skillTag(k), meta: skillMeta(d), icon: SKILL_FX[k].icon, tip: d.description, reason: blockReason(f, side, k) };
        }),
        { id: "defend", name: "Defender", sub: "Mitad de daño hasta tu turno", meta: "Sin costo", icon: SKILL_FX.defend.icon, tip: "Hasta el inicio de tu próximo turno recibes la mitad del daño; guardia perfecta contra una amenaza fuerte.", reason: null },
      ]
    : [];
  const left = Math.max(0, f.turnCap - f.turn);
  return (
    <Panel title={`${nameOf(view, m.a)} vs ${nameOf(view, m.b)}`}>
      <div className="flex items-start gap-1">
        {hero("a")}
        <div className="w-14 shrink-0 pt-6 text-center sm:w-20">
          <div className="text-xs opacity-70">Turno {f.turn}</div>
          {!over && f.toMove && (
            <div className="text-xl tabular-nums text-yellow-300">
              {formatCountdown(msLeft(f.deadlineMs, now))}
            </div>
          )}
        </div>
        {hero("b")}
      </div>
      {!over && f.queue.length > 0 && (
        <ol className="mt-2 flex flex-wrap items-center justify-center gap-1 text-xs" aria-label="Próximos turnos">
          {f.queue.map((q, i) => (
            <li
              key={i}
              className={`max-w-20 truncate rounded border px-1.5 py-0.5 ${q.certain ? "border-yellow-300" : "border-white/20 opacity-80"}`}
            >
              {q.side === "a" ? "◆" : "●"} {side ? (q.side === side ? "Tú" : nameOf(view, idOf(q.side))) : nameOf(view, idOf(q.side))}
              {q.certain ? "" : "?"}
            </li>
          ))}
        </ol>
      )}
      {f.warn && !over && (
        <p className="mt-1 text-center text-xs text-yellow-300">
          Quedan {left} turnos: luego gana quien tenga más vida.
        </p>
      )}
      {f.last && (
        <p className="mt-2 text-center text-sm">
          {nameOf(view, idOf(f.last.side))}:{" "}
          {f.last.auto ? "sin respuesta, se defiende" : actionName(f, f.last.side, f.last.action)}
        </p>
      )}
      {side && !over && (
        <>
          {myTurn ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {buttons.map((bt) => (
                <button
                  key={bt.id}
                  className="btn min-w-0 !whitespace-normal break-words"
                  disabled={bt.reason !== null || sent === tag}
                  onClick={() => act(bt.id)}
                  title={bt.tip}
                >
                  <span className="flex items-center justify-center gap-1">
                    <Icon name={bt.icon} className="h-6 shrink-0" />
                    {bt.name}
                  </span>
                  <span className="block text-xs font-normal opacity-80">{bt.sub}</span>
                  <span className="block text-[11px] font-normal opacity-80">{bt.reason ?? bt.meta}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-center text-sm">
              Esperando a <b>{nameOf(view, idOf(FOE[side]))}</b>…
            </p>
          )}
          <p className="mt-2 text-center text-xs opacity-80">
            {myTurn
              ? "Tu turno: si el tiempo se acaba te defiendes solo; dos turnos sin responder cuentan como huida."
              : "Aún no te toca. Mira la cola de turnos arriba."}
          </p>
        </>
      )}
      <ul className="mt-2 space-y-0.5 text-xs opacity-80">
        {f.log.slice(-4).map((l, i) => (
          <li key={i} className="break-words">{l}</li>
        ))}
      </ul>
    </Panel>
  );
}

export function DuelFight({ view, client, onError }: Props) {
  const duel = view.duel;
  if (!duel) return null;
  const mine = mineOf(view);
  const rest = duel.matches.filter((m) => m !== mine);
  return (
    <>
      {mine && <MatchFight view={view} m={mine} client={client} big onError={onError} />}
      {rest.map((m) => (
        <MatchFight key={m.key} view={view} m={m} client={client} big={!mine} onError={onError} />
      ))}
    </>
  );
}

// ------------------------------------------------------------ results
export function DuelResults({ view }: { view: RoomView }) {
  const duel = view.duel;
  if (!duel) return null;
  return (
    <Panel title="Resultado de los duelos">
      <ul className="space-y-3 text-center">
        {duel.matches.map((m) => {
          const pays =
            m.outcome === null ? [] : settlePool(m.bets, m.outcome).payouts;
          const mineBet = pays.find((p) => p.bettor === view.me);
          return (
            <li key={m.key}>
              <div className="text-lg">
                {m.winner ? (
                  <>
                    <b className="text-yellow-300">{nameOf(view, m.winner)}</b> gana{" "}
                    <span className="text-sm opacity-80">
                      {m.end ? END_TEXT[m.end] : ""} · +{ROOM_K.duelWinChips} fichas
                    </span>
                  </>
                ) : (
                  <>
                    {nameOf(view, m.a)} vs {nameOf(view, m.b)}:{" "}
                    <b>{m.end ? END_TEXT[m.end] : "sin resultado"}</b>
                  </>
                )}
              </div>
              {mineBet && (
                <div className={`text-sm ${mineBet.payout > mineBet.stake ? "text-green-300" : mineBet.payout === mineBet.stake ? "" : "text-red-400"}`}>
                  Tu apuesta: {mineBet.payout >= mineBet.stake ? "+" : "−"}
                  {Math.abs(mineBet.payout - mineBet.stake)} fichas
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
