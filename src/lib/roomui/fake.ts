// Scripted fake of the room server for /sala/demo: runs the REAL state machine
// (lib/game/room.ts) with 1-6 bots, a virtual clock (`speed` x faster) and a
// server-like replay of the floor logs I submit. No network, no Supabase.
import { generateCharacter, type Character } from "../game/characters";
import { computeAwards } from "../game/awards";
import { createRng, hashSeed, type Rng } from "../game/rng";
import { RARITY_IDS } from "../game/rarity";
import type { StageAction } from "../game/stageReplay";
import {
  advance,
  chooseDoor,
  chooseHero,
  closeRoom,
  createRoomState,
  endNight,
  joinRoom,
  kickPlayer,
  leaveRoom,
  placeBet,
  placeInterference,
  reportOutcome,
  setMode,
  setRank,
  setPresence,
  setReady,
  setTurnSeconds,
  settlePool,
  hasVote,
  interfereCostFor,
  startCoop,
  startRound,
  transferHost,
  type BetPrediction,
  type DoorKind,
  type FightOutcome,
  type InterfereKind,
  type Result,
  type RoomMode,
  type RoomState,
} from "../game/room";
import { resolveVoteResult, voteClosesAt, VOTE_EVENT } from "../game/vote";
import {
  bossUnit,
  coopNode,
  coopPool,
  coopPrizes,
  coopRank,
  coopTally,
  replayCoop,
} from "../game/coop";
import { alignClimb, newClimb, roomDoors, type Climb } from "../game/floorFights";
import type { FightSpec } from "../game/stage";
import type { RarityId } from "../game/rarity";
import type { CoopView } from "../rooms/api";
import { replayFloor } from "./play";
import type {
  Award,
  BattleView,
  EmoteId,
  FloorRun,
  HeroSummary,
  PlayerView,
  Res,
  RoomClient,
  RoomEvent,
  RoomView,
  TurnInfo,
  VoteInfo,
} from "./types";

const NAMES = ["Joaco", "Maru", "Tano", "Lucho", "Cami", "Nacho", "Pipo"];
const ME = "me";

export interface FakeOpts {
  meName: string;
  players: number; // total including me, 2..7
  speed: number; // virtual clock multiplier (QA: 5-10)
  mode?: RoomMode;
  rank?: RarityId;
  turnSeconds?: number;
  /** Builds my hero (already normalized for the mode) from a collection id. */
  makeHero: (heroId: string | null, mode: RoomMode, seed: number) => Character;
}

const summaryOf = (c: Character): HeroSummary => ({
  name: c.name,
  classId: c.classId,
  element: c.element,
  rarity: c.rarity ?? "f",
  stars: c.stars ?? 0,
  traits: c.traits,
});

const ok = (): Res => ({ ok: true });
const err = (error: string) => ({ ok: false as const, error });

export class FakeRoomClient implements RoomClient {
  readonly kind = "fake" as const;
  private st: RoomState;
  private opts: FakeOpts;
  private t0 = Date.now();
  private names = new Map<string, string>([[ME, "Tú"]]);
  private botHeroes = new Map<string, HeroSummary>();
  private viewCbs = new Set<(v: RoomView | null) => void>();
  private evCbs = new Set<(e: RoomEvent) => void>();
  private tasks: { at: number; fn: () => void }[] = [];
  private lastSeq = -1;
  private rng: Rng = createRng(Date.now());
  private myRun: Climb | null = null;
  private myRunRound = 0;
  private submitted = new Set<string>();
  private stats = new Map<
    string,
    { defeats: number; wins: number; betNet: number; interferes: number }
  >();
  private awards: Award[] | null = null;
  private votes = new Map<string, Record<string, boolean>>(); // "round:floor" -> id -> yes
  private voteDone = new Map<string, { opened: boolean; delta: number }>();
  private view: RoomView | null = null;
  private timer: ReturnType<typeof setInterval>;
  private flaky: string | null = null;
  private coopDmg = new Map<string, { damage: number; finished: boolean }>();

