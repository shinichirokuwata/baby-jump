// Pure spawn/movement/collision logic for obstacles — kept separate from
// Game.tsx's per-frame orchestration so the "how obstacles behave" rules
// are easy to find and adjust independently of the game loop wiring.
import { rectsOverlap } from "./physics";
import {
  OBSTACLE_CATEGORY,
  OBSTACLE_VISUALS,
  type ObstacleInstance,
  type ObstacleKind,
} from "./obstacleTypes";

const LANE_COUNT = 3;

let nextObstacleId = 1;

// Altitude-driven difficulty tiers for *pattern shape* (how many lanes get
// filled at once, whether spawns stagger) — separate from the zone-driven
// obstacleSpeedPxPerSec/obstacleSpawnIntervalMs in zones.ts, which still
// drive how fast/frequent obstacles are. Together: zones.ts answers "how
// fast", this answers "how many at once and how they're arranged".
export type DifficultyTier = "tutorial" | "easy" | "building" | "advanced";

export function getDifficultyTier(altitudeMeters: number): DifficultyTier {
  if (altitudeMeters < 50) return "tutorial";
  if (altitudeMeters < 150) return "easy";
  if (altitudeMeters < 500) return "building";
  return "advanced";
}

export type PatternSpec = { lane: number; delayMs: number };

// How likely a given filled lane (from generatePattern below) is a hazard
// (space-debris) rather than a catchable (milk-bottle), by altitude.
// Deliberately separate from getDifficultyTier — that decides *how many*
// lanes fill and *when*; this only decides, independently, what kind ends
// up in a lane that was already going to be filled. 0 below 500m so the
// early game stays exactly as it was before hazards existed; ramps gently
// through 2500m so a player who dodges carefully can reliably keep going
// (see the brief: "ちゃんと避ければ普通に2,500mまで行ける"). Left flat at
// 0.35 for every altitude beyond that on purpose — GOAL_ALTITUDE_M later
// moved from 2500 to 50000 (see Game.tsx), but this rate was intentionally
// *not* re-tuned for the extended climb: obstacle fall speed/spawn interval
// already keep scaling with altitude (see zones.ts's WORLD_ZONES), so the
// hazard-vs-catchable mix staying constant just means "the risk per
// encounter stops growing, encounters alone keep getting faster/more
// frequent" — a deliberate choice, not an oversight, unless real play
// through to 50000m shows it needs revisiting.
function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  const t = Math.min(Math.max((x - x0) / (x1 - x0), 0), 1);
  return y0 + (y1 - y0) * t;
}

export function getDebrisProbability(altitudeMeters: number): number {
  if (altitudeMeters < 500) return 0;
  if (altitudeMeters < 1000) return lerp(altitudeMeters, 500, 1000, 0, 0.12);
  if (altitudeMeters < 2000) return lerp(altitudeMeters, 1000, 2000, 0.12, 0.25);
  if (altitudeMeters < 2500) return lerp(altitudeMeters, 2000, 2500, 0.25, 0.35);
  return 0.35;
}

// Which hazard *kind* fills a slot that getDebrisProbability above already
// decided should be a hazard — a completely separate question from *how
// often* hazards appear. Uniform across the three so no one kind dominates.
const HAZARD_KINDS: ReadonlyArray<ObstacleKind> = [
  "space-debris",
  "solar-panel-debris",
  "thermal-foil-debris",
];

export function pickHazardKind(): ObstacleKind {
  return HAZARD_KINDS[Math.floor(Math.random() * HAZARD_KINDS.length)];
}

/**
 * Decides which lanes get an item on this spawn cycle. Originally written
 * for a dodge game, where always leaving one lane open guaranteed an escape
 * route — that danger no longer exists now that lanes carry catchables, but
 * the same rule doubles as a *readability* guarantee: it caps how many
 * items can be on screen at once (never all 3 lanes) so it's always clear
 * which one to chase next, which is exactly what the catch game wants too.
 * Checked against *actual* currently-alive items (not just "what we spawned
 * last time"), so it holds regardless of pattern history. Variety is a
 * secondary preference layered on top — the open lane prefers to differ
 * from `lastOpenLane` so the same gap position doesn't repeat back to back.
 * The player's own lateral movement is never lane-constrained — only where
 * items originate is.
 */
