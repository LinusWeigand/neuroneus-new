import * as Phaser from "phaser";
import { THEME } from "@/game/theme";
import { darken, hex, lighten, luminance, mix, rgba } from "./color";
import { chip, cloud, custom, glow, ring } from "./textures";
import { U, VIEW } from "./view";

/**
 * The world behind the action, from the theme's backdrop recipe: a sky gradient, a sun or
 * moon, layered silhouettes with atmospheric depth, an optional synthwave grid, and ambient
 * particles (stars, bubbles, snow, fireflies, dust, confetti). Layers scroll with parallax.
 *
 *   this.backdrop = createBackdrop(this);           // in create()
 *   this.backdrop.update(delta);                     // in update()
 *   this.backdrop.speed = 20 * U;                    // auto-scroll for runners (px per second)
 *
 * Everything sits at depth < -10, so game objects at depth 0 and up draw on top.
 */
export type Backdrop = {
  /** Horizontal scroll in view pixels per second; layers move at their parallax share of it. */
  speed: number;
  update(deltaMs: number): void;
};

const B = THEME.backdrop;
const W = VIEW.width;
const H = VIEW.height;
const LIGHT = luminance(B.sky[1]) > 0.55;

/** A smooth periodic random profile over `width` (seamless when tiled). */
function profile(width: number, seed: number, kind: "smooth" | "jagged") {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const waves = Array.from({ length: kind === "jagged" ? 7 : 3 }, (_, i) => ({
    f: kind === "jagged" ? [2, 3, 5, 7, 11, 13, 17][i] : [1, 2, 3][i],
    a: (kind === "jagged" ? 1 / (i + 1.2) : 1 / (i + 1)) * (0.6 + rand() * 0.8),
    p: rand() * Math.PI * 2,
  }));
  const norm = waves.reduce((n, w) => n + w.a, 0);
  return (x: number) => {
    let v = 0;
    for (const w of waves) {
      const t = (x / width) * Math.PI * 2 * w.f + w.p;
      v += w.a * (kind === "jagged" ? 1 - Math.abs(Math.sin(t)) * 2 : Math.sin(t));
    }
    return v / norm; // -1..1
  };
}

function silhouetteLayer(scene: Phaser.Scene, index: number, color: string) {
  const kind = B.silhouettes;
  const tw = W * 2;
  const height = Math.round(H * [0.42, 0.34, 0.24][index]);
  const key = custom(scene, `bd-sil-${kind}-${index}`, tw, height, (ctx, w, h) => {
    const smooth = kind === "hills" || kind === "dunes" || kind === "trees";
    const f = profile(w, 7 + index * 13, smooth ? "smooth" : "jagged");
    const amp = kind === "dunes" ? 0.18 : kind === "hills" ? 0.28 : 0.38;
    const base = h * (kind === "city" ? 0.55 : 0.45);
    const yAt = (x: number) => base + f(x) * h * amp - h * 0.1;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    if (kind === "city") {
      // Blocks of buildings, seamless across the edge.
      let x = 0;
      let seed = index * 31 + 3;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const blocks: [number, number, number][] = [];
      while (x < w) {
        const bw = h * (0.12 + rand() * 0.18);
        const top = h * (0.15 + rand() * 0.55);
        blocks.push([x, Math.min(bw, w - x), top]);
        x += bw;
      }
      for (const [bx, bw, top] of blocks) ctx.rect(bx, top, bw + 1, h - top);
      ctx.fill();
      if (index === 2) {
        ctx.fillStyle = rgba(THEME.palette.accent, LIGHT ? 0.35 : 0.55);
        for (const [bx, bw, top] of blocks) {
          for (let wy = top + h * 0.05; wy < h - h * 0.08; wy += h * 0.09) {
            for (let wx = bx + bw * 0.15; wx < bx + bw - bw * 0.2; wx += bw * 0.28) {
              if (((wx * 7 + wy * 13) | 0) % 3 === 0) ctx.fillRect(wx, wy, bw * 0.12, h * 0.04);
            }
          }
        }
      }
      return;
    }
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, yAt(x));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    if (kind === "trees") {
      // A canopy of rounded and pointed trees along the ridge.
      const step = h * (0.16 - index * 0.03);
      for (let x = 0; x < w; x += step) {
        const y = yAt(x);
        const th = h * (0.22 + ((x * 13) % 7) / 40) * (1 + index * 0.15);
        if (((x / step) | 0) % 3 === 0) {
          ctx.beginPath();
          ctx.arc(x, y - th * 0.45, th * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x - th * 0.32, y + 2);
          ctx.lineTo(x, y - th);
          ctx.lineTo(x + th * 0.32, y + 2);
          ctx.fill();
        }
      }
    }
    // A thin lit rim along the top edge gives every layer depth.
    ctx.strokeStyle = rgba(lighten(color, LIGHT ? 0.35 : 0.25), 0.7);
    ctx.lineWidth = Math.max(1, U * 0.3);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) (x ? ctx.lineTo : ctx.moveTo).call(ctx, x, yAt(x) + 1);
    if (kind !== "trees") ctx.stroke();
  });
  const horizon = B.grid ? H * 0.62 : H;
  return scene.add
    .tileSprite(0, horizon - height + (B.grid ? height * 0.12 : 0), W, height, key)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(-80 + index * 5);
}

