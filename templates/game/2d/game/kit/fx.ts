import * as Phaser from "phaser";
import { sfx } from "@/game/audio";
import { toast } from "@/game/state";
import { THEME } from "@/game/theme";
import { darken, hex } from "./color";
import { ensureFxTextures, glow } from "./textures";
import { U, VIEW } from "./view";

/**
 * Game feel ("juice"): the feedback that makes every action land. Use the combos for the
 * common moments, and the single effects to build your own. Every effect is short; stack
 * a few on important moments instead of making one big.
 *
 *   juice.collect(this, gem.x, gem.y, 10);     // burst + "+10" + pop + sound + score
 *   juice.hit(this, player);                   // flash + shake + hit-stop + burst + sound
 *   juice.explode(this, x, y, THEME.palette.danger);
 *   fx.trail(this, player, THEME.palette.primary);
 */

const DISPLAY_FONT = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";

/** The emitters are pooled per scene and texture. */
const emitters = new WeakMap<Phaser.Scene, Map<string, Phaser.GameObjects.Particles.ParticleEmitter>>();

function emitter(scene: Phaser.Scene, texture: string, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) {
  let pool = emitters.get(scene);
  if (!pool) {
    pool = new Map();
    emitters.set(scene, pool);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => emitters.delete(scene));
  }
  const id = texture + JSON.stringify(config);
  let e = pool.get(id);
  if (!e || !e.scene) {
    e = scene.add.particles(0, 0, texture, { ...config, emitting: false });
    e.setDepth(900);
    pool.set(id, e);
  }
  return e;
}

let frozenUntil = 0;