export function generatePattern(
  tier: DifficultyTier,
  existing: ReadonlyArray<ObstacleInstance>,
  playableHalfWidth: number,
  lastOpenLane: number,
): { specs: PatternSpec[]; openLane: number } {
  if (tier === "tutorial") return { specs: [], openLane: lastOpenLane };

  const laneWidth = (playableHalfWidth * 2) / LANE_COUNT;
  const occupiedLanes = new Set(
    existing.map((o) => Math.floor((o.x + playableHalfWidth) / laneWidth)),
  );
  const availableLanes: number[] = [];
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    if (!occupiedLanes.has(lane)) availableLanes.push(lane);
  }
  // Nothing safe to add right now (rare — only if existing obstacles
  // already occupy 2+ lanes) — skip this cycle rather than risk a wall.
  if (availableLanes.length === 0) return { specs: [], openLane: lastOpenLane };

  let fillCount: number;
  if (tier === "easy") fillCount = 1;
  else if (tier === "building") fillCount = 2;
  else fillCount = Math.random() < 0.7 ? 2 : 1; // advanced: mostly 2, sometimes 1 for rhythm variety

  // Always keep at least one lane open among the currently-available ones.
  fillCount = Math.min(fillCount, availableLanes.length - 1);
  if (fillCount <= 0) return { specs: [], openLane: lastOpenLane };

  const preferredOpen = availableLanes.filter((lane) => lane !== lastOpenLane);
  const openPool = preferredOpen.length > 0 ? preferredOpen : availableLanes;
  const openLane = openPool[Math.floor(Math.random() * openPool.length)];

  const fillable = availableLanes.filter((lane) => lane !== openLane);
  const shuffled = [...fillable].sort(() => Math.random() - 0.5).slice(0, fillCount);

  // advanced tier: occasionally stagger the second obstacle by a beat so
  // paired obstacles don't always fall in lockstep.
  const stagger = tier === "advanced" && shuffled.length > 1 && Math.random() < 0.5;
  const specs = shuffled.map((lane, i) => ({
    lane,
    delayMs: stagger && i > 0 ? 200 + Math.random() * 150 : 0,
  }));

  return { specs, openLane };
}

function laneX(lane: number, playableHalfWidth: number, obstacleWidth: number): number {
  const laneWidth = (playableHalfWidth * 2) / LANE_COUNT;
  const laneCenter = -playableHalfWidth + laneWidth * (lane + 0.5);
  const jitterRange = Math.max(laneWidth - obstacleWidth, 0);
  return laneCenter + (Math.random() - 0.5) * jitterRange;
}

export function spawnObstacleInLane(
  kind: ObstacleKind,
  lane: number,
  playableHalfWidth: number,
  spawnY: number,
  speed: number,
): ObstacleInstance {
  const visual = OBSTACLE_VISUALS[kind];
  return {
    id: nextObstacleId++,
    kind,
    category: OBSTACLE_CATEGORY[kind],
    x: laneX(lane, playableHalfWidth, visual.width),
    y: spawnY,
    width: visual.width,
    height: visual.height,
    speed,
  };
}

export function advanceObstacle(obstacle: ObstacleInstance, dt: number): ObstacleInstance {
  return { ...obstacle, y: obstacle.y + obstacle.speed * dt };
}

/** Pure overlap test — reused unchanged for both catch and (future) hazard
 * checks. What an overlap *means* is entirely the caller's decision. */
export function checkCollision(
  babyX: number,
  babyY: number,
  babyWidth: number,
  babyHeight: number,
  obstacle: ObstacleInstance,
): boolean {
  return rectsOverlap(
    { x: babyX, y: babyY, width: babyWidth, height: babyHeight },
    { x: obstacle.x, y: obstacle.y, width: obstacle.width, height: obstacle.height },
  );
}
