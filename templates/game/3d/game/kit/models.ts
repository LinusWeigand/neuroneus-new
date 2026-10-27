import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { THEME } from "@/game/theme";
import { mat } from "./materials";

/**
 * Good-looking models without model files: rounded, shaded, with charming details. Each
 * returns a Group standing on y = 0 at its origin, about 1 unit tall unless sized, casting
 * and receiving shadows. Colors come from THEME.palette by role.
 *
 *   const hero = models.character({ color: THEME.palette.primary, ears: "bunny" });
 *   const fox = models.character({ color: THEME.palette.danger, mood: "angry", ears: "cat" });
 *
 * Never use bare BoxGeometry/SphereGeometry meshes as game objects; build from these or
 * compose new ones the same way (rounded shapes, a lighter belly or top, eyes for anything alive).
 */

function shadowed<T extends THREE.Object3D>(o: T) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

const lighter = (color: string, t: number) => `#${new THREE.Color(color).lerp(new THREE.Color("#ffffff"), t).getHexString()}`;
const darker = (color: string, t: number) => `#${new THREE.Color(color).lerp(new THREE.Color("#000000"), t).getHexString()}`;

function eye(size: number, angry: boolean) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), mat.flat("#ffffff"));
  white.scale.set(1, 1.15, 0.6);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 12, 10), mat.flat("#16121f"));
  pupil.position.set(0, -size * 0.05, size * 0.42);
  pupil.scale.set(1, 1.1, 0.6);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(size * 0.18, 8, 6), mat.flat("#ffffff"));
  glint.position.set(-size * 0.2, size * 0.25, size * 0.62);
  g.add(white, pupil, glint);
  if (angry) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(size * 1.8, size * 0.35, size * 0.3), mat.flat("#16121f"));
    brow.position.set(0, size * 1.15, size * 0.3);
    g.add(brow);
    g.userData.brow = brow;
  }
  return g;
}

