'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Whether the user has asked the OS to reduce motion.
 *
 * The CSS layer already neutralises transitions and keyframes; this is for
 * JavaScript-driven motion, which CSS cannot reach. Defaults to `false` so the
 * server and the first client render agree — the effect corrects it before the
 * animation would have been visible anyway.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Counts from the previous value to the next one over `duration`.
 *
 * Starts at zero so a freshly loaded figure visibly resolves rather than
 * appearing fully formed, and animates from wherever it was on later updates —
 * so a refresh that changes the balance shows the change happening. Quartic
 * ease-out: most of the distance is covered early, which reads as fast even at
 * two thirds of a second.
 *
 * Returns the target immediately when motion is reduced.
 */
export function useCountUp(target: number, duration = 650): number {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    if (from === target) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      const value = from + (target - from) * eased;
      setDisplay(value);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        // Land exactly on the target; easing alone leaves it a hair short.
        fromRef.current = target;
        setDisplay(target);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      // Interrupted mid-flight: resume from where it stopped, not from zero.
      cancelAnimationFrame(frame);
      fromRef.current = display;
    };
    // `display` is deliberately not a dependency — reading it in cleanup is the
    // point, and depending on it would restart the animation every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, reduced]);

  return display;
}

/**
 * `false` on the first paint, `true` one frame later.
 *
 * Lets a CSS transition run on mount: render the element in its "from" state,
 * flip the flag, and the browser has two distinct computed styles to
 * interpolate between. A plain effect is not enough — React can flush it in the
 * same frame, and the transition never starts.
 */
export function useMountedFlag(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return ready;
}
