"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameLoop } from "./useGameLoop";
import { clampLateral, clampRange, stepAltitude } from "./physics";
import {
  BACKGROUND_LAYERS,
  getCurrentZoneLabel,
  getLayerState,
  getZoneClimbSpeed,
  getZoneObstacleSpeed,
  getZoneParallax,
  getZoneSkyGradient,
  getZoneSpawnIntervalMs,
} from "./zones";
import {
  advanceObstacle,
  checkCollision,
  generatePattern,
  getDebrisProbability,
  getDifficultyTier,
  pickHazardKind,
  spawnObstacleInLane,
} from "./obstacleSpawner";
import type { ObstacleInstance, ObstacleKind } from "./obstacleTypes";
import { Sky } from "./Sky";
import { Skyline } from "./Skyline";
import { Clouds } from "./Clouds";
import { Stratosphere } from "./Stratosphere";
import { Space } from "./Space";
import { Baby, type BabyExpression } from "./Baby";
import { Obstacle } from "./Obstacle";
import { Hud } from "./Hud";

// How long the "happy" face holds after a catch before easing back to
// normal. A repeat catch within this window just restarts the timer from
// that moment ("happy表示時間をその時点から約450msにリセット") rather than
// stacking multiple timeouts.
const HAPPY_EXPRESSION_MS = 450;

const PX_PER_METER = 16;
// HUD text only needs to update a few times a second, not every frame —
// physics/visuals still run at full rAF rate via refs regardless.
const ALTITUDE_UPDATE_INTERVAL_FRAMES = 4;

// Baby sits at a fixed row on screen — the camera follows the baby, not
// the other way around, so the world (background + obstacles) does the
// moving. Fraction of viewport height from the top. Raised from 0.42 to
// 0.52 (画面中央すぎる印象の調整) — must stay in sync with Baby.tsx's own
// `top-[52%]` anchor, and must not be pushed further down than this: on a
// 1440x900 viewport the resting row already sits past
// ROOFTOP_SAFE_BOTTOM_RATIO's line at this value (downward 2D-move room is
// 0 there, per HUD_SAFE_TOP_PX/ROOFTOP_SAFE_BOTTOM_RATIO below, both left
// untouched), so this is as far down as it can go without the two moving.
const BABY_ROW_RATIO = 0.52;
// READY/STARTING keep the baby at the *old* row (before the 0.42->0.52
// move above) purely for display — at 0.52 the resting baby visually
// overlaps the READY screen's START button/GOAL text (both centered
// independently of BABY_ROW_RATIO). Applied as a one-off pixel offset when
// writing the transform in those two phases only (see below); collision,
// PLAYING's resting row, and everything else still use BABY_ROW_RATIO.
const BABY_READY_ROW_RATIO = 0.42;
// Baby's rendered box is `clamp(130px, 38vmin, 240px)` (see Baby.tsx) —
// mirrored here in JS so the lateral clamp/hitbox/obstacle lanes can be
// computed without a layout read every frame.
const BABY_ASPECT = 1230 / 1278;
const EDGE_MARGIN_PX = 10;
// Vertical play-area bounds — the baby's Y offset from BABY_ROW_RATIO is
// clamped between these, so it can roam up/down without ever entering the
// HUD text at the top or the rooftop concrete at the bottom. Top is a fixed
// px margin (the HUD's text block is a fixed size regardless of viewport);
// bottom is a fraction of viewport height (the rooftop wall's position in
// the cover-fit photo scales with viewport height). Tuned against actual
// 390x844 / 1440x900 screenshots, not derived from anything else.
const HUD_SAFE_TOP_PX = 190;
const ROOFTOP_SAFE_BOTTOM_RATIO = 0.62;
// Collision box is smaller than the full rendered image (which has
// transparent padding around the character), so hits feel fair.
const BABY_HITBOX_SCALE = 0.55;

const KEY_MOVE_SPEED_PX_PER_SEC = 320;
// The baby's *target* position updates instantly from input (no input
// lag); the rendered/collision position eases toward that target with this
// time constant so drags/flicks never look like a teleport. At 0.05s the
// position is ~95% of the way there within 3 frames — far below what reads
// as "laggy", just enough to smooth out jitter. Applied identically to both
// axes, so diagonal easing feels the same as axis-aligned easing.
const POSITION_SMOOTHING_TAU = 0.05;

const OBSTACLE_KIND: ObstacleKind = "milk-bottle";
const OBSTACLE_SPAWN_Y = -60;
const OBSTACLE_DESPAWN_MARGIN_PX = 90;
// Altitude-gated tutorial: see obstacleSpawner.ts's getDifficultyTier for
// the tier boundaries (tutorial < 50m, easy < 150m, building < 500m, then
// advanced) — zones.ts's obstacleSpeedPxPerSec/obstacleSpawnIntervalMs
// still drive "how fast/frequent", this only shapes "how many lanes at
// once and whether they stagger".

// Cosmetic-only "flight feel" tuning (read state, never drive it):
const BASE_CLIMB_TILT_DEG = -3;
const MAX_BANK_TILT_DEG = 6;
const BOB_PX = 4;
const BOB_HZ = 0.7;
const SWAY_PX = 3;
const SWAY_HZ = 0.3;
// Slow secondary waves that modulate the bob/sway *amplitude* over many
// seconds (different periods from each other so the two never lock into a
// single repeating combined shape) — a plain constant-period sine reads as
// a mechanical tic; breathing the amplitude in and out reads as floating in
// open air instead. Still purely cosmetic: only feeds --bob-y/--sway-x,
// never babyRowY/babyXRef, so catch judgment is untouched.
const BOB_MOD_HZ = 0.11;
const SWAY_MOD_HZ = 0.08;
// A small extra lift while steering hard, so chasing a milk bottle
// left/right also reads as being airborne rather than sliding on rails.
const STEER_LIFT_PX = 1.6;
const REFERENCE_MAX_CLIMB_PX_PER_SEC = 110 * PX_PER_METER; // space zone's climb speed

