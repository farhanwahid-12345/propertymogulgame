## Overview

Eight related fixes across dashboard layout, notifications, banking flows, and property UI. Grouped below in build order.

---

### 1. Move "Upcoming Events" out of the central UI

**Goal:** the Upcoming Events card no longer occupies a slot in the main column — its rows feed the notification centre instead.

- In `src/pages/Index.tsx`, remove the `<UpcomingEvents />` render from the main grid.
- In `src/components/ui/notification-centre.tsx`, add an "Upcoming" group at the top:
  - Reuse the row-building logic from `UpcomingEvents.tsx` (extract into `src/lib/upcomingEvents.ts` as `buildUpcomingRows({ monthsPlayed, entityType, pendingEvictions, planningApplications, lastCorporationTaxMonth })`).
  - Render each row as a `notification-centre` item with the same icon + months-away badge.
- Delete `UpcomingEvents.tsx` once unreferenced (keep the helper only).

### 2. Notification ↔ feed parity

**Bug:** ping fires but notification centre is empty, or centre has rows but no ping fired.

- Audit `pushNotification` callers in `gameStore.ts` and `use-toast.ts`. Every `showToast` that should be persistent must also push into `notifications` (and vice versa).
- Add a single helper `notify({title, description, severity, category})` in `src/lib/notify.ts` that:
  - Pushes into the store's `notifications` array (cap 50, newest first).
  - Triggers the toast via `useToast`.
  - Plays the ping sound when `severity !== 'silent'`.
- Replace bare `showToast(...)` calls that represent real events (sale completed, chain collapse, loan approved, eviction served, planning decision, tax due, etc.) with `notify(...)`.
- Add a dev-mode console warning when a notification is added with no matching toast or vice versa.

### 3. Seller pull-out ping

- In `gameStore.ts` chain-collapse path (~line where `chain risk` resolves), call `notify({title: 'Sale fell through', description: '${propName}: buyer pulled out.', severity: 'warning', category: 'sales'})`.
- Same on the buying side when the seller collapses (the player is buyer).

### 4. Fixed-term selector when buying

**Currently** `MortgageProviderSelector` only shows fixed-term options inside `MortgageRefinance`.

- Add the same `<Select>` for "Initial Fixed Term" (2yr / 5yr / SVR) into `mortgage-provider-selector.tsx`.
- Plumb `initialFixedTermYears` through `buyProperty` → `useGameState.buyProperty` → `gameStore.buyProperty` → stored on the new `Mortgage` record (already supported by the type).
- Default = SVR (no fix), matching today's behaviour.

### 5. Operations panel — make it hide away

- In `operations-center.tsx`, swap the always-on glass card for a header-only collapsed state:
  - When `totalActionable === 0`, render only the 36px summary chip; do not reserve grid space for the body.
  - When actionable, default to collapsed and show "X active — tap to view".
- Keep the existing `CollapsibleSection` wrapper from `Index.tsx`; remove the inner duplicate `Card` chrome that adds vertical bulk.
- Persist open/closed in `localStorage` (already done by `CollapsibleSection`).

### 6. Loans panel fixes

- **"No active loans" bug:** `BankingPanel` summary uses `(gameState as any).loans` but `useGameState` does not surface `loans`. Add `loans: store.loans` to the returned object in `useGameState.ts`. Update the summary + `defaultOpenDesktop` to use the typed value.
- **Cash flow ignores loans:** in `useGameState.ts`:
  - Add `loanExpenses = loans.reduce((s, l) => s + fromPennies(l.monthlyPayment), 0)`.
  - Include in `totalMonthlyExpenses`.
  - Add `loans: loanExpenses` to `expenseBreakdown`.
- In `game-stats.tsx` cash-flow popover, render a "Loan Payments" row when `expenseBreakdown.loans > 0`.

### 7. Renovation ROI accuracy

- In `src/lib/engine/renovation.ts`, audit `expectedROI` / `valueUplift` formulas against what `gameStore.completeRenovation` actually applies (cost debited vs. value added).
- Replace the headline number shown in `renovation-dialog.tsx` with the same formula the store uses, expressed as `(uplift - cost) / cost`. Show a range if the roll is probabilistic.
- Add a unit-style sanity check in `renovation.ts`: assert that the median rolled outcome matches the displayed estimate within ±2pp.

### 8. Portfolio mortgage — secure button silently fails + ensure payoff/cash-out

- In `gameStore.handlePortfolioMortgage`, replace the silent `console.warn` on ineligibility with `showToast("Portfolio mortgage rejected", reason, "destructive")` so the user sees why.
- Verify the existing logic that filters out `selectedPropertyIds` from `prev.mortgages` (already pays off old mortgages by removing them and using `cashDelta = loanAmount - totalCurrentMortgages`). Surface this in the UI:
  - In `portfolio-mortgage.tsx`, add a "Settles £X of existing mortgages" line above the cash-out figure.
  - Cap the slider's lower bound at `totalCurrentMortgages` (already correct) and clamp upper bound to `min(maxLoanAmount, totalPortfolioValue)`.
- After success, fire `notify({title: 'Portfolio mortgage secured', ...})`.

### 9. Tenant Concerns → folded into Property Condition bar

- Delete the standalone `tenant-concerns-feed.tsx` from the dashboard render in `Index.tsx`.
- In `property-card.tsx`, attach concerns to the existing `RepairBar` row:
  - Show concern count as a small chip beside the bar (`⚠ 2 concerns`).
  - Clicking the chip opens a popover listing the property's open concerns with their existing action buttons (resolve, ignore, dispute) — reuse the row component logic from the deleted feed.
- Keep all engine logic (concern generation, decay, auto-resolve on top-up) untouched.
- Drop `TenantConcernsFeed` import from `Index.tsx`; archive the file.

---

### Technical notes

- Notification refactor (#2) is the only structural change — everything else is local.
- No store-shape migration. `loans` is already persisted; only the hook exposure is missing.
- `CollapsibleSection` already supports `defaultOpenDesktop` + localStorage; reuse it.
- All money math stays in pennies in the store, pounds at the UI boundary.

### Files touched

- `src/pages/Index.tsx` — drop `UpcomingEvents`, drop `TenantConcernsFeed`, restyle Operations slot.
- `src/components/sections/UpcomingEvents.tsx` — delete after extraction.
- `src/lib/upcomingEvents.ts` — new helper.
- `src/lib/notify.ts` — new unified notify helper.
- `src/components/ui/notification-centre.tsx` — render upcoming rows; consume notify.
- `src/stores/gameStore.ts` — chain-collapse notify, portfolio-mortgage toast on ineligible.
- `src/hooks/useGameState.ts` — expose `loans`; add `loanExpenses` to expenses + breakdown.
- `src/components/sections/BankingPanel.tsx` — typed loans summary.
- `src/components/ui/loans-panel.tsx` — minor (uses store directly already).
- `src/components/ui/game-stats.tsx` — loan row in cash-flow popover.
- `src/components/ui/mortgage-provider-selector.tsx` — fixed-term select for buy flow.
- `src/components/ui/operations-center.tsx` — slimmer collapsed chrome.
- `src/components/ui/portfolio-mortgage.tsx` — show payoff line; success notify.
- `src/components/ui/property-card.tsx` — concerns chip + popover beside RepairBar.
- `src/components/ui/tenant-concerns-feed.tsx` — extract row component, then archive.
- `src/lib/engine/renovation.ts` + `src/components/ui/renovation-dialog.tsx` — ROI accuracy.
