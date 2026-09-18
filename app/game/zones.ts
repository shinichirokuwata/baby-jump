// The world the baby auto-climbs through while dodging obstacles, as one
// continuous journey rather than a series of background swaps:
//   Tokyo rooftop -> Tokyo from above -> clouds approaching -> clouds near
//   -> inside the clouds -> above the clouds -> stratosphere -> space -> moon
//
// Three things are deliberately kept separate here:
//
// 1. WORLD_ZONES — the narrative/visual stages (see public/design-reference/
//    baby-jump-world-reference.png). Each is a plain data record: where it
//    starts, its label, its sky color, its parallax feel, and which
//    BACKGROUND_LAYER (if any exists yet) represents it. This is the part
//    meant to be extended zone-by-zone as new altitudes get designed — it
//    drives *pacing of the story*, nothing about difficulty or speed.
//
// 2. SPEED_ZONES — climbSpeed / obstacleSpeedPxPerSec / obstacleSpawnIntervalMs
//    by altitude, kept in their own fixed keyframe list *independent* of
//    WORLD_ZONES on purpose. They used to share one array (each WorldZone
//    carried its own speed fields), but that meant reshaping the *visual*
//    zone boundaries — exactly what a "the scenery feels monotonous" pass
//    needs to do — would silently move the climbSpeed keyframes too and
//    change total run time. Splitting them means WORLD_ZONES can be
//    freely re-cut for pacing while SPEED_ZONES stays byte-for-byte the
//    values already measured at 0->50000m ≈ 363s (~6.05 min) — see its own
//    comment below. Do not merge these back into one array without
//    re-verifying that measurement.
//
// 3. BACKGROUND_LAYERS — the actual photo transitions. A layer's fade/zoom/
//    haze curve is authored as its own keyframe list rather than derived
//    from the zone boundaries above, because in practice a transition (e.g.
//    Tokyo receding while clouds build presence) spans *several* zones with
//    its own pacing — forcing it into a rigid "one zone = one transition"
//    rule would fight the art direction rather than serve it. "tokyo",
//    "clouds", "stratosphere" and "space" have real photos today; the moon
//    zone simply has no `backgroundLayer` yet and falls back to its sky
//    gradient alone (see Sky.tsx) until art exists for it.
export type BackgroundLayerId = "tokyo" | "clouds" | "stratosphere" | "space";

export type WorldZoneId =
  | "tokyo-rooftop"
  | "tokyo-sky"
  | "clouds-approaching"
  | "clouds-near"
  | "clouds-inside"
  | "clouds-above"
  | "stratosphere-transition"
  | "stratosphere"
  | "stratosphere-upper"
  | "space-approaching"
  | "space-transition"
  | "space-nearing"
  | "space"
  | "moon";

export type WorldZone = {
  id: WorldZoneId;
  label: string;
  /** Meters. This zone runs until the next zone's altitudeStart (Infinity for the last one). */
  altitudeStart: number;
  /** Which BACKGROUND_LAYERS entry visually represents this zone, if its art exists yet. */
  backgroundLayer?: BackgroundLayerId;
  sky: { top: string; bottom: string };
  /** px factor combined with --steer-norm (how far left/right the player is currently steering) for a light camera-reacts-to-steering feel. */
  parallax: number;
};

export type SpeedZone = {
  /** Meters. Runs until the next entry's altitudeStart (Infinity for the last one). */
  altitudeStart: number;
  /** How fast altitude climbs on its own while at/above this altitude, m/s. */
  climbSpeed: number;
  /** How fast obstacles fall at/above this altitude, px/s. */
  obstacleSpeedPxPerSec: number;
  /** Average time between obstacle spawns at/above this altitude, ms (before the early-game ramp-up eases it in — see Game.tsx). */
  obstacleSpawnIntervalMs: number;
};

