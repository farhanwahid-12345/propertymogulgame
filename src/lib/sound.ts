/**
 * Tiny one-shot sound utility.
 *
 * No audio assets — uses short WebAudio tones so the bundle stays small.
 * Respects `pm_sound_enabled` flag persisted in localStorage.
 */

const STORAGE_KEY = 'pm_sound_enabled';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent('pm:sound-toggled', { detail: enabled }));
}

let lastPlayed: Record<string, number> = {};
let cachedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (cachedCtx) return cachedCtx;
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedCtx = new Ctor();
    return cachedCtx;
  } catch {
    return null;
  }
}

interface Tone {
  freq: number;
  /** Seconds offset from cue start. */
  at: number;
  /** Seconds duration. */
  dur?: number;
  /** Peak gain (0..1). */
  gain?: number;
  type?: OscillatorType;
}

function playCue(key: string, throttleMs: number, tones: Tone[]): void {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  if (now - (lastPlayed[key] || 0) < throttleMs) return;
  lastPlayed[key] = now;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const start = ctx.currentTime;
    tones.forEach(({ freq, at, dur = 0.22, gain = 0.18, type = 'sine' }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t0 = start + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    });
  } catch {
    /* ignore */
  }
}

/** Soft two-tone chime — tenant concern raised. */
export function playConcernChime(): void {
  playCue('concern', 500, [
    { freq: 660, at: 0 },
    { freq: 880, at: 0.12 },
  ]);
}

/** Bright triple — rent collected / income event. */
export function playCoinChime(): void {
  playCue('coin', 400, [
    { freq: 988, at: 0, dur: 0.12, gain: 0.14 },
    { freq: 1318, at: 0.07, dur: 0.18, gain: 0.14 },
  ]);
}

/** Heavy triangle — sale completed / auction won. */
export function playGavel(): void {
  playCue('gavel', 800, [
    { freq: 220, at: 0, dur: 0.15, type: 'triangle', gain: 0.22 },
    { freq: 165, at: 0.1, dur: 0.25, type: 'triangle', gain: 0.18 },
  ]);
}

/** Dry square — paperwork: eviction served, tax filed. */
export function playPaper(): void {
  playCue('paper', 600, [
    { freq: 380, at: 0, dur: 0.08, type: 'square', gain: 0.1 },
    { freq: 320, at: 0.1, dur: 0.08, type: 'square', gain: 0.1 },
  ]);
}

/** Descending alert — warning, mortgage shock, refusal. */
export function playWarning(): void {
  playCue('warning', 700, [
    { freq: 520, at: 0, dur: 0.18, type: 'sawtooth', gain: 0.16 },
    { freq: 392, at: 0.18, dur: 0.22, type: 'sawtooth', gain: 0.14 },
  ]);
}

/** Ascending arpeggio — level up, milestone. */
export function playLevelUp(): void {
  playCue('levelup', 1200, [
    { freq: 523, at: 0, dur: 0.14 },
    { freq: 659, at: 0.1, dur: 0.14 },
    { freq: 784, at: 0.2, dur: 0.18 },
    { freq: 1047, at: 0.32, dur: 0.24, gain: 0.22 },
  ]);
}