  constructor(opts: FakeOpts) {
    this.opts = opts;
    const now = this.vnow();
    this.st = createRoomState(ME, now, {
      mode: opts.mode ?? "nivelado",
      rank: opts.rank ?? "f",
      turnSeconds: opts.turnSeconds ?? 30,
    });
    this.names.set(ME, opts.meName);
    const n = Math.max(2, Math.min(7, opts.players));
    for (let i = 1; i < n; i++) {
      const id = `b${i}`;
      this.names.set(id, NAMES[i - 1]);
      const r = joinRoom(this.st, id, now);
      if (r.ok) this.st = r.state;
      const hero = generateCharacter(createRng(hashSeed(900 + i, 5)));
      this.botHeroes.set(id, {
        ...summaryOf(hero),
        rarity: RARITY_IDS[i % RARITY_IDS.length],
        stars: i % 3,
      });
      const h = chooseHero(this.st, id, `bot:${id}`);
      if (h.ok) this.st = h.state;
    }
    if (n >= 5) this.flaky = `b${n - 1}`;
    this.timer = setInterval(() => this.tick(), 200);
    this.publish();
  }

  // ------------------------------------------------------------ clocks
  private vnow = () => this.t0 + (Date.now() - this.t0) * this.opts.speed;
  private toClient = (v: number) => this.t0 + (v - this.t0) / this.opts.speed;
  private after(ms: number, fn: () => void) {
    this.tasks.push({ at: this.vnow() + ms, fn });
  }

  // ------------------------------------------------------------ plumbing
  private emit(e: RoomEvent) {
    this.evCbs.forEach((cb) => cb(e));
  }
  private publish() {
    this.view = this.buildView();
    this.viewCbs.forEach((cb) => cb(this.view));
  }
  private apply(r: Result): Res {
    if (!r.ok) return err(r.error);
    this.st = r.state;
    for (const e of r.effects) {
      if (e.type === "battle_settled") this.onSettled(e.key);
      if (e.type === "host_changed" && e.hostId !== ME)
        this.after(4_000, () => this.botHostStarts());
    }
    this.publish();
    return ok();
  }
  private stat(id: string) {
    let s = this.stats.get(id);
    if (!s)
      this.stats.set(
        id,
        (s = { defeats: 0, wins: 0, betNet: 0, interferes: 0 }),
      );
    return s;
  }
  private onSettled(key: string) {
    const b = Object.values(this.st.battles).find((x) => x.key === key);
    if (!b || !b.outcome) return;
    if (b.outcome === "lose") this.stat(b.fighter).defeats += 1;
    if (b.outcome === "win") this.stat(b.fighter).wins += 1;
    for (const po of settlePool(b.bets, b.outcome).payouts)
      this.stat(po.bettor).betNet += po.payout - po.stake;
  }

