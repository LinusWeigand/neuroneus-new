import type * as Phaser from "phaser";
import { THEME } from "@/game/theme";
import { darken, lighten, rgba } from "./color";
import { custom } from "./textures";

/**
 * Recognizable things: animals and everyday objects drawn so that a child names them at
 * first glance (a bunny has long ears and a cotton tail, a fox a pointed snout and a bushy
 * tail, a carrot is an orange taper with green leaves). When the spec names a thing, use
 * the matching sprite here; never stand in a gem for a carrot or a ball for an animal.
 * Missing something? Draw it with `custom()` in the same style: soft shading, a dark outline,
 * a highlight, the defining features exaggerated.
 *
 *   const key = sprites.animal(this, { kind: "bunny", size: 9 * U, accent: THEME.palette.primary });
 *   const carrot = sprites.carrot(this, { size: 5 * U });
 *
 * Animals are drawn in a friendly three-quarter view facing right; flip with setFlipX(true).
 * `size` is the sprite's height in view pixels.
 */

type Ctx = CanvasRenderingContext2D;

const outline = (c: string) => THEME.art.outline ?? darken(c, 0.55);
const lw = (size: number) => Math.max(1, size * 0.035);

function shade(ctx: Ctx, color: string, x: number, y: number, r: number) {
  if (THEME.art.shading === "cel") return color;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r * 1.1);
  g.addColorStop(0, lighten(color, 0.32));
  g.addColorStop(0.55, color);
  g.addColorStop(1, darken(color, 0.22));
  return g;
}

/** Fill and outline the current path. */
function paint(ctx: Ctx, color: string, size: number, x: number, y: number, r: number) {
  ctx.fillStyle = shade(ctx, color, x, y, r);
  ctx.fill();
  ctx.lineWidth = lw(size);
  ctx.lineJoin = "round";
  ctx.strokeStyle = outline(color);
  ctx.stroke();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function eyeAt(ctx: Ctx, x: number, y: number, r: number, angry: boolean, color: string) {
  ctx.fillStyle = "#ffffff";
  ellipse(ctx, x, y, r * 0.85, r);
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.strokeStyle = outline(color);
  ctx.stroke();
  ctx.fillStyle = "#1a1420";
  ellipse(ctx, x + r * 0.25, y + r * 0.05, r * 0.55, r * 0.65);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ellipse(ctx, x + r * 0.05, y - r * 0.3, r * 0.2, r * 0.2);
  ctx.fill();
  if (angry) {
    ctx.strokeStyle = "#1a1420";
    ctx.lineWidth = Math.max(1, r * 0.35);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.9, y - r * 1.5);
    ctx.lineTo(x + r * 0.9, y - r * 0.9);
    ctx.stroke();
  }
}

export type AnimalKind = "bunny" | "fox" | "cat" | "bear" | "mouse" | "frog" | "bird" | "eagle";

/** Natural fur colors; `color` overrides, `accent` adds a scarf in a role color (e.g. the player's primary). */
const FUR: Record<AnimalKind, { fur: string; belly: string }> = {
  bunny: { fur: "#efe4d6", belly: "#ffffff" },
  fox: { fur: "#e8743b", belly: "#fff4e6" },
  cat: { fur: "#9aa3ad", belly: "#eef0f2" },
  bear: { fur: "#a0693f", belly: "#e8c9a0" },
  mouse: { fur: "#b8b3ae", belly: "#f1ece6" },
  frog: { fur: "#6cc04a", belly: "#d9f2a8" },
  bird: { fur: "#5aa9e6", belly: "#fff1c9" },
  eagle: { fur: "#7a4a2a", belly: "#f6efe6" },
};

/**
 * An animal character. kind: bunny, fox, cat, bear, mouse, frog, bird, eagle.
 * mood "angry" for enemies; pose "run" stretches it forward; eagles spread their wings
 * (pose "dive" points them down for a swoop).
 */
