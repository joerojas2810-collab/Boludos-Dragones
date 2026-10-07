"use client";

import { useState, type ReactNode } from "react";
import { DoorIcon } from "@/components/DoorIcon";
import { CoopBar, CoopFight } from "@/components/room/CoopBoss";
import { FloorPlayer } from "@/components/room/FloorPlayer";
import { Podium } from "@/components/room/Podium";
import { HeroSprite } from "@/components/HeroSprite";
import "@/components/fx.css";
import { ItemCard } from "@/components/ItemCard";
import { Panel } from "@/components/Panel";
import { CLASSES } from "@/lib/game/characters";
import {
  isAid,
  isFightDoor,
  ROOM_K,
  type DoorKind,
  type InterfereKind,
  type RoomMode,
} from "@/lib/game/room";
import { doorsFor } from "@/lib/game/run";
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/game/rarity";
import { useProfile } from "@/lib/useProfile";
import { useNow, useRoom, type LiveFight } from "@/lib/useRoom";
import { characterView } from "@/lib/viewModels";
import { filterSortCharacters } from "@/lib/viewModels";
import { AWARD_INFO, nightTitles } from "@/lib/game/awards";
import { DEFAULT_HERO } from "@/lib/game/room";
import { Vfx } from "@/components/fx/Vfx";
import type { EmoteId, RoomClient, RoomView } from "@/lib/roomui/types";
import {
  DOOR_NAME,
  errorText,
  fightersOf,
  formatCountdown,
  msLeft,
  phaseBanner,
  playerStatus,
  rankRows,
} from "@/lib/roomui/viewModels";

// Fallback glyphs; the painted sprites (vfx_emote_<id>) are shown when available.
const EMOTES: Record<EmoteId, string> = {
  laugh: "😂",
  fire: "🔥",
  skull: "💀",
  clap: "👏",
  clown: "🤡",
  luck: "🍀",
};
const TONE = {
  info: "text-[#d9d2ca]",
  boss: "text-red-400",
  danger: "text-orange-300",
  gold: "text-yellow-300",
} as const;
const STATUS_COLOR = {
  idle: "text-[#d9d2ca]",
  ok: "text-green-300",
  bad: "text-red-400",
  warn: "text-yellow-300",
  fight: "text-orange-300",
} as const;

