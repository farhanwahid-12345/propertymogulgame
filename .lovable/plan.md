

# Plan: Three Quick Fixes

Three small, focused fixes from the screenshot annotations.

---

## 1. Reset toast wording: £250K → £100K

**File:** `src/stores/gameStore.ts` (line 1607)

The reset action toast still says "Started fresh with £250K!" but `INITIAL_CASH` is now £100,000.

```ts
showToast("Game Reset", "Started fresh with £100K!");
```

One-line change.

---

## 2. Mortgage rejection should always show inline (not just collapse)

**File:** `src/components/ui/estate-agent-window.tsx`

The screenshot shows the red "Mortgage Rejected — Mortgage Denied: Debt-to-income rate 76% exceeds 50% limit for this lender" banner appearing on a property tile, but it's tied to the *tile* not the *expanded purchase panel*. When the player adjusts the LTV slider or switches provider inside the buy panel, the rejection banner should:
- Stay visible (inline) inside the expanded buy panel
- Update reactively as LTV/term/provider change
- Not be dismissed by collapsing the property tile

**Already partially implemented** at lines 697–735 (reactive `calculateMortgageEligibility` block) and 780–795 (button-disable). Two gaps:
1. The rejection banner currently only shows on the *collapsed tile* (top-right red chip) — replicate it as a persistent inline banner *inside* the open buy panel above the Confirm button.
2. The button-click handler (lines 737–750) re-runs eligibility and fires a toast on rejection — suppress that toast since the inline banner already shows the reason. Just early-return without toast.

Also verify the **same surface in `mortgage-management.tsx`** (refinance) does the same — already done in the previous round.

---

## 3. Rent shows £0 after assigning tenant

**Root cause:** When a property completes conveyancing inline (no original listing in `estateAgentProperties` to reconstruct from — see `gameStore.ts` lines 295–303), the resulting owned property has `monthlyIncome: 0` AND `baseRent: 0` (line 302: `baseRent: prop.monthlyIncome`). Then `selectTenant` does `calcTenantRent(0, tenant, condition) = 0` and assigns £0/mo.

**File:** `src/stores/gameStore.ts` (`selectTenant`, lines 1221–1263)

Add a robust base-rent fallback chain mirroring what `tenant-selector.tsx` already does for display:

```ts
let currentBaseRent = property.baseRent || property.monthlyIncome;
if (currentBaseRent <= 0 && property.value > 0) {
  // Derive from value × yield/12 as last-resort
  const yieldPct = property.yield ?? 7;
  currentBaseRent = Math.floor((property.value * (yieldPct / 100)) / 12);
}
```

Also persist the derived `baseRent` back onto the property (line 1259 already updates `baseRent: currentBaseRent`) so future tenant changes keep the same base.

**Secondary fix:** in the conveyancing-completion path (`processMonthEnd`, around line 297–303), when the original listing is missing, derive `monthlyIncome` from `value × yield/12` rather than leaving it at 0:
```ts
const yieldPct = prop.yield ?? (6 + Math.random() * 9);
const derivedRent = Math.floor((prop.value * (yieldPct / 100)) / 12);
prop = { ...prop, monthlyIncome: prop.monthlyIncome || derivedRent, yield: yieldPct };
```

---

## Files Modified

| File | Change |
|---|---|
| `src/stores/gameStore.ts` | Reset toast £100K; selectTenant baseRent fallback; conveyancing-completion derives monthlyIncome |
| `src/components/ui/estate-agent-window.tsx` | Inline rejection banner persists in open buy panel; suppress toast on inline-rejected click |

