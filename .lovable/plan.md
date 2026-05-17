## Goal
Fix the entity picker (Sole Trader / Limited Company) so Confirm actually proceeds, without re-breaking tutorial exit.

## Root cause
In `OnboardingGate`:
- `dismissed` is initialized from `onboardingCompleted` only.
- An effect closes the flow whenever `onboardingCompleted` becomes true.

Two failure modes follow:
1. Returning saves migrated to `onboardingCompleted=true` but with `entityChosen=false` start with `dismissed=true`, so the entity dialog never opens.
2. When the user picks an entity, `setEntityType` runs synchronously and (for new sessions where the tour is being replayed) the store can settle `onboardingCompleted=true` from a prior dismiss, which then trips the effect and closes the dialog before `setStage('tour-market')` renders.

## Plan
1. **Gate dismissal on entity choice**
   - In `OnboardingGate`, treat the entity picker as non-dismissible: `open = !entityChosen || (!onboardingCompleted && !dismissed)`.
   - Initialize `dismissed` to `false` whenever `!entityChosen`, regardless of `onboardingCompleted`.

2. **Stop the auto-close effect from firing during entity stage**
   - Only mirror `onboardingCompleted → dismissed` when `entityChosen` is also true.

3. **Make entity pick + advance atomic**
   - In `OnboardingFlow`, on Confirm: call `onEntityPick(picked)` then `setStage('tour-market')` in the same handler (already the case) but ensure parent does not interfere — covered by step 2.
   - On entity-stage "Skip tour": pick the entity, then `finish()` (existing behaviour, keep).

4. **Verify**
   - Fresh game: entity dialog appears; clicking Sole Trader/LTD highlights, Confirm advances to the tour, tour exit buttons still close it.
   - Returning save with migrated onboardingCompleted=true and no entity chosen: entity dialog appears and Confirm proceeds.
   - Replay tour from header: full flow runs and every close button exits.

## Files to change
- `src/pages/Index.tsx` (only `OnboardingGate`)

## Expected result
Sole Trader / Limited Company buttons select and Confirm advances to the tour; previous tutorial-exit fix remains intact.