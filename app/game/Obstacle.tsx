"use client";

import { forwardRef } from "react";
import Image from "next/image";
import { OBSTACLE_VISUALS, type ObstacleKind } from "./obstacleTypes";

// Which CSS animation class each kind uses, and the length of that
// animation's cycle in (hundredths of a second, matching the existing
// `% motionPeriodS / 100` delay math) — kept as one table so it's obvious
// at a glance that every kind has its own distinct motion. See globals.css
// for the actual keyframes.
const MOTION_BY_KIND: Record<ObstacleKind, { className: string; periodS: number }> = {
  "milk-bottle": { className: "bottle-sway", periodS: 280 },
  "space-debris": { className: "debris-tumble", periodS: 340 },
  "solar-panel-debris": { className: "panel-drift", periodS: 480 },
  "thermal-foil-debris": { className: "foil-flutter", periodS: 390 },
};

type ObstacleProps = {
  kind: ObstacleKind;
  width: number;
  height: number;
  /** px/s fall speed — drives a static, render-time-only "coming down" stretch (never affects the collision box). */
  speed: number;
  /** Deterministic per-instance offset so items don't all flutter in lockstep. */
  id: number;
  /** Swap-in point for real art — falls back to the vector placeholder when unset. */
  imageSrc?: string;
};

// `ref` is the element Game writes `transform: translate(...)` to every
// frame — the item's real, catch/collision-relevant position and size
// (`width`/`height`, exactly what Game's hitbox math uses). It stays an
// invisible reference frame: the actual artwork renders on a *centered,
// slightly larger* inner layer (see visualScale in obstacleTypes.ts), so
// swapping in real art with soft edges/breathing room later never makes a
// catch feel cheated out of — the art is only ever equal to or larger than
// the box, never smaller.
//
// Motion is split the same way Baby.tsx splits it: a static speed-stretch
// layer, then a separate CSS-animated flutter layer, each owning its own
// `transform` so they never fight — cheap even with several items on
// screen (the flutter is a plain CSS animation, zero per-frame JS cost).
export const Obstacle = forwardRef<HTMLDivElement, ObstacleProps>(function Obstacle(
  { kind, width, height, speed, id, imageSrc },
  ref,
) {
  const visualScale = OBSTACLE_VISUALS[kind].visualScale ?? 1;
  const visualWidth = width * visualScale;
  const visualHeight = height * visualScale;

  const stretchY = 1 + Math.min(speed / 500, 1) * 0.07;
  const stretchX = 1 - Math.min(speed / 500, 1) * 0.025;
  // Deterministic pseudo-random phase per instance so multiple items don't
  // move in lockstep — each kind has its own motion class + cycle length
  // (see globals.css) so the three hazards don't all tumble identically.
  const motion = MOTION_BY_KIND[kind];
  const motionDelay = -(((id * 37) % motion.periodS) / 100);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0"
      style={{ width, height }}
      aria-hidden
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: visualWidth,
          height: visualHeight,
          transform: `translate(-50%, -50%) scale(${stretchX}, ${stretchY})`,
        }}
      >
        <div
          className={`${motion.className} h-full w-full`}
          style={{ animationDelay: `${motionDelay}s` }}
        >
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt=""
              width={visualWidth}
              height={visualHeight}
              className="h-full w-full object-contain"
            />
          ) : (
            <ItemPlaceholder kind={kind} />
          )}
        </div>
      </div>
    </div>
  );
});

// Vector placeholder until real art exists (see obstacleTypes.ts's
// imageSrc seam). The switch is kept flat so the next kind — catchable or
// hazard — slots in without restructuring anything else.
function ItemPlaceholder({ kind }: { kind: ObstacleKind }) {
  switch (kind) {
    case "space-debris":
      return <SpaceDebris />;
    case "solar-panel-debris":
      return <SolarPanelDebris />;
    case "thermal-foil-debris":
      return <ThermalFoilDebris />;
    case "milk-bottle":
    default:
      return <MilkBottle />;
  }
}

