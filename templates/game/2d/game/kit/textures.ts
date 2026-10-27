import type * as Phaser from "phaser";
import { THEME } from "@/game/theme";
import { darken, lighten, rgba } from "./color";

/**
 * Good-looking sprites without image files. Every function draws a texture once (shaded,
 * outlined, with a highlight, in the theme's style) and returns its key for
 * `scene.add.image(x, y, key)` / `scene.physics.add.sprite(x, y, key)`.
 *
 *   const key = textures.creature(this, { radius: 5 * U, color: THEME.palette.primary });
 *   this.player = this.physics.add.sprite(x, y, key);
 *
 * Sizes are in view pixels (use U from ./view). Never draw game objects as plain rectangles
 * or circles: use these, or `textures.custom` with the same shading rules.
 */

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const CEL = THEME.art.shading === "cel";

/** Outline color for a fill: the theme's ink for inked styles, else a deep shade of the fill. */
function outline(color: string) {
  return THEME.art.outline ?? darken(color, 0.55);
}

function lineWidth(size: number) {
  return Math.max(1, Math.round(size * 0.07));
}

/** Draw your own texture with a 2D canvas. Returns the key. Drawn once per key. */
export function custom(scene: Phaser.Scene, key: string, width: number, height: number, draw: Draw) {
  if (scene.textures.exists(key)) return key;
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = !THEME.fx.pixelArt;
  draw(ctx, w, h);
  tex.refresh();
  return key;
}

/** A fill with volume: light from the top left, shadow bottom right. */
function bodyFill(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number) {
  if (CEL) return color;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.05);
  g.addColorStop(0, lighten(color, 0.4));
  g.addColorStop(0.5, color);
  g.addColorStop(1, darken(color, 0.3));
  return g;
}

/** Cel shading: a darker crescent at the bottom right, clipped to the current path. */
function celShade(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.clip();
  ctx.fillStyle = darken(color, 0.22);
  ctx.beginPath();
  ctx.arc(cx + r * 0.35, cy + r * 0.35, r * 1.05, 0, Math.PI * 2);
  ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 1.05, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  ctx.restore();
}

