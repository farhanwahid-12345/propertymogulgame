## Goal
Remove the "✨ Upgrade to premium (£X → 1.25× rent)" button from each property card. It's an unrealistic instant-finish shortcut that bypasses the proper Renovate flow (which already handles condition tier upgrades with scaled costs, durations, planning permission, and ceiling diminishing returns).

## Reference
The user circled the button in `image-15.png` and wants it removed.

## Changes

### 1. `src/components/ui/property-card.tsx`
- **Remove** the JSX block at lines ~548–566 that renders the conditional `Upgrade to {target}` button (the IIFE that computes `costPct`, `cost`, `newMult` and renders the purple-bordered Button).
- **Remove** the `onUpgradeCondition` prop from the `PropertyCardProps` interface (line ~50) and from the destructured component props (line ~109), since it's no longer used.

### 2. `src/pages/Index.tsx`
- **Remove** the `onUpgradeCondition={gameState.upgradeCondition}` prop being passed to `PropertyCard` at line ~378.

### 3. Keep the underlying action intact (no removal)
- Leave `upgradeCondition` in `src/stores/gameStore.ts` (lines 306, 2503–2536) and its passthrough in `src/hooks/useGameState.ts` (lines 311–313, 408) **as-is**. Rationale:
  - Persisted saves may reference it in the future, and it's harmless dead-internal API.
  - Removing it would require a save migration and risks breaking other call sites if any are added later.
  - If the user later confirms they want it fully purged, that's a trivial follow-up.

## Out of Scope
- The "Renovate" button and the full renovation dialog/tracker stay exactly as they are — that's the realistic path the user wants players to use.
- No changes to the underlying condition tier system (`dilapidated` / `standard` / `premium`) — properties can still reach `premium` via Renovate or be purchased in that condition.

## Verification
- Property cards no longer show the purple "Upgrade to {target}" button.
- "Renovate" button still opens the renovation dialog with all condition-improving options.
- No TypeScript errors from the removed prop.
