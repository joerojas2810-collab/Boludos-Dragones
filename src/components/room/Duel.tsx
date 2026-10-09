"use client";

// 1v1 duels in a room: host panel, pick, bets, the secret-pick fight and the
// result. Pure view code: rules live in lib/game/{duel,room}.ts and the server.
import { useState } from "react";
import { ClassElementPicker } from "@/components/room/ClassElementPicker";
import { HealthBar } from "@/components/HealthBar";
import { HeroSprite } from "@/components/HeroSprite";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import type { HeroAction } from "@/lib/art/heroes";
import { CLASSES, type ClassId } from "@/lib/game/characters";
import type { Action } from "@/lib/game/combat";
import type { Element } from "@/lib/game/elements";
import {
  DEFAULT_HERO,
  ROOM_K,
  settlePool,
  type DuelEnd,
  type DuelMode,
} from "@/lib/game/room";
import { SKILLS, type SkillId } from "@/lib/game/skills";
import type { DuelView } from "@/lib/rooms/api";
import type { RoomClient, RoomView } from "@/lib/roomui/types";
import { errorText, formatCountdown, msLeft } from "@/lib/roomui/viewModels";
import { useNow } from "@/lib/useRoom";
import { useProfile } from "@/lib/useProfile";
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
  balanceado: "Balanceado: eliges solo clase y elemento",
  real: "Héroes reales: tu héroe, a poder completo",
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
  const [heroPicked, setHeroPicked] = useState<string | null>(null);
  if (!duel) return null;
  const picked = new Set(duel.picked);
  const send = (p: Parameters<RoomClient["duelPick"]>[0]) =>
    void client.duelPick(p).then((r) => onError(r.ok ? null : errorText(String(r.error))));
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
              onPick={(classId, element) => send({ classId, element })}
            />
          ) : (
            <RealPicker
              mine={heroPicked}
              onPick={(id) => {
                setHeroPicked(id);
                send({ heroId: id });
              }}
            />
          )}
          <p className="mt-2 text-center text-sm">
            {picked.has(view.me)
              ? "Enviado ✓ Puedes cambiarlo hasta que acabe el tiempo."
              : duel.mode === "balanceado"
                ? "Si no eliges, entras de Caballero de Fuego."
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
const ACTION_ART: Record<Action, HeroAction> = {
  attack1: "attack_1",
  attack2: "attack_2",
  attack3: "attack_3",
  defend: "defend",
};

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
  const [sent, setSent] = useState<string | null>(null); // `${key}:${turn}:${action}`
  const f = m.fight;
  if (!f) return null;
  const side = m.a === view.me ? "a" : m.b === view.me ? "b" : null;
  const foe = side === "a" ? "b" : "a";
  const over = m.reported || m.status === "settled";
  const turnTag = `${m.key}:${f.turn}:`;
  const chosen = sent?.startsWith(turnTag) ? (sent.slice(turnTag.length) as Action) : null;
  const act = (a: Action) => {
    setSent(turnTag + a);
    void client.duelMove(m.key, a).then((r) => {
      onError(r.ok ? null : errorText(String(r.error)));
      if (!r.ok) setSent(null);
    });
  };
  const me = side ? f.heroes[side] : null;
  const skill = me?.skill ? SKILLS[me.skill as SkillId] : null;
  const cls = me ? CLASSES[me.classId as ClassId] : null;
  const label = (a: Action) =>
    a === "defend"
      ? "Defender"
      : a === "attack1"
        ? cls?.attack1.name
        : a === "attack2"
          ? cls?.attack2.name
          : skill?.name;
  const hero = (s: "a" | "b") => {
    const h = f.heroes[s];
    const lastPick = f.last?.[s] ?? null;
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        <HeroSprite
          key={`${s}${f.turn}`}
          classId={h.classId as ClassId}
          element={h.element as Element}
          flip={s === "b"}
          animated
          action={lastPick ? ACTION_ART[lastPick] : "idle"}
          className={big ? "w-40 sm:w-56" : "w-24"}
        />
        <div className="truncate text-sm font-semibold">{nameOf(view, s === "a" ? m.a : m.b)}</div>
        <div className="w-full max-w-60">
          <HealthBar hp={f.hp[s]} max={f.maxHp[s]} />
        </div>
        <div className="text-xs opacity-70">
          {f.picked[s] && !over ? "ya eligió ✓" : ""}
        </div>
      </div>
    );
  };
  return (
    <Panel title={`${nameOf(view, m.a)} vs ${nameOf(view, m.b)}`}>
      <div className="flex items-end gap-2">
        {hero("a")}
        <div className="shrink-0 pb-10 text-center">
          <div className="text-xs opacity-70">Turno {f.turn}</div>
          {!over && (
            <div className="text-xl tabular-nums text-yellow-300">
              {formatCountdown(msLeft(f.deadlineMs, now))}
            </div>
          )}
        </div>
        {hero("b")}
      </div>
      {f.last && (
        <p className="mt-2 text-center text-sm">
          {nameOf(view, m.a)}: {label2(f.heroes.a, f.last.a)} · {nameOf(view, m.b)}: {label2(f.heroes.b, f.last.b)}
        </p>
      )}
      {side && !over && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["attack1", "attack2", "attack3", "defend"] as Action[])
              .filter((a) => a !== "attack3" || skill)
              .map((a) => {
                const cd = a === "attack2" ? f.cooldown[side] : a === "attack3" ? f.cooldown3[side] : 0;
                return (
                  <button
                    key={a}
                    className={`btn ${chosen === a ? "" : "btn-gray"}`}
                    disabled={cd > 0 || chosen !== null}
                    onClick={() => act(a)}
                  >
                    {label(a)}
                    {cd > 0 && <span className="block text-xs opacity-70">enfría {cd}</span>}
                  </button>
                );
              })}
          </div>
          <p className="mt-2 text-center text-xs opacity-80">
            {chosen
              ? f.picked[foe]
                ? "Resolviendo…"
                : "Elegiste en secreto. Esperando al rival…"
              : "Defender justo cuando el rival lanza su golpe fuerte es guardia perfecta."}
          </p>
        </>
      )}
      <ul className="mt-2 space-y-0.5 text-xs opacity-80">
        {f.log.slice(-4).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </Panel>
  );
}

function label2(h: { classId: string; skill?: string }, a: Action | null) {
  if (a === null) return "sin respuesta";
  if (a === "defend") return "Defender";
  const cls = CLASSES[h.classId as ClassId];
  if (a === "attack1") return cls.attack1.name;
  if (a === "attack2") return cls.attack2.name;
  return h.skill ? SKILLS[h.skill as SkillId].name : "habilidad";
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
