import { describe, expect, it } from "vitest";
import {
  acceptBlock,
  isFairTrade,
  isPieceKey,
  parsePieceKey,
  pieceLabel,
  spareKeys,
  TRADE_VALUE,
  tradeBand,
  type MarketOffer,
} from "./market";
import { MAX_COPIES, PULL_COST_CHARACTER, type Profile } from "./profile";
import { RARITIES } from "./rarity";

const prof = (c: [string, number][], w: [string, number][] = []) =>
  ({
    characters: c.map(([id, spare]) => ({ id, stars: 0, copies: Array(spare).fill("terco") })), // heroes: spare copies
    weapons: w.map(([id, stars]) => ({ id, stars })),
  }) as unknown as Profile;
const offer = (o: Partial<MarketOffer>): MarketOffer => ({
  id: "o",
  sellerId: "s",
  seller: "Ana",
  kind: "character",
  give: "c-mago-fuego-c",
  want: null,
  coins: 0,
  expiresAt: "",
  ...o,
});

describe("market keys", () => {
  it("accepts real pieces only", () => {
    expect(parsePieceKey("c-mago-fuego-c")?.kind).toBe("character");
    expect(parsePieceKey("w-espada-rayo-a")?.kind).toBe("weapon");
    expect(parsePieceKey("c-espada-rayo-a")).toBeNull();
    expect(parsePieceKey("c-mago-fuego-mitico")).toBeNull();
    expect(parsePieceKey("c-mago-fuego-raro; drop")).toBeNull();
    expect(isPieceKey("weapon", "c-mago-fuego-c")).toBe(false);
    expect(pieceLabel("c-mago-fuego-c")).toContain("Mago");
  });
  it("only spare copies (heroes) and stars (weapons) are tradeable", () => {
    const p = prof([
      ["c-mago-fuego-c", 1],
      ["c-picaro-agua-f", 0],
    ]);
    expect(spareKeys(p, "character")).toEqual(["c-mago-fuego-c"]);
  });
  it("explains why an offer cannot be accepted", () => {
    expect(acceptBlock(prof([]), offer({}), true)).toMatch(/tu oferta/);
    expect(acceptBlock(prof([]), offer({}), false)).toBeNull();
    expect(
      acceptBlock(prof([["c-mago-fuego-c", MAX_COPIES]]), offer({}), false),
    ).toMatch(/máximo/);
    const swap = offer({ want: "c-picaro-agua-f" });
    expect(acceptBlock(prof([["c-picaro-agua-f", 0]]), swap, false)).toMatch(
      /repetida/,
    );
    expect(acceptBlock(prof([["c-picaro-agua-f", 1]]), swap, false)).toBeNull();
  });
});

describe("equivalent trades (+-25% in value)", () => {
  it("values follow the gacha price of each rank", () => {
    expect(TRADE_VALUE.f).toBe(830);
    expect(TRADE_VALUE.s).toBe(8330);
    // value = coins a pull of that rank costs: price / odds (250 / 0.30 ~ 830; 250 / 0.03 = 8330)
    expect(TRADE_VALUE.f).toBeCloseTo(PULL_COST_CHARACTER / 0.3, -1);
    expect(TRADE_VALUE.s).toBeCloseTo(PULL_COST_CHARACTER / RARITIES.s.probability, -1);
    const v = Object.values(TRADE_VALUE);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
  });
  it("same rank swaps are fair; gifts and lopsided swaps are not", () => {
    expect(isFairTrade("w-espada-fuego-f", "w-hacha-agua-f", 0)).toBe(true);
    expect(isFairTrade("w-espada-fuego-f", null, 0)).toBe(false); // gift
    expect(isFairTrade("w-espada-fuego-e", "w-hacha-agua-f", 0)).toBe(false); // 200 off > 25% of 700 (175)
  });
  it("a higher rank can be paid with a lower one plus coins, within 25%", () => {
    // E (1140) for F (830) + coins: fair at +310, allowed band is +-285 around it
    const band = tradeBand("w-espada-fuego-e", "w-hacha-agua-f");
    expect(band.fair).toBe(310);
    expect(band.min).toBe(25);
    expect(band.max).toBe(595);
    expect(isFairTrade("w-espada-fuego-e", "w-hacha-agua-f", 310)).toBe(true);
    expect(isFairTrade("w-espada-fuego-e", "w-hacha-agua-f", 24)).toBe(false);
    expect(isFairTrade("w-espada-fuego-e", "w-hacha-agua-f", 596)).toBe(false);
  });
  it("selling for coins only: the price must be within 25% of the value", () => {
    expect(isFairTrade("w-espada-fuego-c", null, 2080)).toBe(true);
    expect(isFairTrade("w-espada-fuego-c", null, 1559)).toBe(false);
    expect(isFairTrade("w-espada-fuego-c", null, 2600)).toBe(true);
    expect(isFairTrade("w-espada-fuego-c", null, 2601)).toBe(false);
  });
  it("negative coins: the seller tops up a weaker piece", () => {
    // give F (830), want E (1140) and pay 310 on top
    expect(isFairTrade("w-espada-fuego-f", "w-hacha-agua-e", -310)).toBe(true);
    expect(isFairTrade("w-espada-fuego-f", "w-hacha-agua-e", 0)).toBe(false);
  });
  it("an acceptor without the coins cannot accept", () => {
    const o = offer({ give: "w-espada-fuego-e", kind: "weapon", coins: 500 });
    expect(
      acceptBlock({ ...prof([], []), coins: 100 } as Profile, o, false),
    ).toMatch(/monedas/);
    expect(
      acceptBlock({ ...prof([], []), coins: 600 } as Profile, o, false),
    ).toBeNull();
  });
});
