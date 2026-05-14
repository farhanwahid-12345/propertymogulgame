# Fix Pack: 6 Gameplay & UI Issues

## 1. Toasts dismiss on submenu interaction
**File:** `src/hooks/use-toast.ts`

- Reduce `TOAST_REMOVE_DELAY` from 1,000,000 ms to ~5,000 ms so toasts auto-clear quickly.
- Add a global listener (mounted in `App.tsx` or inside the toaster) that calls `dismiss()` on any `pointerdown` whose target is inside `[role="dialog"], [data-state="open"], [role="menu"], .sheet`. This ensures the "Offer Accepted" / "Mortgage declined" toasts disappear the moment the player opens or clicks inside any sub-menu, dialog, sheet, or popover.

## 2. Single pause / sound button
**File:** `src/components/ui/notification-centre.tsx`

The header already renders pause + sound in `HeroHeader.tsx`. `NotificationCentre` duplicates them.

- Remove the pause `<Button>` and sound `<Button>` blocks from `NotificationCentre` — keep only the bell + sheet.
- Drop now-unused imports (`Pause`, `Play`, `Volume2`, `VolumeX`, `isSoundEnabled`, `setSoundEnabled`, `useGameStore`, `togglePause`).
- Change the wrapper `<div className="flex items-center gap-1.5">` to just the bell trigger.

## 3. Trim renovation menu + scale up "Basic Repairs" cost
**File:** `src/components/ui/renovation-dialog.tsx`

- Remove `basic_repair` and `full_redecoration` entries from `RENOVATION_OPTIONS`.
- Repair-bar top-up (the `RepairBar` "Top up condition" action in `property-card.tsx`) is now the sole repair channel. Re-cost it so it's no longer trivially cheap:
  - **File:** `src/lib/engine/constants.ts` — raise `CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT` so a 20-point top-up on a 900 sqft property costs roughly £600–£900 (currently far below). Target: ~£0.05 per point per sqft → 20 pts × 900 sqft = £900.
  - Optionally cap `MAX_TOPUP_POINTS_PER_MONTH` if it currently allows full restoration in one click.
- Verify suppression/cooldown logic that referenced `basic_repair` / `full_redecoration` (`renovationCompletionMonths['full_redecoration']`, etc.) still compiles; remove the now-dead `ineligibilityReason` branches that look up those IDs.

## 4. Stop the "Market | Debt | Month" bar from flashing
**File:** `src/components/ui/game-stats.tsx` (lines ~226-241)

The flashing comes from the `recentTenantEvents` `Badge` (destructive variant) re-mounting on every render and the `glass-hover` transition firing on parent re-renders.

- Wrap the `CollapsibleTrigger` button in `React.memo` (extract a small `MarketSummaryBar` component) so it only re-renders when `currentMarketRate`, `totalDebt`, `monthsPlayed`, or `recentTenantEvents.length` actually change.
- Remove the `transition-all duration-300` from `glass-hover` for this specific element (use plain `glass` + a static hover bg) to kill the perceived pulse on parent state churn.
- Stabilise the badge: render it conditionally on `recentTenantEvents.length > 0` only, and key it by `length` so React doesn't reconcile a fresh node every tick.

## 5. Renovations only when vacant
**File:** `src/components/ui/renovation-dialog.tsx`

Today only some options carry `requiresVacant: true`. User wants ALL renovations gated.

- In `ineligibilityReason`, add a top-level rule: `if (hasTenant) return 'Tenant in residence — serve eviction or wait for vacancy';` (regardless of `requiresVacant`).
- Pass `hasTenant` through from `PropertyCard` (already in props as `currentTenant` — derive `hasTenant={!!currentTenant}` and forward).
- Keep the per-option `requiresVacant` flag for clarity but it becomes redundant.

## 6. Multi-tenant slots after conversions
**Files:** `src/types/game.ts`, `src/stores/gameStore.ts`, `src/components/ui/property-card.tsx`, `src/components/ui/tenant-selector.tsx`

A converted HMO with 4 rooms or a building converted to 3 flats currently still has one tenant slot. After conversion, each unit needs its own tenant.

- **Type:** change `Property.currentTenantId?: string` to `currentTenantIds?: string[]` (length 1 for standard properties, `subtypeUnits` for HMO/flats). Provide a sanitiser that migrates legacy single-tenant saves into a one-element array.
- **Store actions:** `assignTenant(propertyId, tenant, slotIndex?)`, `removeTenant(propertyId, slotIndex)`, evictions per-slot. Rent aggregation sums all occupied slots; council tax only when ALL slots vacant; satisfaction tracked per slot.
- **Tenant generation (`tenant-selector.tsx`):** when `property.subtype === 'hmo'`, bias profiles toward `student`/`budget`/`young couple`; when `subtype === 'flats'`, allow per-flat profile mix. Show a slot picker (e.g. "Room 1 of 4 — vacant") at the top of the dialog.
- **`PropertyCard`:** show a compact occupancy strip (`👤👤👤·` style) for multi-unit properties, with an "Assign" button per vacant slot. Existing single-tenant UI remains for `subtype === 'standard'`.
- **Activity feed / events:** include slot index in departure / eviction entries.

This is the largest item — touches state shape, persistence, and UI. Worth landing in its own PR after the other five quick fixes.

## Technical notes

- All financial deltas remain in pennies via existing helpers.
- No engine constants outside `CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT` change.
- No new packages.
- Save-game compatibility preserved via sanitisers in `src/stores/sanitizers.ts`.

## Suggested order
1. Items 2, 4 — pure UI, low risk.
2. Item 1 — toast UX.
3. Items 3, 5 — renovation rules.
4. Item 6 — multi-tenant slots (largest, ship last).