// SPEED_ZONES — climbSpeed / obstacleSpeedPxPerSec / obstacleSpawnIntervalMs
// by altitude. FROZEN as of the "extend the goal to 50000m" pass: these are
// the exact keyframe altitudes/values that were simulated and then measured
// via a real (non-mocked) playthrough at 0->50000m ≈ 363.9s (~6.05 min) —
// see that session's notes for the search that produced them. A later pass
// ("re-tune the *background* pacing, not the speed") deliberately reused
// this list completely unchanged and moved WORLD_ZONES (below) to its own
// independent boundaries instead — do not add/remove/move entries here
// without re-measuring 0->50000m, since every point here is a real
// interpolation keyframe for getZoneClimbSpeed/getZoneObstacleSpeed/
// getZoneSpawnIntervalMs.
export const SPEED_ZONES: SpeedZone[] = [
  { altitudeStart: 0, climbSpeed: 20, obstacleSpeedPxPerSec: 150, obstacleSpawnIntervalMs: 2600 },
  { altitudeStart: 100, climbSpeed: 25, obstacleSpeedPxPerSec: 170, obstacleSpawnIntervalMs: 2300 },
  { altitudeStart: 300, climbSpeed: 30, obstacleSpeedPxPerSec: 190, obstacleSpawnIntervalMs: 2000 },
  { altitudeStart: 500, climbSpeed: 35, obstacleSpeedPxPerSec: 210, obstacleSpawnIntervalMs: 1800 },
  { altitudeStart: 1000, climbSpeed: 40, obstacleSpeedPxPerSec: 230, obstacleSpawnIntervalMs: 1600 },
  { altitudeStart: 2000, climbSpeed: 48, obstacleSpeedPxPerSec: 250, obstacleSpawnIntervalMs: 1400 },
  { altitudeStart: 10000, climbSpeed: 105, obstacleSpeedPxPerSec: 320, obstacleSpawnIntervalMs: 1100 },
  { altitudeStart: 20000, climbSpeed: 160, obstacleSpeedPxPerSec: 345, obstacleSpawnIntervalMs: 1050 },
  { altitudeStart: 30000, climbSpeed: 220, obstacleSpeedPxPerSec: 370, obstacleSpawnIntervalMs: 1000 },
  { altitudeStart: 40000, climbSpeed: 310, obstacleSpeedPxPerSec: 395, obstacleSpawnIntervalMs: 950 },
  { altitudeStart: 50000, climbSpeed: 420, obstacleSpeedPxPerSec: 420, obstacleSpawnIntervalMs: 900 },
  { altitudeStart: 384400, climbSpeed: 260, obstacleSpeedPxPerSec: 500, obstacleSpawnIntervalMs: 750 },
];

// WORLD_ZONES — narrative/visual pacing only (label, sky color, parallax,
// which BACKGROUND_LAYER represents it). Altitudes here are independent of
// SPEED_ZONES above; changing them changes how the *scenery* reads at a
// given altitude without touching climbSpeed or obstacle difficulty at all.
//
// Re-cut in the "background feels monotonous 2000-10000m and 10000-50000m"
// pass: 0-2000m kept exactly as previously tuned (that pacing wasn't the
// complaint). Beyond 2000m the story now has more, earlier checkpoints —
// stratosphere's own label/color arrival was moved up from 10000m to 5000m
// (with a 2500m transition step on the way in), and two new space-adjacent
// checkpoints (space-transition@30000, space-nearing@40000) sit between
// space-approaching@20000 and space@50000 — so the HUD zone label and sky
// gradient now change roughly every 5000-10000m of this stretch instead of
// holding "成層圏"/one sky color across an 8000-20000m span. sky colors are
// the same palette used before, just reassigned to the earlier checkpoints
// they now belong to (each old color shows up ~1 checkpoint earlier than
// before); parallax likewise carries the same progression of values,
// shifted the same way. See BACKGROUND_LAYERS below for the matching
// opacity re-tune (the actual photo crossfades, which is what most of the
// "feels slow" perception comes from).
export const WORLD_ZONES: WorldZone[] = [
  {
    id: "tokyo-rooftop",
    label: "東京",
    altitudeStart: 0,
    backgroundLayer: "tokyo",
    sky: { top: "#8ec7e8", bottom: "#f6d9a8" },
    parallax: -8,
  },
  {
    id: "tokyo-sky",
    label: "東京上空",
    altitudeStart: 100,
    backgroundLayer: "tokyo",
    sky: { top: "#7ec0e8", bottom: "#eddcb8" },
    parallax: -8,
  },
  {
    id: "clouds-approaching",
    label: "雲が接近",
    altitudeStart: 300,
    backgroundLayer: "clouds",
    sky: { top: "#6fb2e0", bottom: "#d9e8f2" },
    parallax: -9,
  },
  {
    id: "clouds-near",
    label: "雲の近く",
    altitudeStart: 500,
    backgroundLayer: "clouds",
    sky: { top: "#4f95d8", bottom: "#cfe8f7" },
    parallax: -10,
  },
  {
    id: "clouds-inside",
    label: "雲の中",
    altitudeStart: 1000,
    backgroundLayer: "clouds",
    sky: { top: "#6fa8d8", bottom: "#eef4fa" },
    parallax: -10,
  },
  {
    id: "clouds-above",
    label: "雲の上",
    altitudeStart: 2000,
    backgroundLayer: "clouds",
    sky: { top: "#2f78c8", bottom: "#eaf4fb" },
    parallax: -10,
  },
  {
    id: "stratosphere-transition",
    label: "成層圏へ移行",
    altitudeStart: 2500,
    backgroundLayer: "stratosphere",
    sky: { top: "#25689c", bottom: "#dcedf8" },
    parallax: -8,
  },
  {
    id: "stratosphere",
    label: "成層圏",
    altitudeStart: 5000,
    backgroundLayer: "stratosphere",
    sky: { top: "#123566", bottom: "#6f9fd6" },
    parallax: -4,
  },
  {
    id: "stratosphere-upper",
    label: "成層圏上部",
    altitudeStart: 10000,
    backgroundLayer: "stratosphere",
    sky: { top: "#0e2950", bottom: "#5a80b1" },
    parallax: -3.25,
  },
  {
    id: "space-approaching",
    label: "宇宙が見え始める",
    altitudeStart: 20000,
    backgroundLayer: "space",
    sky: { top: "#0a1c3a", bottom: "#45628b" },
    parallax: -2.5,
  },
  {
    id: "space-transition",
    label: "宇宙への移行",
    altitudeStart: 30000,
    backgroundLayer: "space",
    sky: { top: "#071025", bottom: "#304366" },
    parallax: -1.75,
  },
  {
    id: "space-nearing",
    label: "宇宙目前",
    altitudeStart: 40000,
    backgroundLayer: "space",
    sky: { top: "#050c1c", bottom: "#233252" },
    parallax: -1.25,
  },
  {
    id: "space",
    label: "宇宙",
    altitudeStart: 50000,
    backgroundLayer: "space",
    sky: { top: "#03040f", bottom: "#1b2440" },
    parallax: -1,
  },
  {
    id: "moon",
    label: "月",
    altitudeStart: 384400,
    sky: { top: "#000000", bottom: "#05050a" },
    parallax: 0,
  },
];