export function animal(
  scene: Phaser.Scene,
  o: { kind: AnimalKind; size: number; color?: string; accent?: string; mood?: "happy" | "angry"; pose?: "stand" | "run" | "dive" },
) {
  const S = Math.round(o.size);
  const fur = o.color ?? FUR[o.kind].fur;
  const belly = FUR[o.kind].belly;
  const angry = o.mood === "angry";
  const pose = o.pose ?? "stand";
  const wide = o.kind === "eagle" ? 1.9 : o.kind === "fox" ? 1.45 : 1.15;
  const key = `animal-${o.kind}-${S}-${fur}-${o.accent ?? ""}-${o.mood ?? ""}-${pose}`;
  return custom(scene, key, S * wide, S, (ctx, w, h) => {
    ctx.lineCap = "round";
    if (o.kind === "eagle") return drawEagle(ctx, w, h, fur, belly, angry, pose);
    const run = pose === "run";
    // Layout: body lower left, head upper right (three-quarter view facing right).
    const bodyX = w * (o.kind === "fox" ? 0.45 : 0.42);
    const bodyY = h * 0.68;
    const bodyR = h * (o.kind === "bear" ? 0.27 : 0.23);
    const headX = w * (o.kind === "fox" ? 0.68 : 0.6) + (run ? w * 0.04 : 0);
    const headY = h * (o.kind === "bunny" ? 0.5 : 0.44);
    const headR = h * (o.kind === "bear" ? 0.22 : o.kind === "frog" ? 0.21 : 0.2);

    // Tail behind the body.
    if (o.kind === "fox") {
      ctx.beginPath();
      ctx.moveTo(bodyX - bodyR * 0.6, bodyY - bodyR * 0.1);
      ctx.bezierCurveTo(w * 0.02, h * 0.45, w * 0.0, h * 0.9, bodyX - bodyR * 0.3, bodyY + bodyR * 0.7);
      ctx.closePath();
      paint(ctx, fur, S, w * 0.15, h * 0.7, bodyR);
      ctx.fillStyle = "#ffffff";
      ellipse(ctx, w * 0.06, h * 0.72, h * 0.07, h * 0.09, 0.4);
      ctx.fill();
    } else if (o.kind === "cat" || o.kind === "mouse") {
      ctx.strokeStyle = outline(fur);
      ctx.lineWidth = h * (o.kind === "cat" ? 0.07 : 0.035);
      ctx.beginPath();
      ctx.moveTo(bodyX - bodyR * 0.8, bodyY + bodyR * 0.2);
      ctx.quadraticCurveTo(w * 0.04, bodyY, w * 0.1, h * 0.35);
      ctx.stroke();
      ctx.strokeStyle = fur;
      ctx.lineWidth = h * (o.kind === "cat" ? 0.045 : 0.018);
      ctx.stroke();
    } else if (o.kind === "bunny") {
      ellipse(ctx, bodyX - bodyR * 0.95, bodyY - bodyR * 0.1, h * 0.09, h * 0.09);
      paint(ctx, "#ffffff", S, bodyX - bodyR, bodyY, h * 0.09);
    }

    // Feet.
    const feetY = h * 0.93;
    for (const dx of run ? [-0.9, 0.7] : [-0.45, 0.45]) {
      ellipse(ctx, bodyX + dx * bodyR, feetY, h * (o.kind === "bunny" ? 0.1 : 0.075), h * 0.05);
      paint(ctx, o.kind === "fox" ? "#3b2a26" : darken(fur, 0.08), S, bodyX + dx * bodyR, feetY, h * 0.08);
    }
    // Body with a lighter belly.
    ellipse(ctx, bodyX, bodyY, bodyR * (run ? 1.35 : 1.15), bodyR, run ? -0.12 : 0);
    paint(ctx, fur, S, bodyX, bodyY, bodyR * 1.2);
    ctx.save();
    ellipse(ctx, bodyX, bodyY, bodyR * (run ? 1.35 : 1.15), bodyR, run ? -0.12 : 0);
    ctx.clip();
    ctx.fillStyle = belly;
    ellipse(ctx, bodyX + bodyR * 0.45, bodyY + bodyR * 0.35, bodyR * 0.7, bodyR * 0.65);
    ctx.fill();
    ctx.restore();

    // Ears behind the head.
    const ear = (ex: number, ey: number, tilt: number) => {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(tilt);
      if (o.kind === "bunny") {
        ellipse(ctx, 0, -h * 0.17, h * 0.065, h * 0.2);
        paint(ctx, fur, S, 0, -h * 0.17, h * 0.2);
        ctx.fillStyle = "#ffb3c7";
        ellipse(ctx, h * 0.005, -h * 0.17, h * 0.032, h * 0.14);
        ctx.fill();
      } else if (o.kind === "fox" || o.kind === "cat") {
        ctx.beginPath();
        ctx.moveTo(-h * 0.08, 0);
        ctx.lineTo(0, -h * (o.kind === "fox" ? 0.2 : 0.15));
        ctx.lineTo(h * 0.08, 0);
        ctx.closePath();
        paint(ctx, fur, S, 0, -h * 0.08, h * 0.1);
        ctx.fillStyle = o.kind === "fox" ? "#3b2a26" : "#ffb3c7";
        ctx.beginPath();
        ctx.moveTo(-h * 0.035, -h * 0.03);
        ctx.lineTo(0, -h * (o.kind === "fox" ? 0.17 : 0.11));
        ctx.lineTo(h * 0.035, -h * 0.03);
        ctx.closePath();
        ctx.fill();
      } else if (o.kind === "bear" || o.kind === "mouse") {
        const r = h * (o.kind === "mouse" ? 0.11 : 0.075);
        ellipse(ctx, 0, -r * 0.6, r, r);
        paint(ctx, fur, S, 0, -r * 0.6, r);
        ctx.fillStyle = o.kind === "mouse" ? "#ffb3c7" : darken(fur, 0.2);
        ellipse(ctx, 0, -r * 0.55, r * 0.55, r * 0.55);
        ctx.fill();
      }
      ctx.restore();
    };
    if (o.kind !== "frog" && o.kind !== "bird") {
      ear(headX - headR * 0.45, headY - headR * 0.75, o.kind === "bunny" ? -0.25 : -0.3);
      ear(headX + headR * 0.35, headY - headR * 0.8, o.kind === "bunny" ? 0.12 : 0.25);
    }

    // Head.
    ellipse(ctx, headX, headY, headR * (o.kind === "frog" ? 1.25 : 1.05), headR);
    paint(ctx, fur, S, headX, headY, headR * 1.1);
    // Snout or beak.
    if (o.kind === "fox") {
      ctx.beginPath();
      ctx.moveTo(headX + headR * 0.2, headY - headR * 0.15);
      ctx.quadraticCurveTo(headX + headR * 1.9, headY + headR * 0.15, headX + headR * 1.75, headY + headR * 0.35);
      ctx.quadraticCurveTo(headX + headR * 0.9, headY + headR * 0.85, headX + headR * 0.1, headY + headR * 0.5);
      ctx.closePath();
      paint(ctx, "#fff4e6", S, headX + headR, headY + headR * 0.3, headR);
      ctx.fillStyle = "#1a1420";
      ellipse(ctx, headX + headR * 1.72, headY + headR * 0.28, headR * 0.15, headR * 0.12);
      ctx.fill();
    } else if (o.kind === "bird") {
      ctx.beginPath();
      ctx.moveTo(headX + headR * 0.85, headY - headR * 0.15);
      ctx.lineTo(headX + headR * 1.55, headY + headR * 0.1);
      ctx.lineTo(headX + headR * 0.85, headY + headR * 0.3);
      ctx.closePath();
      paint(ctx, "#ffb43a", S, headX + headR, headY, headR * 0.4);
    } else if (o.kind !== "frog") {
      ellipse(ctx, headX + headR * 0.55, headY + headR * 0.35, headR * 0.45, headR * 0.32);
      ctx.fillStyle = lighten(fur, 0.45);
      ctx.fill();
      ctx.fillStyle = o.kind === "bunny" || o.kind === "mouse" ? "#ff7f9e" : "#2a1d1d";
      ellipse(ctx, headX + headR * 0.85, headY + headR * 0.22, headR * 0.13, headR * 0.1);
      ctx.fill();
      // Whiskers.
      if (o.kind === "bunny" || o.kind === "cat" || o.kind === "mouse") {
        ctx.strokeStyle = rgba(outline(fur), 0.7);
        ctx.lineWidth = Math.max(1, h * 0.008);
        for (const dy of [-0.05, 0.08]) {
          ctx.beginPath();
          ctx.moveTo(headX + headR * 0.8, headY + headR * (0.35 + dy));
          ctx.lineTo(headX + headR * 1.45, headY + headR * (0.25 + dy * 2));
          ctx.stroke();
        }
      }
    } else {
      ctx.strokeStyle = outline(fur);
      ctx.lineWidth = Math.max(1, h * 0.015);
      ctx.beginPath();
      ctx.arc(headX + headR * 0.25, headY + headR * 0.2, headR * 0.6, 0.2, 1.3);
      ctx.stroke();
    }
    // Eyes and cheeks.
    const eyeR = headR * (o.kind === "frog" ? 0.36 : 0.27);
    const eyeY = headY - headR * (o.kind === "frog" ? 0.6 : 0.15);
    eyeAt(ctx, headX + headR * 0.05, eyeY, eyeR, angry, fur);
    if (o.kind !== "fox" && o.kind !== "bird") eyeAt(ctx, headX + headR * 0.62, eyeY + headR * 0.02, eyeR * 0.85, angry, fur);
    if (!angry) {
      ctx.fillStyle = rgba("#ff7a9a", 0.4);
      ellipse(ctx, headX - headR * 0.2, headY + headR * 0.35, headR * 0.17, headR * 0.1);
      ctx.fill();
    }
    // A scarf in a role color marks who's who (the player's primary, an enemy's danger).
    if (o.accent) {
      ctx.beginPath();
      ctx.ellipse(headX - headR * 0.1, headY + headR * 0.95, headR * 0.85, headR * 0.22, -0.15, 0, Math.PI * 2);
      paint(ctx, o.accent, S, headX, headY + headR, headR * 0.5);
    }
    // Bird wing.
    if (o.kind === "bird") {
      ellipse(ctx, bodyX - bodyR * 0.1, bodyY - bodyR * 0.1, bodyR * 0.75, bodyR * 0.45, -0.5);
      paint(ctx, darken(fur, 0.15), S, bodyX, bodyY, bodyR * 0.6);
    }
  });
}

