"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pickSpotsForRound,
  randomPositionJitter,
  randomWaitMs,
  ROUND_PEEK_DURATIONS_S,
  ROUND_UNCLE_COUNTS,
  TOTAL_ROUNDS,
  type GamePhase,
  type UncleSpot,
  type RoundOutcome,
  type RoundState,
} from "./uncleLogic";
import { Uncle } from "./Uncle";
import { Hammer, HIT_DISPLAY_MS, type HitEffect } from "./Hammer";
import { UncleHud } from "./UncleHud";

// No requestAnimationFrame loop here on purpose — UNCLE SMASH is a
// discrete, event/timer-driven state machine (hidden -> peeking ->
// roundResult), so plain setTimeout + CSS transitions is the right tool,
// not a continuous rAF loop. Every effect below owns its own timer(s) and
// clears them in its cleanup — covers both normal transitions and unmount.
// Rounds 1-4 have one uncle; rounds 5-8 have 2-3 up at once (see
// ROUND_UNCLE_COUNTS) — each uncle is tracked as its own instance with its
// own `hit` flag so they can be smashed independently within one round.

const STARTING_DURATION_MS = 500;
const RESOLVE_DISPLAY_MS = 600;
// The pop-in CSS transition (see getSpotStyle's `transition` string) takes
// this long to visually settle. ROUND_PEEK_DURATIONS_S is genuinely-hittable
// time, not time eaten by the reveal animation — this is added on top
// before the auto-fail timeout fires.
const POP_TRANSITION_MS = 300;
// Taps are ignored for this long after a round starts peeking, so an
// accidental tap during the very first sliver of the reveal never counts.
const MIN_VISIBLE_DELAY_MS = 150;

// Safe position-jitter ranges (percent), keeping the uncle clear of the
// top ROUND/score labels and off the extreme screen edges.
const VERTICAL_JITTER_MIN = 30;
const VERTICAL_JITTER_MAX = 58;
const HORIZONTAL_JITTER_MIN = 30;
const HORIZONTAL_JITTER_MAX = 70;

type UncleInstance = {
  key: string;
  spot: UncleSpot;
  jitter: number;
  hit: boolean;
};

// Peeking always slides the box all the way to its natural anchored rest
// position (0%) rather than stopping partway — the character's own bbox
// sits close to one edge of the wide source photo, so a full slide-to-rest
// already reads as "peeking near the edge", not "walked fully into frame".
// Hidden slides exactly one full box-width/height off-screen in the
// opposite direction — and a `hit` uncle is treated as unrevealed too, so
// getting smashed slides him straight back off-screen (his own "disappear"
// exit) without needing separate exit-animation styling, even while the
// round continues for whoever else is still up.
function getSpotStyle(spot: UncleSpot, roundState: RoundState, jitter: number, hit: boolean): React.CSSProperties {
  const revealed = (roundState === "peeking" || roundState === "roundResult") && !hit;
  const transition = revealed
    ? "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)"
    : "transform 220ms ease-in";
  const t = (jitter + 1) / 2; // 0..1

  switch (spot) {
    case "left": {
      const top = VERTICAL_JITTER_MIN + t * (VERTICAL_JITTER_MAX - VERTICAL_JITTER_MIN);
      return { left: 0, top: `${top}%`, transform: `translate(${revealed ? 0 : -100}%, -50%)`, transition };
    }
    case "right": {
      const top = VERTICAL_JITTER_MIN + t * (VERTICAL_JITTER_MAX - VERTICAL_JITTER_MIN);
      return { right: 0, top: `${top}%`, transform: `translate(${revealed ? 0 : 100}%, -50%)`, transition };
    }
    case "bottom": {
      const left = HORIZONTAL_JITTER_MIN + t * (HORIZONTAL_JITTER_MAX - HORIZONTAL_JITTER_MIN);
      return { left: `${left}%`, bottom: "8%", transform: `translate(-50%, ${revealed ? 0 : 100}%)`, transition };
    }
  }
}

