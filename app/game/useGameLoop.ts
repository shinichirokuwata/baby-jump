"use client";

import { useEffect, useRef } from "react";

const MAX_DT = 1 / 30; // clamp so a dropped/backgrounded frame can't cause a physics jump

/**
 * Drives a requestAnimationFrame loop and hands the caller a delta-time in
 * seconds each frame. The callback is expected to mutate refs / DOM directly
 * rather than calling setState every frame, to keep this at 60fps.
 */
export function useGameLoop(onTick: (dt: number) => void) {
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  });

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, MAX_DT);
      lastTime = time;
      onTickRef.current(dt);
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);
}
