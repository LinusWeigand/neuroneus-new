/**
 * Tiny tweens for motion with easing. Driven by the game loop (game/main.ts calls
 * updateTweens), so they pause with the game.
 *
 *   tween(0.3, (k) => mesh.scale.setScalar(1 + 0.3 * (1 - k)), { ease: ease.outBack });
 */

export const ease = {
  linear: (t: number) => t,
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

type Tween = { t: number; dur: number; update: (k: number) => void; ease: (t: number) => number; done?: () => void; owner?: object };

let active: Tween[] = [];

/** Runs `update(k)` with k eased from 0 to 1 over `seconds`. Returns a function that cancels it. */
export function tween(
  seconds: number,
  update: (k: number) => void,
  opts: { ease?: (t: number) => number; done?: () => void; owner?: object } = {},
) {
  // A new tween on the same owner replaces the old one (no fighting over one property).
  if (opts.owner) active = active.filter((t) => t.owner !== opts.owner);
  const tw: Tween = { t: 0, dur: Math.max(0.001, seconds), update, ease: opts.ease ?? ease.outCubic, done: opts.done, owner: opts.owner };
  active.push(tw);
  update(tw.ease(0));
  return () => {
    active = active.filter((t) => t !== tw);
  };
}

export function updateTweens(dt: number) {
  if (!active.length) return;
  const finished: Tween[] = [];
  for (const tw of active) {
    tw.t = Math.min(tw.dur, tw.t + dt);
    tw.update(tw.ease(tw.t / tw.dur));
    if (tw.t >= tw.dur) finished.push(tw);
  }
  if (finished.length) {
    active = active.filter((t) => !finished.includes(t));
    for (const tw of finished) tw.done?.();
  }
}

export function clearTweens() {
  active = [];
}