export function RoomScreen({
  client,
  onExit,
}: {
  client: RoomClient;
  onExit: () => void;
}) {
  const { view, live, emotes, toast, gone, emote } = useRoom(client);
  const now = useNow();
  const [err, setErr] = useState<string | null>(null);
  const run = async (p: Promise<{ ok: boolean; error?: unknown }>) => {
    const r = await p;
    setErr(r.ok ? null : errorText(String(r.error)));
  };

  if (gone)
    return (
      <Centered>
        <p className="mb-3">
          {gone === "closed"
            ? "La sala se cerró."
            : "Ya no estás en esta sala."}
        </p>
        <button className="btn" onClick={onExit}>
          Salir
        </button>
      </Centered>
    );
  if (!view) return <Centered>Conectando…</Centered>;

  const me = view.players.find((p) => p.id === view.me);
  const isHost = view.hostId === view.me;
  const banner = phaseBanner(view.phase, view.floor, view.round);
  const left = msLeft(view.deadline, now);
  const myDoor = me?.door ?? null;
  const iFight = !!view.battles[view.me];
  const rows = rankRows(view.players, "chips", view.me);
  const canPlay =
    !!me &&
    !me.eliminated &&
    view.floor >= me.activeFromFloor &&
    me.outcome === null;
  const floorKey = `${view.round}:${view.floor}`;
  const titles = view.awards
    ? nightTitles(
        view.players.map((p) => p.id),
        view.awards,
      )
    : null;

  let main: ReactNode = null;
  switch (view.phase) {
    case "lobby":
    case "round_setup":
    case "round_end":
      main = (
        <>
          {view.phase === "lobby" && (
            <Panel title="Sala">
              <div className="text-center text-sm opacity-80">
                Código para unirse
              </div>
              <div className="mb-3 text-center text-4xl tracking-[0.3em] text-yellow-300">
                {view.code}
              </div>
              {isHost ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {(["nivelado", "completo"] as RoomMode[]).map((m) => (
                    <button
                      key={m}
                      className={`btn ${view.mode === m ? "" : "btn-gray"}`}
                      onClick={() => void run(client.setMode(m))}
                    >
                      {m === "nivelado" ? "Modo nivelado" : "Poder completo"}
                    </button>
                  ))}
                  <select
                    aria-label="Rango del dungeon"
                    className="btn btn-gray"
                    value={view.rank}
                    onChange={(e) =>
                      void run(client.setRank(e.target.value as RarityId))
                    }
                  >
                    {RARITY_IDS.map((r) => (
                      <option key={r} value={r}>
                        Rango {RARITIES[r].label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Segundos por turno"
                    className="btn btn-gray"
                    value={view.turnSeconds}
                    onChange={(e) =>
                      void run(client.setTurnSeconds(Number(e.target.value)))
                    }
                  >
                    {[20, 30, 45, 60].map((s) => (
                      <option key={s} value={s}>
                        {s} s por turno
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="text-center text-sm">
                  Modo:{" "}
                  {view.mode === "nivelado" ? "nivelado" : "poder completo"} ·{" "}
                  rango {RARITIES[view.rank].label} · {view.turnSeconds} s por
                  turno
                </div>
              )}
            </Panel>
          )}
          <HeroPicker view={view} onPick={(id) => void run(client.hero(id))} />
          <div className="flex flex-wrap justify-center gap-2">
            {view.phase === "round_end" && me && (
              <button
                className="btn btn-gray"
                onClick={() => void run(client.ready(!me.ready))}
              >
                {me.ready ? "Quitar listo" : "Listo"}
              </button>
            )}
            {isHost &&
              (view.phase === "lobby" || view.phase === "round_end") && (
                <button
                  className="btn"
                  onClick={() => void run(client.startRound())}
                >
                  {view.phase === "lobby" ? "Iniciar ronda" : "Siguiente ronda"}
                </button>
              )}
            {isHost &&
              view.phase === "round_end" &&
              view.round >= ROOM_K.coopMinRound && (
                <button
                  className="btn !border-red-700"
                  onClick={() => void run(client.startCoop())}
                >
                  Jefe final (todos juntos)
                </button>
              )}
            {isHost && view.phase === "round_end" && (
              <button
                className="btn btn-gray"
                onClick={() => void run(client.endNight())}
              >
                Terminar la noche
              </button>
            )}
          </div>
        </>
      );
      break;
    case "doors": {
      const doors =
        view.seed === null
          ? []
          : doorsFor(view.seed, view.floor, null, view.rank);
      main = (
        <Panel title="Elige una puerta">
          {!canPlay ? (
            <p className="text-center">
              {me?.eliminated
                ? "Estás eliminado de esta ronda: mira, apuesta e interfiere."
                : "Mirando este piso."}
            </p>
          ) : doors.length === 0 ? (
            <p className="text-center">Cargando puertas…</p>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              {doors.map((d, i) => (
                <button
                  key={i}
                  className={`pixel-frame choice-card flex min-w-32 flex-col items-center gap-1 p-3 text-center ${
                    myDoor === d.kind ? "!border-green-400" : ""
                  } ${d.kind === "boss" ? "!border-red-700" : ""}`}
                  onClick={() => void run(client.door(view.floor, d.kind))}
                >
                  <DoorIcon kind={d.kind} className="h-10" />
                  <span className="choice-title">{DOOR_NAME[d.kind]}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      );
      break;
    }
    case "betting":
      main = (
        <>
          {canPlay && myDoor && !isFightDoor(myDoor) && (
            <FloorPlayer
              key={floorKey}
              client={client}
              floor={view.floor}
              door={myDoor}
            />
          )}
          <BetPanel view={view} client={client} onError={setErr} />
          {me && (
            <button
              className="btn btn-gray self-center"
              onClick={() => void run(client.ready(!me.ready))}
            >
              {me.ready ? "Esperando a los demás…" : "Listo"}
            </button>
          )}
        </>
      );
      break;
    case "fighting":
      main = (
        <>
          {canPlay && iFight && myDoor && (
            <FloorPlayer
              key={floorKey}
              client={client}
              floor={view.floor}
              door={myDoor}
            />
          )}
          {canPlay && !iFight && myDoor && !isFightDoor(myDoor) && (
            <FloorPlayer
              key={floorKey}
              client={client}
              floor={view.floor}
              door={myDoor}
            />
          )}
          <FightStrip view={view} live={live} />
        </>
      );
      break;
    case "reveal":
      main = (
        <>
          {view.vote && (
            <VotePanel vote={view.vote} client={client} onError={setErr} />
          )}
          <FightStrip view={view} live={live} reveal />
        </>
      );
      break;
    case "coop_boss":
      main = (
        <>
          <CoopBar view={view} />
          {me && <CoopFight client={client} />}
        </>
      );
      break;
    case "night_summary":
    case "closed":
      main = (
        <>
          {view.coop && <CoopBar view={view} />}
          <Panel title="Resumen de la noche">
            <Podium
              ranked={rows.map((r) => view.players.find((x) => x.id === r.id)!)}
              titles={titles}
            />
            {view.awards?.map((a) => (
              <div key={a.id} className="mb-2 text-center">
                <div className="font-bold">
                  {AWARD_INFO[a.id].title}:{" "}
                  {view.players.find((p) => p.id === a.player)?.name ?? "?"}
                </div>
                <div className="text-sm opacity-80">
                  {AWARD_INFO[a.id].blurb(a.value)}
                </div>
              </div>
            ))}
            {titles && (
              <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-center text-sm">
                {rows.map((r) => (
                  <li key={r.id}>
                    <b>{r.name}</b>:{" "}
                    <span className="text-yellow-300">{titles[r.id]}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-center">
              <button className="btn" onClick={onExit}>
                Salir
              </button>
            </div>
          </Panel>
        </>
      );
      break;
    default:
      main = (
        <Panel className="text-center">
          {view.floor > 0 ? `Piso ${view.floor}` : ""} …
        </Panel>
      );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 pt-6 text-base">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className={`text-lg font-semibold ${TONE[banner.tone]}`}>
              {banner.title}
            </div>
            <div className="text-sm opacity-80">{banner.hint}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl tabular-nums text-yellow-300">
              {formatCountdown(left)}
            </div>
            <div className="text-xs opacity-70">
              Sala {view.code}
              {view.connection === "reconnecting" && " · reconectando…"}
            </div>
          </div>
        </div>
        {err && <div className="mt-2 text-sm text-red-400">{err}</div>}
        {toast && <div className="mt-2 text-sm text-green-300">{toast}</div>}
      </Panel>
      <div className="flex flex-col gap-3 md:flex-row-reverse">
        <Panel title={`Ranking · fichas`} className="md:w-72 md:shrink-0">
          <ol className="space-y-1">
            {rows.map((r) => {
              const p = view.players.find((x) => x.id === r.id)!;
              const st = playerStatus(view, p, null);
              return (
                <li
                  key={r.id}
                  className="b-enter flex items-center gap-2 text-sm"
                >
                  <span className="w-5 text-right opacity-70">{r.pos}</span>
                  {p.hero ? (
                    <HeroSprite
                      classId={p.hero.classId}
                      element={p.hero.element}
                      traits={p.hero.traits}
                      className="w-12 shrink-0"
                      crop
                    />
                  ) : (
                    <span className="w-12 shrink-0" />
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate ${r.isMe ? "text-yellow-300" : ""}`}
                  >
                    {p.isHost && "★ "}
                    {r.name}
                    {titles && (
                      <span className="block text-xs text-yellow-300">
                        {titles[r.id]}
                      </span>
                    )}
                    {emotes[r.id] && (
                      <Vfx
                        key={emotes[r.id].id}
                        id={`emote_${emotes[r.id].id}`}
                        className="ml-1 inline-block h-8 w-8 align-middle"
                      />
                    )}
                    <span className={`block text-xs ${STATUS_COLOR[st.kind]}`}>
                      {p.hero ? `${p.hero.name} · ` : ""}
                      {st.text}
                    </span>
                  </span>
                  <span className="tabular-nums text-yellow-300">
                    {r.chips}
                  </span>
                  <span className="w-8 text-right text-xs opacity-70">
                    P{r.floor}
                  </span>
                  {isHost && r.id !== view.me && view.phase !== "closed" && (
                    <button
                      className="btn btn-gray !px-2 !py-0 text-xs"
                      aria-label={`Expulsar a ${r.name}`}
                      title="Expulsar"
                      onClick={() => {
                        if (window.confirm(`¿Expulsar a ${r.name}?`))
                          void run(client.kick(r.id));
                      }}
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {view.phase !== "closed" && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(Object.keys(EMOTES) as EmoteId[]).map((id) => (
                <button
                  key={id}
                  className="btn btn-gray !px-2"
                  onClick={() => emote(id)}
                >
                  <span aria-label={id} className="relative block h-7 w-7">
                    <Vfx id={`emote_${id}`} className="h-full w-full" />
                    <span className="sr-only">{EMOTES[id]}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            className="btn btn-gray mt-3 w-full text-center"
            onClick={() => {
              if (window.confirm("¿Salir de la sala?"))
                void client.leave().then(onExit);
            }}
          >
            Salir
          </button>
          {isHost && view.phase !== "closed" && (
            <button
              className="btn btn-gray mt-2 w-full text-center"
              onClick={() => {
                if (window.confirm("¿Cerrar la sala para todos?"))
                  void client.close();
              }}
            >
              Cerrar sala
            </button>
          )}
        </Panel>
        <div className="flex min-w-0 flex-1 flex-col gap-3">{main}</div>
      </div>
    </main>
  );
}

const Centered = ({ children }: { children: ReactNode }) => (
  <main className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
    {children}
  </main>
);

function HeroPicker({
  view,
  onPick,
}: {
  view: RoomView;
  onPick: (id: string) => void;
}) {
  const { profile } = useProfile();
  const mine = view.players.find((p) => p.id === view.me)?.heroId ?? null;
  const owned = profile
    ? filterSortCharacters(profile.characters, {
        classId: "all",
        rarity: "all",
        sort: "rarity",
      })
    : [];
  return (
    <Panel title="Tu héroe">
      <p className="mb-2 text-center text-sm opacity-80">
        {view.mode === "nivelado"
          ? "Modo nivelado: todos con poder base parecido; rareza y estrellas dan un bono chico."
          : "Poder completo: cuenta toda tu colección."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          className={`pixel-frame p-2 text-sm ${mine === DEFAULT_HERO ? "!border-green-400" : ""}`}
          onClick={() => onPick(DEFAULT_HERO)}
        >
          Común al azar
        </button>
        {owned.map((c) => (
          <button key={c.id} aria-label={c.name} onClick={() => onPick(c.id)}>
            <ItemCard
              item={characterView(c)}
              size={64}
              selected={mine === c.id}
            />
          </button>
        ))}
      </div>
      {mine === null && (
        <p className="mt-2 text-center text-sm text-yellow-300">
          Aún no elegiste.
        </p>
      )}
    </Panel>
  );
}

function FightStrip({
  view,
  live,
  reveal = false,
}: {
  view: RoomView;
  live: Record<string, LiveFight>;
  reveal?: boolean;
}) {
  const list = fightersOf(view);
  const nameOf = (id: string) =>
    view.players.find((x) => x.id === id)?.name ?? "?";
  return (
    <Panel title={reveal ? "Resultados" : "Peleas"}>
      {list.length === 0 && (
        <p className="text-center text-sm">Nadie pelea este piso.</p>
      )}
      <ul className="space-y-1">
        {list.map((p) => {
          const st = playerStatus(view, p, null);
          const b = view.battles[p.id];
          const lf = live[p.id];
          const pct =
            lf && lf.pMax > 0 ? Math.round((lf.pHp / lf.pMax) * 100) : null;
          const epct =
            lf && lf.eMax > 0 ? Math.round((lf.eHp / lf.eMax) * 100) : null;
          return (
            <li key={p.id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {p.name}
                  {p.door && (
                    <span className="opacity-70"> · {DOOR_NAME[p.door]}</span>
                  )}
                  {b.interfered && (
                    <span
                      className={
                        isAid(b.interferenceKind)
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {" "}
                      ·{" "}
                      {isAid(b.interferenceKind)
                        ? `ayudado (${AID_LABEL[b.interferenceKind]})`
                        : "interferido"}
                      {b.interferenceFrom
                        ? ` por ${nameOf(b.interferenceFrom)}`
                        : ""}
                    </span>
                  )}
                </span>
                <span className={STATUS_COLOR[st.kind]}>{st.text}</span>
              </div>
              {pct !== null && b.status !== "settled" && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <Bar pct={pct} fill="health" label={`Vida de ${p.name}`} />
                  {epct !== null && (
                    <Bar pct={epct} fill="health_low" label="Vida del rival" />
                  )}
                </div>
              )}
              {b.bets.length > 0 && (
                <div className="text-xs opacity-80">
                  {b.bets
                    .map(
                      (x) =>
                        `${nameOf(x.bettor)} ${x.stake} a ${x.prediction === "win" ? "ganar" : "perder"}`,
                    )
                    .join(" · ")}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function VotePanel({
  vote,
  client,
  onError,
}: {
  vote: NonNullable<RoomView["vote"]>;
  client: RoomClient;
  onError: (e: string | null) => void;
}) {
  const go = async (yes: boolean) => {
    const r = await client.vote(vote.floor, yes);
    onError(r.ok ? null : errorText(String(r.error)));
  };
  const res = vote.result;
  return (
    <Panel title={vote.title}>
      <p className="mb-2 text-center">{vote.question}</p>
      <p className="mb-2 text-center text-sm opacity-80">
        Sí {vote.yes} · No {vote.no} · gana la mayoría; empate o silencio = no
        se abre.
      </p>
      {res ? (
        <p
          className={`text-center font-bold ${res.opened ? (res.delta > 0 ? "text-green-300" : "text-red-400") : "opacity-80"}`}
        >
          {!res.opened
            ? "No se abrió. Nadie gana ni pierde."
            : res.delta > 0
              ? `¡Tesoro! Todos ganan ${res.delta} fichas.`
              : `¡Maldición! Todos pierden ${-res.delta} fichas.`}
        </p>
      ) : (
        <div className="flex justify-center gap-2">
          {([true, false] as const).map((yes) => (
            <button
              key={String(yes)}
              className={`btn ${vote.mine === yes ? "" : "btn-gray"}`}
              disabled={!vote.open}
              onClick={() => void go(yes)}
            >
              {yes ? "Abrir" : "Dejarlo"}
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

const STAKES = [10, 25, 50];
const INTERFERE: [InterfereKind, string][] = [
  ["stronger_enemy", "Enemigo +20%"],
  ["adverse_element", "Elemento adverso"],
];
const AID_LABEL = { heal: "Curación", ward: "Bendición" } as const;
const AID: [InterfereKind, string][] = [
  ["heal", "Curar +40% vida"],
  ["ward", "Bendecir +15% ATQ/DEF"],
];

function BetPanel({
  view,
  client,
  onError,
}: {
  view: RoomView;
  client: RoomClient;
  onError: (e: string | null) => void;
}) {
  const [stake, setStake] = useState(STAKES[0]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const targets = fightersOf(view).filter((p) => p.id !== view.me);
  const me = view.players.find((p) => p.id === view.me);
  const cost = view.interfereCost ?? ROOM_K.interfereCost;
  const mark = (k: string) => setDone((s) => new Set(s).add(k));
  const go = async (
    key: string,
    p: Promise<{ ok: boolean; error?: unknown }>,
  ) => {
    const r = await p;
    onError(r.ok ? null : errorText(String(r.error)));
    if (r.ok) mark(key);
  };
  return (
    <Panel title={`Apuestas · tienes ${me?.chips ?? 0} fichas`}>
      {targets.length === 0 && (
        <p className="text-center text-sm">No hay peleas apostables.</p>
      )}
      <div className="mb-2 flex items-center justify-center gap-2 text-sm">
        Apuesta:
        {STAKES.map((s) => (
          <button
            key={s}
            className={`btn !px-3 ${stake === s ? "" : "btn-gray"}`}
            onClick={() => setStake(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {targets.map((p) => {
          const open = view.battles[p.id]?.status === "open";
          return (
            <li
              key={p.id}
              className="pixel-frame flex flex-wrap items-center gap-2 p-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <b>{p.name}</b>
                {p.hero &&
                  ` · ${p.hero.name} (${CLASSES[p.hero.classId].name})`}
                {p.door && (
                  <span className="opacity-70">
                    {" "}
                    · {DOOR_NAME[p.door as DoorKind]}
                  </span>
                )}
              </span>
              {(["win", "lose"] as const).map((pred) => (
                <button
                  key={pred}
                  className="btn !px-3"
                  disabled={
                    !open ||
                    done.has(`b${p.id}`) ||
                    (me?.chips ?? 0) < Math.max(stake, ROOM_K.minBet)
                  }
                  onClick={() =>
                    void go(`b${p.id}`, client.bet(p.id, pred, stake))
                  }
                >
                  {pred === "win" ? "Ganará" : "Perderá"}
                </button>
              ))}
              {INTERFERE.map(([k, label]) => (
                <button
                  key={k}
                  className="btn btn-gray !px-3"
                  disabled={
                    !open || done.has(`i${p.id}`) || (me?.chips ?? 0) < cost
                  }
                  onClick={() => void go(`i${p.id}`, client.interfere(p.id, k))}
                >
                  {label} ({cost})
                </button>
              ))}
              {AID.map(([k, label]) => (
                <button
                  key={k}
                  className="btn !px-3"
                  title={`Ayuda a ${p.name}: si gana, recuperas ${ROOM_K.aidRefund} fichas. Una intervención por pelea.`}
                  disabled={
                    !open ||
                    done.has(`i${p.id}`) ||
                    (me?.chips ?? 0) < ROOM_K.aidCost
                  }
                  onClick={() => void go(`i${p.id}`, client.interfere(p.id, k))}
                >
                  {label} ({ROOM_K.aidCost})
                </button>
              ))}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Bar({
  pct,
  fill,
  label,
}: {
  pct: number;
  fill: "health" | "health_low";
  label: string;
}) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuenow={w}
      className="relative h-2 min-w-0 flex-1 overflow-hidden rounded bg-black/50"
    >
      <span
        className="bar-fill absolute inset-y-0 left-0"
        data-fill={fill}
        style={{ width: `${w}%` }}
      />
    </span>
  );
}
