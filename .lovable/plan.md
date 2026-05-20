## Goal
Stop the onboarding/tutorial card from reappearing after the user clicks **Got it**, **Skip tour**, or **X**, while keeping **Replay tour** working intentionally.

## Likely cause
The tutorial currently depends on two sources of truth:
- Zustand save state: `onboardingCompleted`
- Separate localStorage flag: `pm_onboarding_done`

Dismissal sets both, but the main gate only trusts the Zustand field. Because saves are debounced and game ticks keep writing state frequently, a stale pending save can overwrite the completed flag and make the tutorial reopen.

## Plan
1. **Make dismissal write-through immediately**
   - Add a small flush capability to the debounced storage adapter so critical state changes can be written immediately instead of waiting for the 2s debounce.
   - Use it when the tutorial is dismissed or replayed.

2. **Make the onboarding gate resilient**
   - In `OnboardingGate`, read the `pm_onboarding_done` localStorage flag as a defensive fallback on mount.
   - If localStorage says the tutorial was dismissed but the store says it was not, repair the store by setting `onboardingCompleted: true`.
   - Keep entity selection mandatory: this fallback must not skip the first-time business-structure picker when `entityChosen` is false.

3. **Prevent stale pending saves from reviving the tutorial**
   - Update the persistence layer so an immediate onboarding dismissal flushes the latest `propertyTycoonSave` before the next game tick can persist older state.
   - Ensure `dismissTour()` remains the single close path for **Got it**, **Skip tour**, and **X**.

4. **Preserve explicit replay behavior**
   - `Replay tour` should still remove the fallback flag and set `onboardingCompleted: false`.
   - The tour should then close permanently again after the next dismissal.

## Files to change
- `src/lib/debouncedSave.ts`
- `src/lib/onboarding.ts`
- `src/pages/Index.tsx`

## Validation
- Start with the tutorial visible.
- Click **Got it** and confirm it closes.
- Let the game clock tick / month advance and confirm it does not come back.
- Refresh the preview and confirm it stays dismissed.
- Use **Replay tour**, then dismiss again and confirm it stays off.