export type BackgroundLayerConfig = {
  image: string;
  /** Static base crop. Omit when the layer drives its own position dynamically (see clouds below). */
  objectPosition?: string;
  /** [altitudeMeters, value][], eased between points — see the file header. */
  opacityKeyframes: ReadonlyArray<readonly [number, number]>;
  zoomKeyframes?: ReadonlyArray<readonly [number, number]>;
  driftKeyframes?: ReadonlyArray<readonly [number, number]>;
  hazeKeyframes?: ReadonlyArray<readonly [number, number]>;
};

export const BACKGROUND_LAYERS: Record<BackgroundLayerId, BackgroundLayerConfig> = {
  tokyo: {
    image: "/images/background/tokyo-rooftop.png",
    objectPosition: "82% 50%",
    // Re-tuned for a faster early fade — the previous curve held Tokyo at
    // full opacity through 300m, which read as "nothing has changed yet"
    // even after climbing that far. Now recedes steadily from the very
    // first meter and is fully gone by 2000m (no residual — clouds is the
    // sole backdrop from there, matching its own opacity reaching 1 at the
    // same altitude). zoom/drift below are unchanged.
    opacityKeyframes: [
      [0, 1],
      [100, 0.85],
      [300, 0.55],
      [500, 0.25],
      [1000, 0.05],
      [2000, 0],
    ],
    zoomKeyframes: [
      [0, 1],
      [300, 1],
      [700, 0.99],
      [1000, 0.93],
      [1500, 0.87],
      [2000, 0.85],
    ],
    // Downward drift on top of normal parallax, so Tokyo reads as sinking
    // away below rather than just fading/shrinking in place.
    driftKeyframes: [
      [0, 0],
      [300, 0],
      [700, 10],
      [1000, 30],
      [1500, 45],
      [2000, 50],
    ],
  },
  clouds: {
    image: "/images/background/tokyo-clouds.png",
    // No static objectPosition: this layer slides its own crop dynamically
    // via zoomKeyframes below (see Clouds.tsx), rather than sitting at one
    // fixed position.
    // Re-tuned alongside tokyo's opacity above for a faster early build —
    // already a visible presence by 100m instead of staying invisible
    // through 300m, so the handoff away from Tokyo reads clearly well
    // before 300m. Reaches full backdrop by 2000m ("雲の上：雲海を主役に
    // する") exactly as before. The 2000m+ tail was re-tuned in the
    // "2000-10000m feels monotonous" pass: previously held near-full
    // (0.6) all the way to 5000m and only cleared by 10000m, which read as
    // "still looking at clouds" through most of that span even though
    // stratosphere.png was already fading in underneath. Now fades out
    // notably faster so the handoff *visibly progresses* well before 10000m
    // instead of arriving all at once near the end.
    opacityKeyframes: [
      [0, 0],
      [100, 0.15],
      [300, 0.45],
      [500, 0.75],
      [1000, 0.95],
      [2000, 1],
      [3000, 0.72],
      [5000, 0.38],
      [7000, 0.14],
      [9000, 0.03],
      [10000, 0],
    ],
    // How "zoomed into" the cloud sea it looks — independent of opacity so
    // "near" (500-700m), "inside" (1000-1500m) and "receding above" (2000m+)
    // read as distinct moments. Eases back by 2000m on purpose: fully
    // zoomed-in reads as "inside", not the vast, open cloud sea wanted once
    // above it — and keeps easing back as the view pulls away, matching the
    // now-faster opacity fade above so the pull-back finishes around the
    // same time the layer itself has faded out.
    zoomKeyframes: [
      [0, 0],
      [700, 0.1],
      [1000, 0.4],
      [1300, 0.8],
      [1500, 0.9],
      [2000, 0.55],
      [4000, 0.3],
      [7000, 0.12],
      [10000, 0.03],
    ],
    // Soft white overlay that ramps up hard through 1000-1500m ("霞・白さ・
    // 視界低下を強める", entering the cloud) and clears by 2000m (breaking
    // out above it) — the cheapest way to tell those two stages apart with
    // only one cloud photo.
    hazeKeyframes: [
      [0, 0],
      [900, 0],
      [1200, 0.35],
      [1500, 0.65],
      [1750, 0.4],
      [2000, 0.08],
    ],
  },
  stratosphere: {
    image: "/images/background/stratosphere.png",
    // Centered on the Earth's curve with a slight bias toward the sun
    // flare in the source photo's upper-right; cover-fit crops this wide
    // panorama's *width* on phone screens (its height always fits), so the
    // curve itself — not the flare — is what has to stay framed.
    objectPosition: "58% 46%",
    // Stays invisible through the heart of the cloud zone, a faint tease by
    // 2500m, strengthening through 4000-8000m, and fully the backdrop by
    // 10000m ("成層圏を主役にする"). Re-tuned in the "2000-10000m feels
    // monotonous" pass to rise *earlier and faster* than before (was still
    // only 0.15 by 5000m and 0.55 by 7500m — most of the climb into
    // stratosphere happened invisibly, arriving late) — now clearly present
    // by 4000m and mostly resolved by 8000m, so the handoff away from
    // clouds is something the player can watch happen across the whole
    // stretch rather than a late payoff. Past 10000m it no longer just
    // holds at 1: it now gives way earlier too (0.9 by 15000m, 0.65 by
    // 20000m) so it keeps *visibly moving* through the rest of the climb
    // instead of sitting static for 15000m before finally fading for
    // space.png — paired with space's own earlier rise below.
    opacityKeyframes: [
      [2000, 0],
      [2500, 0.08],
      [4000, 0.32],
      [6000, 0.62],
      [8000, 0.87],
      [10000, 1],
      [15000, 0.9],
      [20000, 0.65],
      [30000, 0.35],
      [40000, 0.15],
      [50000, 0.05],
    ],
    // A gentle zoom-in as it strengthens through arrival, then a slow
    // pull-back as space.png takes over — sells "moving past" stratosphere
    // rather than the layer just sitting still while space fades in on top
    // of it.
    zoomKeyframes: [
      [2000, 1],
      [4000, 1],
      [6000, 1.02],
      [8000, 1.06],
      [10000, 1.08],
      [20000, 1.1],
      [30000, 1.04],
      [40000, 0.98],
      [50000, 0.92],
    ],
  },
  space: {
    image: "/images/background/space.png",
    // Centered on the Earth's curve with a bias toward the sun flare in
    // the source photo's upper-right, same reasoning as stratosphere.
    objectPosition: "60% 42%",
    // Re-tuned in the "10000-50000m feels like one long stratosphere hold"
    // pass to arrive much earlier: previously space stayed at ~0 all the
    // way to 25000m (only 0.05 there) and only became visible in the last
    // 10000m, so "成層圏に入ってから宇宙までが長い" was really "space was
    // invisible for 15000m of the climb". Now: still essentially invisible
    // through 10000-15000m on purpose (so entering stratosphere doesn't
    // instantly read as "already in space"), a first hint by 20000m
    // ("宇宙の気配"), clearly present by 30000m ("宇宙背景が明確"), strongly
    // dominant by 40000m ("かなり宇宙に近い"), and fully the backdrop
    // exactly at 50000m ("完全な宇宙" / CLEAR). Holds at 1 beyond that —
    // this is as far as real art goes today, so the moon zone (384,400m)
    // rides on this same photo rather than a jarring drop to a flat
    // placeholder color.
    opacityKeyframes: [
      [10000, 0],
      [15000, 0.05],
      [20000, 0.18],
      [25000, 0.32],
      [30000, 0.5],
      [35000, 0.66],
      [40000, 0.8],
      [45000, 0.92],
      [50000, 1],
    ],
    zoomKeyframes: [
      [10000, 1],
      [20000, 1.01],
      [30000, 1.02],
      [40000, 1.03],
      [50000, 1.05],
    ],
  },
};

