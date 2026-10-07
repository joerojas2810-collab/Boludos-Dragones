// Floor vote (pure): an optional shared-risk event at the end of some floors.
// Everybody present may vote yes/no; majority of the votes cast wins, a tie
// means "not opened". Not voting is an abstention and never blocks. The seed
// decides (secretly) whether opening pays or costs; the amount is the same for
// every present player and grows when fewer players are in the room.
import { hashSeed, createRng } from "./rng";
import { hasVote, ROOM_K } from "./room";

export interface VoteEvent {
  title: string;
  question: string;
  good: string;
  bad: string;
}

export const VOTE_EVENT: VoteEvent = {
  title: "El cofre maldito",
  question:
    "¿Abrimos el cofre maldito? Si sale bien, todos ganan fichas; si sale mal, todos pierden.",
  good: "¡Tesoro! Todos ganan fichas.",
  bad: "¡Maldición! Todos pierden fichas.",
};

export const voteFloor = hasVote;
/** Voting stops (and the result is paid) this long before the reveal ends. */
export const voteClosesAt = (revealDeadline: number) =>
  revealDeadline - ROOM_K.voteShowMs;

/** Chips at stake per present player: x1 with 7 players, x1.5 with 2. */
export function voteAmount(present: number): number {
  const n = Math.min(ROOM_K.maxPlayers, Math.max(1, present));
  return Math.round(
    ROOM_K.voteChips *
      (1 + (ROOM_K.maxPlayers - n) * ROOM_K.voteScalePerMissing),
  );
}

/** Secret outcome of opening the chest, fixed by the round seed (same for everybody). */
export const voteOutcomeFor = (
  seed: number,
  round: number,
  floor: number,
): "good" | "bad" =>
  createRng(hashSeed(seed, round, floor, 0x70e)).chance(0.5) ? "good" : "bad";

export interface Tally {
  yes: number;
  no: number;
  abstain: number;
  opens: boolean;
}

/** Only votes from `eligible` (present members) count; the rest abstain. */
export function tallyVote(
  votes: Readonly<Record<string, boolean>>,
  eligible: readonly string[],
): Tally {
  let yes = 0;
  let no = 0;
  for (const id of eligible) {
    if (votes[id] === true) yes++;
    else if (votes[id] === false) no++;
  }
  return { yes, no, abstain: eligible.length - yes - no, opens: yes > no };
}

export interface VoteResult extends Tally {
  outcome: "good" | "bad" | null; // null = not opened
  delta: number; // per present player (0 when not opened)
}

export function resolveVoteResult(
  seed: number,
  round: number,
  floor: number,
  votes: Readonly<Record<string, boolean>>,
  eligible: readonly string[],
): VoteResult {
  const t = tallyVote(votes, eligible);
  if (!t.opens) return { ...t, outcome: null, delta: 0 };
  const outcome = voteOutcomeFor(seed, round, floor);
  const amt = voteAmount(eligible.length);
  return { ...t, outcome, delta: outcome === "good" ? amt : -amt };
}
