import Image from "next/image";

// Main Tokyo backdrop: sky, skyline and rooftop are one continuous photo, so
// this renders as a single full-bleed layer rather than being split across
// depth layers (splitting one photo across differently-paced parallax layers
// would tear it apart as jump progress changes). `imageSrc`/`objectPosition`
// come from zones.ts's BACKGROUND_LAYERS.tokyo — the swap-in point for this
// layer's art. Clouds.tsx sits in front of this one, fading in as altitude
// rises (see zones.ts getLayerState).
//
// This is the farthest depth layer, so its parallax is the baseline
// --zone-parallax value as-is (Foreground, closest, multiplies it up) —
// real landmarks like Skytree should barely drift, just enough to read as
// a gentle camera push. --tokyo-opacity/--tokyo-scale/--tokyo-sink (set by
// Game from absolute altitude) fade, pull back and drift this down
// slightly as the baby climbs, so it reads as sinking away into the
// distance rather than being swapped out.
//
// Parallax is driven by --steer-norm (how far left/right the player is
// currently steering, -1..1) rather than altitude directly: these are
// single static photos, not tileable strips, so scrolling them by the
// actual distance climbed would eventually scroll them off past the edge
// into blank space. Reacting to steering instead gives a bounded, always-
// meaningful "the world responds as I fly" feel — still zone-driven via
// --zone-parallax, still smaller for farther layers.
export function Skyline({
  imageSrc,
  objectPosition = "50% 50%",
}: {
  imageSrc?: string;
  objectPosition?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-40 overflow-hidden"
      style={{
        opacity: "var(--tokyo-opacity, 1)",
        transform:
          "translateX(calc(var(--steer-norm, 0) * var(--zone-parallax, -8) * 1px)) " +
          "translateY(calc(var(--tokyo-sink, 0) * 1px)) " +
          "scale(var(--tokyo-scale, 1))",
      }}
      aria-hidden
    >
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition }}
          priority
        />
      ) : (
        <div className="flex h-full w-full items-end gap-1 px-2 pb-[14%]">
          {SKYLINE_PLACEHOLDER_HEIGHTS.map((height, index) => (
            <div
              key={index}
              className="flex-1 bg-slate-800/80"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const SKYLINE_PLACEHOLDER_HEIGHTS = [
  40, 65, 50, 90, 60, 75, 45, 85, 55, 70, 40, 60,
];
