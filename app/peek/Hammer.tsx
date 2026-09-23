"use client";

import Image from "next/image";

export type HitEffect = { x: number; y: number; id: number };

// How long each hit-effect display (hammer swing + impact + ripple) stays
// mounted before it's cleared — matches the 0.2-0.3s the brief asks for the
// hammer animation itself, plus a small buffer so the ripple can finish its
// own slightly-longer fade. UncleGame.tsx owns the per-hit timer that
// removes it from the `hits` array after this long (kept here as the
// single source of truth both files read from). Multiple hits can be live
// at once — rounds 5-8 have more than one uncle, so two quick taps on two
// different uncles both get their own hammer/impact/ripple at their own
// tapped position, independent of each other.
export const HIT_DISPLAY_MS = 460;

// Keyframes injected once via a plain <style> tag (not globals.css — kept
// local to this game). Comical "whack-a-mole" energy: swing + a small
// cartoon star + a soft ripple — no blood/injury imagery of any kind.
const STYLES = `
@keyframes hammer-swing {
  0% { transform: rotate(-42deg); }
  55% { transform: rotate(18deg); }
  100% { transform: rotate(6deg); }
}
@keyframes hit-impact-pop {
  0% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
  35% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.4); opacity: 0; }
}
@keyframes hit-ripple {
  0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0.55; }
  100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
}
.hammer-swing { animation: hammer-swing 260ms ease-out; }
.hit-impact-pop { animation: hit-impact-pop 320ms ease-out forwards; }
.hit-ripple { animation: hit-ripple 460ms ease-out forwards; }
@media (prefers-reduced-motion: reduce) {
  .hammer-swing { animation: none; transform: rotate(6deg); }
  .hit-impact-pop, .hit-ripple { animation: none; display: none; }
}
`;

// Purely a HIT visual — no click handling of its own (the uncle himself is
// the tap target now, see Uncle.tsx). Each entry in `hits` appears at its
// own tapped position and swings down independently; UncleGame.tsx removes
// an entry from the array after HIT_DISPLAY_MS so this stays a plain
// render-from-props component with no effect of its own (avoids a
// setState-in-effect render cascade for what's just a timed array-item
// removal the parent already owns).
export function Hammer({ hits }: { hits: HitEffect[] }) {
  if (hits.length === 0) return null;

  return (
    <>
      <style>{STYLES}</style>
      {hits.map((hit) => (
        <div
          key={hit.id}
          className="pointer-events-none fixed z-40"
          style={{ left: hit.x, top: hit.y }}
          aria-hidden
        >
          <div
            className="hammer-swing absolute"
            style={{
              width: "clamp(72px, 17vmin, 112px)",
              left: 0,
              top: 0,
              transform: "translate(-72%, -88%)",
              transformOrigin: "80% 92%",
            }}
          >
            <Image
              src="/images/uncle/hammer.png"
              alt=""
              width={1208}
              height={1302}
              className="h-auto w-full object-contain"
              unoptimized
            />
          </div>
          <div className="hit-impact-pop absolute" style={{ left: 0, top: 0 }}>
            <svg width="44" height="44" viewBox="0 0 46 46">
              <path
                d="M23 2 L27 17 L42 12 L30 22 L44 30 L28 28 L31 44 L23 30 L15 44 L18 28 L2 30 L16 22 L4 12 L19 17 Z"
                fill="#ffd447"
                stroke="#e0a52c"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            className="hit-ripple absolute rounded-full border border-neutral-400/50"
            style={{ left: 0, top: 0, width: 60, height: 60 }}
          />
        </div>
      ))}
    </>
  );
}