export function createBackdrop(scene: Phaser.Scene): Backdrop {
  const updaters: ((dt: number, scroll: number) => void)[] = [];

  // Sky.
  const sky = custom(scene, "bd-sky", W, H, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, B.sky[0]);
    g.addColorStop(B.grid ? 0.62 : 1, B.sky[1]);
    if (B.grid) g.addColorStop(1, B.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  scene.add.image(0, 0, sky).setOrigin(0, 0).setScrollFactor(0).setDepth(-100);

  // Nebula or haze: big soft color clouds.
  if (!LIGHT) {
    const g = glow(scene, 32);
    [THEME.palette.secondary, THEME.palette.primary, THEME.palette.secondary].forEach((c, i) => {
      const img = scene.add
        .image(W * (0.2 + i * 0.32), H * (0.25 + (i % 2) * 0.2), g)
        .setTint(hex(c))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(B.particles === "stars" && B.silhouettes === "none" ? 0.22 : 0.1)
        .setScale((H * (0.55 + i * 0.1)) / 32)
        .setScrollFactor(0)
        .setDepth(-98);
      scene.tweens.add({ targets: img, x: img.x + W * 0.05, duration: 9000 + i * 2000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    });
  }

  // Stars far behind everything.
  if (B.particles === "stars") {
    for (const [layer, count, size, alpha] of [
      [0, 120, 0.22, 0.55],
      [1, 50, 0.38, 0.85],
    ] as const) {
      const key = custom(scene, `bd-stars-${layer}`, W, H, (ctx, w, h) => {
        let s = 17 + layer * 101;
        const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < count; i++) {
          ctx.fillStyle = rgba(i % 7 === 0 ? THEME.palette.accent : "#ffffff", alpha * (0.4 + r() * 0.6));
          ctx.beginPath();
          ctx.arc(r() * w, r() * h * (B.grid ? 0.62 : 0.9), Math.max(0.6, U * size * (0.5 + r())), 0, Math.PI * 2);
          ctx.fill();
        }
      });
      const t = scene.add.tileSprite(0, 0, W, H, key).setOrigin(0, 0).setScrollFactor(0).setDepth(-97 + layer);
      updaters.push((dt, scroll) => (t.tilePositionX += scroll * dt * (0.02 + layer * 0.04) + dt * U * 0.15));
    }
    const g = glow(scene, 32);
    for (let i = 0; i < 14; i++) {
      const twinkle = scene.add
        .image(Math.random() * W, Math.random() * H * 0.55, g)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale((U * 1.2) / 32)
        .setAlpha(0)
        .setScrollFactor(0)
        .setDepth(-95);
      scene.tweens.add({ targets: twinkle, alpha: 0.9, duration: 700 + Math.random() * 900, delay: Math.random() * 4000, yoyo: true, repeat: -1, repeatDelay: Math.random() * 3000 });
    }
  }

  // Sun or moon.
  if (B.orb) {
    const r = Math.round(H * (B.grid ? 0.2 : 0.13));
    const ox = B.grid ? W * 0.5 : W * 0.74;
    const oy = B.grid ? H * 0.47 : H * 0.28;
    scene.add
      .image(ox, oy, glow(scene, 32))
      .setTint(hex(B.orb))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(LIGHT ? 0.5 : 0.65)
      .setScale((r * 3.2) / 32)
      .setScrollFactor(0)
      .setDepth(-92);
    const disc = custom(scene, `bd-orb-${r}`, r * 2, r * 2, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, lighten(B.orb!, 0.55));
      g.addColorStop(1, B.orb!);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      if (B.grid) {
        // Synthwave sun: horizontal cuts that thicken toward the bottom.
        ctx.globalCompositeOperation = "destination-out";
        for (let i = 0; i < 7; i++) {
          const y = h * (0.5 + i * 0.075);
          ctx.fillRect(0, y, w, Math.max(1, h * 0.012 * (i + 1)));
        }
        ctx.globalCompositeOperation = "source-over";
      }
    });
    scene.add.image(ox, oy, disc).setScrollFactor(0).setDepth(-91);
  }

  // Clouds drift across light skies.
  if (LIGHT && B.silhouettes !== "city") {
    for (let i = 0; i < 5; i++) {
      const c = scene.add
        .image(Math.random() * W, H * (0.08 + Math.random() * 0.3), cloud(scene, { width: W * (0.12 + Math.random() * 0.1), color: lighten(B.sky[1], 0.6) }))
        .setAlpha(0.9)
        .setScrollFactor(0)
        .setDepth(-90);
      const drift = (0.6 + Math.random()) * U;
      updaters.push((dt, scroll) => {
        c.x -= dt * (drift + scroll * 0.05);
        if (c.x < -c.width) c.x = W + c.width;
      });
    }
  }

  // Silhouettes: far hazy, near dark (or saturated on light themes).
  if (B.silhouettes !== "none") {
    const baseColor = LIGHT ? THEME.palette.secondary : darken(THEME.palette.bg, 0.15);
    const layers = B.grid ? [0] : [0, 1, 2];
    for (const i of layers) {
      const color = mix(B.sky[1], baseColor, B.grid ? 0.75 : [0.35, 0.62, 0.92][i]);
      const t = silhouetteLayer(scene, i, color);
      const factor = [0.08, 0.2, 0.45][i];
      updaters.push((dt, scroll) => (t.tilePositionX += scroll * dt * factor + dt * U * 0.1 * (i + 1)));
    }
  }

  // Synthwave grid floor rushing toward the viewer.
  if (B.grid) {
    const horizon = H * 0.62;
    const floor = custom(scene, "bd-floor", W, H - horizon, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, mix(THEME.palette.bg, THEME.palette.secondary, 0.25));
      g.addColorStop(1, THEME.palette.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    scene.add.image(0, horizon, floor).setOrigin(0, 0).setScrollFactor(0).setDepth(-60);
    const lines = scene.add.graphics().setScrollFactor(0).setDepth(-59).setBlendMode(Phaser.BlendModes.ADD);
    let phase = 0;
    updaters.push((dt, scroll) => {
      phase = (phase + dt * (0.35 + scroll / (W * 0.5))) % 1;
      lines.clear();
      const color = hex(THEME.palette.secondary);
      for (let i = 0; i < 14; i++) {
        const z = (i + phase) / 14;
        const y = horizon + (H - horizon) * z * z;
        lines.lineStyle(Math.max(1, U * 0.25 * (0.4 + z)), color, 0.15 + z * 0.6);
        lines.lineBetween(0, y, W, y);
      }
      for (let i = -12; i <= 12; i++) {
        lines.lineStyle(Math.max(1, U * 0.22), color, 0.45);
        lines.lineBetween(W / 2 + i * W * 0.02, horizon, W / 2 + i * W * 0.16, H);
      }
    });
    scene.add.rectangle(0, horizon - 1, W, Math.max(2, U * 0.4), hex(lighten(THEME.palette.secondary, 0.3)), 0.9).setOrigin(0, 0).setScrollFactor(0).setDepth(-58).setBlendMode(Phaser.BlendModes.ADD);
  }

  // Ambient particles in front of the backdrop, behind the action.
  const glowKey = glow(scene, 32);
  switch (B.particles) {
    case "bubbles": {
      ring(scene, { radius: 16, thickness: 2 });
      scene.add
        .particles(0, 0, "ring-16-2-#ffffff", {
          x: { min: 0, max: W },
          y: H + 20,
          speedY: { min: -9 * U, max: -3 * U },
          speedX: { min: -1 * U, max: 1 * U },
          lifespan: 14000,
          frequency: 260,
          scale: { min: U / 40, max: U / 14 },
          alpha: { start: 0.45, end: 0 },
        })
        .setScrollFactor(0)
        .setDepth(-20);
      // Light shafts from the surface.
      const shaft = custom(scene, "bd-shaft", 64, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(255,255,255,0.9)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(w * 0.35, 0);
        ctx.lineTo(w * 0.65, 0);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();
      });
      for (let i = 0; i < 4; i++) {
        const s = scene.add
          .image(W * (0.15 + i * 0.25), -H * 0.05, shaft)
          .setOrigin(0.5, 0)
          .setTint(hex(THEME.palette.primary))
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.07)
          .setScale((W * 0.12) / 64, (H * 1.1) / 256)
          .setAngle(-12 + i * 4)
          .setScrollFactor(0)
          .setDepth(-85);
        scene.tweens.add({ targets: s, alpha: 0.13, angle: s.angle + 5, duration: 5000 + i * 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
      break;
    }
    case "snow":
      scene.add
        .particles(0, 0, glowKey, {
          x: { min: -W * 0.1, max: W },
          y: -10,
          speedY: { min: 3 * U, max: 9 * U },
          speedX: { min: 0, max: 3 * U },
          lifespan: 16000,
          frequency: 90,
          scale: { min: U / 50, max: U / 18 },
          alpha: { min: 0.5, max: 0.95 },
        })
        .setScrollFactor(0)
        .setDepth(-20);
      break;
    case "fireflies":
      for (let i = 0; i < 22; i++) {
        const f = scene.add
          .image(Math.random() * W, H * (0.3 + Math.random() * 0.65), glowKey)
          .setTint(hex(THEME.palette.accent))
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale((U * (1.2 + Math.random() * 1.4)) / 32)
          .setAlpha(0)
          .setScrollFactor(0)
          .setDepth(-20);
        scene.tweens.add({ targets: f, alpha: 0.9, duration: 900 + Math.random() * 1200, yoyo: true, repeat: -1, delay: Math.random() * 3000 });
        scene.tweens.add({ targets: f, x: f.x + (Math.random() - 0.5) * 12 * U, y: f.y + (Math.random() - 0.5) * 8 * U, duration: 3000 + Math.random() * 3000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
      break;
    case "dust":
      scene.add
        .particles(0, 0, glowKey, {
          x: { min: 0, max: W },
          y: { min: 0, max: H },
          speedX: { min: -1.5 * U, max: 1.5 * U },
          speedY: { min: -1 * U, max: 0.5 * U },
          lifespan: 7000,
          frequency: 200,
          scale: { min: U / 60, max: U / 22 },
          alpha: { start: 0, end: LIGHT ? 0.5 : 0.7, ease: "Sine.easeInOut" },
          tint: hex(LIGHT ? "#ffffff" : lighten(THEME.palette.accent, 0.4)),
          blendMode: Phaser.BlendModes.ADD,
        })
        .setScrollFactor(0)
        .setDepth(-20);
      break;
    case "confetti":
      chip(scene, 6);
      scene.add
        .particles(0, 0, "chip-6", {
          x: { min: 0, max: W },
          y: -10,
          speedY: { min: 3 * U, max: 7 * U },
          speedX: { min: -2 * U, max: 2 * U },
          rotate: { start: 0, end: 360 },
          lifespan: 16000,
          frequency: 220,
          scale: { min: U / 10, max: U / 6 },
          alpha: 0.6,
          tint: [THEME.palette.primary, THEME.palette.secondary, THEME.palette.accent, THEME.palette.good].map(hex),
        })
        .setScrollFactor(0)
        .setDepth(-20);
      break;
    case "stars":
      break;
  }

  const backdrop: Backdrop = {
    speed: 0,
    update(deltaMs) {
      const dt = Math.min(0.05, deltaMs / 1000);
      for (const u of updaters) u(dt, backdrop.speed);
    },
  };
  return backdrop;
}
