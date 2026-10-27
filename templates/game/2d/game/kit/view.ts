import { GAME } from "@/game/config";
import { THEME } from "@/game/theme";

/**
 * The game's fixed logical resolution. The canvas scales to fit the screen, so game code
 * always works in these coordinates: (0, 0) top left to (VIEW.width, VIEW.height).
 * Pixel-art themes render at a low resolution and scale up crisply.
 */
const base = THEME.fx.pixelArt ? { long: 480, short: 270 } : { long: 1280, short: 720 };

export const VIEW =
  GAME.orientation === "portrait"
    ? { width: base.short, height: base.long }
    : { width: base.long, height: base.short };

/** One unit = 1% of the shorter side. Size and speed everything in units: `radius: 4 * U`. */
export const U = Math.min(VIEW.width, VIEW.height) / 100;
