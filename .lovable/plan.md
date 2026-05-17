## Goal
Make every tutorial exit button reliably close the tutorial, keep the tutorial available, and prevent the floating coach card from trapping the player after the last step.

## Plan
1. **Separate tutorial visibility from persisted game state while mounted**
   - Add a local `dismissed` state in `OnboardingGate` so clicking `Skip intro`, `Skip tour`, `Got it`, or `X` immediately hides the tutorial in the current render cycle.
   - Keep `onboardingCompleted` persisted in the game store so the tutorial still stays dismissed after reload.
   - Reset local dismissal only when the persisted store explicitly asks to replay the tutorial.

2. **Make `OnboardingFlow` controlled and reset-safe**
   - Reset the internal stage when the tutorial is opened: first-time users start at welcome/entity; replay starts at the market tour.
   - Prevent stale stages from staying active if the tutorial is closed and reopened.
   - Use one shared `finish()` path for all close actions.

3. **Fix entity selection closing race**
   - Ensure choosing an entity does not accidentally close or reopen the tutorial because `entityChosen` changes during the same click.
   - Keep the entity picker, then continue into the tour if the user confirms; if they skip, dismiss cleanly.

4. **Clean up the duplicated localStorage/store dismissal logic**
   - Keep `dismissTour()` as the canonical completion helper.
   - Remove redundant localStorage writes from `Index.tsx` so there is only one completion path.
   - Update stale comments in `src/lib/onboarding.ts` so future fixes do not reintroduce the old two-source bug.

5. **Verify the actual failing buttons**
   - Test first-time flow: `Skip intro`, entity `Skip tour`, tour `Skip tour`, `X`, and final `Got it`.
   - Test replay flow from the header menu: replay opens the tour, then each close button exits.
   - Confirm the underlying Market/Bank/Operations buttons remain clickable once the tutorial is closed.

## Files to change
- `src/pages/Index.tsx`
- `src/components/ui/onboarding-flow.tsx`
- `src/lib/onboarding.ts`

## Expected result
The tutorial remains in the game, but every exit control closes it immediately and permanently until the player deliberately chooses replay tour again.