// The catchable: a small baby bottle of milk (replaces the earlier paper
// airplane placeholder — same catch/spawn/collision pipeline, only the art
// changed). A mostly-transparent glass body with a clearly white milk fill
// inset from its walls, a narrow neck, a collar ring, and a rounded teat on
// top — enough shape to read as "baby bottle" at a glance even rendered
// small, without toy-like color or excess detail. Soft drop-shadow (not a
// glow) keeps it visible against any of the sky backdrops.
function MilkBottle() {
  return (
    <svg
      viewBox="0 0 30 52"
      className="h-full w-full"
      style={{ filter: "drop-shadow(0 2px 3px rgba(10,14,20,0.3))" }}
    >
      <defs>
        <linearGradient id="bottle-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id="bottle-milk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0f2f5" />
        </linearGradient>
      </defs>

      {/* shoulder taper from neck down to the body's full width */}
      <path
        d="M10,14 L20,14 L23,20 L7,20 Z"
        fill="url(#bottle-glass)"
        stroke="#e4e9ef"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      {/* body — the transparent/semi-transparent glass */}
      <rect x="3" y="20" width="24" height="29" rx="6" fill="url(#bottle-glass)" stroke="#e4e9ef" strokeWidth="0.8" />
      {/* milk — inset from the glass walls with a little headspace at the
          top, so it clearly reads as "liquid inside" rather than a solid
          white block filling the whole bottle. */}
      <rect x="5" y="26" width="20" height="21" rx="4.5" fill="url(#bottle-milk)" />
      {/* neck */}
      <rect x="10.5" y="9" width="9" height="6" fill="url(#bottle-glass)" stroke="#e4e9ef" strokeWidth="0.7" />
      {/* collar / ring the teat seats against */}
      <rect x="9" y="7.3" width="12" height="3" rx="1.3" fill="#eef1f4" stroke="#d7dde4" strokeWidth="0.6" />
      {/* teat */}
      <path
        d="M12,7.3 C12,4 13,1 15,0.6 C17,1 18,4 18,7.3 Z"
        fill="#ecd3a8"
        stroke="#c9a877"
        strokeWidth="0.5"
      />
      {/* a glass highlight streak and one faint volume-gradation line —
          just enough to read as glass/plastic, not more. */}
      <rect x="5.5" y="23" width="1.6" height="22" rx="0.8" fill="#ffffff" opacity="0.5" />
      <line x1="19" y1="38" x2="24" y2="38" stroke="#c9d2db" strokeWidth="0.6" opacity="0.5" />
    </svg>
  );
}

// The first Hazard: a torn fragment of satellite panel — an irregular
// (not symmetrical, not a game-icon shape) gunmetal shard with a strip of
// gold foil insulation and a couple of rivets, the way real MLI-wrapped
// debris reads at a glance. No red, no spikes, nothing "weapon"-shaped —
// just an inert piece of broken hardware that happens to be in the way.
function SpaceDebris() {
  return (
    <svg
      viewBox="0 0 56 44"
      className="h-full w-full"
      style={{ filter: "drop-shadow(0 2px 3px rgba(10,14,20,0.4))" }}
    >
      <defs>
        <linearGradient id="debris-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d7dbe0" />
          <stop offset="55%" stopColor="#9aa1a9" />
          <stop offset="100%" stopColor="#5c626b" />
        </linearGradient>
        <linearGradient id="debris-foil" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#cdae67" />
          <stop offset="100%" stopColor="#8f7745" />
        </linearGradient>
      </defs>

      {/* irregular torn panel silhouette — deliberately not a regular polygon */}
      <polygon
        points="7,20 17,5 38,3 51,15 47,33 24,41 5,31"
        fill="url(#debris-body)"
        stroke="#454a51"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />

      {/* a strip of foil insulation clinging to one edge */}
      <polygon points="17,5 38,3 35,10 20,11" fill="url(#debris-foil)" opacity="0.85" />

      {/* faint solar-cell grid lines hinting at a broken panel */}
      <path d="M11,26 L44,20 M13,32 L45,26" stroke="#454a51" strokeWidth="0.5" opacity="0.35" />

      {/* rivets */}
      <circle cx="15" cy="24" r="1.1" fill="#33383e" />
      <circle cx="40" cy="17" r="1.1" fill="#33383e" />

      {/* torn-edge shadow for a little depth */}
      <polygon points="5,31 24,41 19,36 8,29" fill="#2f3338" opacity="0.25" />
    </svg>
  );
}

