import type { ReactNode } from "react";
import { INITIAL_HP, type GamePhase } from "./Game";
import { HpIndicator } from "./HpIndicator";

// Minimal, white-on-photo overlay. Text sits on soft top/bottom scrims
// (not boxes) so it stays legible over the sky without competing with the
// photo. Everything except START/RETRY is `pointer-events-none` so drags
// always fall through to Game's steering handler underneath.
function formatAltitude(meters: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(meters)));
}

// One shared button for START and every RETRY — glassy, semi-transparent,
// modestly rounded (not a pill) so it reads as a restrained overlay control
// over a cinematic photo rather than a game-y widget. hover brightens
// slightly; active scales/sinks down a touch for a light "press" cue.
function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      // pointer-events must follow `disabled`, not be a blanket "auto" —
      // a disabled button still occupies its screen rect even while its
      // wrapper is invisible (opacity-0), and browsers never dispatch
      // pointer events through a disabled control (nothing to bubble to
      // Game's own drag handler underneath). Left as "auto" unconditionally,
      // this button becomes a silent, invisible dead zone for any drag
      // gesture that starts inside its rect during PLAYING — harmless while
      // nothing gameplay-relevant sat there, but a real bug once something
      // (e.g. the baby's own row) does.
      className={`${
        disabled ? "pointer-events-none" : "pointer-events-auto"
      } rounded-xl border border-white/35 bg-white/10 px-10 py-3.5 text-sm font-semibold tracking-[0.25em] text-white shadow-md backdrop-blur-md transition-all duration-150 hover:bg-white/[0.18] active:scale-[0.97] active:bg-white/[0.16] active:shadow-sm disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

export function Hud({
  phase,
  altitude,
  bestAltitude,
  catchCount,
  bestCatch,
  goalAltitude,
  zoneLabel,
  showGuide,
  hp,
  onStart,
  onRetry,
}: {
  phase: GamePhase;
  altitude: number;
  bestAltitude: number;
  catchCount: number;
  bestCatch: number;
  goalAltitude: number;
  zoneLabel: string;
  showGuide: boolean;
  hp: number;
  onStart: () => void;
  onRetry: () => void;
}) {
  const isPlaying = phase === "playing" || phase === "gameOver" || phase === "clear";

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/35 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 text-white"
        style={{ paddingTop: "max(1.1rem, env(safe-area-inset-top))" }}
      >
        {/* Small persistent title — hidden while the READY overlay shows
            its own large "BABY JUMP" instead of the two competing. */}
        <div
          className={`flex flex-col items-center text-center drop-shadow-sm transition-opacity duration-500 ${
            isPlaying ? "opacity-100" : "opacity-0"
          }`}
        >
          <p className="text-base font-semibold tracking-[0.4em]">BABY JUMP</p>
          <p
            className={`mt-1 text-[9px] font-medium tracking-[0.25em] text-white/60 transition-opacity duration-500 ${
              showGuide ? "opacity-100" : "opacity-0"
            }`}
          >
            A SMALL JUMP A BIG ADVENTURE.
          </p>
        </div>
        <div className="mt-5 flex items-start justify-between px-5 drop-shadow-sm">
          <div
            className={`transition-opacity duration-500 ${
              isPlaying ? "opacity-100" : "opacity-0"
            }`}
          >
            <p className="text-4xl font-semibold leading-none tabular-nums">
              {formatAltitude(altitude)}
              <span className="ml-1 text-lg font-medium opacity-70">m</span>
            </p>
            <p className="mt-1 text-[11px] font-medium tracking-[0.3em] opacity-70">
              {zoneLabel}
            </p>
          </div>
          {/* CATCH fades with altitude — meaningless before PLAYING starts.
              HP (diaper icons) sits right below it, only during actual
              PLAYING — meaningless in READY/STARTING, and CLEAR/GAME OVER
              each already have their own dedicated overlay ("CLEAR時のHP
              表示は不要"). */}
          <div
            className={`text-center transition-opacity duration-500 ${
              isPlaying ? "opacity-100" : "opacity-0"
            }`}
          >
            <p className="text-[11px] font-medium tracking-[0.3em] opacity-75">CATCH</p>
            <p className="text-lg font-semibold tabular-nums">{catchCount}</p>
            <div
              className={`mt-2 transition-opacity duration-300 ${
                phase === "playing" ? "opacity-100" : "opacity-0"
              }`}
            >
              <HpIndicator hp={hp} maxHp={INITIAL_HP} />
            </div>
          </div>
          {/* BEST stays visible in READY/STARTING too, per the brief. */}
          <div className="text-right">
            <p className="text-[11px] font-medium tracking-[0.3em] opacity-75">
              BEST
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {formatAltitude(bestAltitude)}m
            </p>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/30 to-transparent"
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute inset-x-0 flex justify-center transition-opacity duration-700 ${
          phase === "playing" && showGuide ? "opacity-100" : "opacity-0"
        }`}
        style={{ bottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-[11px] font-medium tracking-[0.3em] text-white/70 drop-shadow-sm">
          DRAG TO MOVE
        </p>
      </div>

      {/* READY: a minimal title + START. Fades out together as soon as
          STARTING begins (see Game.tsx's handleStart), synced with the
          baby's lift-off, rather than cutting abruptly. No dimming layer —
          the Tokyo photo stays the star. */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-8 text-white transition-opacity duration-300 ${
          phase === "ready" ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex flex-col items-center gap-1 text-center drop-shadow-md">
          <p className="text-2xl font-semibold tracking-[0.35em]">BABY JUMP</p>
          <p className="text-[10px] font-medium tracking-[0.25em] text-white/70">
            A SMALL JUMP A BIG ADVENTURE.
          </p>
        </div>
        <ActionButton onClick={onStart} disabled={phase !== "ready"}>
          START
        </ActionButton>
        <p className="text-[10px] font-medium tracking-[0.2em] text-white/55">
          GOAL {formatAltitude(goalAltitude)}m
        </p>
      </div>

      {phase === "clear" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-white">
          <p className="text-xs font-semibold tracking-[0.4em] text-white/80 drop-shadow-md">
            CLEAR
          </p>
          <p className="text-5xl font-semibold tabular-nums drop-shadow-md">
            {formatAltitude(altitude)}m
          </p>
          <div className="text-center drop-shadow-sm">
            <p className="text-[11px] font-medium tracking-[0.3em] text-white/70">CATCH</p>
            <p className="text-2xl font-semibold tabular-nums">{catchCount}</p>
          </div>
          <div className="text-center drop-shadow-sm">
            <p className="text-[11px] font-medium tracking-[0.3em] text-white/70">BEST CATCH</p>
            <p className="text-lg font-semibold tabular-nums">{bestCatch}</p>
          </div>
          <div className="mt-2">
            <ActionButton onClick={onRetry}>RETRY</ActionButton>
          </div>
        </div>
      )}

      {phase === "gameOver" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/55 text-white backdrop-blur-[2px]">
          <p className="text-xs font-semibold tracking-[0.4em] text-white/70">
            GAME OVER
          </p>
          <div className="text-center">
            <p className="text-5xl font-semibold tabular-nums">
              {formatAltitude(altitude)}m
            </p>
            <p className="mt-1 text-[11px] tracking-[0.3em] text-white/60">
              到達高度
            </p>
          </div>
          <p className="text-sm font-medium tabular-nums text-white/80">
            BEST {formatAltitude(bestAltitude)}m
          </p>
          <div className="text-center">
            <p className="text-[11px] font-medium tracking-[0.3em] text-white/70">CATCH</p>
            <p className="text-2xl font-semibold tabular-nums">{catchCount}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-medium tracking-[0.3em] text-white/70">BEST CATCH</p>
            <p className="text-lg font-semibold tabular-nums">{bestCatch}</p>
          </div>
          <div className="mt-3">
            <ActionButton onClick={onRetry}>RETRY</ActionButton>
          </div>
        </div>
      )}
    </>
  );
}
