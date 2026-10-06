import { describe, expect, it } from "vitest";
import { autoBlockReason, autoPolicy } from "./auto";
import { generateCharacter, type Character } from "./characters";
import { startBattle } from "./combat";
import {
  applyRunAction,
  ENGINE_VERSION,
  initialReplay,
  replayRun,
  type ReplayState,
  type RunAction,
} from "./replay";
import {
  applyBattleResult,
  chooseDoor,
  chooseSkill,
  createRun,
  doorsFor,
  enemyFor,
  GROUP_REWARD_MULT,
  groupSize,
  nextFloor,
  skillOffer,
  startFight,
  upgradeOffer,
  type FightKind,
  type FightNode,
} from "./run";
import { createRng } from "./rng";
import { xpToNext } from "./progression";
import { SKILL_LEVEL } from "./skills";

const strongHero = (seed = 7, over: Partial<Character> = {}): Character => {
  const h = generateCharacter(createRng(seed), "caballero");
  return {
    ...h,
    ...over,
    stats: {
      ...h.stats,
      hp: h.stats.hp * 25,
      atk: h.stats.atk * 6,
      def: h.stats.def * 6,
    },
  };
};

describe("enemy groups", () => {
  const sizes = (kind: FightKind, floor: number) =>
    new Set(Array.from({ length: 300 }, (_, s) => groupSize(s, floor, kind)));

  it("follows the schedule tables", () => {
    for (const f of [1, 2]) expect(sizes("easy", f)).toEqual(new Set([1]));
    expect(sizes("easy", 4)).toEqual(new Set([1, 2]));
    expect(sizes("easy", 12)).toEqual(new Set([1, 2]));
    for (const f of [1, 3, 5]) expect(sizes("hard", f)).toEqual(new Set([2]));
    expect(sizes("hard", 8)).toEqual(new Set([2, 3]));
    expect(sizes("hard", 20)).toEqual(new Set([2, 3]));
    for (const f of [5, 10]) expect(sizes("boss", f)).toEqual(new Set([1]));
    expect(sizes("boss", 15)).toEqual(new Set([1, 2]));
    expect(sizes("boss", 30)).toEqual(new Set([1, 2, 3]));
  });

  it("is deterministic from (seed, floor, kind) and fits in 1..3", () => {
    for (const kind of ["easy", "hard", "boss"] as const)
      for (const floor of [3, 9, 15, 30, 45]) {
        const a = enemyFor(77, floor, kind);
        expect(enemyFor(77, floor, kind)).toEqual(a);
        expect(a.enemies.length).toBe(groupSize(77, floor, kind));
        expect(a.enemies.length).toBeGreaterThanOrEqual(1);
        expect(a.enemies.length).toBeLessThanOrEqual(3);
        expect(a.enemy).toBe(a.enemies[0]);
        expect(new Set(a.enemies.map((e) => e.name)).size).toBe(
          a.enemies.length,
        );
        for (const e of a.enemies) expect(e.stats.hp).toBeGreaterThan(0);
      }
  });

  it("the boss is the first of its group and keeps its own name", () => {
    const g = enemyFor(5, 30, "boss");
    expect(g.enemies[0].name).not.toMatch(/ del | de la /);
  });

  it("rewards scale with the group size", () => {
    const run0 = createRun(3, strongHero());
    const opened = chooseDoor(run0, 0);
    if (!opened || opened.node.type !== "fight") throw new Error("no fight");
    const node: FightNode = opened.node;
    const started = startFight(opened.run);
    if (!started) throw new Error("no start");
    const won = { ...started.battle, status: "won" as const };
    const coins = (n: number) => {
      const nn: FightNode = {
        ...node,
        enemies: Array.from({ length: n }, () => node.enemies[0]),
      };
      const r = applyBattleResult({ ...started.run, node: nn }, won, nn);
      return r.coins;
    };
    const one = coins(1);
    expect(coins(2)).toBe(Math.round((one / 1) * GROUP_REWARD_MULT[1]));
    expect(coins(3)).toBe(Math.round((one / 1) * GROUP_REWARD_MULT[2]));
    expect(coins(3)).toBeGreaterThan(coins(2));
  });

  it("a run with a group fight in progress is JSON-serializable", () => {
    const run = createRun(11, strongHero());
    const open = chooseDoor(run, 0);
    if (!open) throw new Error("no door");
    const f = startFight(open.run);
    if (!f) throw new Error("no fight");
    expect(JSON.parse(JSON.stringify(open.run))).toEqual(open.run);
    expect(JSON.parse(JSON.stringify(f.battle))).toEqual(f.battle);
  });
});

