## Seven targeted fixes

Grouped in build order. All scoped — no schema migrations.

---

### 1. Move "Portfolio Mortgage" into the main banking button row

`BankingPanel.tsx` currently renders `<PortfolioMortgage />` on its own line below the Pay/Manage/Credit row.

- Move `<PortfolioMortgage />` into the same `flex flex-wrap gap-2` row as `MortgageSettlement`, `MortgageManagement`, `CreditOverdraft`.
- Drop the separate `<div className="mt-4">` wrapper.
- Restyle its trigger button to match the others (same `variant="outline"` glass treatment, same height).
- Keep the "Need 3+ properties" disabled state.

---

### 2. Block conversions while a property has any tenant

Conversions structurally rebuild the property; today the dialog allows them on let units.

- In `gameStore.ts` `completeRenovation` (~line 2660), if `renovationType.category === 'conversion'`, check `prev.tenants.some(t => t.propertyId === propertyId)`. If so → `showToast("Conversion Blocked", "Vacate every unit (serve eviction notices) before converting.", "destructive")` and return.
- Mirror the same gate at the planning-application step (`submitPlanningApplication` for conversions) so the player isn't allowed to spend the LPA fee on an impossible job.
- In `renovation-dialog.tsx`, when the selected option is a conversion and the property has a tenant, disable the "Start renovation" button and show an inline warning ("Cannot convert while occupied — serve notice first"). Reuse the existing tenant lookup already passed to the dialog.

---

### 3. Mortgage acceptance silently failing on buy

`buyProperty` and `buyPropertyAtPrice` currently `return` with only a `console.warn` when the eligibility check fails after the user clicks Accept.

- In both store actions, replace the silent warn with `showToast("Mortgage rejected", eligibility.reason || "Lender declined this application.", "destructive")`.
- Add a pre-submit eligibility recheck inside `MortgageProviderSelector` so already-ineligible providers are visibly disabled (already partially done) — but additionally re-run `calculateMortgageEligibility` against the live cash/credit/DTI snapshot at click time and short-circuit with the same toast before calling the store, so the failure path is consistent.
- Add a `notify({title: "Mortgage approved", ...})` on success in both `buyProperty`/`buyPropertyAtPrice` so the user gets positive confirmation too.

---

### 4. Chime + sub-menu when planning is approved

`gameStore.ts` already toasts "Planning Approved" at line 1074, but it's a passive ping with no follow-through.

- Replace the bare `showToast` with the unified `notify({title, description, severity: 'success', category: 'planning'})` so it lands in the notification centre AND plays the success chime.
- Add a `pendingPlanningCelebrations: string[]` slice (just approval IDs) populated alongside the resolution.
- New component `src/components/ui/planning-approved-dialog.tsx`: subscribes to `pendingPlanningCelebrations`, opens automatically when non-empty, lists each newly-approved application with the property name, renovation name, and a primary "Start renovation now" button that opens `renovation-dialog` for that property and pre-selects the approved type. A "Later" button just clears the entry.
- Mount the dialog once in `Index.tsx` so it triggers from anywhere.

---

### 5. One conversion type per property

Today a player can stack `convert_hmo` then `convert_flats` on the same building.

- In `renovation-dialog.tsx` (~line 379 — already filters conversions where subtype != standard), broaden the rule: if `property.completedRenovationIds` contains ANY id from the conversion category, hide every other conversion option and show "Already converted to {subtype}".
- In `gameStore.completeRenovation`, add a server-side guard: refuse a conversion when the property already has a completed conversion renovation. Toast: "Already Converted", "This property has already been converted to {existing subtype}."
- Same guard inside `submitPlanningApplication` so the player can't even apply.

---

### 6. Loan limits respect mortgages, existing loans, and credit rating

`applyForLoan` currently caps by `monthlyNetRent * 6/48 × creditFactor` — mortgages reduce net rent, but existing loan repayments and credit-tier hard caps are not applied.

- Subtract existing loan monthly payments from `monthlyNetRent` before computing `dynamicCap`:
  ```
  const existingLoanPayments = (prev.loans || []).reduce((s, l) => s + l.monthlyPayment, 0);
  const monthlyNetRent = Math.max(0, monthlyRent - monthlyMortgage - existingLoanPayments);
  ```
- Add a credit-tier hard cap multiplier on top of `creditFactor`:
  - <500: 0.4× hardCap
  - 500–649: 0.7× hardCap
  - 650–749: 1.0× hardCap
  - ≥750: 1.25× hardCap
- Add a portfolio-DTI gate: combined `(monthlyMortgage + existingLoanPayments + newLoanPayment) / monthlyRent ≤ 0.75` for personal, ≤ 0.85 for business. Reject with `showToast("Loan Rejected", "Combined debt-to-income exceeds X%. Reduce existing debt first.", "destructive")` before debiting.
- Surface the same calculation in `loans-panel.tsx` so the slider's max binds to the live cap (no more "approved then surprise rejection").

---

### 7. Per-slot eviction, locks, and re-let scope

Today `PropertyLock` is property-wide, so evicting one flat (`relet_lock` after a `landlord_move_in`) blocks letting the OTHER flat too.

- Add optional `slotIndex?: number` to `PropertyLock` in `src/types/game.ts`. Migration: existing locks default to all-slots (undefined = property-wide, preserves current behaviour for legacy single-unit data).
- In `gameStore.ts`:
  - When pushing `relet_lock` (line 1055) and `appeal_cooldown` after eviction completion, set `slotIndex: ev.slotIndex`.
  - In the `releLock` lookup (line 2207) and `appealCd` lookup (line 2374), filter by both propertyId AND `(l.slotIndex === undefined || l.slotIndex === slotIndex)`.
  - Audit other lock consumers for the same scoping.
- In the let-flow guard at line 2233, only block the slot being filled, not the whole property.
- No UI changes required — repair bar / concerns chip already render per-property.

---

### Files touched

- `src/components/sections/BankingPanel.tsx` — #1
- `src/components/ui/portfolio-mortgage.tsx` — #1 button styling parity
- `src/stores/gameStore.ts` — #2, #3, #4, #5, #6, #7
- `src/components/ui/renovation-dialog.tsx` — #2, #5
- `src/components/ui/mortgage-provider-selector.tsx` — #3 pre-submit recheck
- `src/components/sections/PropertyMarket.tsx` — #3 plumbing if needed
- `src/components/ui/planning-approved-dialog.tsx` — new file (#4)
- `src/pages/Index.tsx` — mount new dialog (#4)
- `src/components/ui/loans-panel.tsx` — #6 live cap binding
- `src/types/game.ts` — `PropertyLock.slotIndex?` (#7)
- `src/lib/notifications.ts` / `src/hooks/use-toast.ts` — already in place from prior pass; reuse `notify`/`pushNotification` for #3 success and #4 chime.

### Notes

- No store-shape migration: `slotIndex?` is additive; existing persisted locks remain valid (treated as property-wide).
- All money math stays in pennies in the store, pounds at the UI boundary.
- The planning-approved dialog deliberately avoids auto-starting work — the player must confirm so they don't burn cash unintentionally.
