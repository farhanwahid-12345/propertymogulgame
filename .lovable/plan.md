# Plan: Renovation gating, grant removal, renters' rights & auto-overdraft

Four targeted changes across the renovation system, macro events, tenant lifecycle, and cash-spending plumbing.

---

## 1. Vacancy-gated large-scale renovations

**Problem:** Major works (extensions, conversions, central heating, full redecoration) realistically can't happen with a tenant in residence — but the dialog allows them anytime.

### Changes

**`src/components/ui/renovation-dialog.tsx`:**
- Add a new optional flag on `RenovationType`: `requiresVacant?: boolean`.
- Mark these as `requiresVacant: true`:
  - `full_redecoration`
  - `central_heating`
  - `loft_conversion`, `rear_extension`, `conservatory`
  - All four `convert_*` options (HMO 4, HMO 6, flats, commercial→residential)
- Leave these tenant-friendly (no flag): `basic_repair`, `kitchen_upgrade`, `bathroom_renovation`, `double_glazing`.
- Add a new optional prop `hasTenant?: boolean` to `RenovationDialogProps`.
- Extend `ineligibilityReason` to return `"Property must be vacant"` when `r.requiresVacant && hasTenant`.
- The existing `blocked` flag already grays out + blocks selection — no extra UI work.

**`src/components/ui/property-card.tsx`:**
- Where `<RenovationDialog>` is rendered, pass `hasTenant={!!tenant}` (the card already has the tenant record in scope).

**`src/pages/Index.tsx`:**
- No change — props flow through `property-card`.

---

## 2. Remove the Government Landlord Grant

**Problem:** Cash injections from the government are unrealistic.

### Changes

**`src/stores/gameStore.ts`** (`processMonthEnd`, around line 925-957):
- Remove the `grant` entry from the `eventTypes` array.
- Remove the `else if (chosen.type === 'grant') { ... }` block (line 952-954).
- Remove the `eventCashBonus > 0` portion of the toast (line 956) — simplify to just `chosen.description`.
- Drop the `eventCashBonus` accumulator and `cash: finalCash + eventCashBonus` → `cash: finalCash` (line 969).

**`src/types/game.ts`:**
- Remove `'grant'` from the `MacroEconomicEvent['type']` union (line 188).

No migration needed — historic `'grant'` entries in `economicEvents` will still render their stored name/description harmlessly; the type narrowing only affects future events.

---

## 3. Renters' Rights compliance for tenant changes

**Problem:** The current `removeTenant` lets the landlord evict instantly, with no notice, no grounds, no deposit. Doesn't reflect the Renters' Rights Bill (Section 21 abolished, periodic tenancies, mandatory deposits, etc.).

### New mechanics

**Deposit handling (Tenancy Deposit Scheme):**
- On `selectTenant`, take a deposit equal to **5 weeks' rent** (UK Tenant Fees Act cap) from the player's cash and hold it on the tenancy record (`depositHeld: number` in pennies).
- On `removeTenant` (landlord-initiated), refund the deposit in full to the tenant — player loses it.
- On natural tenant departure (low satisfaction early-exit, end of tenancy), refund the deposit fully unless the property is in `dilapidated` condition (treat as damage withholding — keep 50%).