  // ------------------------------------------------------------ view
  private heroOf(id: string): { summary: HeroSummary | null } {
    if (id === ME) {
      const p = this.st.players.find((x) => x.id === ME);
      if (!p?.heroId) return { summary: null };
      return {
        summary: summaryOf(
          this.opts.makeHero(p.heroId, this.st.mode, this.st.roundSeed ?? 0),
        ),
      };
    }
    return { summary: this.botHeroes.get(id) ?? null };
  }
  private buildView(): RoomView {
    const s = this.st;
    const reveal = s.phase === "reveal" || s.phase === "round_end";
    const showDoors =
      s.phase === "betting" ||
      s.phase === "fighting" ||
      s.phase === "reveal" ||
      s.phase === "round_end";
    const players: PlayerView[] = s.players
      .filter((p) => !p.left)
      .map((p) => ({
        id: p.id,
        name: this.names.get(p.id) ?? p.id,
        hero: this.heroOf(p.id).summary,
        heroId: p.heroId,
        chips: p.chips,
        lives: p.lives,
        eliminated: p.eliminated,
        present: p.present,
        ready: p.ready,
        isHost: p.id === s.hostId,
        activeFromFloor: p.activeFromFloor,
        roundMaxFloor: p.roundMaxFloor,
        nightMaxFloor: p.nightMaxFloor,
        doorChosen: p.door !== null,
        door: showDoors || p.id === ME ? p.door : null,
        outcome: p.outcome,
        fights: !!s.battles[p.id],
      }));
    const battles: Record<string, BattleView> = {};
    for (const b of Object.values(s.battles)) {
      const mine = b.interference?.from === ME;
      battles[b.fighter] = {
        fighter: b.fighter,
        bets: b.bets.map((x) => ({ ...x })),
        status: b.status,
        outcome: b.outcome,
        voidReason: b.voidReason,
        interferedByMe: mine ? b.interference!.kind : null,
        interfered: !!b.interference && (reveal || mine || b.fighter === ME),
        interferenceFrom: reveal && b.interference ? b.interference.from : null,
        interferenceKind: reveal && b.interference ? b.interference.kind : null,
      };
    }
    return {
      code: "DEMO",
      me: ME,
      mode: s.mode,
      rank: s.rank,
      turnSeconds: s.turnSeconds,
      phase: s.phase,
      phaseSeq: s.phaseSeq,
      round: s.round,
      floor: s.floor,
      deadline: s.deadline > 0 ? this.toClient(s.deadline) : 0,
      seed: s.roundSeed,
      hostId: s.hostId,
      players,
      battles,
      awards: this.awards,
      interfereCost: interfereCostFor(
        Object.fromEntries(
          this.st.players.filter((p) => !p.left).map((p) => [p.id, p.chips]),
        ),
        ME,
      ),
      vote: this.voteInfo(),
      coop: this.coopView(),
      connection: "online",
    };
  }

  // ------------------------------------------------------------ coop boss
  private coopView(): CoopView | null {
    const s = this.st;
    if (s.roundSeed === null || this.coopDmg.size === 0) return null;
    const rank = coopRank(s.mode, s.rank);
    const pool = coopPool(
      s.roundSeed,
      rank,
      s.players.filter((p) => !p.left).length,
    );
    const damage = Object.fromEntries(
      [...this.coopDmg].map(([id, c]) => [id, c.damage]),
    );
    const t = coopTally(pool, damage);
    return {
      ...t,
      prizes: coopPrizes(t, damage),
      bossName: coopNode(s.roundSeed, rank).enemies[0].name,
      players: [...this.coopDmg].map(([id, c]) => ({ id, ...c })),
    };
  }
  private coopHero(): Climb | null {
    const s = this.st;
    if (s.roundSeed === null) return null;
    const p = s.players.find((x) => x.id === ME);
    const hero = this.opts.makeHero(p?.heroId ?? null, s.mode, s.roundSeed);
    return newClimb(s.roundSeed, hero, s.rank);
  }
  private botCoop(id: string) {
    const s = this.st;
    if (s.roundSeed === null) return;
    const unit = bossUnit(s.roundSeed, coopRank(s.mode, s.rank));
    this.after(this.rng.int(4_000, 25_000), () => {
      if (this.st.phase !== "coop_boss") return;
      this.coopDmg.set(id, {
        damage: Math.round(unit * (0.4 + this.rng.next() * 3)),
        finished: true,
      });
      this.publish();
    });
  }

