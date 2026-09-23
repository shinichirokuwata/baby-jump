import Image from "next/image";
import type { UncleSpot } from "./uncleLogic";

// Real UNCLE SMASH art (public/images/uncle/) — confirmed present before
// wiring this up. All three are the same 1536x1024 landscape canvas with
// the character occupying one portion of it. Peeking slides the box all
// the way to its natural anchored rest position (see UncleGame.tsx's
// getSpotStyle) rather than stopping partway through a reveal — since the
// character sits close to one edge of the wide canvas, a full slide-to-rest
// already reads as "peeking near the edge" on its own, with the
// transparent remainder simply extending harmlessly off past the far side.
// All three files have real alpha (confirmed via PIL: mode RGBA, genuine
// 0..254 transparency, clean character-shaped cutout with no black
// background baked in) — no CSS mask-image is needed for any of them.
type SpotArt = {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  cssWidth: string;
};

export const SPOT_ART: Record<UncleSpot, SpotArt> = {
  left: {
    src: "/images/uncle/uncle-left.png",
    naturalWidth: 1536,
    naturalHeight: 1024,
    cssWidth: "clamp(360px, 100vmin, 520px)",
  },
  right: {
    src: "/images/uncle/uncle-right.png",
    naturalWidth: 1536,
    naturalHeight: 1024,
    cssWidth: "clamp(360px, 100vmin, 520px)",
  },
  bottom: {
    src: "/images/uncle/uncle-bottom.png",
    naturalWidth: 1536,
    naturalHeight: 1024,
    cssWidth: "clamp(280px, 68vmin, 460px)",
  },
};

// left/right's normal box is deliberately vmin-wide (up to ~100vmin) for a
// good single-uncle peekaboo scale — but at mobile widths that alone spans
// almost the *entire* screen, and with two+ uncles up at once (rounds 5-8)
// two such boxes anchored to opposite edges would overlap across the whole
// middle of the screen. Multi-uncle rounds use this much narrower box
// instead so a left uncle and a right uncle never share any horizontal
// space, regardless of vertical jitter — at 390px wide that's ~172px per
// side with a real gap left over in between; bottom's box doesn't need the
// same treatment since it's already vertically well clear of left/right's
// jitter band (checked against the widest jitter swing on both sides).
const COMPACT_WIDTH: Partial<Record<UncleSpot, string>> = {
  left: "clamp(170px, 44vmin, 300px)",
  right: "clamp(170px, 44vmin, 300px)",
};

// The clickable region — deliberately *not* the whole (mostly transparent)
// wrapper box, or clicking empty space next to the uncle would register as
// a hit ("おじさんの周囲の空白部分をクリックしてもHITにしない"). Percentages
// are of the wrapper's own rendered box, matched to where each photo's
// character actually sits (measured from each PNG's alpha channel).
// HIT_AREA_MARGIN_PX below adds a little extra forgiveness on top, per
// "少しだけ押しやすくしてください". This region is now rendered as its own
// small absolutely-positioned element (see hitZoneStyle) rather than
// hit-tested via clientX/clientY math on the full wrapper — with multiple
// uncles on screen at once, their (oversized, mostly-transparent) wrapper
// boxes can visually overlap even though the characters themselves don't,
// and a full-box pointer target would let whichever uncle is later in the
// DOM steal clicks meant for the one underneath. Confining the actual
// clickable element to just this sub-region sidesteps that entirely.
const HIT_AREA_CONFIG: Record<UncleSpot, { xMin: number; xMax: number; yMin: number; yMax: number }> = {
  left: { xMin: 0, xMax: 48, yMin: 6, yMax: 100 },
  right: { xMin: 52, xMax: 100, yMin: 6, yMax: 100 },
  bottom: { xMin: 10, xMax: 85, yMin: 38, yMax: 100 },
};
const HIT_AREA_MARGIN_PX = 32;

// Keyframes injected once via a plain <style> tag (not globals.css — kept
// local to this game; harmless if duplicated across simultaneous uncles).
// A small squash + shake on the character himself — the impact star/ripple
// live in Hammer.tsx, positioned at the actual tap point instead of a
// fixed spot on the photo.
const UNCLE_STYLES = `
@keyframes uncle-hit-shake {
  0% { transform: scale(0.9) translateX(0); }
  25% { transform: scale(0.9) translateX(-4px); }
  50% { transform: scale(0.92) translateX(4px); }
  75% { transform: scale(0.95) translateX(-2px); }
  100% { transform: scale(1) translateX(0); }
}
.uncle-hit-shake { animation: uncle-hit-shake 320ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .uncle-hit-shake { animation: none; transform: scale(0.94); }
}
`;

export function Uncle({
  spot,
  hit,
  canHit,
  compact,
  onHit,
  style,
}: {
  spot: UncleSpot;
  /** Whether *this* uncle has already been smashed this round — once true he's slid back off-screen and can't be hit again. */
  hit: boolean;
  /** Whether a tap right now should register as a hit — gates the pointer handler below (mirrors the round-state/timing guards the game loop already owns); combined with `!hit` internally. */
  canHit: boolean;
  /** True for rounds with 2+ uncles at once — uses a narrower box for left/right so simultaneous uncles never overlap. */
  compact: boolean;
  onHit: (clientX: number, clientY: number) => void;
  style: React.CSSProperties;
}) {
  const art = SPOT_ART[spot];
  const cssWidth = (compact && COMPACT_WIDTH[spot]) || art.cssWidth;
  const area = HIT_AREA_CONFIG[spot];
  const effectiveCanHit = canHit && !hit;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!effectiveCanHit) return;
    onHit(e.clientX, e.clientY);
  };

  return (
    <div
      className="absolute"
      style={{ width: cssWidth, ...style, pointerEvents: "none" }}
    >
      <style>{UNCLE_STYLES}</style>
      <div className={hit ? "uncle-hit-shake" : ""} style={{ transformOrigin: "50% 60%" }}>
        <Image
          src={art.src}
          alt=""
          width={art.naturalWidth}
          height={art.naturalHeight}
          className="h-auto w-full object-contain"
          priority
          unoptimized
        />
      </div>
      <div
        onPointerDown={handlePointerDown}
        className={effectiveCanHit ? "cursor-pointer" : ""}
        style={{
          position: "absolute",
          left: `calc(${area.xMin}% - ${HIT_AREA_MARGIN_PX}px)`,
          top: `calc(${area.yMin}% - ${HIT_AREA_MARGIN_PX}px)`,
          width: `calc(${area.xMax - area.xMin}% + ${HIT_AREA_MARGIN_PX * 2}px)`,
          height: `calc(${area.yMax - area.yMin}% + ${HIT_AREA_MARGIN_PX * 2}px)`,
          pointerEvents: effectiveCanHit ? "auto" : "none",
        }}
      />
    </div>
  );
}