const BEST_ALTITUDE_KEY = "baby-jump:best-altitude-m";
const BEST_CATCH_KEY = "baby-jump:best-catch-count";
const GUIDE_VISIBLE_MS = 3000;

// --- Game phase state machine ---
// READY: page load / just after RETRY. Nothing progresses — altitude,
// obstacles, collision, the survival timer — all frozen; only a tiny idle
// float plays. STARTING: the ~0.9s takeoff flourish after pressing START,
// still frozen otherwise. PLAYING: today's full game, unchanged. GAME_OVER:
// unchanged (already existed as a boolean; now just one of the four).
export type GamePhase = "ready" | "starting" | "playing" | "gameOver" | "clear";

// One play = reaching this altitude. Lowered from 50000 to 13000 ("ゴール
//高度を50,000m→13,000mへ変更") purely to shorten a run — climbSpeed/
// SPEED_ZONES are untouched (see zones.ts), so this only changes *how far*
// the same unchanged climb has to go, not how fast it goes. 13000m lands
// mid-way through the stratosphere-upper zone (see zones.ts's WORLD_ZONES),
// well past the stratosphere/space crossfade's midpoint — a clear "way up
// there" ending — without requiring the full climb to space.
const GOAL_ALTITUDE_M = 13000;

// HP system: a Hazard hit no longer ends the run outright — it costs one
// HP (see the diaper icons in Hud.tsx via HpIndicator), and only HP === 0
// triggers GAME OVER. INVULNERABLE_DURATION_S is the grace window after a
// hit during which further Hazard overlaps are ignored outright (checked
// against survivalTimeRef, which itself only advances while "playing" —
// so this naturally pauses/resumes with the rest of the sim, no separate
// wall-clock timer needed). 0.8-1.0s asked for; 0.9s picked as the middle.
export const INITIAL_HP = 3;
const INVULNERABLE_DURATION_S = 0.9;
// How fast the baby blinks (opacity) while invulnerable — purely cosmetic,
// the actual collision immunity comes from INVULNERABLE_DURATION_S above.
const HIT_FLICKER_HZ = 6;
// Mirrors HAPPY_EXPRESSION_MS's pattern exactly (own timeout ref, own short
// window) for the brief "sad" flash on a survived hit — independent of the
// catch/happy timer so the two never have to coordinate.
const HIT_EXPRESSION_MS = 400;

// READY: a very small idle float — explicitly *not* the bigger in-flight
// bob (BOB_PX above), just enough to avoid looking pasted-on while waiting.
const READY_BOB_PX = 2;
const READY_BOB_HZ = 0.35;

// STARTING: a short, scripted "anticipation -> sink -> float up -> settle"
// curve, authored as three eased segments so it reaches exactly 0 (handing
// off cleanly to PLAYING's own bob) rather than an arbitrary sine phase.
// Reuses Baby.tsx's existing --bob-y/--speed-stretch vars — Baby.tsx itself
// needs no changes; Game just feeds it a different formula while starting.
const START_ANTICIPATION_S = 0.22;
const START_RISE_S = 0.38;
const START_SETTLE_S = 0.3;
const STARTING_DURATION_S = START_ANTICIPATION_S + START_RISE_S + START_SETTLE_S; // 0.9s
const START_SINK_PX = 7; // sinks down slightly first
const START_FLOAT_PX = 9; // then floats up past rest before settling
const START_SINK_STRETCH = -0.5; // slight squash while sinking
const START_FLOAT_STRETCH = 0.6; // slight stretch while floating up

