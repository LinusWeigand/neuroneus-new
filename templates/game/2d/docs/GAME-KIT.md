# Game kit (2D, Phaser 3.90)

The game is built on this kit. It already gives you a polished frame: title screen, HUD,
pause, game over, touch controls, sound, a themed backdrop, bloom and juice. Your job is the
game itself, at the same quality. Read `docs/ART-DIRECTION.md` for what it should look like.

## Files

| File | What it is | Edit? |
| --- | --- | --- |
| `game/scenes/play-scene.ts` | The game. Ships as a SAMPLE: replace it with the real game, keeping its patterns. | yes |
| `game/config.ts` | Title, tagline, lives, orientation, controls text, touch buttons. Keep in sync. | yes |
| `game/main.ts` | Boots Phaser and returns the handle (start, pause, resume, destroy). Add scenes here. | rarely |
| `game/theme.ts` | Art direction tokens (palette roles, backdrop recipe, fx). Never hard-code colors. | tune only |
| `game/state.ts` | What the UI shows: `setHud`, `addScore`, `toast`, `gameOver`, `getState`, `isPlaying`. | no |
| `game/input.ts` | `input.axis()`, `input.down(a)`, `input.pressed(a)`; actions left/right/up/down/action/alt/pause. | no |
| `game/audio.ts` | `sfx(name)` and `music.start/stop` (the shell runs music). | no |
| `game/kit/*` | textures, fx/juice, backdrop, post, color, view. | extend |
| `components/game/*` | The shell (menus, HUD, touch controls). Restyle via CSS tokens only. | rarely |

`game/` code is loaded only in the browser (the shell imports `game/main.ts` dynamically).
Never import `phaser` or anything in `game/` from a page, layout or server component.
Always import Phaser as a namespace: `import * as Phaser from "phaser"` (it has no default export).

## Coordinates and sizes

The world is a fixed `VIEW` (1280×720 landscape, 720×1280 portrait, low-res for pixel art)
scaled to fit the screen. `U` = 1% of the shorter side. Size and speed everything in `U`
(`radius: 4 * U`, `speed: 40 * U` px/s) so the game looks right in every theme.

## Art: never plain shapes

Make every sprite with `game/kit/textures.ts` (shaded, outlined, highlighted in the theme's style):
`creature` (a character with eyes, `mood: "angry"` for enemies), `orb`, `gem`, `star`, `heart`,
`box` (platforms, walls, tiles), `ship`, `spikes`, `ring`, `cloud`, `glow`, `spark`, `chip`, and
`custom(scene, key, w, h, draw)` for anything else, drawn with gradients, an outline and a
highlight like the others. Colors come from `THEME.palette` by role: `primary` = the player,
`danger` = enemies and hazards, `accent` = rewards, `secondary` = world accents, `good` = health.
Sprites are drawn once per key; call the functions in `create()`.

Key objects glow: `addGlow(sprite, color)` (kit/post) and `fx.aura(scene, sprite, color)`.
Moving things leave `fx.trail`. Idle things breathe: `fx.bob`, slow rotation, a pulsing scale.
Depth: backdrop < -10, world 0–9, player 10, effects 900+.

## Juice: every event gets feedback

`import { fx, juice } from "../kit/fx"`

- `juice.collect(scene, x, y, points?)`: burst, ring, "+points", sound
- `juice.hit(scene, sprite)`: white blink, hit-stop, shake, sparks, sound
- `juice.explode(scene, x, y, color?)`: flash, big shake, debris, shockwave, sound
- `juice.celebrate(scene, "Level 2")`: confetti, camera punch, fanfare, big toast
- Single effects: `fx.shake`, `fx.flash`, `fx.hitStop` (skip your update while `fx.frozen()`),
  `fx.burst`, `fx.sparks`, `fx.confetti`, `fx.shockwave`, `fx.floatText`, `fx.pop`, `fx.squash`
  (`"stretch"` on jump, `"squash"` on land), `fx.blink`, `fx.trail`, `fx.aura`, `fx.bob`, `fx.punch`
- Sounds: `sfx("pickup" | "coin" | "jump" | "shoot" | "hit" | "explode" | "powerup" | "select" | "lose" | "win" | "step" | "whoosh")`

Movement has weight: accelerate and use drag instead of setting velocity directly; ease every
tween (`Back.easeOut`, `Cubic.easeOut`, `Sine.easeInOut`), never linear.

## The run lifecycle

The scene runs from page load: before the first run it is the title screen's living background
(attract mode, no player). The shell calls `handle.start()` → your `startRun()` must reset
everything (entities, timers, player). Report with `setHud({ lives, level, stats })`, `addScore(n)`,
`toast("Wave 2")`, and end a run with `gameOver()` (after a short death effect). The shell shows
score, lives, level and `stats` chips, pause, game over and best score; never draw menus or HUD
text in the canvas.

## Backdrop

`createBackdrop(this)` in `create()`, `backdrop.update(delta)` in `update()`. Set
`backdrop.speed` (px/s) for side-scrollers so the parallax layers move with the world.
For a ground or level, draw it with `textures.box` tiles or `custom` textures on top.

## Quality bar (check before you finish)

- No plain rectangles/circles, no default fonts, no hard-coded colors.
- Every player action and every game event has visual feedback and a sound.
- The player reads instantly (primary color, glow, eyes); hazards read as dangerous (danger color, spikes, angry).
- Difficulty ramps; the first 10 seconds are easy and already fun.
- `game/config.ts` matches the game (title, tagline, controls, touch buttons, lives).
- Works with keyboard and touch (input + GAME.touch), pauses cleanly, restarts cleanly.
