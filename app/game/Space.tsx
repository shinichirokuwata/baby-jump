import Image from "next/image";

// The full-Earth-from-orbit backdrop, sitting in front of Stratosphere
// (which recedes below as this strengthens — see zones.ts BACKGROUND_LAYERS)
// and behind the baby/obstacles. `imageSrc`/`objectPosition` come from
// BACKGROUND_LAYERS.space. --space-opacity/--space-zoom (set by Game from
// absolute altitude) fade and gently zoom this in as it becomes the
// dominant view — same mechanism as Skyline/Clouds/Stratosphere, no new
// plumbing invented for it. This is also the backdrop the (not-yet-built)
// moon zone rides on for now, rather than a jarring drop to a flat color.
//
// Parallax reuses --steer-norm and --zone-parallax (see Skyline.tsx for
// why steering drives this instead of altitude), at Skyline's baseline
// ratio: still as far a backdrop as Tokyo was, just far higher up.
export function Space({
  imageSrc,
  objectPosition = "50% 50%",
}: {
  imageSrc?: string;
  objectPosition?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{
        opacity: "var(--space-opacity, 0)",
        transform:
          "translateX(calc(var(--steer-norm, 0) * var(--zone-parallax, -8) * 1px))",
      }}
      aria-hidden
    >
      {imageSrc && (
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{
            objectPosition,
            transform: "scale(var(--space-zoom, 1))",
          }}
          priority
        />
      )}
    </div>
  );
}