function drawEagle(ctx: Ctx, w: number, h: number, fur: string, head: string, angry: boolean, pose: string) {
  const cx = w / 2;
  const dive = pose === "dive";
  // Wings: layered feathers, spread wide (or swept back in a dive).
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + side * w * 0.05, h * 0.42);
    ctx.scale(side, 1);
    ctx.rotate(dive ? 0.55 : -0.12);
    for (let i = 0; i < 5; i++) {
      const fx = w * (0.1 + i * 0.075);
      ctx.beginPath();
      ctx.ellipse(fx, h * (0.04 + i * 0.02), w * 0.09, h * 0.07, 0.35 + i * 0.08, 0, Math.PI * 2);
      paint(ctx, i % 2 ? darken(fur, 0.12) : fur, h, fx, h * 0.05, h * 0.1);
    }
    ctx.restore();
  }
  // Tail.
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.05, h * 0.7);
  ctx.lineTo(cx - w * 0.08, h * 0.95);
  ctx.lineTo(cx + w * 0.08, h * 0.95);
  ctx.lineTo(cx + w * 0.05, h * 0.7);
  ctx.closePath();
  paint(ctx, "#f6efe6", h, cx, h * 0.85, h * 0.12);
  // Body.
  ellipse(ctx, cx, h * 0.55, w * 0.1, h * 0.24);
  paint(ctx, fur, h, cx, h * 0.55, h * 0.24);
  // Talons.
  ctx.fillStyle = "#ffb43a";
  for (const side of [-1, 1]) {
    ellipse(ctx, cx + side * w * 0.04, h * 0.78, w * 0.025, h * 0.04);
    ctx.fill();
  }
  // White head with a hooked yellow beak.
  ellipse(ctx, cx, h * 0.27, w * 0.085, h * 0.16);
  paint(ctx, head, h, cx, h * 0.27, h * 0.16);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.025, h * 0.34);
  ctx.quadraticCurveTo(cx, h * 0.48, cx + w * 0.03, h * 0.36);
  ctx.closePath();
  paint(ctx, "#ffb43a", h, cx, h * 0.38, h * 0.05);
  for (const side of [-1, 1]) {
    const ex = cx + side * w * 0.035;
    ctx.fillStyle = "#ffd43a";
    ellipse(ctx, ex, h * 0.25, h * 0.035, h * 0.035);
    ctx.fill();
    ctx.fillStyle = "#1a1420";
    ellipse(ctx, ex, h * 0.255, h * 0.018, h * 0.02);
    ctx.fill();
    if (angry) {
      ctx.strokeStyle = "#1a1420";
      ctx.lineWidth = Math.max(1, h * 0.018);
      ctx.beginPath();
      ctx.moveTo(ex - side * h * 0.05, h * 0.19);
      ctx.lineTo(ex + side * h * 0.03, h * 0.225);
      ctx.stroke();
    }
  }
}

