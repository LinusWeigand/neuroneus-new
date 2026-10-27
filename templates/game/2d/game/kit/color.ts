/** Color helpers. Theme colors are "#rrggbb" strings; Phaser wants numbers for tints. */

/** "#ff8800" → 0xff8800 */
export function hex(color: string) {
  return parseInt(color.replace("#", ""), 16);
}

function rgb(color: string) {
  const n = hex(color);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

function toHex(r: number, g: number, b: number) {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend two colors: t=0 is `a`, t=1 is `b`. */
export function mix(a: string, b: string, t: number) {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export const lighten = (c: string, t: number) => mix(c, "#ffffff", t);
export const darken = (c: string, t: number) => mix(c, "#000000", t);

/** "#rrggbb" with alpha, for canvas drawing: rgba(...). */
export function rgba(color: string, alpha: number) {
  const [r, g, b] = rgb(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Perceived brightness 0..1. */
export function luminance(color: string) {
  const [r, g, b] = rgb(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
