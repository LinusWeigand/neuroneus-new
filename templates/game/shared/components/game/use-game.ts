"use client";

import { useSyncExternalStore } from "react";
import { getState, subscribe } from "@/game/state";

/** The game's state (phase, score, lives, toast...) for React components. */
export function useGame() {
  return useSyncExternalStore(subscribe, getState, getState);
}