/** A carrot: orange taper with ridges and a leafy green top. Points down. */
export function carrot(scene: Phaser.Scene, o: { size: number; color?: string }) {
  const S = Math.round(o.size);
  const color = o.color ?? "#f28c28";
  return custom(scene, `carrot-${S}-${color}`, S * 0.6, S, (ctx, w, h) => {
    const cx = w / 2;
    // Leaves.
    for (const [dx, tilt, len] of [
      [-0.12, -0.5, 0.36],
      [0, 0, 0.42],
      [0.12, 0.5, 0.36],
    ] as const) {
      ctx.save();
      ctx.translate(cx + dx * w, h * 0.3);
      ctx.rotate(tilt);
      ellipse(ctx, 0, -h * len * 0.5, w * 0.1, h * len * 0.5);
      paint(ctx, "#4caf50", S, 0, -h * len * 0.5, h * 0.15);
      ctx.restore();
    }
    // Root.
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.3, h * 0.3);
    ctx.quadraticCurveTo(cx - w * 0.32, h * 0.32, cx - w * 0.25, h * 0.45);
    ctx.lineTo(cx, h * 0.98);
    ctx.lineTo(cx + w * 0.25, h * 0.45);
    ctx.quadraticCurveTo(cx + w * 0.32, h * 0.32, cx + w * 0.3, h * 0.3);
    ctx.closePath();
    paint(ctx, color, S, cx, h * 0.5, h * 0.35);
    ctx.strokeStyle = rgba(darken(color, 0.35), 0.7);
    ctx.lineWidth = Math.max(1, S * 0.02);
    for (const y of [0.45, 0.58, 0.71]) {
      const half = w * 0.25 * (1 - (y - 0.3) / 0.7);
      ctx.beginPath();
      ctx.moveTo(cx - half * 0.7, h * y);
      ctx.lineTo(cx - half * 0.1, h * (y + 0.015));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ellipse(ctx, cx - w * 0.1, h * 0.42, w * 0.05, h * 0.08, 0.2);
    ctx.fill();
  });
}

