import * as THREE from "three";
import { sfx } from "@/game/audio";
import { input } from "@/game/input";
import { addScore, gameOver, getState, isPlaying, setHud } from "@/game/state";
import { THEME } from "@/game/theme";
import type { Fx } from "./kit/fx";
import { models } from "./kit/models";
import type { Stage } from "./kit/stage";
import { ease, tween } from "./kit/tween";

/**
 * SAMPLE GAME, replace it with the real one. It shows the kit's patterns working together,
 * which the real game should keep:
 * - the world is built from kit/models (rounded, shaded, with faces), lit by the stage
 * - attract mode before the first run: the camera circles a living world behind the title
 * - startRun() resets everything; update(dt) reads `input` and reports through game/state
 * - movement has weight (acceleration, drag, turning, squash on landing), every event has
 *   feedback (fx.juice.*) and sound
 */
const ARENA = 12;

export class World {
  private player: THREE.Group;
  private velocity = new THREE.Vector3();
  private vy = 0;
  private gems: THREE.Group[] = [];
  private hazards: { mesh: THREE.Group; dir: THREE.Vector3; speed: number }[] = [];
  private alive = false;
  private invulnerable = 0;
  private spawnTimer = 0;
  private levelTimer = 0;
  private time = 0;
  private camTarget = new THREE.Vector3();

  constructor(
    private stage: Stage,
    private fx: Fx,
  ) {
    const { scene } = stage;
    scene.add(models.island(ARENA + 2));
    // Decoration around the rim makes the arena feel like a place.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const r = ARENA + 0.6 + Math.random() * 0.8;
      const deco = i % 3 === 0 ? models.rock(undefined, 0.7 + Math.random() * 0.6) : models.tree({ height: 2 + Math.random() * 1.4, kind: i % 2 ? "pine" : "round" });
      deco.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      deco.rotation.y = Math.random() * Math.PI;
      scene.add(deco);
    }
    for (let i = 0; i < 40; i++) {
      const f = models.flower([THEME.palette.accent, THEME.palette.secondary, "#ffffff"][i % 3]);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * ARENA;
      f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      scene.add(f);
    }

