## Two small but important realism fixes

### 1. Deposit comes from the **tenant**, not the landlord

**Problem:** When you select a tenant, the game currently debits the 5-week deposit from your cash (and shows the "Deposit Required" toast if you can't afford it). In reality, the **tenant** pays the deposit; the landlord just holds it in a TDS-protected scheme. The landlord only ever puts hand in pocket if they wrongly withhold and lose a dispute.

**Fix in `src/stores/gameStore.ts` → `selectTenant` action (around lines 1810–1870):**
- Remove the `debit(prev, depositDelta)` call and the "Deposit Required" blocking toast.
- Still record `depositHeld: requiredDeposit` on the `PropertyTenant` record (it's a held trust amount, not landlord cash).
- Drop the `depositMsg` overdraft suffix from the "Tenant Moved In!" toast — just say "5-week deposit (£X) protected via TDS."
- Remove the `refund` cash-credit branch when a previous tenant's deposit was higher (that money was the previous tenant's, not yours — it just transfers between TDS records).

**Eviction-completion logic (already correct, ~line 905+):** Keep the existing behaviour where:
- A normal end-of-tenancy returns the deposit to the tenant (no impact on landlord cash).
- A "dilapidated" property withholds 50% — which generates a `DepositDispute` the tenant can fight. Landlord only loses cash if they **lose** the dispute (already handled).

**Migration:** No save-version bump needed — `depositHeld` field already exists. Existing players keep their recorded deposits; we just stop double-charging them going forward.

### 2. Reasonable grace-period timer on Tenant Concerns

**Problem:** Concerns start decaying tenant satisfaction the very next month after they're raised. The screenshot shows no visible "deadline" — players feel ambushed.

**Fix in `src/stores/gameStore.ts` (concerns decay block ~lines 879–889):**
- Add a **2-month grace period** before decay kicks in: only apply `satisfactionPenaltyIfIgnored` if `(newMonthNumber - c.raisedMonth) > 2`.
- Safety/noise concerns keep their existing 1-month grace (already handled separately at line 1892) — those are urgent.
- Damage-sourced concerns get a 1-month grace (more urgent than lifestyle ones).

**Fix in `src/components/ui/tenant-concerns-feed.tsx` (around lines 87–91):**
- Replace the existing "{monthsOpen}mo open · -X/mo" badge with a **deadline countdown**:
  - If still in grace: green badge → `Resolve in {graceRemaining}mo`
  - If decaying: red badge → `Decaying · -{penalty}/mo`
- Compute `graceRemaining` from category: `safety/noise → 1`, `damage → 1`, others → `2`.

### Files to modify
- `src/stores/gameStore.ts` — remove deposit debit/refund in `selectTenant`; add grace-period gate in monthly concern decay loop.
- `src/components/ui/tenant-concerns-feed.tsx` — show deadline/grace badge instead of bare elapsed time.

### Memory updates
- Update `mem://game-mechanics/property-management/tenant-management` (or create a new `deposit-handling` memory): "Deposits are paid by tenants, held in TDS — landlord cash is never debited at tenancy start. Landlord only loses cash if they lose a deposit dispute."
- Update `mem://game-mechanics/property-management/tenant-concerns`: "Concerns now have a grace period before satisfaction decay starts — 2 months for general, 1 month for safety/noise/damage."

### Out of scope
No changes to eviction flow, dispute mechanics, or appreciation. No save migration required.