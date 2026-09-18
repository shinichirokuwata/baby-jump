"use client";

import { forwardRef } from "react";
import Image from "next/image";

export type BabyExpression = "normal" | "happy" | "sad";

// Same responsive width used everywhere below — kept as one string so the
// width and the per-expression framing correction (which is expressed as a
// multiple of this same width) can never drift out of sync.
const BABY_WIDTH_CSS = "clamp(130px, 38vmin, 240px)";
// Height is derived from the *normal* image's own aspect ratio and applied
// to the shared box explicitly — previously this came for free from a
// single <Image>'s own intrinsic size via `h-auto`, but three expression
// images are stacked in the same box, so the box needs its own explicit
// height for that to still work. The "natural" reference set (see
// EXPRESSIONS below) is a perfect square, unlike the previous set.
const BABY_ASPECT = 1;

// Each expression's source PNG has its own framing of the character within
// its canvas (different transparent padding), so simply swapping `src` on
// an otherwise-identical box would make the baby visibly jump a few px
// when the expression changes. offsetXPercent/offsetYPercent are a
// one-time-measured correction (as a multiple of the rendered width, so it
// stays correct at every responsive size) that lines up each image's
// actual character silhouette with the normal image's — re-measure these
// again if any of the three files is swapped for a new asset with
// different framing. The "natural" set (public/images/baby/natural/) is
// the official reference set as of this change; the previous set under
// public/images/baby/ is left on disk untouched but no longer used here.
const EXPRESSIONS: Record<
  BabyExpression,
  { src: string; width: number; height: number; offsetXPercent: number; offsetYPercent: number }
> = {
  normal: {
    src: "/images/baby/natural/baby-jump.png",
    width: 1254,
    height: 1254,
    offsetXPercent: 0,
    offsetYPercent: 0,
  },
  happy: {
    src: "/images/baby/natural/baby-jump-happy.png",
    width: 1254,
    height: 1254,
    offsetXPercent: -0.32,
    offsetYPercent: 0.4,
  },
  sad: {
    src: "/images/baby/natural/baby-jump-sad.png",
    width: 1254,
    height: 1254,
    offsetXPercent: -0.16,
    offsetYPercent: 0.6,
  },
};

type BabyProps = {
  expression: BabyExpression;
};

// `ref` is the element Game writes `transform: translate(x, y)` to every
// frame — the baby's real, collision-relevant 2D position (x lateral, y an
// offset from the default row set by Game.tsx's BABY_ROW_RATIO, clamped so
// it never enters the HUD above or the rooftop below). It's kept free of
// any other transform so that imperative write never clobbers declarative
// styling.
//
// The visual-only "flight feel" layer below reads CSS vars Game sets every
// frame from state that isn't part of collision (climb speed, steering
// velocity, an ambient clock) — never fed back into the real position:
//  - --tilt-deg: a small constant climb lean plus a bank into steering,
//    like a plane easing into a turn.
//  - --bob-y / --sway-x: a tiny ambient float/drift, always on and subtle,
//    so hovering in place still reads as "flying" rather than "pasted on".
//  - --speed-stretch: a faint stretch that scales with how fast the current
//    zone climbs (or the baby itself moves), for a sense of speed.
//
// All three expression images are mounted simultaneously and crossfaded via
// opacity (see `expression` below) rather than swapping `src` — this avoids
// any flash-of-missing-image while a newly-selected src loads, and gives the
// "自然に切り替わる" soft transition the brief asked for without any extra
// animation machinery.
export const Baby = forwardRef<HTMLDivElement, BabyProps>(function Baby(
  { expression },
  ref,
) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2">
      <div ref={ref} className="will-change-transform">
        <div
          className="origin-center relative"
          style={{
            width: BABY_WIDTH_CSS,
            height: `calc(${BABY_WIDTH_CSS} * ${BABY_ASPECT})`,
            transform:
              "translateX(calc(var(--sway-x, 0) * 1px)) " +
              "translateY(calc(var(--bob-y, 0) * 1px)) " +
              "rotate(calc(var(--tilt-deg, 0) * 1deg)) " +
              "scaleX(calc(1 - var(--speed-stretch, 0) * 0.03)) " +
              "scaleY(calc(1 + var(--speed-stretch, 0) * 0.045))",
          }}
        >
          {(Object.keys(EXPRESSIONS) as BabyExpression[]).map((key) => {
            const cfg = EXPRESSIONS[key];
            return (
              <div
                key={key}
                className={`absolute inset-0 transition-opacity duration-150 ease-out ${
                  expression === key ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  transform: `translate(calc(${BABY_WIDTH_CSS} * ${cfg.offsetXPercent} / 100), calc(${BABY_WIDTH_CSS} * ${cfg.offsetYPercent} / 100))`,
                }}
              >
                <Image
                  src={cfg.src}
                  alt=""
                  width={cfg.width}
                  height={cfg.height}
                  className="h-full w-full object-contain"
                  priority={key === "normal"}
                  // Next's built-in image optimizer (no `sharp` installed)
                  // corrupts this image's alpha channel — the transparent
                  // background comes back as a baked-in checkerboard. These
                  // three local PNGs are small and static, so bypassing
                  // optimization and serving the original file directly
                  // sidesteps the bug entirely rather than working around it.
                  unoptimized
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
