import * as THREE from "three";
import { THEME } from "@/game/theme";

/**
 * Materials in the theme's style. Colors come from THEME.palette by role; materials are
 * cached per color, so call these freely.
 *
 *   mat.surface(THEME.palette.primary)   // the default for characters and objects
 *   mat.glow(THEME.palette.accent)       // emissive: blooms (pickups, lights, magic)
 */

const cache = new Map<string, THREE.Material>();

function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}

let toonRamp: THREE.DataTexture | null = null;
function ramp() {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 170, 255]);
  toonRamp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

export const mat = {
  /** The theme's look for solid things: soft satin, or cel-shaded for inked and pixel themes. */
  surface(color: string, opts: { roughness?: number; flat?: boolean } = {}) {
    if (THEME.art.shading === "cel") {
      return cached(`toon-${color}-${opts.flat}`, () => new THREE.MeshToonMaterial({ color, gradientMap: ramp() }));
    }
    return cached(
      `std-${color}-${opts.roughness ?? 0.55}-${opts.flat}`,
      () => new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.55, metalness: 0, flatShading: opts.flat ?? false }),
    );
  },
  /** Shiny: coins, metal, polished gems. */
  shiny(color: string) {
    return cached(`shiny-${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.7 }));
  },
  /** Glows and blooms. Intensity above 1 makes it bloom. */
  glow(color: string, intensity = 2.2) {
    return cached(
      `glow-${color}-${intensity}`,
      () => new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 }),
    );
  },
  /** Flat unlit color: eyes, decals, UI-like elements in the world. */
  flat(color: string) {
    return cached(`flat-${color}`, () => new THREE.MeshBasicMaterial({ color }));
  },
  /** Ground with a soft painted texture (grass, sand, snow) in the theme's ground color. */
  ground(color = THEME.world3d.ground, repeat = 8) {
    return cached(`ground-${color}-${repeat}`, () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const base = new THREE.Color(color);
      ctx.fillStyle = `#${base.getHexString()}`;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 900; i++) {
        const c = base.clone().offsetHSL((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 });
    });
  },
};
