// Ephemeral per-room extras (fight HP after each turn, emotes) served by the
// snapshot. In-memory on purpose: no migration, and losing it is harmless.
// ponytail: per server instance; if Vercel scales out, move to a table or Realtime.
export interface LiveTurn {
  fighter: string;
  n: number;
  actor: "p" | "e";
  kind: "hit" | "crit" | "miss";
  dmg: number;
  pHp: number;
  eHp: number;
}
export interface EmoteRec {
  from: string;
  id: string;
  at: number;
}
interface Bucket {
  live: Map<string, LiveTurn & { key: string }>;
  emotes: EmoteRec[];
  touched: number;
}
const rooms = new Map<string, Bucket>();
const EMOTE_KEEP_MS = 6_000;
const ROOM_TTL_MS = 6 * 3_600_000;

function bucket(room: string, now: number): Bucket {
  let b = rooms.get(room);
  if (!b) {
    for (const [k, v] of rooms) if (now - v.touched > ROOM_TTL_MS) rooms.delete(k);
    b = { live: new Map(), emotes: [], touched: now };
    rooms.set(room, b);
  }
  b.touched = now;
  return b;
}

/** `key` = "round:floor"; stale floors are ignored on read. */
export const setLive = (room: string, key: string, t: LiveTurn, now: number) =>
  void bucket(room, now).live.set(t.fighter, { ...t, key });

/** Returns false when the same player emoted less than `gapMs` ago. */
export function addEmote(room: string, e: EmoteRec, gapMs: number): boolean {
  const b = bucket(room, e.at);
  const last = [...b.emotes].reverse().find((x) => x.from === e.from);
  if (last && e.at - last.at < gapMs) return false;
  b.emotes = b.emotes.filter((x) => e.at - x.at < EMOTE_KEEP_MS).concat(e);
  return true;
}

export function readLive(room: string, key: string, now: number) {
  const b = rooms.get(room);
  if (!b) return { live: [] as LiveTurn[], emotes: [] as EmoteRec[] };
  return {
    live: [...b.live.values()]
      .filter((x) => x.key === key)
      .map((x) => ({
        fighter: x.fighter,
        n: x.n,
        actor: x.actor,
        kind: x.kind,
        dmg: x.dmg,
        pHp: x.pHp,
        eHp: x.eHp,
      })),
    emotes: b.emotes.filter((x) => now - x.at < EMOTE_KEEP_MS),
  };
}
