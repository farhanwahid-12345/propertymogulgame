import { useGameStore } from "@/stores/gameStore";

export const ONBOARDING_DONE_KEY = "pm_onboarding_done";

/**
 * Re-open the welcome tour from anywhere. Clears both the localStorage flag
 * (which acts as a defensive fallback in OnboardingGate) AND the zustand flag,
 * so the gate condition `(!onboardingCompleted && !lsDone)` evaluates true and
 * the floating coach card appears at step 1.
 */
export function replayTour() {
  try {
    window.localStorage.removeItem(ONBOARDING_DONE_KEY);
  } catch {
    /* noop */
  }
  useGameStore.setState({ onboardingCompleted: false } as any);
}

/** Mark the tour as completed in both stores. Used by the floating coach card's
 * Got it / Skip / X buttons so closing doesn't depend on a parent callback. */
export function dismissTour() {
  try {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, '1');
  } catch {
    /* noop */
  }
  useGameStore.setState({ onboardingCompleted: true } as any);
}