function highlight(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha = 0.8) {
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.38, cy - r * 0.42, r * 0.26, r * 0.15, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ball(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bodyFill(ctx, color, cx, cy, r);
  ctx.fill();
  if (CEL) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    celShade(ctx, color, cx, cy, r);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = lineWidth(r * 2);
  ctx.strokeStyle = outline(color);
  ctx.stroke();
}

/** A glossy ball: projectiles, coins seen from far, planets, bubbles. */
export function orb(scene: Phaser.Scene, o: { radius: number; color: string }) {
  const r = Math.round(o.radius);
  const pad = lineWidth(r * 2) + 1;
  return custom(scene, `orb-${r}-${o.color}`, r * 2 + pad * 2, r * 2 + pad * 2, (ctx, w) => {
    ball(ctx, o.color, w / 2, w / 2, r);
    highlight(ctx, w / 2, w / 2, r);
  });
}

/**
 * A character with eyes: the fastest way to make a player, an enemy or a pet feel alive.
 * `look` turns the eyes (radians, 0 = right). `mood: "angry"` adds brows for enemies.
 */
export function creature(
  scene: Phaser.Scene,
  o: { radius: number; color: string; look?: number; mood?: "happy" | "angry"; squish?: number },
) {
  const r = Math.round(o.radius);
  const look = o.look ?? 0;
  const squish = o.squish ?? 0.92;
  const pad = lineWidth(r * 2) + 2;
  const key = `creature-${r}-${o.color}-${look.toFixed(2)}-${o.mood ?? "happy"}-${squish}`;
  return custom(scene, key, r * 2 + pad * 2, r * 2 + pad * 2, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2 + r * (1 - squish) * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, squish);
    ball(ctx, o.color, 0, 0, r);
    ctx.restore();
    highlight(ctx, cx, cy - r * 0.05, r * 0.9, 0.55);

    const ex = Math.cos(look) * r * 0.18;
    const ey = Math.sin(look) * r * 0.12;
    const eyeR = r * 0.24;
    for (const side of [-1, 1]) {
      const x = cx + side * r * 0.36 + ex;
      const y = cy - r * 0.12 + ey;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(x, y, eyeR * 0.85, eyeR, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.strokeStyle = outline(o.color);
      ctx.stroke();
      ctx.fillStyle = "#16121f";
      ctx.beginPath();
      ctx.arc(x + Math.cos(look) * eyeR * 0.35, y + Math.sin(look) * eyeR * 0.3, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x + Math.cos(look) * eyeR * 0.35 - eyeR * 0.18, y - eyeR * 0.22, eyeR * 0.18, 0, Math.PI * 2);
      ctx.fill();
      if (o.mood === "angry") {
        ctx.strokeStyle = outline(o.color);
        ctx.lineWidth = Math.max(1, r * 0.1);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - side * eyeR * 1.0, y - eyeR * 1.45);
        ctx.lineTo(x + side * eyeR * 0.8, y - eyeR * 0.85);
        ctx.stroke();
      }
    }
    if (o.mood !== "angry") {
      ctx.fillStyle = rgba("#ff7a9a", 0.35);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + side * r * 0.6 + ex, cy + r * 0.2 + ey, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** A faceted gem: pickups, treasure, crystals. */
export function gem(scene: Phaser.Scene, o: { radius: number; color: string }) {
  const r = Math.round(o.radius);
  const pad = lineWidth(r * 2) + 1;
  return custom(scene, `gem-${r}-${o.color}`, r * 1.6 + pad * 2, r * 2 + pad * 2, (ctx, w, h) => {
    const cx = w / 2;
    const top = pad;
    const bottom = h - pad;
    const mid = top + r * 0.62;
    const hw = r * 0.8;
    const facets: [string, [number, number][]][] = [
      [lighten(o.color, 0.45), [[cx, top], [cx - hw, mid], [cx, mid]]],
      [lighten(o.color, 0.2), [[cx, top], [cx + hw, mid], [cx, mid]]],
      [o.color, [[cx - hw, mid], [cx, bottom], [cx, mid]]],
      [darken(o.color, 0.25), [[cx + hw, mid], [cx, bottom], [cx, mid]]],
    ];
    for (const [fill, pts] of facets) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx + hw, mid);
    ctx.lineTo(cx, bottom);
    ctx.lineTo(cx - hw, mid);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth(r * 2);
    ctx.strokeStyle = outline(o.color);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(cx - hw * 0.35, mid - r * 0.18, Math.max(1, r * 0.1), 0, Math.PI * 2);
    ctx.fill();
  });
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points = 5, inner = 0.48) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** A chunky star: rewards, power-ups, ratings. */
export function star(scene: Phaser.Scene, o: { radius: number; color: string; points?: number }) {
  const r = Math.round(o.radius);
  const pad = lineWidth(r * 2) + 1;
  return custom(scene, `star-${r}-${o.color}-${o.points ?? 5}`, r * 2 + pad * 2, r * 2 + pad * 2, (ctx, w) => {
    const c = w / 2;
    starPath(ctx, c, c + r * 0.05, r, o.points ?? 5);
    ctx.fillStyle = bodyFill(ctx, o.color, c, c, r);
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth(r * 2);
    ctx.strokeStyle = outline(o.color);
    ctx.stroke();
    highlight(ctx, c + r * 0.1, c + r * 0.15, r * 0.6, 0.7);
  });
}

/** A heart: health pickups, lives. */
export function heart(scene: Phaser.Scene, o: { radius: number; color: string }) {
  const r = Math.round(o.radius);
  const pad = lineWidth(r * 2) + 1;
  return custom(scene, `heart-${r}-${o.color}`, r * 2 + pad * 2, r * 2 + pad * 2, (ctx, w) => {
    const c = w / 2;
    ctx.beginPath();
    ctx.moveTo(c, c + r * 0.85);
    ctx.bezierCurveTo(c - r * 1.4, c - r * 0.1, c - r * 0.6, c - r * 1.15, c, c - r * 0.45);
    ctx.bezierCurveTo(c + r * 0.6, c - r * 1.15, c + r * 1.4, c - r * 0.1, c, c + r * 0.85);
    ctx.closePath();
    ctx.fillStyle = bodyFill(ctx, o.color, c, c, r);
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth(r * 2);
    ctx.strokeStyle = outline(o.color);
    ctx.stroke();
    highlight(ctx, c - r * 0.1, c - r * 0.05, r * 0.7, 0.7);
  });
}

/** A rounded block with a bevel: platforms, walls, crates, tiles, buttons in the world. */
export function box(scene: Phaser.Scene, o: { width: number; height: number; color: string; radius?: number }) {
  const w0 = Math.round(o.width);
  const h0 = Math.round(o.height);
  const rad = Math.round(o.radius ?? Math.min(w0, h0) * 0.18);
  const lw = lineWidth(Math.min(w0, h0));
  return custom(scene, `box-${w0}x${h0}-${rad}-${o.color}`, w0, h0, (ctx, w, h) => {
    const x = lw / 2;
    const y = lw / 2;
    const bw = w - lw;
    const bh = h - lw;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, rad);
    if (CEL) {
      ctx.fillStyle = o.color;
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, lighten(o.color, 0.18));
      g.addColorStop(0.55, o.color);
      g.addColorStop(1, darken(o.color, 0.22));
      ctx.fillStyle = g;
    }
    ctx.fill();
    // Bevel: a lit top edge and a shaded lower lip.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = darken(o.color, 0.25);
    ctx.fillRect(0, h - Math.max(lw * 1.5, bh * 0.16), w, h);
    ctx.fillStyle = rgba("#ffffff", 0.35);
    ctx.fillRect(0, 0, w, Math.max(1, Math.min(bh * 0.12, lw * 1.5)));
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, rad);
    ctx.lineWidth = lw;
    ctx.strokeStyle = outline(o.color);
    ctx.stroke();
  });
}

