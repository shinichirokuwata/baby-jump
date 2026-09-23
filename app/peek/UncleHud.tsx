import type { ReactNode } from "react";
import type { GamePhase } from "./uncleLogic";
import { TOTAL_ROUNDS, getMatchOutcome } from "./uncleLogic";

// Independent from BABY JUMP/BABY BALANCE's own Hud components — same
// restrained visual language (white-on-light, small caps, glassy button),
// its own component.
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
      className={`${
        disabled ? "pointer-events-none" : "pointer-events-auto"
      } rounded-xl border border-black/15 bg-white/70 px-10 py-3.5 text-sm font-semibold tracking-[0.25em] text-neutral-800 shadow-md backdrop-blur-md transition-all duration-150 hover:bg-white/90 active:scale-[0.97] disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

export function UncleHud({
  phase,
  round,
  youScore,
  uncleScore,
  onStart,
  onPlayAgain,
}: {
  phase: GamePhase;
  round: number;
  youScore: number;
  uncleScore: number;
  onStart: () => void;
  onPlayAgain: () => void;
}) {
  return (
    <>
      {phase === "playing" && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 text-neutral-700"
          style={{ paddingTop: "max(1.1rem, env(safe-area-inset-top))" }}
        >
          <p className="text-[11px] font-medium tracking-[0.3em] opacity-70">
            ROUND {round} / {TOTAL_ROUNDS}
          </p>
        </div>
      )}

      {phase === "playing" && (
        <div
          className="pointer-events-none absolute inset-x-0 flex justify-center gap-10 text-neutral-700"
          style={{ top: "max(4.2rem, calc(env(safe-area-inset-top) + 3.5rem))" }}
        >
          <div className="text-center">
            <p className="text-[11px] font-medium tracking-[0.3em] opacity-60">YOU</p>
            <p className="text-lg font-semibold tabular-nums">{youScore}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-medium tracking-[0.3em] opacity-60">UNCLE</p>
            <p className="text-lg font-semibold tabular-nums">{uncleScore}</p>
          </div>
        </div>
      )}

      {phase === "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 text-neutral-800">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-2xl font-semibold tracking-[0.3em]">UNCLE SMASH</p>
          </div>
          <ActionButton onClick={onStart} disabled={phase !== "ready"}>
            START
          </ActionButton>
        </div>
      )}

      {phase === "finished" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-white/60 text-neutral-800 backdrop-blur-[2px]">
          <p className="text-sm font-semibold tracking-[0.3em] opacity-70">UNCLE SMASH</p>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-[11px] font-medium tracking-[0.3em] opacity-60">YOU</p>
              <p className="text-3xl font-semibold tabular-nums">{youScore}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-medium tracking-[0.3em] opacity-60">UNCLE</p>
              <p className="text-3xl font-semibold tabular-nums">{uncleScore}</p>
            </div>
          </div>
          <p className="text-xl font-semibold tracking-[0.3em]">
            {getMatchOutcome(youScore, uncleScore) === "player"
              ? "YOU WIN"
              : getMatchOutcome(youScore, uncleScore) === "uncle"
                ? "UNCLE WINS"
                : "DRAW"}
          </p>
          <div className="mt-2">
            <ActionButton onClick={onPlayAgain}>PLAY AGAIN</ActionButton>
          </div>
        </div>
      )}
    </>
  );
}
