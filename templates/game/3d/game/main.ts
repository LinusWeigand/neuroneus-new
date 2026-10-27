import type { GameHandle } from "@/game/handle";
import { createFx } from "./kit/fx";
import { createStage } from "./kit/stage";
import { clearTweens, updateTweens } from "./kit/tween";
import { World } from "./world";

/**
 * Boots the 3D game into `parent` and hands the shell its controls. Loaded only in the
 * browser (components/game/game-shell.tsx imports it dynamically).
 *
 * A fixed-timestep loop (60 updates a second, whatever the frame rate) drives the world,
 * tweens and effects; rendering runs every animation frame. Before the first run the world
 * is the title screen's living background; `start()` begins a run.
 */
export async function createGame(parent: HTMLElement): Promise<GameHandle> {
  const stage = createStage(parent);
  const fx = createFx(stage);
  const world = new World(stage, fx);

  const STEP = 1 / 60;
  let paused = false;
  let running = true;
  let acc = 0;
  let last = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    if (!running) return;
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      if (!paused) {
        world.update(STEP);
        updateTweens(STEP);
        fx.update(STEP);
      }
      acc -= STEP;
    }
    fx.beforeRender();
    stage.render();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    start: () => {
      paused = false;
      world.startRun();
    },
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      last = performance.now();
    },
    destroy: () => {
      running = false;
      cancelAnimationFrame(frame);
      clearTweens();
      fx.dispose();
      stage.dispose();
    },
  };
}
