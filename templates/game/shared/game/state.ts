/**
 * The game's state that the React UI shows (title, HUD, pause, game over), shared between the
 * game code and React without either importing the other. The game writes, the UI reads:
 *
 *   setHud({ score: score + 10 });   toast("Wave 2");   gameOver();
 *
 * React reads it with `useGame()` (components/game/use-game.ts).
 */

export type Phase = "loading" | "title" | "playing" | "paused" | "over";

export type GameState = {
  phase: Phase;
  score: number;
  /** Best score on this device (saved in localStorage). */
  best: number;
  /** Set when the run that just ended beat the previous best. */
  newBest: boolean;
  lives: number;
  maxLives: number;
  level: number;
  /** A short message shown big in the middle for a moment ("Wave 2", "Combo x3"). */
  toast: { id: number; text: string } | null;
  /** Anything else the HUD should show, by label: { Coins: 12, Time: "0:42" }. */
  stats: Record<string, string | number>;
};

const BEST_KEY = "game:best";

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

let state: GameState = {
  phase: "loading",
  score: 0,
  best: 0,
  newBest: false,
  lives: 3,
  maxLives: 3,
  level: 1,
  toast: null,
  stats: {},
};
const listeners = new Set<() => void>();

function set(next: Partial<GameState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function getState(): GameState {
  return state;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Update what the HUD shows. */
export function setHud(next: Partial<Pick<GameState, "score" | "lives" | "maxLives" | "level" | "stats">>) {
  set(next);
}

export function addScore(points: number) {
  set({ score: state.score + points });
}

let toastId = 0;
/** Flash a short message in the middle of the screen. */
export function toast(text: string) {
  set({ toast: { id: ++toastId, text } });
}

/** A new run starts: score and lives reset. Called by the shell before `handle.start()`. */
export function resetRun(lives = state.maxLives) {
  set({ phase: "playing", score: 0, newBest: false, lives, level: 1, toast: null, stats: {} });
}

/** The run ended: the shell shows the game-over screen and saves the best score. */
export function gameOver() {
  if (state.phase !== "playing") return;
  const newBest = state.score > state.best;
  const best = Math.max(state.best, state.score);
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {}
  set({ phase: "over", best, newBest });
}

export function setPhase(phase: Phase) {
  if (phase === "title" && state.phase === "loading") set({ phase, best: readBest() });
  else set({ phase });
}

export const isPlaying = () => state.phase === "playing";
