import * as Phaser from "phaser";
import { sfx } from "@/game/audio";
import { input } from "@/game/input";
import { addScore, gameOver, getState, isPlaying, setHud } from "@/game/state";
import { THEME } from "@/game/theme";
import { type Backdrop, createBackdrop } from "../kit/backdrop";
import { fx, juice } from "../kit/fx";
import { addGlow, applyPost } from "../kit/post";
import * as textures from "../kit/textures";
import { U, VIEW } from "../kit/view";

/**
 * SAMPLE GAME, replace it with the real one. It exists to show the kit's patterns working
 * together, which the real game should keep:
 * - create(): backdrop, post-processing, textures from kit/textures (never plain shapes)
 * - attract mode before the first run: the world is alive behind the title screen
 * - startRun(): resets everything for a fresh run (the shell calls it via handle.start())
 * - update(): reads `input`, skips work during hit-stop, reports through game/state
 * - every event has feedback: juice.collect / juice.hit / juice.explode / juice.celebrate
 */
export class PlayScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private player!: Phaser.Physics.Arcade.Sprite;
  private gems!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;
  private faces!: { left: string; right: string };
  private invulnerableUntil = 0;
  private spawnTimer = 0;
  private levelTimer = 0;
  private combo = 0;
  private comboUntil = 0;

  constructor() {
    super("play");
  }

  create() {
    this.backdrop = createBackdrop(this);
    applyPost(this);

    const r = Math.round(4.5 * U);
    this.faces = {
      right: textures.creature(this, { radius: r, color: THEME.palette.primary, look: 0 }),
      left: textures.creature(this, { radius: r, color: THEME.palette.primary, look: Math.PI }),
    };
    this.player = this.physics.add.sprite(VIEW.width / 2, VIEW.height / 2, this.faces.right);
    this.player.setCircle(r * 0.9, this.player.width / 2 - r * 0.9, this.player.height / 2 - r * 0.9);
    this.player.setCollideWorldBounds(true).setDrag(160 * U).setMaxVelocity(70 * U).setDepth(10);
    addGlow(this.player, THEME.palette.primary, 0.8);
    fx.aura(this, this.player, THEME.palette.primary, 10 * U, 0.35);
    fx.trail(this, this.player, THEME.palette.primary, 1.2);
    this.player.setVisible(false).setActive(false);

    this.gems = this.physics.add.group();
    this.hazards = this.physics.add.group();
    this.physics.add.overlap(this.player, this.gems, (_p, g) => this.collect(g as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.hazards, (_p, h) => this.hurt(h as Phaser.Physics.Arcade.Image));

    // Attract mode: the world is already alive behind the title screen.
    for (let i = 0; i < 5; i++) this.spawnGem();
    for (let i = 0; i < 3; i++) this.spawnHazard();
  }

  /** A fresh run. */
  startRun() {
    this.gems.clear(true, true);
    this.hazards.clear(true, true);
    this.player.setPosition(VIEW.width / 2, VIEW.height / 2).setVelocity(0, 0).setVisible(true).setActive(true).setAlpha(1);
    (this.player.body as Phaser.Physics.Arcade.Body).enable = true;
    fx.squash(this, this.player, "stretch");
    fx.shockwave(this, this.player.x, this.player.y, { color: THEME.palette.primary, radius: 20 * U });
    this.invulnerableUntil = this.time.now + 1200;
    this.spawnTimer = 0;
    this.levelTimer = 0;
    this.combo = 0;
    for (let i = 0; i < 4; i++) this.spawnGem();
  }

  update(_time: number, delta: number) {
    this.backdrop.update(delta);
    if (fx.frozen()) return;
    const dt = delta / 1000;
    const level = getState().level;

    if (isPlaying() && this.player.active) {
      const { x, y } = input.axis();
      this.player.setAcceleration(x * 260 * U, y * 260 * U);
      const vx = this.player.body?.velocity.x ?? 0;
      if (Math.abs(vx) > 5 * U) this.player.setTexture(vx < 0 ? this.faces.left : this.faces.right);
      // A little lean and stretch in the direction of travel.
      this.player.setAngle(Phaser.Math.Clamp(vx / (2 * U), -12, 12));
      if (input.pressed("action")) {
        const v = this.player.body!.velocity;
        const len = Math.hypot(v.x, v.y) || 1;
        this.player.setVelocity((v.x / len) * 90 * U, (v.y / len) * 90 * U);
        fx.squash(this, this.player, "stretch");
        sfx("whoosh");
      }

      this.levelTimer += dt;
      if (this.levelTimer > 20) {
        this.levelTimer = 0;
        setHud({ level: level + 1 });
        juice.celebrate(this, `Level ${level + 1}`);
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.5, 2.2 - level * 0.25);
      if (this.hazards.countActive() < 3 + level * 2) this.spawnHazard();
      if (this.gems.countActive() < 5) this.spawnGem();
    }

    // Hazards leaving the screen are recycled.
    for (const h of this.hazards.getChildren() as Phaser.Physics.Arcade.Image[]) {
      h.rotation += dt * 2.5;
      if (h.x < -20 * U || h.x > VIEW.width + 20 * U || h.y < -20 * U || h.y > VIEW.height + 20 * U) h.destroy();
    }
  }

  private spawnGem() {
    const key = textures.gem(this, { radius: 3 * U, color: THEME.palette.accent });
    const pad = 10 * U;
    const g = this.gems.create(
      Phaser.Math.Between(pad, VIEW.width - pad),
      Phaser.Math.Between(pad, VIEW.height - pad),
      key,
    ) as Phaser.Physics.Arcade.Image;
    g.setDepth(5).setScale(0);
    addGlow(g, THEME.palette.accent, 0.7);
    this.tweens.add({ targets: g, scale: 1, duration: 380, ease: "Back.easeOut" });
    fx.bob(this, g, 1.4 * U, 800 + Math.random() * 400);
  }

  private spawnHazard() {
    const key = textures.spikes(this, { radius: 3.6 * U, color: THEME.palette.danger });
    const side = Phaser.Math.Between(0, 3);
    const m = 8 * U;
    const [x, y] =
      side === 0 ? [-m, Math.random() * VIEW.height] : side === 1 ? [VIEW.width + m, Math.random() * VIEW.height] : side === 2 ? [Math.random() * VIEW.width, -m] : [Math.random() * VIEW.width, VIEW.height + m];
    const h = this.hazards.create(x, y, key) as Phaser.Physics.Arcade.Image;
    h.setCircle(h.width * 0.32, h.width * 0.18, h.height * 0.18).setDepth(6);
    addGlow(h, THEME.palette.danger, 0.6);
    const target = this.player.active ? this.player : { x: VIEW.width / 2, y: VIEW.height / 2 };
    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y) + Phaser.Math.FloatBetween(-0.4, 0.4);
    const speed = (18 + getState().level * 4) * U * Phaser.Math.FloatBetween(0.8, 1.2);
    h.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  private collect(g: Phaser.Physics.Arcade.Image) {
    if (!g.active) return;
    this.combo = this.time.now < this.comboUntil ? this.combo + 1 : 1;
    this.comboUntil = this.time.now + 1500;
    const points = 10 * this.combo;
    juice.collect(this, g.x, g.y, points);
    fx.pop(this, this.player, 0.18);
    if (this.combo >= 3) fx.floatText(this, this.player.x, this.player.y - 9 * U, `Combo x${this.combo}`, THEME.palette.secondary);
    addScore(points);
    g.destroy();
  }

  private hurt(h: Phaser.Physics.Arcade.Image) {
    if (!isPlaying() || this.time.now < this.invulnerableUntil) return;
    this.invulnerableUntil = this.time.now + 1400;
    juice.hit(this, this.player);
    h.destroy();
    const lives = getState().lives - 1;
    setHud({ lives });
    if (lives <= 0) {
      juice.explode(this, this.player.x, this.player.y, THEME.palette.primary);
      this.player.setVisible(false).setActive(false).setAcceleration(0, 0);
      (this.player.body as Phaser.Physics.Arcade.Body).enable = false;
      this.time.delayedCall(700, () => gameOver());
      return;
    }
    // Blink while invulnerable.
    this.tweens.add({ targets: this.player, alpha: 0.25, duration: 100, yoyo: true, repeat: 6, onComplete: () => this.player.setAlpha(1) });
  }
}