  // ------------------------------------------------------------ votes
  private voteKey = () => `${this.st.round}:${this.st.floor}`;
  private voters = () =>
    this.st.players.filter((p) => !p.left && p.present).map((p) => p.id);
  private voteInfo(): VoteInfo | null {
    const s = this.st;
    if (s.phase !== "reveal" || !hasVote(s.floor)) return null;
    const k = this.voteKey();
    const v = this.votes.get(k) ?? {};
    const result = this.voteDone.get(k) ?? null;
    const ids = this.voters();
    return {
      floor: s.floor,
      title: VOTE_EVENT.title,
      question: VOTE_EVENT.question,
      open: !result && this.vnow() < voteClosesAt(s.deadline),
      yes: ids.filter((i) => v[i] === true).length,
      no: ids.filter((i) => v[i] === false).length,
      mine: v[ME] ?? null,
      result,
    };
  }
  private resolveVote() {
    const s = this.st;
    const k = this.voteKey();
    if (s.phase !== "reveal" || !hasVote(s.floor) || this.voteDone.has(k))
      return;
    const r = resolveVoteResult(
      s.roundSeed ?? 0,
      s.round,
      s.floor,
      this.votes.get(k) ?? {},
      this.voters(),
    );
    this.voteDone.set(k, { opened: r.outcome !== null, delta: r.delta });
    if (r.delta === 0) return;
    const n = structuredClone(s);
    for (const p of n.players)
      if (!p.left && p.present) p.chips = Math.max(0, p.chips + r.delta);
    this.st = n;
    this.publish();
  }

  // ------------------------------------------------------------ bots
  private botIds = () =>
    this.st.players.filter((p) => p.id !== ME && !p.left).map((p) => p.id);
  private botHostStarts() {
    const s = this.st;
    if (s.hostId === ME || (s.phase !== "lobby" && s.phase !== "round_end"))
      return;
    this.apply(startRound(s, s.hostId, this.vnow(), this.seed()));
  }
  private seed = () => Math.floor(this.rng.next() * 4294967295);

  private onPhase() {
    const s = this.st;
    const bots = this.botIds();
    switch (s.phase) {
      case "lobby":
        if (s.hostId !== ME) this.after(5_000, () => this.botHostStarts());
        break;
      case "round_setup":
        for (const id of bots)
          this.after(this.rng.int(800, 5000), () => {
            const p = this.st.players.find((x) => x.id === id);
            if (p && !p.heroId)
              this.apply(chooseHero(this.st, id, `bot:${id}`));
          });
        break;
      case "floor_intro":
        if (this.flaky) {
          const away = s.floor === 3;
          this.apply(setPresence(this.st, this.flaky, !away, this.vnow()));
        }
        break;
      case "doors":
        for (const id of bots)
          this.after(this.rng.int(1500, 9000), () => this.botDoor(id));
        break;
      case "betting":
        for (const id of bots)
          this.after(this.rng.int(1000, 9000), () => this.botBet(id));
        break;
      case "fighting":
        for (const id of bots) this.botFight(id);
        break;
      case "reveal":
        if (hasVote(s.floor))
          for (const id of bots)
            this.after(this.rng.int(500, 5000), () => {
              const k = this.voteKey();
              if (this.st.phase === "reveal" && !this.voteDone.has(k))
                this.votes.set(k, {
                  ...this.votes.get(k),
                  [id]: this.rng.chance(0.6),
                });
            });
        for (const id of bots)
          if (this.rng.chance(0.4))
            this.after(this.rng.int(500, 6000), () =>
              this.emit({
                type: "emote",
                from: id,
                id: this.rng.pick([
                  "laugh",
                  "fire",
                  "skull",
                  "clap",
                  "clown",
                  "luck",
                ] as const),
              }),
            );
        break;
      case "round_end":
        for (const id of bots)
          this.after(this.rng.int(2000, 7000), () =>
            this.apply(setReady(this.st, id, true)),
          );
        if (s.hostId !== ME) this.after(9_000, () => this.botHostStarts());
        break;
      case "coop_boss":
        this.coopDmg.clear();
        for (const id of bots) this.botCoop(id);
        break;
      case "night_summary":
        this.awards = this.computeAwards();
        this.publish();
        break;
    }
  }

  private botDoor(id: string) {
    const s = this.st;
    if (s.phase !== "doors") return;
    const p = s.players.find((x) => x.id === id);
    if (!p || !p.present || p.door !== null) return;
    const kinds = roomDoors(s.floor).map((d) => d.kind);
    const fights = kinds.filter(
      (k) => k === "easy" || k === "hard" || k === "boss",
    );
    const pool = this.rng.chance(0.75) && fights.length ? fights : kinds;
    this.apply(chooseDoor(s, id, this.rng.pick(pool)));
  }

