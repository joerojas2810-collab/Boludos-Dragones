import { describe, expect, it } from "vitest";
import {
  acceptBlock,
  isPieceKey,
  parsePieceKey,
  pieceLabel,
  spareKeys,
  type MarketOffer,
} from "./market";
import type { Profile } from "./profile";

const prof = (c: [string, number][], w: [string, number][] = []) =>
  ({
    characters: c.map(([id, stars]) => ({ id, stars })),
    weapons: w.map(([id, stars]) => ({ id, stars })),
  }) as unknown as Profile;
const offer = (o: Partial<MarketOffer>): MarketOffer => ({
  id: "o",
  sellerId: "s",
  seller: "Ana",
  kind: "character",
  give: "c-mago-fuego-raro",
  want: null,
  expiresAt: "",
  ...o,
});

describe("market keys", () => {
  it("accepts real pieces only", () => {
    expect(parsePieceKey("c-mago-fuego-raro")?.kind).toBe("character");
    expect(parsePieceKey("w-espada-rayo-epico")?.kind).toBe("weapon");
    expect(parsePieceKey("c-espada-rayo-epico")).toBeNull();
    expect(parsePieceKey("c-mago-fuego-mitico")).toBeNull();
    expect(parsePieceKey("c-mago-fuego-raro; drop")).toBeNull();
    expect(isPieceKey("weapon", "c-mago-fuego-raro")).toBe(false);
    expect(pieceLabel("c-mago-fuego-raro")).toContain("Mago");
  });
  it("only repeated pieces are tradeable", () => {
    const p = prof([
      ["c-mago-fuego-raro", 1],
      ["c-picaro-agua-comun", 0],
    ]);
    expect(spareKeys(p, "character")).toEqual(["c-mago-fuego-raro"]);
  });
  it("explains why an offer cannot be accepted", () => {
    expect(acceptBlock(prof([]), offer({}), true)).toMatch(/tu oferta/);
    expect(acceptBlock(prof([]), offer({}), false)).toBeNull();
    expect(
      acceptBlock(prof([["c-mago-fuego-raro", 5]]), offer({}), false),
    ).toMatch(/máximo/);
    const swap = offer({ want: "c-picaro-agua-comun" });
    expect(
      acceptBlock(prof([["c-picaro-agua-comun", 0]]), swap, false),
    ).toMatch(/repetida/);
    expect(
      acceptBlock(prof([["c-picaro-agua-comun", 1]]), swap, false),
    ).toBeNull();
  });
});