describe("third skill pick", () => {
  const level4 = () =>
    strongHero(7, {
      level: SKILL_LEVEL - 1,
      xp: xpToNext(SKILL_LEVEL - 1) - 1,
    });

  // Plays floor 1 with the auto policy until the fight result is in.
  function winFirstFight(): { s: ReplayState; log: RunAction[] } {
    let s = initialReplay(4, level4());
    const log: RunAction[] = [];
    const push = (a: RunAction) => {
      const n = applyRunAction(s, a);
      if (!n) throw new Error(`illegal ${JSON.stringify(a)}`);
      s = n;
      log.push(a);
    };
    const fightDoor = doorsFor(4, 1).findIndex(
      (d) => d.kind === "easy" || d.kind === "hard",
    );
    push({ t: "door", i: fightDoor });
    for (let i = 0; i < 300 && s.fight && !s.fight.result; i++) {
      const p = autoPolicy(s.fight.battle);
      push({ t: "act", a: p.action, target: p.target });
    }
    expect(s.fight?.result?.status).toBe("active");
    push({ t: "fin" });
    return { s, log };
  }

  it("reaching the level owes a skill pick before upgrades, doors and floors", () => {
    const { s, log } = winFirstFight();
    const r = s.run;
    expect(r.hero.level).toBeGreaterThanOrEqual(SKILL_LEVEL);
    expect(r.pendingSkill).toBe(true);
    expect(s.picks).not.toBeNull();
    expect(skillOffer(r)).toEqual(["barrido", "contraataque"]);
    // the upgrade pick, a door and nextFloor are refused until the skill is chosen
    expect(applyRunAction(s, { t: "pick", id: upgradeOffer(r)[0] })).toBeNull();
    expect(applyRunAction(s, { t: "door", i: 0 })).toBeNull();
    expect(nextFloor({ ...r, floorCleared: true, node: null })).toEqual({
      ...r,
      floorCleared: true,
      node: null,
    });
    // a skill of another class, or an unknown one, is illegal
    expect(applyRunAction(s, { t: "skill", id: "tormenta" })).toBeNull();
    expect(chooseSkill(r, "tormenta")).toBe(r);
    const next = applyRunAction(s, { t: "skill", id: "contraataque" });
    expect(next?.run.hero.skill).toBe("contraataque");
    expect(next?.run.pendingSkill).toBe(false);
    // the replay reaches the same state
    const full = [...log, { t: "skill", id: "contraataque" } as RunAction];
    expect(replayRun(4, level4(), full).run).toEqual(next?.run);
  });

  it("the picked skill is part of the hero in the next fight", () => {
    const { s } = winFirstFight();
    let n = applyRunAction(s, { t: "skill", id: "barrido" });
    if (!n) throw new Error("skill refused");
    while (n.picks) {
      const next = applyRunAction(n, {
        t: "pick",
        id: upgradeOffer(n.run)[0],
      });
      if (!next) throw new Error("pick refused");
      n = next;
    }
    const f = startBattle(
      n.run.hero,
      enemyFor(1, 1, "easy").enemies,
      createRng(1),
    );
    expect(f.player.char.skill).toBe("barrido");
  });
});

