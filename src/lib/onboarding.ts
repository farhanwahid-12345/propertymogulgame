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
