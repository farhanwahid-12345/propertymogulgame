/**
 * Tiny one-shot sound utility.
 *
 * No audio assets — uses a short two-tone WebAudio chime so the bundle stays
 * small. Respects a `soundEnabled` flag persisted in localStorage so the
 * player can mute. Reads on every play so toggling is immediate.
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

let lastPlayed = 0;
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

/** Plays a soft two-tone chime. Throttled to once per 500ms. */
export function playConcernChime(): void {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayed < 500) return;
  lastPlayed = now;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const start = ctx.currentTime;
    const tones = [660, 880];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = start + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  } catch {
    /* ignore */
  }
}