function smoothstep(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function lerpKeyframes(x: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x <= x1) {
      const localT = smoothstep((x - x0) / (x1 - x0));
      return y0 + (y1 - y0) * localT;
    }
  }
  return last[1];
}

export type LayerState = { opacity: number; zoom: number; drift: number; haze: number };

/** Opacity/zoom/drift/haze for a named background layer at the given altitude. */
export function getLayerState(layerId: BackgroundLayerId, altitudeMeters: number): LayerState {
  const layer = BACKGROUND_LAYERS[layerId];
  return {
    opacity: lerpKeyframes(altitudeMeters, layer.opacityKeyframes),
    zoom: layer.zoomKeyframes ? lerpKeyframes(altitudeMeters, layer.zoomKeyframes) : 1,
    drift: layer.driftKeyframes ? lerpKeyframes(altitudeMeters, layer.driftKeyframes) : 0,
    haze: layer.hazeKeyframes ? lerpKeyframes(altitudeMeters, layer.hazeKeyframes) : 0,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function findBracketingZones(altitudeMeters: number): [WorldZone, WorldZone] {
  let i = 0;
  while (i < WORLD_ZONES.length - 1 && WORLD_ZONES[i + 1].altitudeStart <= altitudeMeters) {
    i++;
  }
  return [WORLD_ZONES[i], WORLD_ZONES[Math.min(i + 1, WORLD_ZONES.length - 1)]];
}

/** Sky gradient colors at the given altitude, blended across WORLD_ZONES. */
export function getZoneSkyGradient(altitudeMeters: number): { top: string; bottom: string } {
  const [from, to] = findBracketingZones(altitudeMeters);
  if (from === to) return from.sky;
  const t = smoothstep(
    (altitudeMeters - from.altitudeStart) / (to.altitudeStart - from.altitudeStart),
  );
  return {
    top: mixHex(from.sky.top, to.sky.top, t),
    bottom: mixHex(from.sky.bottom, to.sky.bottom, t),
  };
}

/** The parallax feel at the given altitude, blended across WORLD_ZONES. */
export function getZoneParallax(altitudeMeters: number): number {
  return lerpKeyframes(altitudeMeters, WORLD_ZONES.map((z) => [z.altitudeStart, z.parallax] as const));
}

/** How fast altitude climbs on its own at the given altitude, m/s. Derived from SPEED_ZONES, not WORLD_ZONES — see that array's comment. */
export function getZoneClimbSpeed(altitudeMeters: number): number {
  return lerpKeyframes(altitudeMeters, SPEED_ZONES.map((z) => [z.altitudeStart, z.climbSpeed] as const));
}

/** How fast obstacles fall at the given altitude, px/s. Derived from SPEED_ZONES, not WORLD_ZONES — see that array's comment. */
export function getZoneObstacleSpeed(altitudeMeters: number): number {
  return lerpKeyframes(
    altitudeMeters,
    SPEED_ZONES.map((z) => [z.altitudeStart, z.obstacleSpeedPxPerSec] as const),
  );
}

/** Average time between obstacle spawns at the given altitude, ms. Derived from SPEED_ZONES, not WORLD_ZONES — see that array's comment. */
export function getZoneSpawnIntervalMs(altitudeMeters: number): number {
  return lerpKeyframes(
    altitudeMeters,
    SPEED_ZONES.map((z) => [z.altitudeStart, z.obstacleSpawnIntervalMs] as const),
  );
}

/** The current zone's HUD label (the highest zone whose altitudeStart has been reached). */
export function getCurrentZoneLabel(altitudeMeters: number): string {
  let current = WORLD_ZONES[0];
  for (const zone of WORLD_ZONES) {
    if (zone.altitudeStart <= altitudeMeters) current = zone;
    else break;
  }
  return current.label;
}