/** A ship or arrow pointing right (rotation 0): shooters, racers, cursors. */
export function ship(scene: Phaser.Scene, o: { size: number; color: string; accent?: string }) {
  const s = Math.round(o.size);
  const lw = lineWidth(s);
  const accent = o.accent ?? THEME.palette.accent;
  return custom(scene, `ship-${s}-${o.color}-${accent}`, s + lw * 2, s * 0.8 + lw * 2, (ctx, w, h) => {
    const cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(w - lw, cy);
    ctx.lineTo(lw, lw);
    ctx.lineTo(w * 0.28, cy);
    ctx.lineTo(lw, h - lw);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, lighten(o.color, 0.3));
    g.addColorStop(0.5, o.color);
    g.addColorStop(1, darken(o.color, 0.3));
    ctx.fillStyle = CEL ? o.color : g;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = lw;
    ctx.strokeStyle = outline(o.color);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(w * 0.58, cy, s * 0.13, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(w * 0.6, cy - s * 0.03, s * 0.05, s * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** A spiked ball: hazards, mines, enemies that hurt on touch. */
export function spikes(scene: Phaser.Scene, o: { radius: number; color: string; points?: number }) {
  const r = Math.round(o.radius);
  const n = o.points ?? 10;
  const pad = lineWidth(r * 2) + 1;
  return custom(scene, `spikes-${r}-${o.color}-${n}`, r * 2 + pad * 2, r * 2 + pad * 2, (ctx, w) => {
    const c = w / 2;
    starPath(ctx, c, c, r, n, 0.68);
    ctx.fillStyle = lighten(o.color, 0.1);
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth(r * 2);
    ctx.strokeStyle = outline(o.color);
    ctx.stroke();
    ball(ctx, o.color, c, c, r * 0.58);
    highlight(ctx, c, c, r * 0.58, 0.6);
  });
}

/** A ring: shockwaves, targets, portals. White by default so it can be tinted. */
export function ring(scene: Phaser.Scene, o: { radius: number; thickness?: number; color?: string }) {
  const r = Math.round(o.radius);
  const t = Math.max(1, Math.round(o.thickness ?? r * 0.12));
  const color = o.color ?? "#ffffff";
  return custom(scene, `ring-${r}-${t}-${color}`, r * 2 + t * 2, r * 2 + t * 2, (ctx, w) => {
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, r, 0, Math.PI * 2);
    ctx.lineWidth = t;
    ctx.strokeStyle = color;
    ctx.stroke();
  });
}

/** A soft round light, white: tint it. For glows, auras, particles, light pools. */
export function glow(scene: Phaser.Scene, radius = 32) {
  const r = Math.round(radius);
  return custom(scene, `glow-${r}`, r * 2, r * 2, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, r);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.65)");
    g.addColorStop(0.6, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

/** A short streak of light, white, pointing right: sparks, speed lines, debris. */
export function spark(scene: Phaser.Scene, length = 16) {
  const l = Math.round(length);
  const h = Math.max(2, Math.round(l / 4));
  return custom(scene, `spark-${l}`, l, h, (ctx, w, hh) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** A small square, white: confetti, pixels, debris. */
export function chip(scene: Phaser.Scene, size = 6) {
  const s = Math.max(2, Math.round(size));
  return custom(scene, `chip-${s}`, s, s, (ctx, w) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, w);
  });
}

/** A puffy cloud. */
export function cloud(scene: Phaser.Scene, o: { width: number; color?: string }) {
  const w0 = Math.round(o.width);
  const color = o.color ?? "#ffffff";
  return custom(scene, `cloud-${w0}-${color}`, w0, w0 * 0.55, (ctx, w, h) => {
    const puffs: [number, number, number][] = [
      [0.25, 0.68, 0.2],
      [0.45, 0.48, 0.27],
      [0.68, 0.55, 0.22],
      [0.82, 0.72, 0.15],
      [0.5, 0.75, 0.22],
    ];
    ctx.fillStyle = color;
    for (const [x, y, r] of puffs) {
      ctx.beginPath();
      ctx.arc(x * w, y * h, r * w, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = rgba(darken(color, 0.15), 0.6);
    ctx.fillRect(0, h * 0.78, w, h);
    ctx.globalCompositeOperation = "source-over";
  });
}

/** Makes sure the textures the kit's effects use exist. Called by fx and backdrop. */
export function ensureFxTextures(scene: Phaser.Scene) {
  glow(scene, 32);
  spark(scene, 24);
  chip(scene, 6);
  ring(scene, { radius: 64, thickness: 6 });
}
