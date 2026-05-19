## Two improvements: tax warnings & tenant-arrears recovery

### 1. Tax warning — one month before collection

**Problem:** Tax is silently debited every April. Players hit overdraft or arrears without warning.

**Approach:** In `gameStore.ts` month-end (`processMonthEnd`), detect "one month before April" (`newMonthNumber % 12 === 2`) and `currentTaxYear > lastTaxYear`. Compute the *projected* tax bill from current accumulators using the same `calculateIncomeTax` / `calculateCorporationTax` helpers in `src/lib/engine/taxation.ts` (no new logic, just call them on the running yearly totals).

Surface the warning in three places:
- **Toast** ("Tax due next month") with the projected £ amount and current available funds (cash + overdraft headroom).
- **Notification Centre upcoming-row** — already wired via `buildUpcomingRows` in `src/lib/upcomingEvents.ts`, but extend the row when `monthsAway <= 1` to include the projected amount and a colour-coded "Shortfall £X" badge if cash + overdraft headroom < bill.
- **HeroHeader chip** — small amber `Tax due 1mo: £X` pill next to the existing net-cashflow chip, only when within the warning window.

If the player can't cover it (`cash + overdraftHeadroom < projected`), the toast CTA links to the Bank tab (mortgages / loans / overdraft increase) so they can pre-emptively raise funds. Reuse `showToast` from `storeHelpers.ts`.

Store changes (minimal):
- Add `projectedTaxPennies?: number` and `projectedTaxStampedMonth?: number` to root state so the warning persists across reloads within the warning month and isn't recomputed every tick.

### 2. Tenant arrears → court / debt-recovery option

**Problem:** Arrears just sit. Player can serve Section 8 eviction but can't pursue the debt for cost recovery. And if a tenant resumes paying after a missed month, current logic immediately clears arrears (line 1331 of `gameStore.ts`) — that's wrong; arrears should only clear when the back-rent is also paid.

**Two parts:**

**2a. Fix arrears-clearing bug**
- In `processMonthEnd` arrears bookkeeping (~line 1316), do **not** clear `arrearsMonths` / `arrearsPennies` just because the tenant paid this month's rent.
- Add a new field `arrearsPaidThisMonthPennies` (transient, computed) — the tenant pays *current rent + a slice of back-rent* equal to up to 50% of monthly rent until cleared. Only zero out arrears when `arrearsPennies <= 0`.
- Add an amber "Arrears: £X owed (paying back)" pill state on `property-card.tsx` distinct from the existing red "In arrears" pill.

**2b. Send to debt-recovery (court)**
- New action `sendArrearsToCourt(tenantKey)` on the store. Only available when `arrearsMonths >= 2`.
- Upfront court filing fee: £325 (`debit` via `storeHelpers`).
- Creates a `DebtRecoveryCase` record (new type in `types/game.ts`):
  ```
  { id, tenantName, propertyId, originalArrearsPennies, filedMonth,
    status: 'in_court' | 'recovered' | 'unrecoverable',
    recoveryFeePct: 0.25 }
  ```
- Engine resolves 6–12 months later with weighted outcomes:
  - 55% **recovered**: pay player `originalArrears × (1 − 0.25)` (25% agency fee).
  - 30% **partial**: 30–70% recovered, same 25% fee on what's collected.
  - 15% **unrecoverable**: tenant judgment-proof, fee lost.
- Reputation +1 / credit score +5 on full recovery (small bump).
- New UI panel slot inside Operations Center: "Debt Recovery" list with status badges and expected resolution month. Reuse existing `glass`/badge primitives.

**2c. UX wiring**
- On `property-card.tsx` arrears pill: when `arrearsMonths >= 2`, add a small "Send to court" link that opens a confirmation `Dialog` showing fee, expected recovery range, and timeline.
- Operations Center gets a new collapsible section "Debt recovery (N active)".
- When recovered, fire a toast and push an entry into the activity feed (`ui/activity-feed.tsx` already has `category` enum — add `'debt_recovery'`).

### Files to touch
- `src/stores/gameStore.ts` — projected-tax preview, arrears clearing fix, `sendArrearsToCourt` action, court resolution in month-end.
- `src/lib/engine/taxation.ts` — export a `projectAnnualTax(state)` helper.
- `src/lib/upcomingEvents.ts` — include projected tax in upcoming rows when ≤1 month away.
- `src/types/game.ts` — `DebtRecoveryCase` type, `debtRecoveryCases: []` slice; add `arrearsRepaymentPennies?` field if needed.
- `src/components/sections/HeroHeader.tsx` — tax-warning chip.
- `src/components/ui/property-card.tsx` — amber "paying back" arrears pill + "Send to court" link.
- `src/components/ui/operations-center.tsx` — new debt-recovery section.
- `src/components/ui/activity-feed.tsx` — new category.
- `src/components/ui/notification-centre.tsx` — projected-tax row styling.
- New: `src/components/ui/debt-recovery-dialog.tsx`.

### Out of scope
- No backend changes. No new dependencies. Existing semantic tokens only (no raw hex).
- Existing eviction / Section 8 flow untouched — debt recovery is a separate financial track and can run in parallel with an eviction.