/** A round shiny apple with a leaf. */
export function apple(scene: Phaser.Scene, o: { size: number; color?: string }) {
  const S = Math.round(o.size);
  const color = o.color ?? "#e53b3b";
  return custom(scene, `apple-${S}-${color}`, S, S, (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.3);
    ctx.bezierCurveTo(w * 0.05, h * 0.05, w * -0.05, h * 0.85, w * 0.45, h * 0.95);
    ctx.bezierCurveTo(w * 0.5, h * 0.9, w * 0.55, h * 0.9, w * 0.55, h * 0.95);
    ctx.bezierCurveTo(w * 1.05, h * 0.85, w * 0.95, h * 0.05, w / 2, h * 0.3);
    paint(ctx, color, S, w / 2, h * 0.6, h * 0.4);
    ctx.strokeStyle = "#6b4226";
    ctx.lineWidth = Math.max(1, S * 0.05);
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.32);
    ctx.lineTo(w * 0.53, h * 0.1);
    ctx.stroke();
    ellipse(ctx, w * 0.68, h * 0.14, w * 0.13, h * 0.06, -0.4);
    paint(ctx, "#4caf50", S, w * 0.68, h * 0.14, h * 0.08);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ellipse(ctx, w * 0.32, h * 0.48, w * 0.07, h * 0.12, 0.4);
    ctx.fill();
  });
}

/** A toadstool: red cap with white dots. */
export function mushroom(scene: Phaser.Scene, o: { size: number; color?: string }) {
  const S = Math.round(o.size);
  const color = o.color ?? "#e8483b";
  return custom(scene, `mushroom-${S}-${color}`, S, S, (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.5);
    ctx.quadraticCurveTo(w * 0.33, h * 0.9, w * 0.36, h * 0.97);
    ctx.lineTo(w * 0.64, h * 0.97);
    ctx.quadraticCurveTo(w * 0.67, h * 0.9, w * 0.62, h * 0.5);
    ctx.closePath();
    paint(ctx, "#f6ecd9", S, w / 2, h * 0.75, h * 0.25);
    ctx.beginPath();
    ctx.moveTo(w * 0.04, h * 0.58);
    ctx.bezierCurveTo(w * 0.04, h * 0.0, w * 0.96, h * 0.0, w * 0.96, h * 0.58);
    ctx.closePath();
    paint(ctx, color, S, w / 2, h * 0.35, h * 0.4);
    ctx.fillStyle = "#ffffff";
    for (const [x, y, r] of [
      [0.3, 0.3, 0.08],
      [0.58, 0.2, 0.06],
      [0.72, 0.42, 0.07],
      [0.45, 0.47, 0.05],
    ] as const) {
      ellipse(ctx, w * x, h * y, w * r, w * r);
      ctx.fill();
    }
  });
}