  private botBet(id: string) {
    const s = this.st;
    if (s.phase !== "betting") return;
    const me = s.players.find((x) => x.id === id);
    if (!me || !me.present) return;
    const targets = Object.values(s.battles).filter(
      (b) => b.fighter !== id && b.status === "open",
    );
    if (targets.length) {
      const b = this.rng.pick(targets);
      const door = s.players.find((x) => x.id === b.fighter)?.door;
      const pred: BetPrediction = this.rng.chance(
        door === "hard" || door === "boss" ? 0.4 : 0.7,
      )
        ? "win"
        : "lose";
      const stake = this.rng.pick([10, 10, 25, 50]);
      this.apply(placeBet(this.st, id, b.fighter, pred, stake));
      if (this.rng.chance(0.15)) {
        const k: InterfereKind = this.rng.pick([
          "stronger_enemy",
          "adverse_element",
        ] as const);
        const r = this.apply(
          placeInterference(this.st, id, this.rng.pick(targets).fighter, k),
        );
        if (r.ok) this.stat(id).interferes += 1;
      }
    }
    this.after(this.rng.int(1000, 3000), () =>
      this.apply(setReady(this.st, id, true)),
    );
  }

  /** Scripted bot fight: turn events over time, then the outcome. */
  private botFight(id: string) {
    const s = this.st;
    const b = s.battles[id];
    const p = s.players.find((x) => x.id === id);
    if (!b || !p || !p.present) return;
    const boss = p.door === "boss";
    const pWin =
      (p.door === "hard" ? 0.5 : p.door === "boss" ? 0.45 : 0.78) -
      (b.interference ? 0.15 : 0);
    const win = this.rng.chance(pWin);
    const pMax = this.rng.int(90, 170);
    const eMax = Math.round(
      pMax * (boss ? 1.6 : p.door === "hard" ? 1.2 : 0.8),
    );
    const turns = this.rng.int(4, boss ? 11 : 8);
    const gap = Math.round((boss ? 3000 : 2200) + this.rng.int(0, 1200));
    let pHp = pMax;
    let eHp = eMax;
    const send = (
      n: number,
      actor: "p" | "e",
      kind: TurnInfo["kind"],
      dmg: number,
    ) =>
      this.emit({
        type: "turn",
        msg: { fighter: id, n, actor, kind, dmg, pHp, eHp },
      });
    this.after(300, () => send(0, "p", "miss", 0));
    for (let k = 1; k <= turns; k++) {
      this.after(300 + gap * k, () => {
        if (this.st.phase !== "fighting") return;
        const actor: "p" | "e" = k % 2 === 1 ? "p" : "e";
        const kind: TurnInfo["kind"] = this.rng.chance(0.15)
          ? "miss"
          : this.rng.chance(0.2)
            ? "crit"
            : "hit";
        const last = k >= turns - 1;
        let dmg = 0;
        if (kind !== "miss") {
          if (actor === "p") {
            dmg = Math.round(
              (eMax / Math.ceil(turns / 2)) * (kind === "crit" ? 1.6 : 1),
            );
            eHp =
              win && last
                ? 0
                : Math.max(win ? 1 : Math.round(eMax * 0.15), eHp - dmg);
          } else {
            dmg = Math.round(
              (pMax / Math.ceil(turns / 2)) * (kind === "crit" ? 1.6 : 1),
            );
            pHp =
              !win && last
                ? 0
                : Math.max(win ? Math.round(pMax * 0.1) : 1, pHp - dmg);
          }
        }
        send(k, actor, kind, dmg);
      });
    }
    this.after(300 + gap * (turns + 1), () => {
      if (this.st.phase !== "fighting") return;
      if (win) eHp = 0;
      else pHp = 0;
      send(turns + 1, win ? "p" : "e", "hit", 1);
      this.apply(reportOutcome(this.st, id, win ? "won" : "lost"));
    });
  }

