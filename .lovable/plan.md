# Plan: Realistic appreciation + appeal/dispute flow

Two surgical changes. Most code lives in `src/stores/gameStore.ts`, plus a small new dialog and a state addition for appeals.

---

## 1. Temper property value increases

**Where:** monthly drift block (`src/stores/gameStore.ts` ~lines 947-959) and macro events (~lines 1041-1065).

### Current behaviour
- Monthly drift formula: `0.0045 + (rand-0.5) * 0.004` → mean ~0.45%/mo (~5.5%/yr) but range can swing **+0.65%/mo (~8%/yr)** with only a 1.5% chance of a tiny dip.
- Tech boom: instant **+15% value & rent**.
- Recession: only −10% value (no rent hit).
- These compound; combined with renovation uplifts, portfolio value runs hot.

### New behaviour
- **Halve the central drift** to ~3%/yr nominal and widen the dip side so the long-run trend is realistic UK residential growth (~3–4%/yr).
  ```ts
  const monthlyDrift = 0.0025 + (Math.random() - 0.5) * 0.003; // ~0.10%–0.40%/mo
  const isDip = Math.random() < 0.04; // 4% per month — small corrections more frequent
  const change = isDip ? -(0.004 + Math.random() * 0.012) : monthlyDrift; // dips up to ~1.6%/mo
  ```
- **Cap value vs. purchase price**: add a soft ceiling so a single property's `value` cannot exceed `2.5 ×` the original `price` (purchase basis). When the cap binds, drift only applies to `marketValue` (so paper market signal still moves) but not booked `value`. Prevents runaway compounding on long-held assets.
- **Macro events:**
  - Tech boom: reduce to **+8% value, +5% rent** (was +15/+15).
  - Recession: keep −10% value, **also clip rent by −3%** (more symmetric).
  - Add a third moderate event already there (`rate_cut`) — no change.
- **Renovations** unchanged (they're one-shot and gated; uplifts already scale by sqft).

### Memory update
Update `mem://game-mechanics/property-management/annual-appreciation` to reflect ~3–4%/yr nominal trend, more frequent small dips, and 2.5× purchase-price soft cap.

---

## 2. Appeal / dispute flow for evictions and deposits

Two scenarios where the player wants recourse:

### A. Appeal a served eviction notice
Today the only options are wait or `cancelEviction`. A landlord-driven cancel is fine, but tenants can also realistically challenge — and players want a strategic "fight it" lever for misjudged grounds.

**Mechanic:**
- New action `appealEviction(propertyId)` available on any `PendingEviction` whose ground is `landlord_sale` or `landlord_move_in` (the two most-abusable grounds), or `rent_arrears` if the tenant has paid down to <2 missed months while the notice runs.
- Triggers a **tribunal roll** (cost: £400 court fee, debited via existing `debit` helper so overdraft can cover):
  - 60% upheld → eviction proceeds as scheduled.
  - 40% overturned → eviction removed from `pendingEvictions`; tenant satisfaction restored to `min(100, current + 15)`; if ground was `landlord_sale`/`landlord_move_in`, add a 6-month re-attempt cooldown via a new `propertyLocks` reason `appeal_cooldown`.
- Toast outcome with explicit ruling text.

### B. Dispute a deposit deduction
Today, if a property is `dilapidated` at notice-end, 50% of `depositHeld` is auto-withheld. Players have no recourse.

**Mechanic:**
- After an eviction completes with a withheld deposit, push a record onto a new state slice `depositDisputes: DepositDispute[]`:
  ```ts
  interface DepositDispute {
    id: string;
    propertyId: string;
    propertyName: string;
    tenantName: string;
    withheldAmount: number;   // pennies
    refundedAmount: number;   // pennies
    raisedMonth: number;
    status: 'open' | 'won' | 'lost' | 'settled';
  }
  ```
- New actions:
  - `disputeDeposit(disputeId)` — TDS adjudication roll. Cost: £0 (TDS is free for landlords). Outcome:
    - 35% landlord wins fully → status `won`, no further refund.
    - 50% partial settle → status `settled`, refund **half** the withheld amount via `debit` (it's an outflow now).
    - 15% tenant wins → status `lost`, refund **all** of the withheld amount.
  - `dismissDispute(disputeId)` — drops the record without action.
- Disputes auto-expire 6 months after `raisedMonth`.

### UI: new `EvictionAppealDialog` + dispute card surface
- **`src/components/ui/eviction-appeal-dialog.tsx`** (new): confirmation modal for `appealEviction`. Shows ground, tribunal cost, and the published 60/40 odds.
- **`src/components/ui/eviction-timeline-feed.tsx`**: add an "Appeal Notice" button on each row when eligible (uses the new dialog).
- **`src/components/ui/deposit-disputes-feed.tsx`** (new): mirrors the eviction feed style — lists open disputes with withheld amount, "Raise TDS Dispute" button (calls `disputeDeposit`), "Accept Refund" (calls `dismissDispute`). Closed disputes hide after 1 month.
- **`src/pages/Index.tsx`**: render the new feed below the eviction timeline feed; pass `depositDisputes` from `useGameState`.

### State plumbing
- `src/types/game.ts`: add `DepositDispute` interface; add `depositDisputes: DepositDispute[]` to `GameState`; add `'appeal_cooldown'` to `PropertyLock['reason']` union.
- `src/stores/gameStore.ts`:
  - Initialize `depositDisputes: []`.
  - In the eviction-completion block (~line 904), when `refund < depositHeld`, push a new `DepositDispute` entry (status `'open'`).
  - Add the three new actions (`appealEviction`, `disputeDeposit`, `dismissDispute`) and export them in the bottom export block (~line 2393).
  - Auto-expire disputes in `processMonthEnd` (drop entries older than 6 months unless still `open`).
- `src/hooks/useGameState.ts`: surface `depositDisputes` and the new actions; convert pennies → pounds for display fields where consumed.
- Bump `SAVE_VERSION` to 8 with a migration that initializes `depositDisputes: []`.

### Memory updates
- New: `mem://game-mechanics/property-management/eviction-appeals` — 60/40 odds, £400 cost, 6-month re-attempt cooldown.
- New: `mem://game-mechanics/property-management/deposit-disputes` — TDS roll outcomes (35/50/15), 6-month expiry.

---

## Files touched

| File | Change |
|------|--------|
| `src/stores/gameStore.ts` | Tame drift + macro magnitudes + soft cap; add `depositDisputes` slice; add `appealEviction` / `disputeDeposit` / `dismissDispute`; bump SAVE_VERSION to 8 + migration; push dispute on partial refund. |
| `src/types/game.ts` | `DepositDispute` interface; `depositDisputes` on `GameState`; extend `PropertyLock['reason']`. |
| `src/hooks/useGameState.ts` | Expose new state + actions. |
| `src/components/ui/eviction-appeal-dialog.tsx` | **New** — confirm appeal cost/odds. |
| `src/components/ui/eviction-timeline-feed.tsx` | Add "Appeal" button per eligible row. |
| `src/components/ui/deposit-disputes-feed.tsx` | **New** — list/raise/dismiss disputes. |
| `src/pages/Index.tsx` | Render disputes feed; wire props. |
| Memory | Update `annual-appreciation`; add `eviction-appeals`, `deposit-disputes`. |

No engine refactors required — all changes plug into existing `processMonthEnd`, `debit`/`credit`, and the existing eviction queue.