export const fx = {
  /** Camera shake. strength 0.5 = a tap, 1 = a hit, 2 = an explosion. */
  shake(scene: Phaser.Scene, strength = 1) {
    scene.cameras.main.shake(90 + 70 * strength, 0.0035 * strength);
  },

  /** A full-screen flash, white by default. Keep it short: 60–120 ms. */
  flash(scene: Phaser.Scene, color = "#ffffff", ms = 90) {
    const c = Phaser.Display.Color.HexStringToColor(color);
    scene.cameras.main.flash(ms, c.red, c.green, c.blue);
  },

  /** Freeze the action for a few frames on impact (50–120 ms). Check `fx.frozen()` in update. */
  hitStop(scene: Phaser.Scene, ms = 70) {
    frozenUntil = performance.now() + ms;
    const world = (scene.physics as Phaser.Physics.Arcade.ArcadePhysics | undefined)?.world;
    world?.pause();
    scene.tweens.pauseAll();
    window.setTimeout(() => {
      if (performance.now() + 1 < frozenUntil || !scene.sys.isActive()) return;
      world?.resume();
      scene.tweens.resumeAll();
    }, ms);
  },

  /** True during a hit-stop: skip your own movement code while it is. */
  frozen() {
    return performance.now() < frozenUntil;
  },

  /** A burst of glowing particles. */
  burst(
    scene: Phaser.Scene,
    x: number,
    y: number,
    o: { color?: string; count?: number; speed?: number; size?: number; gravity?: number; life?: number } = {},
  ) {
    ensureFxTextures(scene);
    const e = emitter(scene, "glow-32", {
      speed: { min: 12 * U * (o.speed ?? 1), max: 45 * U * (o.speed ?? 1) },
      angle: { min: 0, max: 360 },
      lifespan: { min: 250 * (o.life ?? 1), max: 650 * (o.life ?? 1) },
      scale: { start: (U / 9) * (o.size ?? 1), end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: (o.gravity ?? 0) * U * 10,
      blendMode: Phaser.BlendModes.ADD,
      tint: hex(o.color ?? THEME.palette.accent),
    });
    e.explode(o.count ?? 18, x, y);
  },

  /** Fast streaks flying outwards: impacts, sparks off metal. */
  sparks(scene: Phaser.Scene, x: number, y: number, o: { color?: string; count?: number; speed?: number } = {}) {
    ensureFxTextures(scene);
    const e = emitter(scene, "spark-24", {
      speed: { min: 30 * U * (o.speed ?? 1), max: 70 * U * (o.speed ?? 1) },
      angle: { min: 0, max: 360 },
      // Streaks point along their direction of travel.
      rotate: { onEmit: (p) => (p ? Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)) : 0) },
      lifespan: { min: 150, max: 380 },
      scale: { start: U / 6, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      tint: hex(o.color ?? "#ffffff"),
    });
    e.explode(o.count ?? 10, x, y);
  },

  /** Confetti: wins, level ups, combos. */
  confetti(scene: Phaser.Scene, x: number, y: number, count = 40) {
    ensureFxTextures(scene);
    const colors = [THEME.palette.primary, THEME.palette.secondary, THEME.palette.accent, THEME.palette.good].map(hex);
    const e = emitter(scene, "chip-6", {
      speed: { min: 25 * U, max: 60 * U },
      angle: { min: 220, max: 320 },
      lifespan: 1600,
      gravityY: 60 * U,
      rotate: { min: 0, max: 360 },
      scale: { start: U / 5, end: U / 8 },
      alpha: { start: 1, end: 0 },
      tint: colors,
    });
    e.explode(count, x, y);
  },

  /** An expanding ring: explosions, landings, power-up pickups. */
  shockwave(scene: Phaser.Scene, x: number, y: number, o: { color?: string; radius?: number; ms?: number } = {}) {
    ensureFxTextures(scene);
    const img = scene.add.image(x, y, "ring-64-6-#ffffff").setDepth(899);
    img.setTint(hex(o.color ?? "#ffffff")).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1);
    scene.tweens.add({
      targets: img,
      scale: ((o.radius ?? 18 * U) / 64) * 1,
      alpha: 0,
      duration: o.ms ?? 420,
      ease: "Cubic.easeOut",
      onComplete: () => img.destroy(),
    });
  },

  /** Text that pops up and floats away: "+10", "Combo!", "Miss". */
  floatText(scene: Phaser.Scene, x: number, y: number, text: string, color = THEME.palette.accent) {
    const t = scene.add
      .text(x, y, text, {
        fontFamily: DISPLAY_FONT(),
        fontSize: `${Math.round(4.2 * U)}px`,
        color,
        stroke: darken(THEME.palette.bg, 0.3),
        strokeThickness: Math.max(2, Math.round(0.9 * U)),
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setScale(0.4);
    scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: "Back.easeOut" });
    scene.tweens.add({
      targets: t,
      y: y - 9 * U,
      alpha: 0,
      delay: 260,
      duration: 650,
      ease: "Cubic.easeIn",
      onComplete: () => t.destroy(),
    });
  },

  /** Scale punch: bigger for a moment, then springs back. */
  pop(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, amount = 0.25) {
    const base = (target.getData("baseScale") as number | undefined) ?? target.scaleX;
    target.setData("baseScale", base);
    scene.tweens.killTweensOf(target);
    target.setScale(base * (1 + amount));
    scene.tweens.add({ targets: target, scaleX: base, scaleY: base, duration: 260, ease: "Back.easeOut" });
  },

  /** Squash and stretch: jumps (stretch), landings (squash). */
  squash(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, kind: "squash" | "stretch" = "squash") {
    const base = (target.getData("baseScale") as number | undefined) ?? target.scaleX;
    target.setData("baseScale", base);
    const [sx, sy] = kind === "squash" ? [1.3, 0.72] : [0.78, 1.25];
    target.setScale(base * sx, base * sy);
    scene.tweens.add({ targets: target, scaleX: base, scaleY: base, duration: 320, ease: "Elastic.easeOut", easeParams: [1.1, 0.5] });
  },

  /** Flashes a sprite white for a moment: it got hit. */
  blink(scene: Phaser.Scene, target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, ms = 80) {
    target.setTintFill(0xffffff);
    scene.time.delayedCall(ms, () => target.active && target.clearTint());
  },

  /** A glowing trail behind a moving object. Returns the emitter (call .stop() to end it). */
  trail(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, color = THEME.palette.primary, size = 1) {
    ensureFxTextures(scene);
    const e = scene.add.particles(0, 0, "glow-32", {
      speed: 0,
      lifespan: 380,
      frequency: 18,
      scale: { start: (U / 10) * size, end: 0 },
      alpha: { start: 0.55, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      tint: hex(color),
    });
    e.startFollow(target);
    e.setDepth(-1);
    // Only while the object is on screen: a hidden player leaves no trail.
    const sync = () => {
      const shown = target.active && (target as unknown as Phaser.GameObjects.Components.Visible).visible !== false;
      if (shown !== e.emitting) {
        if (shown) e.start();
        else e.stop();
      }
    };
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
    target.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
      e.destroy();
    });
    return e;
  },

  /** A soft light that follows an object: makes key things glow even without bloom. */
  aura(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, color: string, radius = 8 * U, alpha = 0.45) {
    const key = glow(scene, 32);
    const light = scene.add.image(target.x, target.y, key).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(color));
    light.setScale(radius / 32).setAlpha(alpha).setDepth(-2);
    const follow = () => {
      const shown = target.active && (target as unknown as Phaser.GameObjects.Components.Visible).visible !== false;
      light.setVisible(shown);
      if (shown) light.setPosition(target.x, target.y);
    };
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, follow);
    target.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, follow);
      light.destroy();
    });
    return light;
  },

  /** Gentle idle motion: bobbing up and down. */
  bob(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, amount = 1.2 * U, ms = 900) {
    scene.tweens.add({ targets: target, y: target.y - amount, duration: ms, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  },

  /** A short zoom punch of the camera. */
  punch(scene: Phaser.Scene, amount = 0.04) {
    const cam = scene.cameras.main;
    cam.zoomTo(1 + amount, 60, "Quad.easeOut", true, (_c, progress) => {
      if (progress === 1) cam.zoomTo(1, 220, "Quad.easeOut", true);
    });
  },
};

/** The common moments, each with sight, motion and sound together. */
export const juice = {
  /** Picking up something good. Adds `points` to the score when given. */
  collect(scene: Phaser.Scene, x: number, y: number, points?: number, color = THEME.palette.accent) {
    fx.burst(scene, x, y, { color, count: 14, speed: 0.8 });
    fx.shockwave(scene, x, y, { color, radius: 8 * U, ms: 300 });
    if (points) fx.floatText(scene, x, y - 3 * U, `+${points}`, color);
    sfx("pickup");
  },

  /** Something got hurt. Pass the sprite that was hit. */
  hit(scene: Phaser.Scene, target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, color = THEME.palette.danger) {
    fx.blink(scene, target);
    fx.hitStop(scene, 80);
    fx.shake(scene, 1.2);
    fx.sparks(scene, target.x, target.y, { color: "#ffffff", count: 8 });
    fx.burst(scene, target.x, target.y, { color, count: 12 });
    sfx("hit");
  },

  /** Something big blew up or a run ended. */
  explode(scene: Phaser.Scene, x: number, y: number, color = THEME.palette.danger) {
    fx.flash(scene, "#ffffff", 110);
    fx.shake(scene, 2.2);
    fx.hitStop(scene, 110);
    fx.burst(scene, x, y, { color, count: 36, speed: 1.4, size: 1.4, life: 1.3 });
    fx.burst(scene, x, y, { color: THEME.palette.accent, count: 16, speed: 0.7 });
    fx.sparks(scene, x, y, { count: 14, speed: 1.3 });
    fx.shockwave(scene, x, y, { color, radius: 26 * U, ms: 520 });
    sfx("explode");
  },

  /** A level up, a combo, a win: confetti, a camera punch, a fanfare and a big message. */
  celebrate(scene: Phaser.Scene, text: string) {
    fx.confetti(scene, VIEW.width / 2, VIEW.height * 0.35, 60);
    fx.punch(scene, 0.05);
    sfx("powerup");
    toast(text);
  },
};