describe("quick resolve in the action log", () => {
  const easyDoor = (seed: number) =>
    doorsFor(seed, 1).findIndex((d) => d.kind === "easy");

  // Plays a whole run live (auto when allowed, else autoPolicy acts).
  function live(seed: number, hero: Character, maxActions = 700) {
    let s = initialReplay(seed, hero);
    const log: RunAction[] = [];
    let autos = 0;
    const push = (a: RunAction): boolean => {
      const n = applyRunAction(s, a);
      if (!n) return false;
      s = n;
      log.push(a);
      return true;
    };
    while (log.length < maxActions && s.run.status === "active") {
      const r = s.run;
      let done = false;
      if (s.fight) {
        if (s.fight.result) done = push({ t: "fin" });
        else {
          const b = s.fight.battle;
          if (!autoBlockReason(b, s.fight.node.kind) && push({ t: "auto" })) {
            autos++;
            done = true;
          } else {
            const p = autoPolicy(b, { guard: true });
            done = push({ t: "act", a: p.action, target: p.target });
          }
        }
      } else if (s.picks)
        done = r.pendingSkill
          ? push({ t: "skill", id: skillOffer(r)[0] })
          : push({ t: "pick", id: upgradeOffer(r)[0] });
      else if (r.pendingLoot) done = push({ t: "loot", i: 0 });
      else if (r.pendingRelic)
        done = push({ t: "relic", id: r.pendingRelic[0] });
      else if (r.node?.type === "event") {
        for (let i = 0; i < 4 && !done; i++) done = push({ t: "event", i });
      } else if (r.node?.type === "shop") done = push({ t: "leave" });
      else if (r.node || r.floorCleared) done = push({ t: "leave" });
      else {
        const doors = doorsFor(r.seed, r.floor);
        const i = doors.findIndex(
          (d) => d.kind === "easy" || d.kind === "boss",
        );
        done = push({ t: "door", i: Math.max(0, i) });
      }
      if (!done) break;
    }
    return { s, log, autos };
  }

  it("replay(log) equals the live result, with auto fights in the log", () => {
    let totalAutos = 0;
    for (const seed of [21, 22, 23, 24]) {
      const hero = strongHero(seed);
      const { s, log, autos } = live(seed, hero);
      totalAutos += autos;
      const rep = replayRun(seed, hero, log);
      expect(rep.rejectedAt).toBeNull();
      expect(rep.run).toEqual(s.run);
      expect(rep.run.maxFloor).toBeGreaterThan(3);
    }
    expect(totalAutos).toBeGreaterThan(0);
  });

  it("an auto entry stands for a whole fight (one log entry)", () => {
    for (let seed = 1; seed < 80; seed++) {
      const i = easyDoor(seed);
      if (i < 0) continue;
      let s = initialReplay(seed, strongHero(seed));
      s = applyRunAction(s, { t: "door", i }) as ReplayState;
      const after = applyRunAction(s, { t: "auto" });
      if (!after) continue;
      expect(after.fight?.battle.status).toBe("won");
      expect(after.fight?.result).not.toBeNull();
      return;
    }
    throw new Error("no easy floor-1 fight was auto-resolvable");
  });

  it("is illegal outside easy fights, mid-fight, or without a fight", () => {
    const hero = strongHero(5);
    expect(applyRunAction(initialReplay(5, hero), { t: "auto" })).toBeNull();
    for (let seed = 1; seed < 60; seed++) {
      const d = doorsFor(seed, 1);
      const hard = d.findIndex((x) => x.kind === "hard");
      if (hard >= 0) {
        const s = applyRunAction(initialReplay(seed, strongHero(seed)), {
          t: "door",
          i: hard,
        }) as ReplayState;
        expect(applyRunAction(s, { t: "auto" })).toBeNull();
      }
      const easy = d.findIndex((x) => x.kind === "easy");
      if (easy >= 0) {
        const s = applyRunAction(initialReplay(seed, strongHero(seed)), {
          t: "door",
          i: easy,
        }) as ReplayState;
        const acted = applyRunAction(s, {
          t: "act",
          a: "attack1",
        }) as ReplayState;
        if (acted.fight && !acted.fight.result)
          expect(applyRunAction(acted, { t: "auto" })).toBeNull();
      }
    }
  });
});

describe("engine version", () => {
  it("runs carry it and replays of another version are refused, not misread", () => {
    const hero = strongHero();
    expect(createRun(1, hero).engineVersion).toBe(ENGINE_VERSION);
    const ok = replayRun(1, hero, []);
    expect(ok.error).toBeUndefined();
    const old = replayRun(1, hero, [{ t: "door", i: 0 }], ENGINE_VERSION - 1);
    expect(old.error).toBe("engine_version");
    expect(old.applied).toBe(0);
  });

  it("act targets outside the living enemies cut the log as an illegal action", () => {
    for (let seed = 1; seed < 40; seed++) {
      const hard = doorsFor(seed, 1).findIndex((d) => d.kind === "hard");
      if (hard < 0) continue;
      const hero = strongHero(seed);
      const log: RunAction[] = [
        { t: "door", i: hard },
        { t: "act", a: "attack1", target: 2 },
      ];
      const rep = replayRun(seed, hero, log);
      expect(rep.rejectedAt).toBe(1); // floor 1 hard has exactly 2 enemies
      return;
    }
    throw new Error("no hard floor-1 door found");
  });
});
