/**
 * What `createGame()` in game/main.ts returns to the shell. The shell owns the screens
 * (title, pause, game over) and calls these; the game owns everything inside the canvas.
 */
export type GameHandle = {
  /** Start a fresh run: reset the world, the player and the score, then play. */
  start(): void;
  /** Freeze everything (the pause menu is open or the tab is hidden). */
  pause(): void;
  resume(): void;
  /** Stop the loop and free the canvas, listeners and GPU memory. */
  destroy(): void;
};

export type CreateGame = (parent: HTMLElement) => Promise<GameHandle> | GameHandle;
