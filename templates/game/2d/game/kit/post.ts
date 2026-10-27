import * as Phaser from "phaser";
import { THEME } from "@/game/theme";
import { hex } from "./color";

/**
 * Post-processing on the camera: bloom makes light-colored and additive things glow, tuned
 * by the theme. WebGL only; on the canvas fallback this does nothing.
 */
export function applyPost(scene: Phaser.Scene) {
  if (scene.game.renderer.type !== Phaser.WEBGL || THEME.fx.bloom <= 0) return;
  const fx = scene.cameras.main.postFX;
  if (!fx) return;
  fx.addBloom(0xffffff, 1, 1, 1, 0.35 + THEME.fx.bloom * 0.6, 4);
}

/** A glow around one sprite (WebGL only), in addition to bloom: for the player and key items. */
export function addGlow(target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, color: string, strength = 1) {
  if (THEME.fx.bloom <= 0.2) return;
  target.preFX?.addGlow(hex(color), 3 * strength, 0, false, 0.1, 12);
}
