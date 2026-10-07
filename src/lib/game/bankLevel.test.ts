import { describe, expect, it } from "vitest";
import { clearedLevels } from "./dungeonProgress";
import { levelCoins, firstClearChest } from "./levelPay";
import { levelLoot } from "./levelLoot";
import { levelsOf, LEVELS_PER_RANK } from "./levels";
import {
  bankLevel,
  chooseHeroSkill,
  createProfile,
  lootOptions,
  migrate,
  pullCharacter,
  type LevelResult,
  type Profile,
} from "./profile";
import { createRng } from "./rng";
import { SKILLS_BY_CLASS } from "./skills";

const withHero = (): Profile => {
  const p = { ...createProfile(), coins: 100000 };
  return pullCharacter(p, createRng(7))!.profile;
};
const res = (p: Profile, over: Partial<LevelResult> = {}): LevelResult => {
  const c = p.characters[0];
  const loot = levelLoot(levelsOf("f")[0], 0, c.classId, 5, lootOptions(p, "f", 0, 0));
  return { rank: "f", level: 0, asc: 0, heroId: c.id, status: "cleared", xp: 300, loot, attemptId: "a1", ...over };
};

describe("bankLevel", () => {
  it("clear: records progress, pays coins, adds EXP, once per attempt", () => {
    const p = withHero();
    const before = p.coins;
    const b = bankLevel(p, res(p));
    expect(b.cleared && !b.repeat).toBe(true);
    expect(clearedLevels(b.profile.dungeons, "f")).toBe(1);
    expect(b.profile.coins).toBe(before + levelCoins("f", 0, false) + b.chest);
    expect(b.profile.characters[0].xp + b.profile.characters[0].level).toBeGreaterThan(
      p.characters[0].xp + p.characters[0].level - 1,
    );
    expect(bankLevel(b.profile, res(p)).profile).toBe(b.profile); // same attempt id
  });
  it("loss keeps EXP but pays nothing and records nothing", () => {
    const p = withHero();
    const b = bankLevel(p, res(p, { status: "lost" }));
    expect(b.cleared).toBe(false);
    expect(b.profile.coins).toBe(p.coins);
    expect(b.profile.dungeons).toEqual({});
    expect(b.xp).toBe(300);
  });
  it("repeat pays 60% and counts toward the daily decay; last level gives the chest", () => {
    let p = withHero();
    for (let i = 0; i < LEVELS_PER_RANK.f; i++) {
      const b = bankLevel(p, res(p, { level: i, attemptId: `x${i}`, loot: { parts: {}, pieces: [] } }));
      p = b.profile;
      if (i === LEVELS_PER_RANK.f - 1) expect(b.chest).toBe(firstClearChest("f", 0));
    }
    const r = bankLevel(p, res(p, { attemptId: "rep" }));
    expect(r.repeat).toBe(true);
    expect(r.coins).toBe(levelCoins("f", 0, true, 1));
    expect(r.chest).toBe(0);
    expect(r.profile.levelsDay?.n).toBe(1);
  });
  it("a locked level never counts as a clear", () => {
    const p = withHero();
    const b = bankLevel(p, res(p, { level: 3 }));
    expect(b.cleared).toBe(false);
    expect(b.profile.dungeons).toEqual({});
  });
});

describe("hero skill + migrate", () => {
  it("chooseHeroSkill validates class and unlock, and survives migrate", () => {
    const p = withHero();
    const c = p.characters[0];
    const [own, other] = [SKILLS_BY_CLASS[c.classId][1], SKILLS_BY_CLASS[c.classId === "mago" ? "caballero" : "mago"][0]];
    const base = { ...p, characters: [{ ...c, rarity: "c" as const }] };
    const ok = chooseHeroSkill(base, c.id, own)!;
    expect(ok.characters[0].skill).toBe(own);
    expect(chooseHeroSkill(base, c.id, other)).toBeNull(); // wrong class
    expect(chooseHeroSkill({ ...base, characters: [{ ...c, rarity: "f" as const, stars: 0 }] }, c.id, own)).toBeNull(); // locked
    expect(migrate(JSON.parse(JSON.stringify(ok))).characters[0].skill).toBe(own);
  });
  it("old numeric dungeon shapes reset to {}", () => {
    expect(migrate({ dungeons: { f: 3 }, ascensions: { f: 2 } }).dungeons).toEqual({});
  });
});
