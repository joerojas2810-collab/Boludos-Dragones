import { describe, expect, it } from "vitest";
import { revealMsFor, ROOM_K } from "./room";
import { resolveVoteResult, tallyVote, voteAmount, voteOutcomeFor } from "./vote";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe("vote", () => {
  it("majority of votes cast wins; tie does not open", () => {
    expect(tallyVote({ p0: true, p1: false }, ids(2)).opens).toBe(false);
    expect(tallyVote({ p0: true, p1: true, p2: false }, ids(3)).opens).toBe(true);
    expect(tallyVote({ p0: false, p1: false, p2: true }, ids(3)).opens).toBe(false);
  });
  it("abstentions never block; absent voters are ignored", () => {
    const t = tallyVote({ p0: true, gone: false, gone2: false }, ids(5));
    expect(t).toEqual({ yes: 1, no: 0, abstain: 4, opens: true });
    expect(tallyVote({}, ids(4)).opens).toBe(false);
  });
  it("amount scales from 7 down to 2 players", () => {
    expect(voteAmount(7)).toBe(ROOM_K.voteChips);
    expect(voteAmount(2)).toBeGreaterThan(voteAmount(4));
    expect(voteAmount(4)).toBeGreaterThan(voteAmount(7));
  });
  it("same result for everybody, deterministic by seed, zero when closed", () => {
    expect(voteOutcomeFor(9, 1, 3)).toBe(voteOutcomeFor(9, 1, 3));
    const seen = new Set(Array.from({ length: 40 }, (_, s) => voteOutcomeFor(s, 1, 3)));
    expect(seen.size).toBe(2);
    const closed = resolveVoteResult(1, 1, 3, { p0: false }, ids(3));
    expect(closed).toMatchObject({ outcome: null, delta: 0 });
    const open = resolveVoteResult(1, 1, 3, { p0: true }, ids(3));
    expect(Math.abs(open.delta)).toBe(voteAmount(3));
  });
  it("reveal lasts longer on vote floors only (model)", () => {
    expect(revealMsFor(3)).toBe(ROOM_K.revealMs + ROOM_K.voteExtraMs);
    expect(revealMsFor(4)).toBe(ROOM_K.revealMs);
    expect(revealMsFor(5)).toBe(ROOM_K.revealMs); // boss floors never vote
  });
});