    this.player = models.character({ color: THEME.palette.primary, ears: "bunny" });
    this.player.visible = false;
    scene.add(this.player);
    for (let i = 0; i < 5; i++) this.spawnGem();
  }

  startRun() {
    for (const h of this.hazards) this.stage.scene.remove(h.mesh);
    this.hazards = [];
    this.player.position.set(0, 0, 0);
    this.player.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.vy = 0;
    this.alive = true;
    this.player.visible = true;
    this.fx.squash(this.player, "stretch");
    this.fx.burst(new THREE.Vector3(0, 0.5, 0), { color: THEME.palette.primary, count: 30 });
    this.invulnerable = 1.5;
    this.spawnTimer = 1;
    this.levelTimer = 0;
  }

  update(dt: number) {
    this.time += dt;
    const playing = isPlaying() && this.alive;
    const level = getState().level;

    if (playing) {
      // Move relative to the camera: up on the stick is away from the camera.
      const { x, y } = input.axis();
      const accel = new THREE.Vector3(x, 0, y).multiplyScalar(40);
      this.velocity.addScaledVector(accel, dt);
      this.velocity.multiplyScalar(Math.pow(0.02, dt)); // drag
      if (this.velocity.length() > 8) this.velocity.setLength(8);
      this.player.position.addScaledVector(this.velocity, dt);
      const flat = Math.hypot(this.player.position.x, this.player.position.z);
      if (flat > ARENA) this.player.position.multiplyScalar(ARENA / flat);
      // Face the direction of travel, smoothly.
      if (this.velocity.lengthSq() > 0.5) {
        const target = Math.atan2(this.velocity.x, this.velocity.z);
        let d = target - this.player.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.player.rotation.y += d * Math.min(1, dt * 12);
      }
      // Jump with weight.
      const grounded = this.player.position.y <= 0.001;
      if (grounded && input.pressed("action")) {
        this.vy = 9;
        this.fx.squash(this.player, "stretch");
        sfx("jump");
      }
      this.vy -= 26 * dt;
      this.player.position.y = Math.max(0, this.player.position.y + this.vy * dt);
      if (this.player.position.y === 0 && this.vy < -2) {
        this.fx.squash(this.player, "squash");
        this.fx.burst(this.player.position.clone(), { color: THEME.world3d.ground, count: 8, speed: 0.4, gravity: 10 });
      }
      if (this.player.position.y === 0) this.vy = 0;
      // A little hop while running.
      const body = this.player.children[0];
      body.position.y = 0.5 + (grounded ? Math.abs(Math.sin(this.time * 14)) * Math.min(1, this.velocity.length() / 6) * 0.12 : 0);

      // Blink while invulnerable.
      this.invulnerable = Math.max(0, this.invulnerable - dt);
      this.player.visible = this.invulnerable === 0 || Math.floor(this.time * 12) % 2 === 0;

      this.levelTimer += dt;
      if (this.levelTimer > 20) {
        this.levelTimer = 0;
        setHud({ level: level + 1 });
        this.fx.juice.celebrate(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), `Level ${level + 1}`);
      }
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = Math.max(0.6, 2.4 - level * 0.3);
        if (this.hazards.length < 2 + level * 2) this.spawnHazard(level);
      }
    }

    // Gems spin and bob; collect them by touching.
    for (const g of [...this.gems]) {
      g.rotation.y += dt * 2;
      g.children[0].position.y = 0.45 + Math.sin(this.time * 3 + g.id) * 0.12;
      if (playing && g.position.distanceTo(this.player.position) < 1.1) {
        this.fx.juice.collect(g.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 10);
        this.fx.pop(this.player, 0.15);
        addScore(10);
        this.stage.scene.remove(g);
        this.gems = this.gems.filter((x) => x !== g);
        this.spawnGem();
      }
    }

    // Hazards roll across the arena.
    for (const h of [...this.hazards]) {
      h.mesh.position.addScaledVector(h.dir, h.speed * dt);
      const core = h.mesh.userData.core as THREE.Object3D;
      core.rotation.x += h.speed * dt * 1.6;
      if (Math.hypot(h.mesh.position.x, h.mesh.position.z) > ARENA + 4) {
        this.stage.scene.remove(h.mesh);
        this.hazards = this.hazards.filter((x) => x !== h);
        continue;
      }
      if (playing && this.invulnerable === 0 && this.player.position.y < 0.8 && h.mesh.position.distanceTo(this.player.position) < 1.1) {
        this.hurt();
      }
    }

    // Camera: follows the player smoothly; circles the island in attract mode.
    const cam = this.stage.camera;
    if (playing) this.camTarget.lerp(this.player.position, Math.min(1, dt * 4));
    else this.camTarget.lerp(new THREE.Vector3(0, 0, 0), Math.min(1, dt));
    const orbit = playing ? 0 : this.time * 0.12;
    const desired = new THREE.Vector3(Math.sin(orbit) * 13, 9, Math.cos(orbit) * 13).add(this.camTarget);
    cam.position.lerp(desired, Math.min(1, dt * 3));
    cam.lookAt(this.camTarget.x, this.camTarget.y + 0.8, this.camTarget.z);
    this.stage.follow(this.camTarget);
  }

  private spawnGem() {
    const g = models.gem(THEME.palette.accent, 0.8);
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * (ARENA - 3);
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.scale.setScalar(0.01);
    tween(0.45, (k) => g.scale.setScalar(Math.max(0.01, k)), { ease: ease.outBack });
    this.stage.scene.add(g);
    this.gems.push(g);
  }

  private spawnHazard(level: number) {
    const mesh = models.spikes(THEME.palette.danger, 1.1);
    const a = Math.random() * Math.PI * 2;
    mesh.position.set(Math.cos(a) * (ARENA + 2), 0, Math.sin(a) * (ARENA + 2));
    const aim = this.player.position.clone().sub(mesh.position).setY(0).normalize();
    aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.5);
    this.stage.scene.add(mesh);
    this.hazards.push({ mesh, dir: aim, speed: 4 + level * 0.8 + Math.random() * 1.5 });
  }

  private hurt() {
    this.invulnerable = 1.5;
    this.fx.juice.hit(this.player);
    const lives = getState().lives - 1;
    setHud({ lives });
    if (lives <= 0) {
      this.fx.juice.explode(this.player.position.clone().add(new THREE.Vector3(0, 0.5, 0)), THEME.palette.primary);
      this.alive = false;
      this.player.visible = false;
      setTimeout(() => gameOver(), 700);
    }
  }
}