/** A leafy bush: hiding spots, decoration, borders. */
export function bush(scene: Phaser.Scene, o: { size: number; color?: string; berries?: string }) {
  const S = Math.round(o.size);
  const color = o.color ?? "#4f9a4a";
  return custom(scene, `bush-${S}-${color}-${o.berries ?? ""}`, S * 1.5, S, (ctx, w, h) => {
    const blobs: [number, number, number][] = [
      [0.22, 0.66, 0.24],
      [0.4, 0.45, 0.3],
      [0.62, 0.42, 0.32],
      [0.8, 0.64, 0.24],
      [0.52, 0.7, 0.28],
    ];
    for (const [x, y, r] of blobs) {
      ellipse(ctx, w * x, h * y, h * r * 1.1, h * r);
      paint(ctx, color, S, w * x, h * y, h * r);
    }
    ctx.fillStyle = rgba(lighten(color, 0.45), 0.6);
    for (const [x, y, r] of blobs) {
      ellipse(ctx, w * x - h * r * 0.3, h * y - h * r * 0.45, h * r * 0.3, h * r * 0.16, -0.4);
      ctx.fill();
    }
    if (o.berries) {
      for (const [x, y] of [
        [0.3, 0.55],
        [0.56, 0.35],
        [0.7, 0.6],
        [0.45, 0.72],
      ] as const) {
        ellipse(ctx, w * x, h * y, h * 0.045, h * 0.045);
        paint(ctx, o.berries, S, w * x, h * y, h * 0.05);
      }
    }
  });
}

/** A tree: round deciduous or pine. Stands on its trunk (origin at the bottom). */
export function tree(scene: Phaser.Scene, o: { size: number; kind?: "round" | "pine"; leaves?: string; trunk?: string }) {
  const S = Math.round(o.size);
  const leaves = o.leaves ?? "#4f9a4a";
  const trunk = o.trunk ?? "#8a5a3b";
  const kind = o.kind ?? "round";
  return custom(scene, `tree-${kind}-${S}-${leaves}`, S * 0.8, S, (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.44, h * 0.98);
    ctx.lineTo(w * 0.46, h * 0.55);
    ctx.lineTo(w * 0.54, h * 0.55);
    ctx.lineTo(w * 0.56, h * 0.98);
    ctx.closePath();
    paint(ctx, trunk, S, w / 2, h * 0.8, h * 0.2);
    if (kind === "pine") {
      for (let i = 0; i < 3; i++) {
        const top = h * (0.02 + i * 0.2);
        const half = w * (0.25 + i * 0.12);
        ctx.beginPath();
        ctx.moveTo(w / 2, top);
        ctx.lineTo(w / 2 + half, top + h * 0.38);
        ctx.lineTo(w / 2 - half, top + h * 0.38);
        ctx.closePath();
        paint(ctx, i % 2 ? lighten(leaves, 0.08) : leaves, S, w / 2, top + h * 0.2, h * 0.25);
      }
      return;
    }
    for (const [x, y, r] of [
      [0.3, 0.42, 0.2],
      [0.7, 0.42, 0.2],
      [0.5, 0.25, 0.25],
      [0.5, 0.5, 0.22],
    ] as const) {
      ellipse(ctx, w * x, h * y, h * r, h * r);
      paint(ctx, leaves, S, w * x, h * y, h * r);
    }
    ctx.fillStyle = rgba(lighten(leaves, 0.4), 0.5);
    ellipse(ctx, w * 0.42, h * 0.18, h * 0.08, h * 0.05, -0.4);
    ctx.fill();
  });
}

