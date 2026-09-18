import Image from "next/image";

// Cloud-sea backdrop for higher altitude, sitting in front of Skyline
// (Tokyo, receding below) and behind Foreground. --clouds-opacity (set by
// Game from absolute altitude — see zones.ts getBackgroundMix) drives the
// fade-in; --clouds-zoom independently drives a "flying up into the cloud
// bank" position/scale shift (staged much more gradually than opacity, so
// "close" and "inside" read as distinct moments rather than one fade).
// Starting the crop high (mostly sky, thin cloud wisps — close to what's
// already showing above Skyline) and sliding down into the dense cloud sea
// keeps the swap feeling continuous rather than a jump-cut between two
// differently-framed photos.
//
// --clouds-haze layers a soft white wash on top, peaking around 1000m
// ("inside" the cloud, softened visibility) and clearing by 2000m ("above"
// it) — the cheapest way to tell those two stages apart with only one photo.
//
// Parallax reuses --steer-norm and --zone-parallax (see Skyline.tsx for
// why steering drives this instead of altitude), scaled up slightly
// relative to Skyline's baseline since this layer sits a bit closer — this
// isn't a second, independent camera effect.
export function Clouds({ imageSrc }: { imageSrc?: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-30 overflow-hidden"
      style={{
        opacity: "var(--clouds-opacity, 0)",
        transform:
          "translateX(calc(var(--steer-norm, 0) * var(--zone-parallax, -8) * 1.25 * 1px))",
      }}
      aria-hidden
    >
      {imageSrc && (
        <>
          <Image
            src={imageSrc}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            style={{
              objectPosition:
                "center calc(15% + var(--clouds-zoom, 0) * 45%)",
              transform: "scale(calc(1 + var(--clouds-zoom, 0) * 0.12))",
            }}
            priority
          />
          <div
            className="absolute inset-0 bg-white"
            style={{ opacity: "var(--clouds-haze, 0)" }}
          />
        </>
      )}
    </div>
  );
}