**Eviction grounds & notice (Renters' Rights Bill):**
- Replace the no-questions `removeTenant` with `evictTenant(propertyId, ground)` accepting one of four grounds:
  - `rent_arrears` → 4-week notice. Only valid if tenant has missed ≥2 months rent (track via `tenantEvents` with `type: 'default'`).
  - `landlord_sale` → 4-month notice. Always valid, but the property is locked from sale for 12 months afterwards if eviction completes without a sale (anti-abuse rule from the Bill).
  - `landlord_move_in` → 4-month notice. Always valid, but locks the property from re-letting for 12 months.
  - `antisocial_behaviour` → 2-week notice. Only valid for `risky` profile tenants with an active `noise` or `safety` concern unresolved >1 month.
- Notice period implemented as: tenant stays for N months after `evictTenant` is called; after the period expires the void begins. Track via a new `pendingEvictions: PendingEviction[]` field on state.
- Player cannot raise rent on a tenant under eviction notice.

**Periodic tenancies:**
- Remove the implicit 12-month fixed term — tenants leave when satisfied <25 (already implemented) or when evicted.
- The 3-month wait between rent-raising tenant-swaps (existing `lastTenantChange` rule) stays — it's a sensible cooldown.

### File changes

**`src/types/game.ts`:**
- Add `depositHeld: number` (pennies) and `evictionNoticeMonth?: number` and `evictionGround?: EvictionGround` to `PropertyTenant`.
- Add new `EvictionGround = 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour'`.
- Add new `PendingEviction { propertyId; tenantId; ground; servedMonth; effectiveMonth }` interface.
- Add `pendingEvictions: PendingEviction[]` to `GameState`.
- Add `propertyLocks: { propertyId; reason: 'sale_lock' | 'relet_lock'; untilMonth: number }[]` to enforce the 12-month restrictions.
- Bump `SAVE_VERSION` to 7.

**`src/stores/gameStore.ts`:**
- `selectTenant` (line 1602): compute `depositHeld = Math.floor(newRent * 5 * 12 / 52)` (5 weeks of rent), check `prev.cash >= depositHeld`, deduct from cash, store on `rec`. Show toast mentioning the deposit.
- Replace `removeTenant` (line 1652) with `evictTenant(propertyId, ground)`:
  - Validate ground based on tenant profile, concerns, and arrears history.
  - Push entry to `pendingEvictions` with `effectiveMonth` based on ground notice period.
  - Show toast with notice period.
- Add `processMonthEnd` logic to:
  - Walk `pendingEvictions`, when `effectiveMonth <= monthsPlayed`: refund deposit (50% if dilapidated), remove tenant, start void, add `propertyLocks` entry where applicable.
- Add `cancelEviction(propertyId)` action (player can withdraw notice).
- `sellProperty` / listing actions: refuse if property has an active `sale_lock` or a current tenant under non-`landlord_sale` eviction.
- Migration v6→v7: backfill `depositHeld: 0` on existing tenants (grandfathered, no retroactive deposit), init `pendingEvictions: []` and `propertyLocks: []`.

**`src/components/ui/tenant-selector.tsx`** (read separately — likely just a prop wiring change):
- Show the deposit requirement on each tenant card: "Deposit required: £X (5 weeks)".
- Disable selection if `cash < requiredDeposit + ...` (defer to store check; show warning).

**New `src/components/ui/eviction-dialog.tsx`:**
- Replaces the inline "Remove tenant" button.
- Lists the 4 grounds with brief explanation, notice period, and validity check (greyed out + tooltip if invalid).
- Confirms eviction → calls `evictTenant`.

**`src/components/ui/property-card.tsx`:**
- Replace direct `removeTenant` call with the new `<EvictionDialog>`.
- If a `pendingEvictions` entry exists for this property, show a banner "Eviction served — N months remaining (Ground: X)" with a "Cancel notice" button.

**`mem://game-mechanics/property-management/tenant-management`** (new memory file):
- Document deposits, eviction grounds, notice periods, and 12-month locks.

### Implementation note
This is the largest of the four changes. We'll implement the **deposit + replace `removeTenant` with grounds-based `evictTenant`** path first; the `propertyLocks` system is genuinely new state surface and adds complexity to the listing flow — flag for a follow-up if time-boxed.

---

## 4. Auto-use overdraft when cash hits zero

**Problem:** Spending actions hard-fail with "Insufficient Funds" even when the player has overdraft headroom available.

**Strategy:** Wrap all cash deductions in a helper that draws from `cash` first, then dips into `overdraftUsed` up to `overdraftLimit`.

### Changes

**`src/stores/gameStore.ts`:**
- Add a pure helper near the top:
  ```ts
  /** Returns { cash, overdraftUsed } after debiting `amount`, or null if insufficient combined funds. */
  function debit(state: { cash: number; overdraftUsed: number; overdraftLimit: number }, amount: number)
    : { cash: number; overdraftUsed: number } | null {
    const totalAvailable = state.cash + (state.overdraftLimit - state.overdraftUsed);
    if (totalAvailable < amount) return null;
    if (state.cash >= amount) return { cash: state.cash - amount, overdraftUsed: state.overdraftUsed };
    const fromCash = state.cash;
    const fromOverdraft = amount - fromCash;
    return { cash: 0, overdraftUsed: state.overdraftUsed + fromOverdraft };
  }
  ```
- Refactor every spending site to use it. Audit list (line numbers from the search above):
  - 469 — entity incorporation fee
  - 1239, 1297 — buy with mortgage (cash required)
  - 1320, 1375 — auction win
  - 1692 — start renovation
  - 1719 — upgrade condition
  - 1740, 1743, 1748 — mortgage settle / partial repay
  - 1905, 1923 — pay damage / take loan (will be removed when we fully retire pendingDamages, but patch them too for now)
  - 2061 — resolve tenant concern
- Each site replaces the pre-check + manual subtraction with:
  ```ts
  const debited = debit(prev, costPennies);
  if (!debited) { showToast("Insufficient Funds", "Even with your overdraft, you can't afford this.", "destructive"); return; }
  set({ ...debited, /* other state */ });
  ```
- For income-receiving sites (rent collection, sale proceeds), do the inverse: if `overdraftUsed > 0`, repay overdraft first before adding to cash. Add a `credit(state, amount)` helper:
  ```ts
  function credit(state: { cash: number; overdraftUsed: number }, amount: number) {
    if (state.overdraftUsed > 0) {
      const repay = Math.min(state.overdraftUsed, amount);
      return { cash: state.cash + (amount - repay), overdraftUsed: state.overdraftUsed - repay };
    }
    return { cash: state.cash + amount, overdraftUsed: state.overdraftUsed };
  }
  ```
- Use `credit` in `processMonthEnd` for rent/sale income (around the `finalCash` computation) so the overdraft naturally pays itself down.

**Toast messaging:**
- When a debit pulls from overdraft (i.e. `prev.cash < amount && debited`), fire an info toast: `"Used £X overdraft. Balance now £Y/£Z."` so the player notices the silent draw.

**`src/components/ui/credit-overdraft.tsx`:**
- No functional change; the dialog still allows manual draw/repay. The auto-use is purely on the spending side.

**`mem://game-mechanics/banking/overdraft-auto-use`** (new memory):
- Note: cash-spending actions auto-tap the overdraft when cash is short; rent/sale income auto-repays overdraft first.

---

## Files modified

| File | Change |
|---|---|
| `src/types/game.ts` | `requiresVacant` (renovation type), `depositHeld`/eviction fields on `PropertyTenant`, new `PendingEviction`/`PropertyLock`, drop `'grant'` from event union, bump `SAVE_VERSION` to 7 |
| `src/stores/gameStore.ts` | Remove grant event; add `debit`/`credit` helpers and refactor all cash sites; replace `removeTenant` with `evictTenant`; deposit handling in `selectTenant`; eviction tick in `processMonthEnd`; add `cancelEviction`; v6→v7 migration |
| `src/components/ui/renovation-dialog.tsx` | `requiresVacant` flag on heavy options; new `hasTenant` prop; vacancy ineligibility message |
| `src/components/ui/property-card.tsx` | Pass `hasTenant` to renovation dialog; mount `<EvictionDialog>` instead of remove button; pending-eviction banner |
| `src/components/ui/tenant-selector.tsx` | Surface 5-week deposit requirement |
| `src/components/ui/eviction-dialog.tsx` | **New file** — 4 grounds with validity gating |
| `mem://game-mechanics/property-management/tenant-management` | Update — Renters' Rights eviction grounds & deposits |
| `mem://game-mechanics/banking/overdraft-auto-use` | **New** — auto-use behaviour |
| `mem://game-mechanics/macro-economic-events` | Update — grant removed |

---

## Risks / open questions
- **Legacy saves with active tenants** won't have deposits. We'll grandfather them (`depositHeld: 0`) so eviction returns nothing rather than refunding phantom money.
- **Property locks are new state and touch listings** — if scope is tight, we can ship grounds + deposits + auto-overdraft first and defer locks to a follow-up.
- **Rent arrears tracking** for `rent_arrears` ground reads from `tenantEvents` filtered to `type: 'default'` for the property — existing data, no schema change.
