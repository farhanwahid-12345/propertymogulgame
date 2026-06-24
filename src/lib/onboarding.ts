import { useGameStore } from "@/stores/gameStore";
import { flushPersistedSave } from "@/lib/debouncedSave";

export const ONBOARDING_DONE_KEY = "pm_onboarding_done";

/** Bump this whenever replayTour is called so listeners can re-mount the flow. */
let replayNonce = 0;
const replayListeners = new Set<(nonce: number) => void>();

export function subscribeReplay(listener: (nonce: number) => void): () => void {
  replayListeners.add(listener);
  return () => { replayListeners.delete(listener); };
}

export function getReplayNonce(): number {
  return replayNonce;
}

/** Re-open the welcome tour from anywhere. Single source of truth = zustand;
 * localStorage is kept in sync as a defensive fallback. */
export function replayTour() {
  try { window.localStorage.removeItem(ONBOARDING_DONE_KEY); } catch { /* noop */ }
  useGameStore.setState({ onboardingCompleted: false } as any);
  flushPersistedSave();
  replayNonce += 1;
  replayListeners.forEach((l) => { try { l(replayNonce); } catch { /* noop */ } });
}

/** Mark the tour as completed. Used by every exit button (Skip / Got it / X).
 * Refuses to complete onboarding while no trading entity has been chosen —
 * the entity picker is mandatory and must not be bypassed. */
export function dismissTour() {
  const state = useGameStore.getState() as any;
  if (!state.entityChosen) return;
  try { window.localStorage.setItem(ONBOARDING_DONE_KEY, '1'); } catch { /* noop */ }
  useGameStore.setState({ onboardingCompleted: true } as any);
}

/** Clear all tutorial persistence — used by resetGame so a fresh game can
 * show the entity picker again without requiring a hard refresh. */
export function clearOnboardingPersistence() {
  try { window.localStorage.removeItem(ONBOARDING_DONE_KEY); } catch { /* noop */ }
  flushPersistedSave();
}

/** Defensive read for the OnboardingGate — true if the user previously
 * dismissed the tour according to localStorage. */
export function isTourDismissedInStorage(): boolean {
  try { return window.localStorage.getItem(ONBOARDING_DONE_KEY) === '1'; }
  catch { return false; }
}
