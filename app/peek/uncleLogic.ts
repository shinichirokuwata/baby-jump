// Pure helpers for UNCLE SMASH — fully self-contained (no imports from
// app/game/ or app/balance/). Adapted from BABY PEEK's peekLogic.ts (same
// round/state-machine shape), renamed/retargeted for this game.

export type UncleSpot = "left" | "right" | "bottom";
export type RoundOutcome = "success" | "fail";
export type RoundState = "hidden" | "peeking" | "roundResult";
export type GamePhase = "ready" | "starting" | "playing" | "finished";

export const TOTAL_ROUNDS = 8;

// How long the uncle(s) stay visible (genuinely hittable) each round,
// seconds — ramps up in both speed and headcount so the back half gets
// busier. Separate from the pop-in animation (see UncleGame's
// POP_TRANSITION_MS), which is added on top, not included in these numbers.
export const ROUND_PEEK_DURATIONS_S: ReadonlyArray<number> = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7];

// How many uncles pop out simultaneously each round: solo through round 4,
// pairs for 5-7, all three spots at once for the round 8 finale.
export const ROUND_UNCLE_COUNTS: ReadonlyArray<number> = [1, 1, 1, 1, 2, 2, 2, 3];

const WAIT_MIN_MS = 700;
const WAIT_MAX_MS = 1700;

/** Random suspense delay before the uncle pops out, so rounds don't fall into a predictable rhythm. */
export function randomWaitMs(): number {
  return WAIT_MIN_MS + Math.random() * (WAIT_MAX_MS - WAIT_MIN_MS);
}

const ALL_SPOTS: ReadonlyArray<UncleSpot> = ["left", "right", "bottom"];

/** Picks a random spot, never repeating the immediately previous one. */
export function pickNextSpot(previous: UncleSpot | null): UncleSpot {
  const pool = previous ? ALL_SPOTS.filter((s) => s !== previous) : ALL_SPOTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function shuffle<T>(items: ReadonlyArray<T>): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks `count` distinct spots for a round. Only the *lead* (first) spot
 * follows the no-consecutive-same-direction rule against the previous
 * round's lead spot (via pickNextSpot) — per the brief, that's the one rule
 * worth preserving as-is; any additional spots for a 2-3 uncle round are
 * simply whichever directions are left, in random order.
 */
export function pickSpotsForRound(count: number, previousLeadSpot: UncleSpot | null): UncleSpot[] {
  const lead = pickNextSpot(previousLeadSpot);
  if (count <= 1) return [lead];
  const rest = shuffle(ALL_SPOTS.filter((s) => s !== lead));
  if (count >= 3) return [lead, ...rest];
  return [lead, rest[0]];
}

/** A small random position offset (-1..1) along the spot's free axis, so the same edge doesn't always pop from the exact same point. */
export function randomPositionJitter(): number {
  return Math.random() * 2 - 1;
}

export type MatchOutcome = "player" | "uncle" | "draw";

export function getMatchOutcome(youScore: number, uncleScore: number): MatchOutcome {
  if (youScore > uncleScore) return "player";
  if (uncleScore > youScore) return "uncle";
  return "draw";
}
