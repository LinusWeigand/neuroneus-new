/**
 * Sound without audio files: effects and a music loop synthesized with the Web Audio API.
 * Browsers only allow sound after the player interacts; everything here stays silent until
 * then, and the mute choice is remembered.
 *
 *   sfx("pickup");  sfx("hit");  sfx("explode", { pitch: 0.8 });
 *   music.start();  music.stop();
 */
import { THEME } from "@/game/theme";

export type SfxName =
  | "pickup"
  | "coin"
  | "jump"
  | "shoot"
  | "hit"
  | "explode"
  | "powerup"
  | "select"
  | "lose"
  | "win"
  | "step"
  | "whoosh";

const MUTE_KEY = "game:muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
const muteListeners = new Set<() => void>();

try {
  muted = typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
} catch {}

function audio() {
  if (ctx) return ctx;
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx = new AudioContext();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(compressor).connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from a click or key handler (the shell does) so sound may play. */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

export function isMuted() {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {}
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.7, ctx.currentTime, 0.02);
  for (const l of muteListeners) l();
}

export function onMuteChange(listener: () => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

function ready() {
  return ctx && master && ctx.state === "running" && !muted ? ctx : null;
}

type ToneOpts = { type?: OscillatorType; from: number; to?: number; dur: number; vol?: number; at?: number; dest?: AudioNode };

function tone(c: AudioContext, o: ToneOpts) {
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = o.type ?? "square";
  osc.frequency.setValueAtTime(o.from, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
  const vol = o.vol ?? 0.2;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(gain).connect(o.dest ?? master!);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

function noise(c: AudioContext, o: { dur: number; vol?: number; from?: number; to?: number; at?: number; type?: BiquadFilterType }) {
  const t = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = o.type ?? "lowpass";
  filter.frequency.setValueAtTime(o.from ?? 3000, t);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(o.vol ?? 0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(filter).connect(gain).connect(master!);
  src.start(t);
  src.stop(t + o.dur + 0.02);
}

/** Plays a sound effect. `pitch` scales every frequency (vary it slightly for repeated sounds). */
export function sfx(name: SfxName, opts: { pitch?: number; volume?: number } = {}) {
  const c = ready();
  if (!c) return;
  const p = (opts.pitch ?? 1) * (0.97 + Math.random() * 0.06);
  const v = opts.volume ?? 1;
  switch (name) {
    case "pickup":
      tone(c, { type: "square", from: 880 * p, to: 1760 * p, dur: 0.08, vol: 0.12 * v });
      tone(c, { type: "sine", from: 1320 * p, dur: 0.16, vol: 0.14 * v, at: 0.05 });
      break;
    case "coin":
      tone(c, { type: "square", from: 988 * p, dur: 0.07, vol: 0.1 * v });
      tone(c, { type: "square", from: 1319 * p, dur: 0.22, vol: 0.1 * v, at: 0.07 });
      break;
    case "jump":
      tone(c, { type: "square", from: 260 * p, to: 620 * p, dur: 0.14, vol: 0.12 * v });
      break;
    case "shoot":
      tone(c, { type: "sawtooth", from: 980 * p, to: 180 * p, dur: 0.11, vol: 0.09 * v });
      noise(c, { dur: 0.05, vol: 0.08 * v, from: 6000, type: "highpass" });
      break;
    case "hit":
      noise(c, { dur: 0.16, vol: 0.35 * v, from: 2400, to: 300 });
      tone(c, { type: "sine", from: 180 * p, to: 55 * p, dur: 0.18, vol: 0.35 * v });
      break;
    case "explode":
      noise(c, { dur: 0.6, vol: 0.5 * v, from: 1600, to: 60 });
      tone(c, { type: "sine", from: 120 * p, to: 28 * p, dur: 0.5, vol: 0.45 * v });
      break;
    case "powerup":
      [523, 659, 784, 1047, 1319].forEach((f, i) =>
        tone(c, { type: "triangle", from: f * p, dur: 0.12, vol: 0.16 * v, at: i * 0.055 }),
      );
      break;
    case "select":
      tone(c, { type: "sine", from: 660 * p, dur: 0.06, vol: 0.12 * v });
      tone(c, { type: "sine", from: 990 * p, dur: 0.09, vol: 0.1 * v, at: 0.05 });
      break;
    case "lose":
      [392, 311, 233, 175].forEach((f, i) =>
        tone(c, { type: "triangle", from: f * p, to: f * 0.94 * p, dur: 0.26, vol: 0.2 * v, at: i * 0.17 }),
      );
      break;
    case "win":
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
        tone(c, { type: "square", from: f * p, dur: 0.14, vol: 0.1 * v, at: i * 0.09 }),
      );
      break;
    case "step":
      noise(c, { dur: 0.04, vol: 0.08 * v, from: 1800, to: 600 });
      break;
    case "whoosh":
      noise(c, { dur: 0.3, vol: 0.18 * v, from: 400, to: 3200, type: "bandpass" });
      break;
  }
}

// ─── Music ──────────────────────────────────────────────────────────────────

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** Chord roots as scale degrees: i-VI-III-VII (minor) or I-V-vi-IV (major). */
const PROGRESSION = { minor: [0, 5, 2, 6], major: [0, 4, 5, 3] };

let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicGain: GainNode | null = null;

function noteFreq(rootMidi: number, scale: number[], degree: number, octave = 0) {
  const n = scale.length;
  const idx = ((degree % n) + n) % n;
  const oct = Math.floor(degree / n) + octave;
  return 440 * Math.pow(2, (rootMidi + scale[idx] + 12 * oct - 69) / 12);
}

/** A soft generative loop in the theme's mood. Quiet by design: it sits under the effects. */
export const music = {
  start() {
    const c = audio();
    if (!c || musicTimer) return;
    musicGain = c.createGain();
    musicGain.gain.value = 0.0001;
    musicGain.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 1.5);
    const lowpass = c.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2200;
    musicGain.connect(lowpass).connect(master!);

    const mood = THEME.music.mood;
    const scale = mood === "major" ? MAJOR : MINOR;
    const chords = PROGRESSION[mood];
    const root = 57; // A3
    const step = 60 / THEME.music.bpm / 2; // eighth notes
    let next = c.currentTime + 0.1;
    let i = 0;

    const schedule = () => {
      if (!musicGain) return;
      while (next < c.currentTime + 0.4) {
        const bar = Math.floor(i / 8) % chords.length;
        const beat = i % 8;
        const chord = chords[bar];
        const at = next - c.currentTime;
        if (beat === 0 || beat === 4) {
          tone(c, { type: "triangle", from: noteFreq(root - 12, scale, chord), dur: step * 3.5, vol: 0.18, at, dest: musicGain });
        }
        const arp = [0, 2, 4, 7, 4, 2, 0, 4][beat];
        tone(c, { type: "square", from: noteFreq(root, scale, chord + arp), dur: step * 0.9, vol: 0.035, at, dest: musicGain });
        if (beat % 2 === 1) {
          const src = c.createBufferSource();
          src.buffer = noiseBuffer;
          const hp = c.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.value = 8000;
          const g = c.createGain();
          g.gain.setValueAtTime(0.04, next);
          g.gain.exponentialRampToValueAtTime(0.0001, next + 0.04);
          src.connect(hp).connect(g).connect(musicGain);
          src.start(next);
          src.stop(next + 0.05);
        }
        next += step;
        i++;
      }
    };
    schedule();
    musicTimer = setInterval(schedule, 100);
  },
  stop() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    if (musicGain && ctx) {
      const g = musicGain;
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
      setTimeout(() => g.disconnect(), 1200);
    }
    musicGain = null;
  },
};
