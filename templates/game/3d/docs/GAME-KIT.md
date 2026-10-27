# Game kit (3D, Three.js 0.186)

The game is built on this kit. It already gives you a polished frame: title screen, HUD,
pause, game over, touch controls, sound, a lit and tone-mapped stage with sky, fog, soft
shadows and bloom, stylized models and juice. Your job is the game itself, at the same
quality. Read `docs/ART-DIRECTION.md` for what it should look like.

## Files

| File | What it is | Edit? |
| --- | --- | --- |
| `game/world.ts` | The game. Ships as a SAMPLE: replace it with the real game, keeping its patterns. | yes |
| `game/config.ts` | Title, tagline, lives, orientation, controls text, touch buttons. Keep in sync. | yes |
| `game/main.ts` | Creates stage, fx and world; fixed-timestep loop; the shell's handle. | rarely |
| `game/theme.ts` | Art direction tokens (palette roles, `world3d` sky/ground/fog/sun, fx). Never hard-code colors. | tune only |
| `game/state.ts` | What the UI shows: `setHud`, `addScore`, `toast`, `gameOver`, `getState`, `isPlaying`. | no |
| `game/input.ts` | `input.axis()`, `input.down(a)`, `input.pressed(a)`; actions left/right/up/down/action/alt/pause. | no |
| `game/audio.ts` | `sfx(name)` and `music.start/stop` (the shell runs music). | no |
| `game/kit/*` | stage, models, materials, fx, tween. | add, don't edit |
| `components/game/*` | The shell (menus, HUD, touch controls). Restyle via CSS tokens only. | rarely |

`game/` code is loaded only in the browser (the shell imports `game/main.ts` dynamically).
Never import `three` or anything in `game/` from a page, layout or server component.
Addons: `import { X } from "three/addons/.../X.js"`.

## Units, camera, loop

1 unit ≈ a character's height. y is up; the ground is y = 0. `world.update(dt)` runs 60 times
a second (dt = 1/60) and only while playing or in attract mode; never use wall-clock time for
game logic. The camera is yours: follow the player smoothly (`position.lerp`, `lookAt`) and call
`stage.follow(target)` so shadows stay sharp around the action. Move relative to the camera.

## Art: recognizable, never bare primitives

`import { models } from "./kit/models"` (each returns a Group standing on y = 0, shadows on):
`character({ color, ears?: "bunny" | "cat" | "bear", mood?: "angry", size? })` (round body,
belly, eyes, feet: players, enemies, animals), `gem`, `coin`, `crate`, `rock`, `tree({ kind:
"round" | "pine" })`, `flower`, `spikes` (hazard; spin `userData.core`), `platform`, `island`
(arena). Everything the spec names must be recognizable at first glance; for anything else,
compose meshes the same way: rounded geometry, a lighter belly or top, eyes for anything alive,
`mat.surface(color)` from `./kit/materials` (`mat.glow` for things that shine, `mat.shiny` for
metal, `mat.ground()` for terrain). Colors from `THEME.palette` by role: `primary` = the player,
`danger` = enemies and hazards, `accent` = rewards, `secondary` = world accents, `good` = health.
Never a bare `BoxGeometry` or `SphereGeometry` mesh as a game object.

Decorate: the sample scatters trees, rocks and flowers around the arena; a world with props
reads as a place, an empty plane reads as a prototype.

## Juice: every event gets feedback

`fx` is passed to the world (`createFx(stage)`):
- `fx.juice.collect(pos, points?)`: burst, "+points", sound
- `fx.juice.hit(object)`: shake, flash, pop, burst, sound
- `fx.juice.explode(pos, color?)`: big shake, white flash, debris, sound
- `fx.juice.celebrate(pos, "Level 2")`: confetti burst, fanfare, big toast
- Single effects: `fx.burst(pos, { color, count, speed, size, gravity, up })`, `fx.shake(n)`,
  `fx.flash(color)`, `fx.pop(obj)`, `fx.squash(obj, "squash" | "stretch")`, `fx.floatText(pos, text)`
- `tween(seconds, (k) => ..., { ease: ease.outBack })` from `./kit/tween` for any eased motion.
- Sounds: `sfx("pickup" | "coin" | "jump" | "shoot" | "hit" | "explode" | "powerup" | "select" | "lose" | "win" | "step" | "whoosh")`

Movement has weight: accelerate, apply drag, turn smoothly toward the direction of travel,
squash on landing, a little hop while running.

## The run lifecycle

The world exists from page load: before the first run it is the title screen's living
background (attract mode; the sample circles the camera). The shell calls `handle.start()` →
`world.startRun()` must reset everything. Keep an `alive` flag for the player (never derive game
state from `visible`). Report with `setHud`, `addScore`, `toast`, end a run with `gameOver()`
after a short death effect. Never draw menus or HUD text in WebGL.

## Quality bar (check before you finish)

- No bare primitives, no hard-coded colors, no default fonts.
- Every player action and every game event has visual feedback and a sound.
- The player reads instantly; hazards read as dangerous; the world has props and depth.
- Difficulty ramps; the first 10 seconds are easy and already fun.
- `game/config.ts` matches the game (title, tagline, controls, touch buttons, lives).
- Works with keyboard and touch, pauses cleanly, restarts cleanly, 60 fps on a laptop.
