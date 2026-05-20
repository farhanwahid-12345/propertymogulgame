## Goal
Stop the tutorial from getting stuck/reappearing, while preserving the required first-time choice between Sole Trader and Limited Company and keeping “Replay tour” working.

## Root cause to fix
The entity picker and tour completion are currently mixed together. Some close/skip paths mark the tour as completed before an entity is chosen, while the gate still forces onboarding open because `entityChosen` remains false. That creates a broken in-memory state that a refresh repairs from persisted storage.

## Implementation plan

1. **Separate entity choice from tour dismissal**
   - In `OnboardingFlow`, closing/skipping the welcome screen before entity selection should move to the entity picker, not dismiss the whole onboarding flow.
   - The dialog close handler should only finish the tour when `skipEntity` is true or the flow is already in tour steps.
   - Keep the entity picker mandatory: no path should set `onboardingCompleted: true` while `entityChosen` is false.

2. **Make choosing an entity atomic**
   - Add a helper in `src/lib/onboarding.ts` for completing onboarding after an entity is selected.
   - Ensure `setEntityType(...)` and tour dismissal cannot race each other: the entity choice is applied first, then onboarding completion is persisted immediately.
   - Remove duplicate `dismissTour()` calls between `OnboardingFlow.finish()` and `OnboardingGate.onFinish()` so completion writes happen once.

3. **Harden the gate against impossible state**
   - Update `OnboardingGate` so the fallback localStorage dismissal can only suppress the tour, never the entity picker.
   - If storage says the tour is done but the store says `entityChosen: false`, always show the entity picker and reset the flow to that stage.
   - If `entityChosen: true` and localStorage says dismissed, repair `onboardingCompleted: true` and flush persistence.

4. **Reset and replay behavior**
   - `resetGame()` should clear the tutorial localStorage marker as part of starting a fresh game, so the new player can choose Sole Trader/Limited Company again without relying on refresh.
   - `Replay tour` should reopen the tour without changing the already-chosen entity.

5. **Verify the exact bug path**
   - Check these flows in the preview:
     - Fresh/reset game: welcome opens, entity buttons are selectable, no refresh needed.
     - Skip intro/close before entity selection: goes to entity picker, does not get stuck.
     - Pick Sole Trader/Limited Company: game continues and tutorial does not reappear.
     - Refresh after choosing: no tutorial unless Replay tour is clicked.
     - Reset game: entity picker appears again and works immediately.