export const models = {
  /**
   * A round character with a face: the player, enemies, animals, NPCs. Faces +z.
   * `ears` makes animals; `mood: "angry"` gives brows for enemies. Height ≈ size.
   */
  character(o: { color: string; size?: number; mood?: "happy" | "angry"; ears?: "bunny" | "cat" | "bear" | "none"; belly?: string }) {
    const s = o.size ?? 1;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 24), mat.surface(o.color));
    body.scale.set(1, 1.05, 0.95);
    body.position.y = 0.5;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), mat.surface(o.belly ?? lighter(o.color, 0.55)));
    belly.scale.set(1, 1.1, 0.5);
    belly.position.set(0, 0.42, 0.3);
    g.add(body, belly);
    for (const side of [-1, 1]) {
      const e = eye(0.09, o.mood === "angry");
      e.position.set(side * 0.17, 0.66, 0.38);
      e.rotation.y = side * 0.25;
      if (o.mood === "angry") (e.userData.brow as THREE.Mesh).rotation.z = side * -0.45;
      g.add(e);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat.surface(darker(o.color, 0.15)));
      foot.scale.set(1, 0.6, 1.4);
      foot.position.set(side * 0.2, 0.06, 0.08);
      g.add(foot);
      if (o.mood !== "angry") {
        const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mat.flat("#ff9bb3"));
        cheek.scale.set(1, 0.6, 0.3);
        cheek.position.set(side * 0.3, 0.55, 0.36);
        g.add(cheek);
      }
      if (o.ears && o.ears !== "none") {
        const ear =
          o.ears === "bunny"
            ? new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.42, 6, 12), mat.surface(o.color))
            : o.ears === "cat"
              ? new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 12), mat.surface(o.color))
              : new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat.surface(o.color));
        ear.position.set(side * (o.ears === "bunny" ? 0.15 : 0.26), o.ears === "bunny" ? 1.12 : 0.92, 0);
        ear.rotation.z = side * (o.ears === "bunny" ? -0.15 : -0.35);
        g.add(ear);
        if (o.ears === "bunny") {
          const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), mat.surface("#ffb3c7"));
          inner.position.set(side * 0.155, 1.13, 0.05);
          inner.rotation.z = side * -0.15;
          g.add(inner);
        }
      }
    }
    g.scale.setScalar(s);
    g.userData.body = body;
    return shadowed(g);
  },

  /** A faceted, glowing gem: pickups, crystals. Spin and bob it. */
  gem(color = THEME.palette.accent, size = 0.5) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.5, 0), mat.glow(color, 1.6));
    m.scale.set(0.8, 1.2, 0.8);
    m.position.y = size * 0.8;
    g.add(m);
    return shadowed(g);
  },

  /** A shiny coin standing on its edge. */
  coin(color = THEME.palette.accent, size = 0.5) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.5, size * 0.5, size * 0.12, 32), mat.shiny(color));
    m.rotation.x = Math.PI / 2;
    m.position.y = size * 0.6;
    g.add(m);
    return shadowed(g);
  },

  /** A rounded box: crates, blocks, buttons, furniture. */
  crate(color = THEME.palette.secondary, size = 1) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 3, size * 0.12), mat.surface(color));
    m.position.y = size / 2;
    g.add(m);
    return shadowed(g);
  },

  /** A low-poly rock. */
  rock(color = THEME.palette.muted, size = 1) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.5, 0), mat.surface(color, { flat: true, roughness: 0.9 }));
    m.scale.set(1.2, 0.75, 1);
    m.rotation.set(Math.random(), Math.random() * Math.PI, 0);
    m.position.y = size * 0.25;
    g.add(m);
    return shadowed(g);
  },

  /** A stylized tree: round canopy by default, `pine` for conifers. */
  tree(o: { leaves?: string; trunk?: string; height?: number; kind?: "round" | "pine" } = {}) {
    const h = o.height ?? 2.4;
    const leaves = o.leaves ?? THEME.palette.secondary;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.05, h * 0.08, h * 0.45, 8), mat.surface(o.trunk ?? "#8a5a3b"));
    trunk.position.y = h * 0.22;
    g.add(trunk);
    if (o.kind === "pine") {
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(h * (0.32 - i * 0.07), h * 0.42, 10), mat.surface(i % 2 ? lighter(leaves, 0.12) : leaves, { flat: true }));
        cone.position.y = h * (0.45 + i * 0.2);
        g.add(cone);
      }
    } else {
      for (const [x, y, z, r] of [
        [0, 0.68, 0, 0.32],
        [0.16, 0.58, 0.1, 0.22],
        [-0.15, 0.6, -0.08, 0.24],
      ] as const) {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(h * r, 1), mat.surface(r < 0.3 ? lighter(leaves, 0.1) : leaves, { flat: true }));
        blob.position.set(h * x, h * y, h * z);
        g.add(blob);
      }
    }
    return shadowed(g);
  },

  /** A small flower: decoration that makes ground feel alive. */
  flower(color = THEME.palette.accent) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), mat.surface("#4f9a4a"));
    stem.position.y = 0.15;
    g.add(stem);
    for (let i = 0; i < 5; i++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat.surface(color));
      const a = (i / 5) * Math.PI * 2;
      petal.position.set(Math.cos(a) * 0.07, 0.32, Math.sin(a) * 0.07);
      petal.scale.set(1, 0.5, 1);
      g.add(petal);
    }
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat.surface("#ffd447"));
    center.position.y = 0.33;
    g.add(center);
    return shadowed(g);
  },

  /** A spiked ball: hazards, mines. Roll it. */
  spikes(color = THEME.palette.danger, size = 1) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.32, 1), mat.surface(color));
    const spikeGeo = new THREE.ConeGeometry(size * 0.09, size * 0.28, 8);
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const pos = ico.getAttribute("position");
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
      const key = v.toArray().map((n) => n.toFixed(2)).join();
      if (seen.has(key)) continue;
      seen.add(key);
      const spike = new THREE.Mesh(spikeGeo, mat.surface(lighter(color, 0.15)));
      spike.position.copy(v).multiplyScalar(size * 0.38);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      core.add(spike);
    }
    core.position.y = size * 0.5;
    g.add(core);
    g.userData.core = core;
    return shadowed(g);
  },

  /** A rounded slab to stand on: platforms, steps, bridges. */
  platform(o: { width?: number; depth?: number; height?: number; color?: string } = {}) {
    const w = o.width ?? 3;
    const d = o.depth ?? 3;
    const h = o.height ?? 0.5;
    const color = o.color ?? THEME.palette.surface;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(h, w, d) * 0.2), mat.surface(darker(color, 0.15)));
    base.position.y = -h / 2;
    const top = new THREE.Mesh(new RoundedBoxGeometry(w * 0.98, h * 0.3, d * 0.98, 2, h * 0.1), mat.surface(lighter(color, 0.1)));
    top.position.y = -h * 0.12;
    g.add(base, top);
    return shadowed(g);
  },

  /** A floating island: the classic arena. Its top is at y = 0. */
  island(radius = 14) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.96, 0.6, 64), mat.ground(THEME.world3d.ground, radius / 2));
    top.position.y = -0.3;
    top.receiveShadow = true;
    const dirt = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.96, radius * 0.9, 24, 3), mat.surface(darker(THEME.world3d.ground, 0.45), { flat: true }));
    dirt.rotation.x = Math.PI;
    dirt.position.y = -0.6 - radius * 0.45;
    g.add(top, dirt);
    return g;
  },
};