export function UncleGame() {
  const prevLeadSpotRef = useRef<UncleSpot | null>(null);
  const hitIdRef = useRef(0);
  const hammerTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [phase, setPhase] = useState<GamePhase>("ready");
  const [round, setRound] = useState(1);
  const [roundState, setRoundState] = useState<RoundState>("hidden");
  const [roundOutcome, setRoundOutcome] = useState<RoundOutcome>("success");
  const [uncles, setUncles] = useState<UncleInstance[]>([]);
  const [canTap, setCanTap] = useState(false);
  const [youScore, setYouScore] = useState(0);
  const [uncleScore, setUncleScore] = useState(0);
  const [hammerHits, setHammerHits] = useState<HitEffect[]>([]);

  // Clears any hammer-hit removal timers still pending on unmount.
  useEffect(() => {
    return () => {
      hammerTimersRef.current.forEach(clearTimeout);
      hammerTimersRef.current = [];
    };
  }, []);

  // READY -> STARTING -> PLAYING (round 1). Guarded so mashing START can't
  // double-start — handleStart only acts while phase === "ready", and once
  // it fires phase immediately leaves "ready" so a second click is a no-op.
  const handleStart = useCallback(() => {
    if (phase !== "ready") return;
    setPhase("starting");
  }, [phase]);

  useEffect(() => {
    if (phase !== "starting") return;
    const t = setTimeout(() => {
      prevLeadSpotRef.current = null;
      setRound(1);
      setYouScore(0);
      setUncleScore(0);
      setRoundState("hidden");
      setUncles([]);
      setHammerHits([]);
      setPhase("playing");
    }, STARTING_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // The round state machine — re-runs whenever phase, roundState or round
  // changes; each branch owns its own timer(s), always cleared on the way
  // out (covers both normal transitions and unmount).
  useEffect(() => {
    if (phase !== "playing") return;

    if (roundState === "hidden") {
      const count = ROUND_UNCLE_COUNTS[round - 1];
      const spots = pickSpotsForRound(count, prevLeadSpotRef.current);
      prevLeadSpotRef.current = spots[0];
      setUncles(
        spots.map((spot) => ({ key: `${round}-${spot}`, spot, jitter: randomPositionJitter(), hit: false }))
      );
      const t = setTimeout(() => setRoundState("peeking"), randomWaitMs());
      return () => clearTimeout(t);
    }

    if (roundState === "peeking") {
      setCanTap(false);
      const tapDelayT = setTimeout(() => setCanTap(true), MIN_VISIBLE_DELAY_MS);
      const durationMs = ROUND_PEEK_DURATIONS_S[round - 1] * 1000 + POP_TRANSITION_MS;
      const failT = setTimeout(() => {
        // Time ran out — whoever's still unhit counts as a miss, but any
        // uncles already smashed this round keep their earned YOU points
        // (youScore was incremented per-hit as it happened, not deferred
        // to round-end, so there's nothing to claw back here).
        setUncleScore((s) => s + 1);
        setRoundOutcome("fail");
        setRoundState("roundResult");
      }, durationMs);
      return () => {
        clearTimeout(tapDelayT);
        clearTimeout(failT);
      };
    }

    if (roundState === "roundResult") {
      const t = setTimeout(() => {
        if (round >= TOTAL_ROUNDS) {
          setPhase("finished");
        } else {
          setRound((r) => r + 1);
          setRoundState("hidden");
        }
      }, RESOLVE_DISPLAY_MS);
      return () => clearTimeout(t);
    }
  }, [phase, roundState, round]);

  const handlePlayAgain = useCallback(() => {
    setPhase("ready");
    setRoundState("hidden");
    setUncles([]);
    setHammerHits([]);
  }, []);

  // Each uncle is its own tap target (see Uncle.tsx, which owns the hit-area
  // geometry and calls this only on a genuine, guarded hit — no root-level
  // "tap anywhere" handler). Multiple hits per round are allowed (rounds
  // 5-8 have more than one uncle up at once): a hit only ever marks *that
  // uncle's* own `hit` flag, never resolves the round by itself unless
  // every uncle currently up has now been hit, in which case the round
  // finishes early ("PERFECT!") instead of waiting out the rest of the
  // timer. `uncles.find(...).hit` guards against double-counting the same
  // uncle from a rapid double-tap, same pattern the single-uncle version
  // used for its one-hit-per-round guard.
  const handleUncleHit = useCallback(
    (key: string, clientX: number, clientY: number) => {
      if (phase !== "playing" || roundState !== "peeking" || !canTap) return;
      const target = uncles.find((u) => u.key === key);
      if (!target || target.hit) return;

      const updated = uncles.map((u) => (u.key === key ? { ...u, hit: true } : u));
      setUncles(updated);
      setYouScore((s) => s + 1);

      hitIdRef.current += 1;
      const newHit: HitEffect = { x: clientX, y: clientY, id: hitIdRef.current };
      setHammerHits((prev) => [...prev, newHit]);
      const timer = setTimeout(() => {
        setHammerHits((prev) => prev.filter((h) => h.id !== newHit.id));
      }, HIT_DISPLAY_MS);
      hammerTimersRef.current.push(timer);

      if (updated.every((u) => u.hit)) {
        setRoundOutcome("success");
        setRoundState("roundResult");
      }
    },
    [phase, roundState, canTap, uncles]
  );

  const canHit = phase === "playing" && roundState === "peeking" && canTap;
  const compact = uncles.length > 1;
  const resultText = roundOutcome === "fail" ? "TOO SLOW!" : uncles.length > 1 ? "PERFECT!" : "HIT!";

  return (
    <div className="relative h-dvh w-full touch-none select-none overflow-hidden bg-gradient-to-b from-white via-[#faf9f7] to-[#f2f1ee]">
      {(phase === "playing" || phase === "starting") &&
        uncles.map((u) => (
          <Uncle
            key={u.key}
            spot={u.spot}
            hit={u.hit}
            canHit={canHit}
            compact={compact}
            onHit={(x, y) => handleUncleHit(u.key, x, y)}
            style={getSpotStyle(u.spot, roundState, u.jitter, u.hit)}
          />
        ))}

      {/* Round-result feedback is text-only, centered, brief — no uncle
          (or any other character) shown in the center, matching BABY
          PEEK's precedent and the "中央におじさんを新たに表示しない" rule
          for the PERFECT! case too. The HIT hammer/impact/ripple play at
          the actual tapped position(s) via Hammer.tsx below, not here. */}
      {phase === "playing" && roundState === "roundResult" && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
          <p className="text-sm font-semibold tracking-[0.3em] text-neutral-800 drop-shadow-sm">{resultText}</p>
        </div>
      )}

      {phase === "playing" && <Hammer hits={hammerHits} />}

      <UncleHud
        phase={phase}
        round={round}
        youScore={youScore}
        uncleScore={uncleScore}
        onStart={handleStart}
        onPlayAgain={handlePlayAgain}
      />
    </div>
  );
}
