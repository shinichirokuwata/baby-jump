// Backmost layer: a color-only fallback for zones/areas without photo art
// yet. Behind Skyline (Tokyo), Clouds and Stratosphere, it's invisible
// whenever those photos cover the screen — it still matters for future
// zones (space/moon) that don't have art, and while art is loading. Colors
// come from CSS custom properties (--sky-top / --sky-bottom) that Game
// updates imperatively every frame, so this stays a cheap, static piece of
// markup.
export function Sky() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-50"
      style={{
        background:
          "linear-gradient(to bottom, var(--sky-top, #8ec7e8), var(--sky-bottom, #f6d9a8))",
      }}
      aria-hidden
    />
  );
}