// Second hazard: a torn-off solar panel section — deep navy-black cells in
// a grid, a thin surviving aluminum frame rail along one edge, and a
// jagged missing corner. Flatter and more angular than the gunmetal
// shard above, and reads as distinctly "panel" rather than "chassis".
function SolarPanelDebris() {
  return (
    <svg
      viewBox="0 0 64 36"
      className="h-full w-full"
      style={{ filter: "drop-shadow(0 2px 3px rgba(10,14,20,0.4))" }}
    >
      <defs>
        <linearGradient id="panel-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#25334c" />
          <stop offset="60%" stopColor="#141c2c" />
          <stop offset="100%" stopColor="#080b12" />
        </linearGradient>
      </defs>

      {/* irregular torn panel silhouette — flat/wide, one corner missing */}
      <polygon
        points="5,11 46,3 61,13 55,30 20,33 3,23"
        fill="url(#panel-body)"
        stroke="#3a4a63"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />

      {/* solar-cell grid, slightly irregular so it doesn't read as a UI icon */}
      <g stroke="#41577c" strokeWidth="0.5" opacity="0.55">
        <line x1="16" y1="6" x2="12" y2="30" />
        <line x1="28" y1="4" x2="25" y2="32" />
        <line x1="40" y1="4" x2="38" y2="31" />
        <line x1="52" y1="7" x2="50" y2="29" />
        <line x1="6" y1="15" x2="58" y2="12" />
        <line x1="5" y1="23" x2="57" y2="20" />
      </g>

      {/* the one length of aluminum frame rail still attached */}
      <path
        d="M5,11 L46,3"
        stroke="#c7ccd2"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* torn corner shadow */}
      <polygon points="3,23 20,33 14,29 6,21" fill="#04060a" opacity="0.55" />
    </svg>
  );
}

// Third hazard: a crumpled scrap of gold multi-layer insulation film —
// soft, curved, torn silhouette (built from curves, not polygons, so it
// reads as "light film" next to the two hard-edged metal hazards above),
// a champagne-gold gradient, a couple of fold creases, and one streak of
// mylar sheen.
function ThermalFoilDebris() {
  return (
    <svg
      viewBox="0 0 52 44"
      className="h-full w-full"
      style={{ filter: "drop-shadow(0 2px 3px rgba(10,14,20,0.35))" }}
    >
      <defs>
        <linearGradient id="foil-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2d9a0" />
          <stop offset="45%" stopColor="#d8b568" />
          <stop offset="100%" stopColor="#a9803f" />
        </linearGradient>
        <linearGradient id="foil-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff6de" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff6de" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* crumpled, torn film silhouette */}
      <path
        d="M8,6 C4,14 2,22 6,30 C9,38 20,42 28,38 C38,34 46,28 44,18 C42,9 34,3 24,4 C18,5 12,2 8,6 Z"
        fill="url(#foil-body)"
        stroke="#8a6a34"
        strokeWidth="0.6"
      />

      {/* fold creases */}
      <path d="M10,10 C16,16 20,24 18,34" stroke="#8a6a34" strokeWidth="0.5" opacity="0.45" fill="none" />
      <path d="M26,7 C30,16 34,22 30,31" stroke="#8a6a34" strokeWidth="0.5" opacity="0.4" fill="none" />

      {/* mylar sheen streak */}
      <path d="M12,9 C18,13 22,20 20,30" stroke="url(#foil-sheen)" strokeWidth="3" opacity="0.7" fill="none" />

      {/* torn notch */}
      <path d="M28,38 L34,40 L30,35 Z" fill="#7a5c2c" opacity="0.5" />
    </svg>
  );
}
