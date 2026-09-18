import Image from "next/image";

// The high-altitude Earth-curvature backdrop, sitting in front of Clouds
// (which recedes below as this strengthens — see zones.ts BACKGROUND_LAYERS)
// and behind Foreground. `imageSrc`/`objectPosition` come from
// BACKGROUND_LAYERS.stratosphere. --stratosphere-opacity/--stratosphere-zoom
// (set by Game from absolute altitude) fade and gently zoom this in as it
// becomes the dominant view, mirroring how Skyline/Clouds are driven —
// same mechanism, new layer, no new plumbing invented for it.
//
// Parallax reuses --steer-norm and --zone-parallax (see Skyline.tsx for
// why steering drives this instead of altitude), at Skyline's baseline
// ratio: this is as far a backdrop as Tokyo was, just much higher up.
export function Stratosphere({
  imageSrc,
  objectPosition = "50% 50%",
}: {
  imageSrc?: string;
  objectPosition?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-20 overflow-hidden"
      style={{
        opacity: "var(--stratosphere-opacity, 0)",
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
            transform: "scale(var(--stratosphere-zoom, 1))",
          }}
          priority
        />
      )}
    </div>
  );
}