/** A flower: petals around a center. Decoration, collectibles. */
export function flower(scene: Phaser.Scene, o: { size: number; color?: string; center?: string }) {
  const S = Math.round(o.size);
  const color = o.color ?? "#ff8fb1";
  return custom(scene, `flower-${S}-${color}`, S * 0.7, S, (ctx, w, h) => {
    ctx.strokeStyle = "#4f9a4a";
    ctx.lineWidth = Math.max(1, S * 0.05);
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.98);
    ctx.quadraticCurveTo(w * 0.45, h * 0.6, w / 2, h * 0.35);
    ctx.stroke();
    ellipse(ctx, w * 0.62, h * 0.72, w * 0.14, h * 0.05, -0.5);
    paint(ctx, "#4f9a4a", S, w * 0.62, h * 0.72, h * 0.05);
    const cy = h * 0.3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ellipse(ctx, w / 2 + Math.cos(a) * w * 0.2, cy + Math.sin(a) * w * 0.2, w * 0.15, w * 0.11, a);
      paint(ctx, color, S, w / 2, cy, w * 0.2);
    }
    ellipse(ctx, w / 2, cy, w * 0.13, w * 0.13);
    paint(ctx, o.center ?? "#ffd447", S, w / 2, cy, w * 0.13);
  });
}

/** A rounded rock or boulder. */
export function rock(scene: Phaser.Scene, o: { size: number; color?: string }) {
  const S = Math.round(o.size);
  const color = o.color ?? "#9a9a9a";
  return custom(scene, `rock-${S}-${color}`, S * 1.3, S, (ctx, w, h) => {
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.95);
    ctx.lineTo(w * 0.12, h * 0.5);
    ctx.lineTo(w * 0.35, h * 0.12);
    ctx.lineTo(w * 0.7, h * 0.08);
    ctx.lineTo(w * 0.92, h * 0.45);
    ctx.lineTo(w * 0.95, h * 0.95);
    ctx.closePath();
    paint(ctx, color, S, w / 2, h / 2, h * 0.5);
    ctx.fillStyle = rgba(lighten(color, 0.35), 0.7);
    ctx.beginPath();
    ctx.moveTo(w * 0.35, h * 0.16);
    ctx.lineTo(w * 0.62, h * 0.13);
    ctx.lineTo(w * 0.5, h * 0.35);
    ctx.closePath();
    ctx.fill();
  });
}

/** A burrow or hole in the ground, seen from a low angle: a dark opening in a mound of earth. */
export function burrow(scene: Phaser.Scene, o: { size: number; earth?: string }) {
  const S = Math.round(o.size);
  const earth = o.earth ?? "#8a5a3b";
  return custom(scene, `burrow-${S}-${earth}`, S, S * 0.55, (ctx, w, h) => {
    ellipse(ctx, w / 2, h * 0.6, w * 0.48, h * 0.38);
    paint(ctx, earth, S, w / 2, h * 0.6, h * 0.4);
    const g = ctx.createRadialGradient(w / 2, h * 0.62, 0, w / 2, h * 0.62, w * 0.32);
    g.addColorStop(0, "#120b08");
    g.addColorStop(1, "#3a2418");
    ctx.fillStyle = g;
    ellipse(ctx, w / 2, h * 0.62, w * 0.32, h * 0.22);
    ctx.fill();
    ctx.fillStyle = rgba(lighten(earth, 0.3), 0.6);
    for (const [x, y] of [
      [0.15, 0.45],
      [0.82, 0.5],
      [0.3, 0.3],
      [0.7, 0.3],
    ] as const) {
      ellipse(ctx, w * x, h * y, w * 0.03, h * 0.04);
      ctx.fill();
    }
  });
}

/** A tuft of grass: sprinkle many over the ground. */
export function grass(scene: Phaser.Scene, o: { size: number; color?: string }) {
  const S = Math.round(o.size);
  const color = o.color ?? "#5cae4f";
  return custom(scene, `grass-${S}-${color}`, S, S, (ctx, w, h) => {
    for (const [x, lean, len] of [
      [0.3, -0.25, 0.7],
      [0.45, -0.05, 0.95],
      [0.55, 0.1, 0.8],
      [0.7, 0.3, 0.6],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(w * (x - 0.07), h);
      ctx.quadraticCurveTo(w * (x + lean * 0.3), h * (1 - len * 0.6), w * (x + lean * 0.5), h * (1 - len));
      ctx.quadraticCurveTo(w * (x + lean * 0.2), h * (1 - len * 0.5), w * (x + 0.07), h);
      ctx.closePath();
      ctx.fillStyle = shade(ctx, color, w * x, h * 0.6, h * 0.5);
      ctx.fill();
    }
  });
}
