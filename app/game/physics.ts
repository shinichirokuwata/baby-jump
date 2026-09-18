// Flight physics for the auto-scroll dodge game: altitude climbs on its own
// (rate is zone-driven — see zones.ts getZoneClimbSpeed), the player only
// controls lateral (x) position. There is no more discrete jump to model —
// the old tap-to-jump gravity/velocity system (GRAVITY, JUMP_VELOCITY,
// MAX_UPWARD_VELOCITY, applyJump, isGrounded, ...) has been removed along
// with the tap-jump input it existed for.

/** Advances altitude by one frame. climbSpeedPxPerSec is zone-driven (see zones.ts). */
export function stepAltitude(y: number, dt: number, climbSpeedPxPerSec: number): number {
  return y + climbSpeedPxPerSec * dt
}

/** Clamps lateral offset from center so the baby can never leave the screen. */
export function clampLateral(x: number, maxAbsPx: number): number {
  if (maxAbsPx <= 0) return 0
  return Math.max(-maxAbsPx, Math.min(maxAbsPx, x))
}

/** Clamps a value to an arbitrary (possibly asymmetric) [min, max] range —
 * used for the baby's vertical offset, whose safe range isn't centered on 0
 * the way the lateral one is (HUD above, rooftop below). */
export function clampRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export type Rect = { x: number; y: number; width: number; height: number }

/** Axis-aligned overlap test; both rects are centered on (x, y). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2
  )
}