  private computeAwards(): Award[] {
    return computeAwards(
      this.st.players.map((p) => {
        const v = this.stats.get(p.id);
        return {
          id: p.id,
          chips: p.chips,
          maxFloor: p.nightMaxFloor,
          wins: v?.wins ?? 0,
          losses: v?.defeats ?? 0,
          betNet: v?.betNet ?? 0,
          interferences: v?.interferes ?? 0,
        };
      }),
    );
  }

  private tick() {
    const now = this.vnow();
    const due = this.tasks.filter((t) => t.at <= now);
    if (due.length) {
      this.tasks = this.tasks.filter((t) => t.at > now);
      due.forEach((t) => t.fn());
    }
    if (this.st.phaseSeq !== this.lastSeq) {
      this.lastSeq = this.st.phaseSeq;
      this.onPhase();
    }
    if (this.st.phase === "reveal" && now >= voteClosesAt(this.st.deadline))
      this.resolveVote();
    const r = advance(this.st, now, this.st.phaseSeq, {
      seed: this.seed(),
      coopDone: this.coopAllDone(),
    });
    if (r.ok && r.advanced) this.apply(r);
    else if (this.view && this.view.deadline !== 0) this.publish();
  }

  // ------------------------------------------------------------ RoomClient
  getView = () => this.view;
  subscribe(cb: (v: RoomView | null) => void) {
    this.viewCbs.add(cb);
    cb(this.view);
    return () => void this.viewCbs.delete(cb);
  }
  onEvent(cb: (e: RoomEvent) => void) {
    this.evCbs.add(cb);
    return () => void this.evCbs.delete(cb);
  }
  async hero(heroId: string) {
    return this.apply(chooseHero(this.st, ME, heroId));
  }
  async ready(ready: boolean) {
    return this.apply(setReady(this.st, ME, ready));
  }
  async setMode(mode: RoomMode) {
    return this.apply(setMode(this.st, ME, mode));
  }
  async setRank(rank: RarityId) {
    return this.apply(setRank(this.st, ME, rank));
  }
  async setTurnSeconds(seconds: number) {
    return this.apply(setTurnSeconds(this.st, ME, seconds));
  }
  async startRound() {
    return this.apply(startRound(this.st, ME, this.vnow(), this.seed()));
  }
  private coopAllDone = () =>
    this.st.phase === "coop_boss" &&
    this.st.players
      .filter((p) => !p.left && p.present)
      .every((p) => this.coopDmg.get(p.id)?.finished);
  async startCoop() {
    return this.apply(startCoop(this.st, ME, this.vnow()));
  }
  async getCoop(): Promise<Res<{ run: Climb; node: FightSpec }>> {
    const run = this.coopHero();
    if (!run || this.st.phase !== "coop_boss") return err("wrong_phase");
    return {
      ok: true,
      run,
      node: coopNode(run.seed, coopRank(this.st.mode, this.st.rank)),
    };
  }
  async coopSubmit(actions: StageAction[]) {
    const run = this.coopHero();
    if (!run || this.st.phase !== "coop_boss") return err("wrong_phase");
    const rep = replayCoop(
      run,
      coopNode(run.seed, coopRank(this.st.mode, this.st.rank)),
      actions,
    );
    if (rep.rejectedAt !== null) return err("invalid_log");
    this.coopDmg.set(ME, { damage: rep.damage, finished: rep.finished });
    this.publish();
    return { ok: true as const, damage: rep.damage, finished: rep.finished };
  }
  async advance(phaseSeq: number) {
    const r = advance(this.st, this.vnow(), phaseSeq, {
      seed: this.seed(),
      coopDone: this.coopAllDone(),
    });
    return r.ok && r.advanced ? this.apply(r) : r.ok ? ok() : err(r.error);
  }
  async door(_floor: number, door: DoorKind) {
    return this.apply(chooseDoor(this.st, ME, door));
  }
  async getRun(): Promise<Res<{ floorRun: FloorRun }>> {
    const s = this.st;
    if (s.roundSeed === null) return err("wrong_phase");
    if (!this.myRun || this.myRunRound !== s.round) {
      const p = s.players.find((x) => x.id === ME);
      const hero = this.opts.makeHero(p?.heroId ?? null, s.mode, s.roundSeed);
      this.myRun = newClimb(s.roundSeed, hero, s.rank);
      this.myRunRound = s.round;
    }
    const run = alignClimb(this.myRun, s.floor);
    const b = s.battles[ME];
    return {
      ok: true,
      floorRun: {
        run,
        floor: s.floor,
        seed: s.roundSeed,
        door: s.players.find((x) => x.id === ME)?.door ?? null,
        enemyBoost:
          s.phase === "fighting" ? (b?.interference?.kind ?? null) : null,
      },
    };
  }
  async submit(floor: number, actions: StageAction[]) {
    const s = this.st;
    const key = `${s.round}:${floor}`;
    if (floor !== s.floor) return err("wrong_floor");
    if (s.phase !== "betting" && s.phase !== "fighting")
      return err("wrong_phase");
    if (this.submitted.has(key)) return err("duplicate");
    const got = await this.getRun();
    if (!got.ok) return got;
    this.submitted.add(key);
    const boost = s.battles[ME]?.interference?.kind ?? null;
    const kind = s.players.find((x) => x.id === ME)?.door ?? "easy";
    const rep = replayFloor(got.floorRun.run, actions, {
      kind: kind === "hard" || kind === "boss" ? kind : "easy",
      boost,
    });
    this.myRun = rep.run;
    if (rep.outcome && s.battles[ME] && s.phase === "fighting")
      this.apply(reportOutcome(this.st, ME, rep.outcome));
    return {
      ok: true as const,
      outcome: rep.outcome as FightOutcome | null,
      eliminated: rep.run.status === "over",
    };
  }
  async bet(fighter: string, prediction: BetPrediction, stake: number) {
    return this.apply(placeBet(this.st, ME, fighter, prediction, stake));
  }
  async interfere(fighter: string, kind: InterfereKind) {
    const r = this.apply(placeInterference(this.st, ME, fighter, kind));
    if (r.ok) this.stat(ME).interferes += 1;
    return r;
  }
  async vote(floor: number, yes: boolean) {
    const s = this.st;
    if (s.phase !== "reveal" || !hasVote(s.floor)) return err("wrong_phase");
    if (floor !== s.floor) return err("wrong_floor");
    if (
      this.vnow() >= voteClosesAt(s.deadline) ||
      this.voteDone.has(this.voteKey())
    )
      return err("wrong_phase");
    this.votes.set(this.voteKey(), {
      ...this.votes.get(this.voteKey()),
      [ME]: yes,
    });
    this.publish();
    return ok();
  }
  async kick(target: string) {
    return this.apply(kickPlayer(this.st, ME, target, this.vnow()));
  }
  async transferHost(to: string) {
    return this.apply(transferHost(this.st, ME, to));
  }
  async endNight() {
    return this.apply(endNight(this.st, ME, this.vnow()));
  }
  async close() {
    const r = this.apply(closeRoom(this.st, ME, this.vnow()));
    if (r.ok) this.emit({ type: "closed" });
    return r;
  }
  async leave() {
    const r = this.apply(leaveRoom(this.st, ME, this.vnow()));
    this.emit({ type: "closed" });
    return r;
  }
  turn(msg: Omit<TurnInfo, "fighter">) {
    this.emit({ type: "turn", msg: { ...msg, fighter: ME } });
  }
  emote(id: EmoteId) {
    this.emit({ type: "emote", from: ME, id });
  }
  dispose() {
    clearInterval(this.timer);
    this.viewCbs.clear();
    this.evCbs.clear();
  }
}