function easeInOutCubic(p: number): number {
  const clamped = Math.min(Math.max(p, 0), 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function computeStartingLift(elapsedSeconds: number): { bobY: number; stretch: number } {
  if (elapsedSeconds < START_ANTICIPATION_S) {
    const p = easeInOutCubic(elapsedSeconds / START_ANTICIPATION_S);
    return { bobY: START_SINK_PX * p, stretch: START_SINK_STRETCH * p };
  }
  if (elapsedSeconds < START_ANTICIPATION_S + START_RISE_S) {
    const p = easeInOutCubic((elapsedSeconds - START_ANTICIPATION_S) / START_RISE_S);
    return {
      bobY: START_SINK_PX + (-START_FLOAT_PX - START_SINK_PX) * p,
      stretch: START_SINK_STRETCH + (START_FLOAT_STRETCH - START_SINK_STRETCH) * p,
    };
  }
  const p = easeInOutCubic(
    (elapsedSeconds - START_ANTICIPATION_S - START_RISE_S) / START_SETTLE_S,
  );
  return {
    bobY: -START_FLOAT_PX * (1 - p),
    stretch: START_FLOAT_STRETCH * (1 - p),
  };
}

// Shared by ready/starting (always the 0m Tokyo state) and playing (the
// current altitude) — factored out purely to avoid writing the same dozen
// CSS custom properties twice; the zones.ts calls and values are identical
// to what this file already computed inline before this change.
function applyWorldStyle(target: CSSStyleDeclaration, altitudeMeters: number): void {
  const skyGradient = getZoneSkyGradient(altitudeMeters);
  const tokyoLayer = getLayerState("tokyo", altitudeMeters);
  const cloudsLayer = getLayerState("clouds", altitudeMeters);
  const stratosphereLayer = getLayerState("stratosphere", altitudeMeters);
  const spaceLayer = getLayerState("space", altitudeMeters);
  target.setProperty("--sky-top", skyGradient.top);
  target.setProperty("--sky-bottom", skyGradient.bottom);
  target.setProperty("--zone-parallax", getZoneParallax(altitudeMeters).toFixed(4));
  target.setProperty("--tokyo-opacity", tokyoLayer.opacity.toFixed(4));
  target.setProperty("--tokyo-scale", tokyoLayer.zoom.toFixed(4));
  target.setProperty("--tokyo-sink", tokyoLayer.drift.toFixed(4));
  target.setProperty("--clouds-opacity", cloudsLayer.opacity.toFixed(4));
  target.setProperty("--clouds-zoom", cloudsLayer.zoom.toFixed(4));
  target.setProperty("--clouds-haze", cloudsLayer.haze.toFixed(4));
  target.setProperty("--stratosphere-opacity", stratosphereLayer.opacity.toFixed(4));
  target.setProperty("--stratosphere-zoom", stratosphereLayer.zoom.toFixed(4));
  target.setProperty("--space-opacity", spaceLayer.opacity.toFixed(4));
  target.setProperty("--space-zoom", spaceLayer.zoom.toFixed(4));
}

function readStoredBestAltitude(): number {
  if (typeof window === "undefined") return 0;
  try {
    const stored = Number(localStorage.getItem(BEST_ALTITUDE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

// Independent from best altitude — a separate localStorage key, a separate
// ref/state pair, updated on its own schedule (each catch, not each frame).
function readStoredBestCatch(): number {
  if (typeof window === "undefined") return 0;
  try {
    const stored = Number(localStorage.getItem(BEST_CATCH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

export function Game() {
  const rootRef = useRef<HTMLDivElement>(null);
  const babyMoverRef = useRef<HTMLDivElement>(null);
  const obstacleNodesRef = useRef<Map<number, HTMLDivElement>>(new Map());

  // --- Simulation state (refs — mutated every frame, never trigger a
  // re-render by themselves; see useGameLoop's doc comment). ---
  const altitudePxRef = useRef(0);
  // babyXRef/babyYRef are the real, rendered/collision position; the
  // babyTarget* refs are where input wants it to be *right now* (updates
  // with zero lag) — each frame both ease toward their target (see
  // POSITION_SMOOTHING_TAU). babyYRef is an *offset* from the default row
  // (viewportHeight * BABY_ROW_RATIO), not an absolute position — 0 means
  // "at the usual row", negative is up, positive is down.
  const babyXRef = useRef(0);
  const babyTargetXRef = useRef(0);
  const prevBabyXRef = useRef(0);
  const babyYRef = useRef(0);
  const babyTargetYRef = useRef(0);
  const prevBabyYRef = useRef(0);
  const clockRef = useRef(0); // ambient seconds, for the bob/sway sine waves
  const survivalTimeRef = useRef(0); // seconds since this run started — also the clock staggered obstacle spawns are scheduled against
  const spawnTimerMsRef = useRef(0);
  const obstaclesRef = useRef<ObstacleInstance[]>([]);
  const pendingSpawnsRef = useRef<
    Array<{ lane: number; atSeconds: number; speed: number; kind: ObstacleKind }>
  >([]);
  const lastOpenLaneRef = useRef(-1);
  const phaseRef = useRef<GamePhase>("ready");
  const startingElapsedRef = useRef(0);
  const bestAltitudeRef = useRef(0);
  const catchCountRef = useRef(0);
  const bestCatchRef = useRef(0);
  const catchFeedbackIdRef = useRef(0);
  const happyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // HP / invulnerability — see INITIAL_HP/INVULNERABLE_DURATION_S above.
  // invulnerableUntilRef is compared against survivalTimeRef (not wall-clock
  // time), so it automatically freezes/resumes with the rest of the sim.
  const hpRef = useRef(INITIAL_HP);
  const invulnerableUntilRef = useRef(0);
  const hitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dragRef = useRef({
    active: false,
    startClientX: 0,
    startClientY: 0,
    startBabyX: 0,
    startBabyY: 0,
  });
  const keyDirXRef = useRef(0);
  const keyDirYRef = useRef(0);

  const viewportWidthRef = useRef(390);
  const viewportHeightRef = useRef(800);
  const babyHalfWidthRef = useRef(65);
  const babyHalfHeightRef = useRef(63);
  const maxLateralAbsRef = useRef(100);
  // Vertical offset bounds (see HUD_SAFE_TOP_PX/ROOFTOP_SAFE_BOTTOM_RATIO) —
  // recomputed on resize alongside maxLateralAbsRef.
  const minBabyOffsetYRef = useRef(-90);
  const maxBabyOffsetYRef = useRef(90);

  // --- React state — only for things that actually need a re-render:
  // throttled HUD numbers, and structural obstacle add/remove. ---
  const [altitude, setAltitude] = useState(0);
  // 0 here (not a lazy localStorage read) is deliberate: localStorage is
  // browser-only, so SSR always renders 0. A lazy initializer would run
  // during the client's first render too and produce a different number
  // immediately, which is a hydration mismatch (confirmed via a real
  // reload — React logs it and re-renders the whole tree to recover). The
  // effect below hydrates the real value after mount instead, once SSR's
  // output has already been reconciled.
  const [bestAltitude, setBestAltitude] = useState(0);
  // Independent from bestAltitude — its own state, own localStorage key, own
  // hydration/sync effects below. The two scores are never derived from
  // each other.
  const [bestCatch, setBestCatch] = useState(0);
  const [catchCount, setCatchCount] = useState(0);
  const [hp, setHp] = useState(INITIAL_HP);
  const [catchFeedback, setCatchFeedback] = useState<Array<{ id: number; x: number }>>([]);
  const [expression, setExpression] = useState<BabyExpression>("normal");
  const [zoneLabel, setZoneLabel] = useState("東京");
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [showGuide, setShowGuide] = useState(true);
  const [obstacleViews, setObstacleViews] = useState<
    Array<{ id: number; kind: ObstacleKind; width: number; height: number; speed: number }>
  >([]);
  const frameRef = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of a browser-only value (localStorage), not an ongoing subscription; see comment on the state declaration above.
    setBestAltitude(readStoredBestAltitude());
    // Same one-time hydration, for the independent best-catch score — the
    // rule above only fires once per effect, so no second disable needed.
    setBestCatch(readStoredBestCatch());
  }, []);

  // Keeps bestAltitudeRef/bestCatchRef (read/written synchronously inside
  // the game loop) in sync with their state counterparts (which can also
  // change from the hydration effect above). Runs after render, not during it.
  useEffect(() => {
    bestAltitudeRef.current = Math.max(bestAltitudeRef.current, bestAltitude);
    bestCatchRef.current = Math.max(bestCatchRef.current, bestCatch);
  });

  // Viewport-derived sizing, recomputed on mount/resize — avoids a layout
  // read inside the game loop.
  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      viewportWidthRef.current = vw;
      viewportHeightRef.current = vh;
      const babyWidth = Math.min(240, Math.max(130, 0.38 * Math.min(vw, vh)));
      babyHalfWidthRef.current = babyWidth / 2;
      babyHalfHeightRef.current = (babyWidth * BABY_ASPECT) / 2;
      maxLateralAbsRef.current = Math.max(
        0,
        vw / 2 - babyHalfWidthRef.current - EDGE_MARGIN_PX,
      );
      babyXRef.current = clampLateral(babyXRef.current, maxLateralAbsRef.current);
      babyTargetXRef.current = clampLateral(babyTargetXRef.current, maxLateralAbsRef.current);

      const defaultRowY = vh * BABY_ROW_RATIO;
      const topBoundCenterY = HUD_SAFE_TOP_PX + babyHalfHeightRef.current;
      const bottomBoundCenterY = vh * ROOFTOP_SAFE_BOTTOM_RATIO - babyHalfHeightRef.current;
      // Guarded with min/max 0 so a default offset of 0 is always inside
      // the range, even on an unusually short viewport where the two
      // bounds would otherwise invert.
      minBabyOffsetYRef.current = Math.min(0, topBoundCenterY - defaultRowY);
      maxBabyOffsetYRef.current = Math.max(0, bottomBoundCenterY - defaultRowY);
      babyYRef.current = clampRange(
        babyYRef.current,
        minBabyOffsetYRef.current,
        maxBabyOffsetYRef.current,
      );
      babyTargetYRef.current = clampRange(
        babyTargetYRef.current,
        minBabyOffsetYRef.current,
        maxBabyOffsetYRef.current,
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Arrow keys + WASD move the baby continuously while held, on both axes
  // (ignored mid-drag so the two input methods don't fight). Diagonal input
  // is normalized where it's applied (see the playing loop) so holding two
  // keys at once isn't faster than holding one.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keyDirXRef.current = -1;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keyDirXRef.current = 1;
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") keyDirYRef.current = -1;
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") keyDirYRef.current = 1;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if ((e.key === "ArrowLeft" || e.key === "a" || e.key === "A") && keyDirXRef.current === -1)
        keyDirXRef.current = 0;
      else if (
        (e.key === "ArrowRight" || e.key === "d" || e.key === "D") &&
        keyDirXRef.current === 1
      )
        keyDirXRef.current = 0;
      else if ((e.key === "ArrowUp" || e.key === "w" || e.key === "W") && keyDirYRef.current === -1)
        keyDirYRef.current = 0;
      else if (
        (e.key === "ArrowDown" || e.key === "s" || e.key === "S") &&
        keyDirYRef.current === 1
      )
        keyDirYRef.current = 0;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const guideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Schedules the guide to hide after GUIDE_VISIBLE_MS. Called from event
  // handlers (retry) where it also flips showGuide back to true; the
  // mount effect below just needs the initial hide scheduled — showGuide
  // already starts `true`, so no setState call belongs in that effect body.
  const armGuideHide = useCallback(() => {
    if (guideTimeoutRef.current) clearTimeout(guideTimeoutRef.current);
    guideTimeoutRef.current = setTimeout(() => setShowGuide(false), GUIDE_VISIBLE_MS);
  }, []);
  useEffect(() => {
    armGuideHide();
    return () => {
      if (guideTimeoutRef.current) clearTimeout(guideTimeoutRef.current);
    };
  }, [armGuideHide]);

  // GAME_OVER -> RETRY lands back in READY (not straight into PLAYING) —
  // the player presses START again to begin the next run.
  const resetGame = useCallback(() => {
    altitudePxRef.current = 0;
    babyXRef.current = 0;
    babyTargetXRef.current = 0;
    prevBabyXRef.current = 0;
    babyYRef.current = 0;
    babyTargetYRef.current = 0;
    prevBabyYRef.current = 0;
    clockRef.current = 0;
    survivalTimeRef.current = 0;
    startingElapsedRef.current = 0;
    spawnTimerMsRef.current = 0;
    obstaclesRef.current = [];
    pendingSpawnsRef.current = [];
    lastOpenLaneRef.current = -1;
    obstacleNodesRef.current.clear();
    phaseRef.current = "ready";
    catchCountRef.current = 0;
    // bestCatchRef/bestCatch deliberately NOT reset here — same as
    // bestAltitude, a best score persists across runs.
    setCatchCount(0);
    setCatchFeedback([]);
    if (happyTimeoutRef.current) {
      clearTimeout(happyTimeoutRef.current);
      happyTimeoutRef.current = null;
    }
    if (hitTimeoutRef.current) {
      clearTimeout(hitTimeoutRef.current);
      hitTimeoutRef.current = null;
    }
    hpRef.current = INITIAL_HP;
    setHp(INITIAL_HP);
    invulnerableUntilRef.current = 0;
    if (babyMoverRef.current) {
      babyMoverRef.current.style.opacity = "1";
    }
    setExpression("normal");
    setObstacleViews([]);
    setAltitude(0);
    setZoneLabel("東京");
    setPhase("ready");
    setShowGuide(true);
    armGuideHide();
  }, [armGuideHide]);

  // READY -> STARTING. Guarded against double-firing (mashing START) since
  // it only does anything when still in READY.
  const handleStart = useCallback(() => {
    if (phaseRef.current !== "ready") return;
    startingElapsedRef.current = 0;
    phaseRef.current = "starting";
    setPhase("starting");
  }, []);

  useGameLoop((dt) => {
    clockRef.current += dt; // ambient clock for idle/flight bob+sway — always advances

    if (phaseRef.current === "gameOver" || phaseRef.current === "clear") return;

    if (phaseRef.current === "ready") {
      // Nothing progresses — altitude/obstacles/collision/timers all stay
      // frozen at whatever resetGame last set them to. Only a tiny idle
      // float plays, via the same CSS vars the normal flight-feel uses;
      // Baby.tsx doesn't need to know which phase produced them.
      if (babyMoverRef.current) {
        const readyRowOffsetPx =
          viewportHeightRef.current * (BABY_READY_ROW_RATIO - BABY_ROW_RATIO);
        babyMoverRef.current.style.transform = `translate(${babyXRef.current}px, ${babyYRef.current + readyRowOffsetPx}px)`;
      }
      if (rootRef.current) {
        const style = rootRef.current.style;
        applyWorldStyle(style, 0);
        style.setProperty("--steer-norm", "0");
        style.setProperty("--tilt-deg", "0");
        style.setProperty("--sway-x", "0");
        style.setProperty(
          "--bob-y",
          (READY_BOB_PX * Math.sin(clockRef.current * READY_BOB_HZ * Math.PI * 2)).toFixed(4),
        );
        style.setProperty("--speed-stretch", "0");
      }
      return;
    }

    if (phaseRef.current === "starting") {
      // Same idea: a scripted lift curve feeds the same vars, still with
      // altitude/obstacles/collision frozen. No normal flight tilt/sway.
      startingElapsedRef.current += dt;
      if (babyMoverRef.current) {
        // Eases from the full READY-row offset down to exactly 0 over the
        // same duration as the lift curve below, so the handoff into
        // PLAYING (which writes translate(x, y) with no offset at all) is
        // seamless instead of snapping the ~84-90px difference in one frame.
        const rowOffsetProgress =
          1 - easeInOutCubic(startingElapsedRef.current / STARTING_DURATION_S);
        const readyRowOffsetPx =
          viewportHeightRef.current * (BABY_READY_ROW_RATIO - BABY_ROW_RATIO) * rowOffsetProgress;
        babyMoverRef.current.style.transform = `translate(${babyXRef.current}px, ${babyYRef.current + readyRowOffsetPx}px)`;
      }
      const { bobY, stretch } = computeStartingLift(startingElapsedRef.current);
      if (rootRef.current) {
        const style = rootRef.current.style;
        applyWorldStyle(style, 0);
        style.setProperty("--steer-norm", "0");
        style.setProperty("--tilt-deg", "0");
        style.setProperty("--sway-x", "0");
        style.setProperty("--bob-y", bobY.toFixed(4));
        style.setProperty("--speed-stretch", stretch.toFixed(4));
      }
      if (startingElapsedRef.current >= STARTING_DURATION_S) {
        phaseRef.current = "playing";
        setPhase("playing");
      }
      return;
    }

    // phaseRef.current === "playing" from here on — the full existing game,
    // unchanged. (clockRef already advanced at the top of this callback.)

    survivalTimeRef.current += dt;

    // 1. Altitude — climbs on its own, rate is zone-driven.
    const altitudeMetersBefore = altitudePxRef.current / PX_PER_METER;
    const climbSpeedPxPerSec = getZoneClimbSpeed(altitudeMetersBefore) * PX_PER_METER;
    altitudePxRef.current = stepAltitude(altitudePxRef.current, dt, climbSpeedPxPerSec);
    const altitudeMeters = altitudePxRef.current / PX_PER_METER;

    // Goal reached — freeze everything right here, before this frame does
    // any spawn/move/catch work. The only other way a run ends is HP
    // reaching 0 from Hazard hits (see hazardHitThisFrame below) — no time
    // limit, no miss counter.
    if (altitudeMeters >= GOAL_ALTITUDE_M) {
      altitudePxRef.current = GOAL_ALTITUDE_M * PX_PER_METER;
      if (babyMoverRef.current) {
        babyMoverRef.current.style.transform = `translate(${babyXRef.current}px, ${babyYRef.current}px)`;
        // In case the goal was reached mid-blink of a hit's invulnerability
        // window — CLEAR should always show the baby fully visible.
        babyMoverRef.current.style.opacity = "1";
      }
      if (rootRef.current) {
        applyWorldStyle(rootRef.current.style, GOAL_ALTITUDE_M);
      }
      phaseRef.current = "clear";
      if (GOAL_ALTITUDE_M > bestAltitudeRef.current) {
        bestAltitudeRef.current = GOAL_ALTITUDE_M;
        setBestAltitude(GOAL_ALTITUDE_M);
        try {
          localStorage.setItem(BEST_ALTITUDE_KEY, String(GOAL_ALTITUDE_M));
        } catch {
          // ignore — best just won't persist this session
        }
      }
      setAltitude(GOAL_ALTITUDE_M);
      setZoneLabel(getCurrentZoneLabel(GOAL_ALTITUDE_M));
      setPhase("clear");
      // CLEAR always shows the normal face, even if a catch's happy timer
      // (or a hit's sad flash) was still running the instant the goal was
      // reached.
      if (happyTimeoutRef.current) {
        clearTimeout(happyTimeoutRef.current);
        happyTimeoutRef.current = null;
      }
      if (hitTimeoutRef.current) {
        clearTimeout(hitTimeoutRef.current);
        hitTimeoutRef.current = null;
      }
      setExpression("normal");
      return;
    }

    // 2. Baby: 2D input + position + purely-cosmetic flight feel. Target
    // updates immediately (no input lag); the rendered/collision position
    // eases toward it (see POSITION_SMOOTHING_TAU) so it never looks like a
    // warp — drag and keyboard both feed the same target, on both axes.
    if (!dragRef.current.active && (keyDirXRef.current !== 0 || keyDirYRef.current !== 0)) {
      // Normalize so a diagonal (both keys held) isn't faster than a
      // single axis — "斜め移動時に速度が速くなりすぎないよう正規化".
      const keyLen = Math.hypot(keyDirXRef.current, keyDirYRef.current);
      const nx = keyDirXRef.current / keyLen;
      const ny = keyDirYRef.current / keyLen;
      babyTargetXRef.current = clampLateral(
        babyTargetXRef.current + nx * KEY_MOVE_SPEED_PX_PER_SEC * dt,
        maxLateralAbsRef.current,
      );
      babyTargetYRef.current = clampRange(
        babyTargetYRef.current + ny * KEY_MOVE_SPEED_PX_PER_SEC * dt,
        minBabyOffsetYRef.current,
        maxBabyOffsetYRef.current,
      );
    }
    const smoothing = 1 - Math.exp(-dt / POSITION_SMOOTHING_TAU);
    babyXRef.current += (babyTargetXRef.current - babyXRef.current) * smoothing;
    babyYRef.current += (babyTargetYRef.current - babyYRef.current) * smoothing;
    if (babyMoverRef.current) {
      babyMoverRef.current.style.transform = `translate(${babyXRef.current}px, ${babyYRef.current}px)`;
    }
    const steerNorm =
      maxLateralAbsRef.current > 0 ? babyXRef.current / maxLateralAbsRef.current : 0;
    const lateralVelocity = dt > 0 ? (babyXRef.current - prevBabyXRef.current) / dt : 0;
    const verticalVelocity = dt > 0 ? (babyYRef.current - prevBabyYRef.current) / dt : 0;
    prevBabyXRef.current = babyXRef.current;
    prevBabyYRef.current = babyYRef.current;
    // Banking (roll) still reads off lateral velocity only — a plane-style
    // lean into a left/right turn. Vertical movement's own visual signature
    // comes through the *actual* position change plus the stretch/lift
    // below, not a second tilt axis (Baby.tsx only has one rotate axis).
    const bankTilt =
      Math.max(-1, Math.min(1, lateralVelocity / 700)) * MAX_BANK_TILT_DEG;
    const movementSpeedPxPerSec = Math.hypot(lateralVelocity, verticalVelocity);
    const climbStretch = Math.min(climbSpeedPxPerSec / REFERENCE_MAX_CLIMB_PX_PER_SEC, 1);
    // Moving fast in *any* direction now also reaches for the existing
    // climb-speed stretch look ("高速移動時には既存のstretch感を活用") —
    // take whichever cause is more prominent right now rather than adding
    // them, so it never over-stretches beyond what climbing alone already did.
    const speedStretch = Math.max(climbStretch, Math.min(movementSpeedPxPerSec / 900, 1) * 0.8);
    // Base lean grows a little with how fast the current zone climbs, on
    // top of the steering bank — "速度に応じたわずかな傾き".
    const climbTilt = BASE_CLIMB_TILT_DEG * (0.6 + 0.4 * speedStretch);
    const tiltDeg = climbTilt + bankTilt;
    // Amplitude breathes slowly in/out (bobModulation/swayModulation) and
    // the bob speeds up a touch with climb speed, so the motion never
    // repeats identically — see the constants' comment above for why.
    const bobModulation = 0.65 + 0.35 * Math.sin(clockRef.current * BOB_MOD_HZ * Math.PI * 2);
    const bobHz = BOB_HZ * (1 + speedStretch * 0.25);
    // steerLift now reacts to movement on either axis, not lateral alone —
    // "上下左右の移動に自然な視覚的反応".
    const steerLift = -Math.min(movementSpeedPxPerSec / 700, 1) * STEER_LIFT_PX;
    const bobY =
      Math.sin(clockRef.current * bobHz * Math.PI * 2) * BOB_PX * bobModulation + steerLift;
    const swayModulation =
      0.6 + 0.4 * Math.sin(clockRef.current * SWAY_MOD_HZ * Math.PI * 2 + 1.7);
    const swayX = Math.sin(clockRef.current * SWAY_HZ * Math.PI * 2) * SWAY_PX * swayModulation;

    // 3. Obstacles — spawn. Tutorial gate + pattern shape are altitude-tier
    // driven (see obstacleSpawner.ts); "how fast/frequent" still comes from
    // zones.ts, unchanged.
    spawnTimerMsRef.current -= dt * 1000;
    if (spawnTimerMsRef.current <= 0) {
      const tier = getDifficultyTier(altitudeMeters);
      const speed = getZoneObstacleSpeed(altitudeMeters);
      const { specs, openLane } = generatePattern(
        tier,
        obstaclesRef.current,
        maxLateralAbsRef.current,
        lastOpenLaneRef.current,
      );
      if (specs.length > 0) {
        lastOpenLaneRef.current = openLane;
        // Each filled lane independently rolls catchable vs hazard (see
        // getDebrisProbability) — the lane/timing pattern above is exactly
        // the same one the milk bottle always used, untouched. Capped at
        // one hazard per spawn cycle so a 2-lane fill can never roll both
        // hazards at once, per the brief's "普通に2,500mまで行ける" goal.
        const debrisChance = getDebrisProbability(altitudeMeters);
        let hazardAssignedThisCycle = false;
        for (const spec of specs) {
          let kind: ObstacleKind = OBSTACLE_KIND;
          if (!hazardAssignedThisCycle && Math.random() < debrisChance) {
            kind = pickHazardKind();
            hazardAssignedThisCycle = true;
          }
          pendingSpawnsRef.current.push({
            lane: spec.lane,
            atSeconds: survivalTimeRef.current + spec.delayMs / 1000,
            speed,
            kind,
          });
        }
      }
      const baseInterval = getZoneSpawnIntervalMs(altitudeMeters);
      spawnTimerMsRef.current = baseInterval * (0.7 + Math.random() * 0.6);
    }
    if (pendingSpawnsRef.current.length > 0) {
      const ready = pendingSpawnsRef.current.filter(
        (p) => p.atSeconds <= survivalTimeRef.current,
      );
      if (ready.length > 0) {
        pendingSpawnsRef.current = pendingSpawnsRef.current.filter(
          (p) => p.atSeconds > survivalTimeRef.current,
        );
        const spawnedNow = ready.map((p) =>
          spawnObstacleInLane(
            p.kind,
            p.lane,
            maxLateralAbsRef.current,
            OBSTACLE_SPAWN_Y,
            p.speed,
          ),
        );
        obstaclesRef.current = [...obstaclesRef.current, ...spawnedNow];
        setObstacleViews((views) => [
          ...views,
          ...spawnedNow.map((o) => ({
            id: o.id,
            kind: o.kind,
            width: o.width,
            height: o.height,
            speed: o.speed,
          })),
        ]);
      }
    }

    // 4. Items — move, catch/hazard-check, despawn. babyRowY now follows the
    // baby's actual vertical offset (babyYRef) instead of a fixed row, so
    // catching works on both axes — checkCollision/rectsOverlap themselves
    // are untouched, only the Y value fed into them now varies.
    const babyRowY = viewportHeightRef.current * BABY_ROW_RATIO + babyYRef.current;
    const babyHitboxWidth = babyHalfWidthRef.current * 2 * BABY_HITBOX_SCALE;
    const babyHitboxHeight = babyHalfHeightRef.current * 2 * BABY_HITBOX_SCALE;
    // Hazard hits are checked here but their HP consequence is applied in
    // Section 6 below, after this frame's background/visuals are already
    // rendered — the same ordering the old one-hit-kill code used, so the
    // final frame of a run still reflects the moment of impact. While
    // invulnerable (see INVULNERABLE_DURATION_S above), a Hazard overlap is
    // ignored outright — it's neither a hit nor removed, so it can still
    // register normally once the window ends if it's still overlapping.
    const wasInvulnerable = survivalTimeRef.current < invulnerableUntilRef.current;
    const caughtIds = new Set<number>();
    const hazardHitIds = new Set<number>();
    const moved = obstaclesRef.current.map((o) => advanceObstacle(o, dt));
    for (const o of moved) {
      const node = obstacleNodesRef.current.get(o.id);
      if (node) {
        const screenX = viewportWidthRef.current / 2 + o.x - o.width / 2;
        node.style.transform = `translate(${screenX}px, ${o.y}px)`;
      }
      if (checkCollision(babyXRef.current, babyRowY, babyHitboxWidth, babyHitboxHeight, o)) {
        if (o.category === "catchable") {
          caughtIds.add(o.id);
        } else if (!wasInvulnerable) {
          hazardHitIds.add(o.id);
        }
      }
    }
    // A hit consumes every Hazard that landed it this frame (removed below,
    // same as a catch) and costs exactly one HP no matter how many Hazards
    // happened to overlap in the same frame — "1回の衝突でHPが複数減らない"
    // applies across simultaneous Hazards too, not just repeated frames.
    const hazardHitThisFrame = hazardHitIds.size > 0;
    if (hazardHitThisFrame) {
      hpRef.current = Math.max(0, hpRef.current - 1);
      setHp(hpRef.current);
      invulnerableUntilRef.current = survivalTimeRef.current + INVULNERABLE_DURATION_S;
      if (hpRef.current > 0) {
        // Survived — brief "sad" flash then back to normal, mirroring the
        // catch/happy timer exactly (its own independent timeout ref) so
        // the two never have to coordinate; whichever fires later wins,
        // same as today.
        setExpression("sad");
        if (hitTimeoutRef.current) clearTimeout(hitTimeoutRef.current);
        hitTimeoutRef.current = setTimeout(() => {
          setExpression("normal");
          hitTimeoutRef.current = null;
        }, HIT_EXPRESSION_MS);
      }
    }
    if (caughtIds.size > 0) {
      catchCountRef.current += caughtIds.size;
      setCatchCount(catchCountRef.current);
      if (catchCountRef.current > bestCatchRef.current) {
        bestCatchRef.current = catchCountRef.current;
        setBestCatch(catchCountRef.current);
        try {
          localStorage.setItem(BEST_CATCH_KEY, String(catchCountRef.current));
        } catch {
          // ignore — best just won't persist this session
        }
      }
      // "GET" feedback near the baby's current lateral position — one entry
      // per catch, self-removing via onAnimationEnd (see the JSX below), so
      // this is a discrete state add per catch event, never a per-frame update.
      const feedbackX = babyXRef.current;
      setCatchFeedback((list) => [
        ...list,
        ...Array.from(caughtIds, () => ({ id: catchFeedbackIdRef.current++, x: feedbackX })),
      ]);
      // Happy face for a beat, then back to normal — a repeat catch just
      // restarts the same 450ms window from now rather than stacking timers.
      setExpression("happy");
      if (happyTimeoutRef.current) clearTimeout(happyTimeoutRef.current);
      happyTimeoutRef.current = setTimeout(() => {
        setExpression("normal");
        happyTimeoutRef.current = null;
      }, HAPPY_EXPRESSION_MS);
    }
    // Uncaught items simply despawn off-screen — no miss counter, no
    // game-over from a miss (per the brief: "取り逃し = 何も起こらない").
    const despawnY = babyRowY + babyHalfHeightRef.current * 2 + OBSTACLE_DESPAWN_MARGIN_PX;
    const survivors = moved.filter(
      (o) => o.y < despawnY && !caughtIds.has(o.id) && !hazardHitIds.has(o.id),
    );
    if (survivors.length !== moved.length) {
      const survivingIds = new Set(survivors.map((o) => o.id));
      for (const id of obstacleNodesRef.current.keys()) {
        if (!survivingIds.has(id)) obstacleNodesRef.current.delete(id);
      }
      setObstacleViews((views) => views.filter((v) => survivingIds.has(v.id)));
    }
    obstaclesRef.current = survivors;

    // 5. Background / zone — same data-driven layers as before, now
    // sourced from the auto-climbing altitude instead of jump physics.
    if (rootRef.current) {
      const style = rootRef.current.style;
      applyWorldStyle(style, altitudeMeters);
      style.setProperty("--steer-norm", steerNorm.toFixed(4));
      style.setProperty("--tilt-deg", tiltDeg.toFixed(4));
      style.setProperty("--bob-y", bobY.toFixed(4));
      style.setProperty("--sway-x", swayX.toFixed(4));
      style.setProperty("--speed-stretch", speedStretch.toFixed(4));
    }
    // Blink while invulnerable (reads this frame's own just-updated window,
    // so the blink starts on the very hit frame, not one frame late) — a
    // deliberately restrained flicker, not an explosion/screen-shake, per
    // the brief's "ミニマルで映画的な雰囲気を維持".
    if (babyMoverRef.current) {
      const stillInvulnerable = survivalTimeRef.current < invulnerableUntilRef.current;
      babyMoverRef.current.style.opacity = stillInvulnerable
        ? (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clockRef.current * HIT_FLICKER_HZ * Math.PI * 2))).toFixed(3)
        : "1";
    }

    // 6. Hazard hit → HP -1, GAME OVER only once HP reaches 0 (checked
    // after this frame's visuals are already applied, so the final frame
    // reflects the moment of impact).
    if (hazardHitThisFrame && hpRef.current <= 0) {
      phaseRef.current = "gameOver";
      const meters = Math.round(altitudeMeters);
      if (meters > bestAltitudeRef.current) {
        bestAltitudeRef.current = meters;
        setBestAltitude(meters);
        try {
          localStorage.setItem(BEST_ALTITUDE_KEY, String(meters));
        } catch {
          // ignore — best just won't persist this session
        }
      }
      setAltitude(meters);
      setZoneLabel(getCurrentZoneLabel(altitudeMeters));
      setPhase("gameOver");
      if (happyTimeoutRef.current) {
        clearTimeout(happyTimeoutRef.current);
        happyTimeoutRef.current = null;
      }
      if (hitTimeoutRef.current) {
        clearTimeout(hitTimeoutRef.current);
        hitTimeoutRef.current = null;
      }
      setExpression("sad");
      return;
    }

    // 7. HUD — throttled, not every frame.
    frameRef.current += 1;
    if (frameRef.current % ALTITUDE_UPDATE_INTERVAL_FRAMES === 0) {
      const meters = Math.round(altitudeMeters);
      setAltitude(meters);
      setZoneLabel(getCurrentZoneLabel(altitudeMeters));
      if (meters > bestAltitudeRef.current) {
        bestAltitudeRef.current = meters;
        setBestAltitude(meters);
        try {
          localStorage.setItem(BEST_ALTITUDE_KEY, String(meters));
        } catch {
          // ignore
        }
      }
    }
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    // Drag/click only steers during PLAYING — disabled in READY/STARTING
    // (nothing to steer yet) and GAME_OVER (frozen; the RETRY button has
    // its own pointerdown handler and stops this from firing anyway).
    if (phaseRef.current !== "playing") return;
    dragRef.current = {
      active: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBabyX: babyTargetXRef.current,
      startBabyY: babyTargetYRef.current,
    };
    if (showGuide) setShowGuide(false);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startClientX;
    const dy = e.clientY - dragRef.current.startClientY;
    babyTargetXRef.current = clampLateral(
      dragRef.current.startBabyX + dx,
      maxLateralAbsRef.current,
    );
    babyTargetYRef.current = clampRange(
      dragRef.current.startBabyY + dy,
      minBabyOffsetYRef.current,
      maxBabyOffsetYRef.current,
    );
  };
  const handlePointerEnd = () => {
    dragRef.current.active = false;
  };

  return (
    <div
      ref={rootRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      className="relative h-dvh w-full touch-none select-none overflow-hidden"
    >
      <Sky />
      <Skyline
        imageSrc={BACKGROUND_LAYERS.tokyo.image}
        objectPosition={BACKGROUND_LAYERS.tokyo.objectPosition}
      />
      <Clouds imageSrc={BACKGROUND_LAYERS.clouds.image} />
      <Stratosphere
        imageSrc={BACKGROUND_LAYERS.stratosphere.image}
        objectPosition={BACKGROUND_LAYERS.stratosphere.objectPosition}
      />
      <Space
        imageSrc={BACKGROUND_LAYERS.space.image}
        objectPosition={BACKGROUND_LAYERS.space.objectPosition}
      />
      <Baby ref={babyMoverRef} expression={expression} />
      {catchFeedback.map((f) => (
        <div
          key={f.id}
          className="pointer-events-none absolute left-1/2 top-[52%] z-30"
          style={{ transform: `translate(calc(-50% + ${f.x}px), -70%)` }}
          aria-hidden
        >
          <span
            className="catch-pop block text-lg font-bold tracking-wide text-white drop-shadow-md"
            onAnimationEnd={() =>
              setCatchFeedback((list) => list.filter((item) => item.id !== f.id))
            }
          >
            +1
          </span>
        </div>
      ))}
      {obstacleViews.map((view) => (
        <Obstacle
          key={view.id}
          id={view.id}
          kind={view.kind}
          width={view.width}
          height={view.height}
          speed={view.speed}
          ref={(node) => {
            if (node) obstacleNodesRef.current.set(view.id, node);
            else obstacleNodesRef.current.delete(view.id);
          }}
        />
      ))}
      <Hud
        phase={phase}
        altitude={altitude}
        bestAltitude={bestAltitude}
        catchCount={catchCount}
        bestCatch={bestCatch}
        goalAltitude={GOAL_ALTITUDE_M}
        zoneLabel={zoneLabel}
        showGuide={showGuide}
        hp={hp}
        onStart={handleStart}
        onRetry={resetGame}
      />
    </div>
  );
}
