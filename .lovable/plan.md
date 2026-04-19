
# Plan: Conveyancing Tracker, Lower Start Cash, Renovations & Mortgage UX

Five focused changes pulled from the screenshot annotations.

---

## 1. Conveyancing Tracker (new panel)
**New file:** `src/components/ui/conveyancing-tracker.tsx`
**Edit:** `src/pages/Index.tsx` (mount near portfolio summary)

- Reads `gameState.conveyancing` directly. Shows one row per in-flight buy/sell:
  - Property name + 🟢 Buying / 🔴 Selling badge
  - Progress bar: `(currentMonth − startMonth) / (completionMonth − startMonth)`
  - "Completes in N months"
  - Cash held in escrow (for buys)
  - 10%/mo chain-collapse risk warning chip
- Collapsible glass card; only renders when `conveyancing.length > 0`.

---

## 2. Change starting cash to £100k
**File:** `src/lib/engine/constants.ts`

```ts
export const INITIAL_CASH = toPennies(100_000); // was 250_000
```

Also update `mem://progression/starting-state` from £250k → £100k.

No other code changes needed — `INITIAL_CASH` is the single source of truth (gameStore reads it, Reset uses it).

---

## 3. Mortgage rejection appears inside Estate Agent sub-menu
**File:** `src/components/ui/estate-agent-window.tsx` (the "Browse Properties" tab — the sub-menu shown in screenshot row 3)

**Problem:** When a player clicks Buy with mortgage in the estate-agent listing card, rejection currently fires a toast and the listing collapses, forcing them to re-click the property to retry. The screenshot shows the red "Mortgage Rejected" banner appearing on the property tile but the user has to back out completely.

**Fix:** Mirror what `property-card.tsx` already does — run `calculateMortgageEligibility` reactively inside the estate-agent property tile whenever provider/LTV/term changes:
- Show inline red banner with `eligibility.reason` directly inside the expanded mortgage panel
- Disable the "Confirm Purchase" button when `!eligibility.eligible`
- Keep the panel open (do NOT collapse on rejection) so user can lower LTV / change provider / change term inline
- Suppress the rejection toast on this surface (still keep it for auction house where there's no inline panel)

---

## 4. Renovation upgrades + tracker
**Files:** `src/components/ui/property-card.tsx`, `src/components/ui/renovation-dialog.tsx` (already exists, currently orphaned), `src/pages/Index.tsx`, optionally extend `gameStore.startRenovation`

### 4a. Wire the existing RenovationDialog into owned property cards
- In `property-card.tsx`, owned-property action area: add `<RenovationDialog>` button alongside existing actions.
- Pass `playerCash`, `propertyValue`, `currentRent`, `onRenovate` (calls `useGameState.startRenovation`).
- Hide it while `isInConveyancing` or while a renovation is already active for that property.

### 4b. Show value/rent uplift preview (already in dialog)
- Already shows "+£X rent / +£Y value / Duration: Nd". No change needed beyond surfacing it.

### 4c. Renovation Tracker
**New file:** `src/components/ui/renovation-tracker.tsx`
**Edit:** `src/pages/Index.tsx`

- Reads `gameState.renovations`. One row per active renovation:
  - Property name + renovation type icon
  - Progress bar based on `startDate` vs `completionDate` (in game-months)
  - "Completes in N months" + cash already spent
- Glass card, only renders when there are active renovations.

### 4d. Condition-tier upgrade button (separate from the cosmetic renovations)
- The existing `upgradeCondition` store action (Dilapidated → Standard → Premium) needs a UI entry point. Add a small "Upgrade Condition" button inside the Renovation dialog header showing cost = `value × 0.05` for next tier and the resulting rent multiplier (1.0× → 1.25×).

---

## 5. Apply 125% portfolio stress test in refinance once 3+ owned
**File:** `src/components/ui/mortgage-refinance.tsx`

Already partially wired (lines 76–93 call `calculateMortgageEligibility` with `ownedPropertyCount`, `totalRentalIncome`, `existingMonthlyMortgagePayments`). The screenshot ("Stress Test (ICR): 76% ✗ Fail (need 125%)") confirms the math is running but the **denominator is wrong** — it's still showing per-property rent vs payment instead of portfolio totals.

**Fix:** In the `Card` summary block (lines 250–285), the displayed ICR ratio comes from `eligibility.icrRatio`, but `calculateMortgageEligibility` already returns the portfolio-wide ICR when `ownedPropertyCount >= 3`. Verify the props flowing in from the parent (`Index.tsx` → `MortgageRefinance`):
- `totalRentalIncome` — must equal `Σ ownedProperty.monthlyIncome` for tenanted properties (pounds)
- `existingMonthlyMortgagePayments` — must equal `Σ mortgage.monthlyPayment` (pounds)
- `ownedProperties.length` is correct

**Edit `src/pages/Index.tsx`** where `<MortgageRefinance>` is rendered: ensure both totals are passed (currently may be 0/undefined, which causes the per-property fallback). Also relabel the displayed line to "Portfolio Stress Test (125%)" vs "Property Stress Test (100%)" based on count (already done via `stressLabel`).

---

## Files Modified

| File | Change |
|---|---|
| `src/lib/engine/constants.ts` | `INITIAL_CASH = 100_000` |
| `src/components/ui/conveyancing-tracker.tsx` *(new)* | Tracker panel |
| `src/components/ui/renovation-tracker.tsx` *(new)* | Active renovations panel |
| `src/components/ui/estate-agent-window.tsx` | Inline mortgage rejection in browse sub-menu |
| `src/components/ui/property-card.tsx` | Mount `RenovationDialog` for owned properties |
| `src/components/ui/renovation-dialog.tsx` | Add condition-tier upgrade entry point |
| `src/pages/Index.tsx` | Mount both trackers; pass totals to refinance |
| `mem://progression/starting-state` | £250k → £100k |

