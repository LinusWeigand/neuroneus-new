"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isMuted, music, onMuteChange, setMuted, sfx, unlockAudio } from "@/game/audio";
import { GAME } from "@/game/config";
import type { GameHandle } from "@/game/handle";
import { input } from "@/game/input";
import { getState, type Phase, resetRun, setPhase, subscribe } from "@/game/state";
import { TouchControls } from "./touch-controls";
import { useGame } from "./use-game";

/**
 * The whole game screen: the canvas (game/main.ts) plus everything around it, in HTML:
 * loading, title screen, HUD, pause menu, game over, touch controls and the screen finish
 * (vignette, grain, scanlines). The game never draws menus; it reports through game/state.ts.
 */
export function GameShell() {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<GameHandle | null>(null);
  const game = useGame();
  const [touch, setTouch] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    const detach = input.attach();
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    (async () => {
      try {
        await document.fonts?.ready;
        // Loaded only in the browser: the engine needs window, the server never runs it.
        const { createGame } = await import("@/game/main");
        const h = await createGame(el);
        if (disposed) return h.destroy();
        handle.current = h;
        setPhase("title");
      } catch (err) {
        console.error("The game failed to start", err);
        setError(true);
      }
    })();
    return () => {
      disposed = true;
      detach();
      music.stop();
      handle.current?.destroy();
      handle.current = null;
    };
  }, []);

  const play = useCallback(() => {
    if (!handle.current) return;
    unlockAudio();
    sfx("select");
    input.clear();
    resetRun(GAME.lives);
    handle.current.start();
    music.start();
  }, []);

  const pause = useCallback(() => {
    if (getState().phase !== "playing") return;
    handle.current?.pause();
    setPhase("paused");
    sfx("select", { pitch: 0.8 });
  }, []);

  const resume = useCallback(() => {
    if (getState().phase !== "paused") return;
    sfx("select");
    setPhase("playing");
    handle.current?.resume();
  }, []);

  // Keys for the screens around the game. Gameplay keys are read through game/input.ts.
  useEffect(() => {
    let readyAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const { phase } = getState();
      const key = e.key.toLowerCase();
      if ((key === "escape" || key === "p") && phase === "playing") pause();
      else if ((key === "escape" || key === "p" || key === "enter") && phase === "paused") resume();
      else if ((key === "enter" || key === " ") && phase === "title") play();
      else if ((key === "enter" || key === " ") && phase === "over" && performance.now() > readyAt) play();
    };
    const unsub = onPhase((phase) => {
      // A short grace period, so the key that ended the run doesn't instantly restart it.
      if (phase === "over") readyAt = performance.now() + 700;
    });
    const onHide = () => document.hidden && pause();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [play, pause, resume]);

  // The end of a run gets its own sound and the music fades.
  const phase = game.phase;
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === "playing" && phase === "over") {
      music.stop();
      sfx(getState().newBest ? "win" : "lose");
    }
    lastPhase.current = phase;
  }, [phase]);

  return (
    <div className="g-root" data-phase={phase}>
      <div ref={host} className="g-canvas" />
      <div className="g-finish" aria-hidden />

      {phase === "playing" || phase === "paused" ? <Hud onPause={pause} /> : null}
      {phase === "playing" && touch ? <TouchControls stick={GAME.touch.stick} buttons={[...GAME.touch.buttons]} /> : null}

      {phase === "loading" && !error ? (
        <div className="g-screen">
          <div className="g-loader" aria-label="Loading" />
        </div>
      ) : null}
      {error ? (
        <div className="g-screen">
          <div className="g-panel g-enter">
            <h2 className="g-heading">The game couldn&apos;t start</h2>
            <p className="g-muted">Your browser may not support WebGL. Try another browser or device.</p>
          </div>
        </div>
      ) : null}

      {phase === "title" ? <TitleScreen best={game.best} touch={touch} onPlay={play} /> : null}

      {phase === "paused" ? (
        <div className="g-screen g-dim">
          <div className="g-panel g-enter">
            <h2 className="g-heading">Paused</h2>
            <div className="g-actions">
              <button type="button" className="g-btn g-btn-primary" onClick={resume} autoFocus>
                Resume
              </button>
              <button type="button" className="g-btn" onClick={play}>
                Restart
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "over" ? (
        <div className="g-screen g-dim">
          <div className="g-panel g-enter">
            <p className="g-eyebrow">Game over</p>
            <p className="g-score-big">{game.score.toLocaleString()}</p>
            {game.newBest ? <p className="g-badge">New best!</p> : <p className="g-muted">Best {game.best.toLocaleString()}</p>}
            <div className="g-actions">
              <button type="button" className="g-btn g-btn-primary" onClick={play} autoFocus>
                Play again
              </button>
            </div>
            {!touch ? <p className="g-hint">Press Enter to play again</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TitleScreen({ best, touch, onPlay }: { best: number; touch: boolean; onPlay: () => void }) {
  return (
    <div className="g-screen g-title-screen">
      <div className="g-title-block g-enter">
        <h1 className="g-title">{GAME.title}</h1>
        <p className="g-tagline">{GAME.tagline}</p>
        <button type="button" className="g-btn g-btn-primary g-btn-play" onClick={onPlay} autoFocus>
          Play
        </button>
        {best > 0 ? <p className="g-muted">Best {best.toLocaleString()}</p> : null}
      </div>
      <div className="g-controls">
        {touch ? (
          <span>{GAME.controls.touch}</span>
        ) : (
          GAME.controls.desktop.map(([keys, what]) => (
            <span key={keys}>
              <kbd>{keys}</kbd> {what}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function Hud({ onPause }: { onPause: () => void }) {
  const game = useGame();
  const [muted, setMutedState] = useState(isMuted);
  useEffect(() => onMuteChange(() => setMutedState(isMuted())), []);

  return (
    <>
      <div className="g-hud g-hud-left">
        <div key={game.score} className="g-hud-score">
          {game.score.toLocaleString()}
        </div>
        <div className="g-hud-chips">
          {game.level > 1 ? <span className="g-chip">Level {game.level}</span> : null}
          {Object.entries(game.stats).map(([label, value]) => (
            <span key={label} className="g-chip">
              {label} <b>{value}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="g-hud g-hud-right">
        {game.maxLives > 0 ? (
          <div className="g-lives" aria-label={`${game.lives} lives`}>
            {Array.from({ length: game.maxLives }, (_, i) => (
              <Heart key={i} full={i < game.lives} />
            ))}
          </div>
        ) : null}
        <button type="button" className="g-icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <SpeakerOff /> : <SpeakerOn />}
        </button>
        <button type="button" className="g-icon-btn" onClick={onPause} aria-label="Pause">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" rx="1.5" />
            <rect x="14" y="5" width="4" height="14" rx="1.5" />
          </svg>
        </button>
      </div>
      {game.toast ? (
        <div key={game.toast.id} className="g-toast">
          {game.toast.text}
        </div>
      ) : null}
    </>
  );
}

function Heart({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={full ? "g-heart" : "g-heart g-heart-empty"} aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

function SpeakerOn() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

function SpeakerOff() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </svg>
  );
}

/** Calls back when the game's phase changes (outside React's render cycle). */
function onPhase(listener: (phase: Phase) => void) {
  let last = getState().phase;
  return subscribe(() => {
    const next = getState().phase;
    if (next !== last) {
      last = next;
      listener(next);
    }
  });
}
