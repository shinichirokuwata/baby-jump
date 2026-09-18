// Falling items the baby interacts with while auto-climbing, split into two
// categories that share the same spawn/movement pipeline (obstacleSpawner.ts)
// but mean opposite things on overlap:
//   "catchable" — CATCH +1, item removed, no game-over.
//   "hazard"    — overlap connects to GAME OVER (see Game.tsx's hazardHit).
export type ObstacleCategory = "catchable" | "hazard";

// "milk-bottle" — the only catchable (a baby bottle of milk; was originally
// a paper airplane, renamed when the art changed — see Obstacle.tsx — but
// the catch/spawn/collision logic itself never changed). "space-debris" /
// "solar-panel-debris" / "thermal-foil-debris" — three hazard *kinds*
// sharing one hazard *rate* (see obstacleSpawner.ts's getDebrisProbability,
// which is unchanged by having more kinds — pickHazardKind is what chooses
// which of the three fills a slot that was already going to be a hazard).
// Future kinds slot in here the same way. OBSTACLE_CATEGORY below is what
// decides which bucket a kind falls into.
export type ObstacleKind =
  | "milk-bottle"
  | "space-debris"
  | "solar-panel-debris"
  | "thermal-foil-debris";

export type ObstacleInstance = {
  id: number;
  kind: ObstacleKind;
  category: ObstacleCategory;
  /** px, offset from the screen's horizontal center — same coordinate space as the baby's lateral position. */
  x: number;
  /** px, distance from the top of the viewport. */
  y: number;
  width: number;
  height: number;
  /** px/s, downward fall speed — baked in at spawn time from the current zone's difficulty. */
  speed: number;
};

export type ObstacleVisualConfig = {
  width: number;
  height: number;
  /** Swap-in point for real art later — Obstacle.tsx uses this instead of the placeholder shape once set. */
  imageSrc?: string;
  /**
   * How much larger the rendered art is than the collision box (width/height
   * above), centered on it. Real art usually has some breathing room/soft
   * edges around the "solid" silhouette, so rendering it a bit larger than
   * the hitbox means a catch never feels cheated out of (baby visibly
   * overlapping the art before it registers) — it only ever errs toward the
   * generous side. Collision math never reads this; only Obstacle.tsx's
   * rendering does. Defaults to 1 (exact match) if omitted.
   */
  visualScale?: number;
};

export const OBSTACLE_VISUALS: Record<ObstacleKind, ObstacleVisualConfig> = {
  // width/height (the real collision box) and visualScale are left exactly
  // as they were for paper-airplane — this pass only changes what's drawn
  // inside the box (see Obstacle.tsx's MilkBottle), not the box itself, per
  // the brief's "見た目のサイズ変更とCollision判定のサイズ変更は混同しない".
  "milk-bottle": {
    width: 40,
    height: 30,
    visualScale: 1.3,
  },
  "space-debris": {
    width: 44,
    height: 34,
    visualScale: 1.25,
  },
  "solar-panel-debris": {
    width: 46,
    height: 32,
    visualScale: 1.2,
  },
  "thermal-foil-debris": {
    width: 42,
    height: 36,
    visualScale: 1.2,
  },
};

export const OBSTACLE_CATEGORY: Record<ObstacleKind, ObstacleCategory> = {
  "milk-bottle": "catchable",
  "space-debris": "hazard",
  "solar-panel-debris": "hazard",
  "thermal-foil-debris": "hazard",
};
