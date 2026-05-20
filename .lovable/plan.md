## Goal
Two fixes for the dashboard:
1. Remove the dead vertical gap above the "Your Empire" portfolio grid so cards sit directly under the tabs row.
2. Treat installed furnishings as a depreciating asset in net worth.

## 1. Dead space above Your Empire

The gap comes from three stacked elements that all stay rendered even when empty:
- `Tabs` always reserves vertical space for the Market tab's helper text.
- The `min-h-[68px]` wrapper around the Action Required section reserves ~68px even when there are no alerts.
- The Listed Properties collapsible still takes a header row when empty.

Changes in `src/pages/Index.tsx`:
- Drop the always-rendered helper paragraph inside `TabsContent value="market"` (or render only when the player has no estate-agent action yet) so the tab content collapses to zero height after onboarding.
- Replace the `min-h-[68px]` wrapper with conditional rendering: only mount the Action Required section when there is at least one entry (pending eviction, deposit dispute, or arrears). Keep the original `CollapsibleSection` intact for when alerts exist.
- Only render the Listed Properties `CollapsibleSection` when `propertyListings.length > 0`.
- Tighten the container's `space-y-3` interaction with the now-removable wrappers so the Portfolio grid moves up immediately.

No styling changes to the portfolio cards themselves — this is purely about removing empty siblings above them.

## 2. Furniture counted in net worth (with depreciation)

Furniture is currently a sunk cost: `furnishProperty` debits cash, sets `furnishingTier` + `furnishingMonthsRemaining` (60-month life), but the value never appears as an asset and silently disappears.

Approach: treat furniture as a separate depreciating asset, linear straight-line over the 60-month life, derived from the current tier and remaining months. No new persisted fields needed.

Changes:
- `src/lib/engine/financials.ts` (new small helper): `getFurnitureValuePennies(property)` returns `costPerSqft(tier) * internalSqft * (monthsRemaining / 60) * 100`, using the same per-sqft costs as `furnishProperty` (`part_furnished = £8`, `fully_furnished = £18`). Returns 0 when unfurnished or months remaining is 0/undefined.
- `src/hooks/useGameState.ts`: add `furnitureValue = Σ getFurnitureValuePennies(property) → pounds` over `ownedPropertiesRaw` and include it in the `netWorth` calculation alongside `renovationWIP` and property value.
- `src/stores/gameStore.ts` (`triggerLevelUp` / level-up net worth recomputation around line 1287, and bankruptcy net-worth recomputation around line 1699 and 1704): include the same furniture asset so the store-side net worth tracks the UI value and level-ups/bankruptcy thresholds stay consistent.
- Verify the monthly depreciation step in `processMonthEnd` (around line 791–799) still ticks `furnishingMonthsRemaining` down — net worth naturally falls each month as a result.

### Notes
- No new state field is added; the depreciation curve is fully derived from `furnishingTier` + `furnishingMonthsRemaining` already on each property.
- Furniture value never exceeds the original install cost and reaches £0 the month it reverts to `unfurnished`.
- The cashflow breakdown and rent multipliers are untouched.

## Verification
- Empty dashboard (no alerts, no listings): Portfolio sits right under the tabs row, no visible gap.
- Furnish a property: net worth jumps by less than the cash cost (because new furniture is valued at its undepreciated cost minus the implicit first-month tick), then declines a fixed amount each month until it hits zero at month 60.
- Selling/conveyancing of an unfurnished property is unaffected.