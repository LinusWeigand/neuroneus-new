"use client";

import { useRef } from "react";
import { type Action, input } from "@/game/input";

/**
 * On-screen controls for phones and tablets: a thumb stick on the left and action buttons on
 * the right. They feed the same `input` the keyboard does, so the game needs no touch code.
 */
export function TouchControls({ stick, buttons }: { stick: boolean; buttons: { action: Action; label: string }[] }) {
  return (
    <div className="g-touch" aria-hidden>
      {stick ? <Stick /> : <span />}
      <div className="g-touch-buttons">
        {buttons.map((b) => (
          <TouchButton key={b.action} action={b.action} label={b.label} />
        ))}
      </div>
    </div>
  );
}

function Stick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);

  const move = (e: React.PointerEvent) => {
    const rect = base.current?.getBoundingClientRect();
    if (!rect || !knob.current) return;
    const r = rect.width / 2;
    let dx = e.clientX - (rect.left + r);
    let dy = e.clientY - (rect.top + r);
    const len = Math.hypot(dx, dy);
    if (len > r) {
      dx = (dx / len) * r;
      dy = (dy / len) * r;
    }
    knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    // A small dead zone keeps a resting thumb from drifting the player.
    const nx = Math.abs(dx) / r < 0.15 ? 0 : dx / r;
    const ny = Math.abs(dy) / r < 0.15 ? 0 : dy / r;
    input.setStick(nx, ny);
  };
  const end = () => {
    pointer.current = null;
    if (knob.current) knob.current.style.transform = "";
    input.setStick(0, 0);
  };

  return (
    <div
      ref={base}
      className="g-stick"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="g-stick-knob" />
    </div>
  );
}

function TouchButton({ action, label }: { action: Action; label: string }) {
  return (
    <button
      type="button"
      className="g-touch-button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        input.press(action, true);
      }}
      onPointerUp={() => input.press(action, false)}
      onPointerCancel={() => input.press(action, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}
