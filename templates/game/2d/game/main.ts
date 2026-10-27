import * as Phaser from "phaser";
import type { GameHandle } from "@/game/handle";
import { THEME } from "@/game/theme";
import { VIEW } from "./kit/view";
import { PlayScene } from "./scenes/play-scene";

/**
 * Boots the Phaser game into `parent` and hands the shell its controls. Loaded only in the
 * browser (components/game/game-shell.tsx imports it dynamically).
 *
 * The scene runs from the start: before the first run it's the living background of the
 * title screen ("attract mode"); `start()` begins a run.
 */
export async function createGame(parent: HTMLElement): Promise<GameHandle> {
  const scene = new PlayScene();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW.width,
    height: VIEW.height,
    backgroundColor: THEME.palette.bg,
    pixelArt: THEME.fx.pixelArt,
    antialias: !THEME.fx.pixelArt,
    roundPixels: THEME.fx.pixelArt,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    audio: { noAudio: true },
    banner: false,
    scene: [scene],
  });
  // Ready once the scene's create() has run.
  await new Promise<void>((resolve) => {
    const wait = () => (scene.sys.isActive() ? resolve() : requestAnimationFrame(wait));
    wait();
  });

  return {
    start: () => {
      scene.scene.resume();
      scene.startRun();
    },
    pause: () => scene.scene.pause(),
    resume: () => scene.scene.resume(),
    destroy: () => game.destroy(true),
  };
}
