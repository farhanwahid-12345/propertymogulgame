## Problem

The new welcome/onboarding flow gates on **both** `entityChosen` AND `onboardingCompleted`. Saves from before today's changes have `entityChosen: true` (incorporated as LTD) but `onboardingCompleted: false`, so the dialog reopens. Picking "Sole Trader" fires "Already Incorporated — cannot revert from LTD" and picking "Limited Company" would charge another £1,000 — the player is locked out.

## Fix (UI only)

**`src/pages/Index.tsx`** — adjust the `OnboardingFlow` open condition and self-heal the flag:

1. Change `open` prop to:  
   `open={!(gameState as any).entityChosen}`  
   (`onboardingCompleted` is only meaningful for brand-new players who haven't chosen an entity yet; once `entityChosen` is true, the welcome tour is moot.)

2. Add a `useEffect` that, on mount, if `entityChosen === true` but `onboardingCompleted !== true`, calls `useGameStore.setState({ onboardingCompleted: true })` so the flag heals on legacy saves.

No engine, store, or tax logic changes. No new migration version needed (the heal is idempotent at runtime).

## Files touched

- `src/pages/Index.tsx` — 1 prop tweak + 1 small effect.
