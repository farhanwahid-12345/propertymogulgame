## Goals

Two interrelated polish items from the player feedback screenshot:

1. **Tenant satisfaction = 0 ⇒ guaranteed walkout, with optional deposit deduction.** Today the early-exit path only fires probabilistically when satisfaction < 25 (8% per month) and silently refunds the full deposit. Players expect a hard exit at 0 and the same right to withhold from the deposit they have at landlord-initiated eviction (especially when the property is damaged/dilapidated).
2. **Renovation dialog ROI is misleading near the area ceiling.** The "ROI (Annual, expected)" figure is computed only from rent uplift and ignores the capital value uplift entirely. It also doesn't reflect the ceiling-diminishing factor already shown in the warning banner, so a property at the area cap still advertises a healthy ROI.

---

## Plan

### 1. Walkout-on-zero + deposit deduction

In `src/stores/gameStore.ts` (~line 907, the early-exit filter):

- **Hard walkout at sat ≤ 0**: every tenant whose satisfaction has hit 0 leaves at month-end (100%, not 8%). Keep the existing probabilistic 8%-at-<25 path for the soft-exit case, but cap it at sat between 1 and 24 so the two paths don't overlap.
- **Deposit deduction on walkout**: mirror the eviction-completion logic (lines ~1035-1055):
  - Compute `heldAmount = tenantRec.depositHeld`.
  - If property `condition === 'dilapidated'` → withhold 50%; if `condition === 'poor'` → withhold 25%; else refund 100%.
  - Push the refund into the same `evictionDepositRefund` accumulator so the cash inflow ledger picks it up.
  - When anything is withheld, push a new entry into `depositDisputes` with `status: 'open'` so the player goes through the same TDS adjudication flow they already know from evictions.
- **TenantHistory entry**: keep existing departure log entry; add `detail` noting whether deposit was withheld and how much.
- **Toast wording**: "Tenant Walked Out — {name} left {property}. Deposit refunded: £X (£Y withheld pending TDS)" so the player immediately sees the financial outcome.

### 2. Renovation ROI reflects ceiling + capital uplift

In `src/components/ui/renovation-dialog.tsx` (~line 529-536):

- Compute a more honest expected ROI:
  - **Annual income return**: `rentUp × 12 × 0.85` (unchanged — keeps the 15% void/management haircut).
  - **One-shot capital return**: `cappedValueUp × 0.85` (matches the `valueTypical` figure already shown above and uses the *post-ceiling* uplift, not the raw `valueUp`).
  - **Combined annualised**: rent return alone is recurring; capital uplift is one-shot. Display two figures so the player can read intent:
    - "Income ROI/yr: X%" — `(rentUp × 12 × 0.85) / cost × 100`
    - "Capital uplift: Y%" — `(cappedValueUp × 0.85) / cost × 100`
    - "Payback period: ~N months" — `cost / max(1, rentUp × 0.85)`
- When `diminishingFactor < 0.95`, render the income/capital lines in amber and append a small "(reduced by ~Z% — area ceiling)" hint so it's visually consistent with the existing warning banner.
- When `diminishingFactor < 0.3` (very near cap), render in danger red — the renovation is unlikely to pay back through capital and the player should reconsider.

No engine logic changes — `applyCeilingDiminishingReturns` already returns the correct `cappedValueUp`; we just need to feed it into the displayed ROI string instead of ignoring it.

---

## Technical details

- **Files modified**:
  - `src/stores/gameStore.ts` — split the early-exit branch into hard (sat ≤ 0) and probabilistic (1–24) paths; reuse the eviction deposit-withholding block (extract into a small inline helper to avoid duplication); push to `depositDisputes` and `tenantHistory`; refundamount goes through `evictionDepositRefund`.
  - `src/components/ui/renovation-dialog.tsx` — replace the single "ROI (Annual, expected)" line (lines 529–536) with three lines (Income ROI/yr, Capital uplift %, Payback months) and conditional colour based on `diminishingFactor`.
- **No state/schema changes**, no `SAVE_VERSION` bump, no new persisted fields. `tenantHistory` and `depositDisputes` already exist (added in v10/v8).
- **No new dependencies, no backend/RPC changes.**

---

## Files to modify

- `src/stores/gameStore.ts`
- `src/components/ui/renovation-dialog.tsx`
- `mem://game-mechanics/property-management/tenant-satisfaction.md` — update note: sat=0 ⇒ guaranteed walkout, deposit withholding mirrors eviction.
- `mem://game-mechanics/property-management/deposit-handling.md` — add the satisfaction-walkout deduction path.
