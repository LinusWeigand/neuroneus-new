/**
 * Player input as actions, the same for keyboard, mouse and touch. Poll it in the update loop:
 *
 *   const { x, y } = input.axis();          // -1..1 each, from WASD / arrows / touch stick
 *   if (input.pressed("action")) jump();   // true once per press (Space / Enter / touch button)
 *   if (input.down("alt")) dash();         // held (Shift / X / second touch button)
 *
 * The on-screen touch stick and buttons (components/game/touch-controls.tsx) write into it.
 */

export type Action = "left" | "right" | "up" | "down" | "action" | "alt" | "pause";

const KEYS: Record<string, Action> = {
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right",
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  " ": "action",
  enter: "action",
  j: "action",
  z: "action",
  shift: "alt",
  x: "alt",
  k: "alt",
  escape: "pause",
  p: "pause",
};

const held = new Set<Action>();
const fresh = new Set<Action>();
const stick = { x: 0, y: 0 };
let attached = 0;

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  const action = KEYS[e.key.toLowerCase()];
  if (!action) return;
  if (action !== "pause") e.preventDefault();
  if (e.type === "keydown") {
    if (!held.has(action)) fresh.add(action);
    held.add(action);
  } else {
    held.delete(action);
  }
}

function onBlur() {
  held.clear();
  stick.x = 0;
  stick.y = 0;
}

export const input = {
  /** Starts listening. Returns a function that stops. Safe to call more than once. */
  attach() {
    if (attached++ === 0) {
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onKey);
      window.addEventListener("blur", onBlur);
    }
    return () => {
      if (--attached === 0) {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
        window.removeEventListener("blur", onBlur);
      }
    };
  },
  /** Movement from keys or the touch stick, each axis -1..1 (diagonals normalized). */
  axis() {
    let x = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0) + stick.x;
    let y = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0) + stick.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  },
  down(action: Action) {
    return held.has(action);
  },
  /** True once per press: the first time it's asked after the key or button went down. */
  pressed(action: Action) {
    if (!fresh.has(action)) return false;
    fresh.delete(action);
    return true;
  },
  /** Forget presses nobody asked about (call when a run starts). */
  clear() {
    fresh.clear();
  },
  /** For the touch controls. */
  setStick(x: number, y: number) {
    stick.x = x;
    stick.y = y;
  },
  press(action: Action, isDown: boolean) {
    if (isDown) {
      if (!held.has(action)) fresh.add(action);
      held.add(action);
    } else {
      held.delete(action);
    }
  },
};
