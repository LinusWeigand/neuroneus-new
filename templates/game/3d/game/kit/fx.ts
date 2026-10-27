import * as THREE from "three";
import { sfx } from "@/game/audio";
import { toast } from "@/game/state";
import { THEME } from "@/game/theme";
import type { Stage } from "./stage";
import { ease, tween } from "./tween";

/**
 * Game feel for the 3D kit: glowing particle bursts, camera shake, scale punches, squash and
 * stretch, screen flashes and floating text. Create once with the stage; call `fx.update(dt)`
 * every step (game/main.ts does).
 *
 *   fx.juice.collect(gem.position, 10);
 *   fx.juice.hit(player);
 *   fx.burst(pos, { color: THEME.palette.accent, count: 30 });
 */
export type Fx = ReturnType<typeof createFx>;

const MAX_PARTICLES = 800;

export function createFx(stage: Stage) {
  // One pooled point cloud for every particle: cheap, and additive so it blooms.
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const baseSize = new Float32Array(MAX_PARTICLES);
  const gravity = new Float32Array(MAX_PARTICLES);
  let cursor = 0;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { scale: { value: 300 } },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float scale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * (1.0 + a), a);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  stage.scene.add(points);

  let shakeAmount = 0;
  const shakeOffset = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const flashEl = document.createElement("div");
  flashEl.style.cssText = "position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .12s ease-out";
  stage.parent.appendChild(flashEl);
  const texts: { el: HTMLDivElement; pos: THREE.Vector3; t: number }[] = [];

  const fx = {
    /** A burst of glowing particles. */
    burst(at: THREE.Vector3, o: { color?: string; count?: number; speed?: number; size?: number; gravity?: number; life?: number; up?: number } = {}) {
      const color = new THREE.Color(o.color ?? THEME.palette.accent);
      const n = o.count ?? 24;
      for (let k = 0; k < n; k++) {
        const i = cursor;
        cursor = (cursor + 1) % MAX_PARTICLES;
        const dir = tmp.set(Math.random() - 0.5, Math.random() * 0.8 + (o.up ?? 0.2), Math.random() - 0.5).normalize();
        const speed = (2 + Math.random() * 4) * (o.speed ?? 1);
        positions.set([at.x, at.y, at.z], i * 3);
        vel.set([dir.x * speed, dir.y * speed, dir.z * speed], i * 3);
        colors.set([color.r, color.g, color.b], i * 3);
        maxLife[i] = life[i] = (0.4 + Math.random() * 0.5) * (o.life ?? 1);
        baseSize[i] = (0.25 + Math.random() * 0.25) * (o.size ?? 1);
        gravity[i] = o.gravity ?? 6;
      }
    },
    /** Camera shake. 0.5 = a tap, 1 = a hit, 2 = an explosion. */
    shake(strength = 1) {
      shakeAmount = Math.max(shakeAmount, 0.25 * strength);
    },
    /** Full-screen flash (60–150 ms). */
    flash(color = "#ffffff", ms = 110) {
      flashEl.style.background = color;
      flashEl.style.transition = "none";
      flashEl.style.opacity = "0.55";
      requestAnimationFrame(() => {
        flashEl.style.transition = `opacity ${ms}ms ease-out`;
        flashEl.style.opacity = "0";
      });
    },
    /** Scale punch: bigger for a moment, springs back. */
    pop(obj: THREE.Object3D, amount = 0.25) {
      const base = (obj.userData.baseScale as number | undefined) ?? obj.scale.x;
      obj.userData.baseScale = base;
      tween(0.3, (k) => obj.scale.setScalar(base * (1 + amount * (1 - k))), { ease: ease.outBack, owner: obj });
    },
    /** Squash on landing, stretch on jumping. */
    squash(obj: THREE.Object3D, kind: "squash" | "stretch" = "squash") {
      const base = (obj.userData.baseScale as number | undefined) ?? obj.scale.x;
      obj.userData.baseScale = base;
      const [xz, y] = kind === "squash" ? [1.3, 0.7] : [0.8, 1.3];
      tween(
        0.35,
        (k) => {
          const e = 1 - k;
          obj.scale.set(base * (1 + (xz - 1) * e), base * (1 + (y - 1) * e), base * (1 + (xz - 1) * e));
        },
        { ease: ease.outElastic, owner: obj },
      );
    },
    /** Text that floats up from a point in the world: "+10", "Combo!". */
    floatText(at: THREE.Vector3, text: string, color = THEME.palette.accent) {
      const el = document.createElement("div");
      el.textContent = text;
      el.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;font-family:var(--font-display),sans-serif;font-size:clamp(18px,3vw,30px);color:${color};text-shadow:0 3px 0 rgba(0,0,0,.35),0 0 16px ${color};white-space:nowrap;will-change:transform`;
      stage.parent.appendChild(el);
      texts.push({ el, pos: at.clone(), t: 0 });
    },
    /** Called every step by the game loop. */
    update(dt: number) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (life[i] <= 0) {
          sizes[i] = 0;
          continue;
        }
        life[i] -= dt;
        vel[i * 3 + 1] -= gravity[i] * dt;
        positions[i * 3] += vel[i * 3] * dt;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        sizes[i] = baseSize[i] * Math.max(0, life[i] / maxLife[i]);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      shakeAmount = Math.max(0, shakeAmount - dt * 1.2);
      for (let i = texts.length - 1; i >= 0; i--) {
        const f = texts[i];
        f.t += dt;
        if (f.t > 0.9) {
          f.el.remove();
          texts.splice(i, 1);
        }
      }
    },
    /** Apply camera shake and place floating text; call right before rendering. */
    beforeRender() {
      const cam = stage.camera;
      cam.position.sub(shakeOffset);
      shakeOffset.set((Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount);
      cam.position.add(shakeOffset);
      const w = stage.parent.clientWidth;
      const h = stage.parent.clientHeight;
      for (const f of texts) {
        tmp.copy(f.pos).project(cam);
        const k = f.t / 0.9;
        const x = (tmp.x * 0.5 + 0.5) * w;
        const y = (-tmp.y * 0.5 + 0.5) * h - k * 60;
        const s = k < 0.2 ? 0.6 + k * 2.5 : 1;
        f.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${s})`;
        f.el.style.opacity = String(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      }
    },
    dispose() {
      flashEl.remove();
      for (const f of texts) f.el.remove();
    },
  };

  const juice = {
    /** Picking up something good. */
    collect(at: THREE.Vector3, points?: number, color = THEME.palette.accent) {
      fx.burst(at, { color, count: 26, speed: 0.9 });
      if (points) fx.floatText(at.clone().add(new THREE.Vector3(0, 1, 0)), `+${points}`, color);
      sfx("pickup");
    },
    /** Something got hurt: pass its object. */
    hit(obj: THREE.Object3D, color = THEME.palette.danger) {
      fx.shake(1.2);
      fx.flash(color, 120);
      fx.pop(obj, 0.3);
      fx.burst(obj.position.clone().add(new THREE.Vector3(0, 0.6, 0)), { color, count: 22, speed: 1.2 });
      sfx("hit");
    },
    /** A big blow-up or the end of a run. */
    explode(at: THREE.Vector3, color = THEME.palette.danger) {
      fx.shake(2.2);
      fx.flash("#ffffff", 150);
      fx.burst(at, { color, count: 70, speed: 2, size: 1.5, life: 1.4 });
      fx.burst(at, { color: THEME.palette.accent, count: 30, speed: 1.2 });
      sfx("explode");
    },
    /** A level up, a combo, a win. */
    celebrate(at: THREE.Vector3, text: string) {
      for (const c of [THEME.palette.primary, THEME.palette.secondary, THEME.palette.accent, THEME.palette.good]) {
        fx.burst(at, { color: c, count: 18, speed: 1.6, up: 1.5, gravity: 9 });
      }
      sfx("powerup");
      toast(text);
    },
  };

  return Object.assign(fx, { juice });
}
