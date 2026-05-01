
## Changes

### 1. Fix tenant satisfaction: stop penalising new move-ins for "recent rent increase"

**Problem:** When a tenant moves in, `lastRentIncrease` may have been set recently (from the annual uplift or a Section 13 on the previous tenant). The new tenant then gets hit with the -8 "Recent rent increase" satisfaction penalty even though they agreed to that rent when they moved in.

**Fix** (in `src/stores/gameStore.ts`, satisfaction loop ~line 892):
- Add a guard: only apply the "recent rent increase" penalty if the tenant's `moveInMonth` is **before** the `lastRentIncrease` date. If the tenant moved in at or after the last increase, they accepted that rent voluntarily — no penalty.
- Store a `moveInMonth` field on each tenant record (set to `monthsPlayed` in `selectTenant`).

Also reduce the penalty from -8 to -4 per month (3 months duration), making it less punishing overall.

### 2. Stop automatic rent increases on player-owned properties

**Problem:** Lines 1203-1218 apply a blanket 3% annual rent uplift to all owned properties, including those with sitting tenants. Per the user's rules, rent on occupied properties should only go up via Section 13 or tenant turnover.

**Fix:**
- The annual rent uplift loop should only increase `baseRent` / `monthlyIncome` on **vacant** properties (no tenant and not in void). This keeps the market reference rising so new tenants get current rates, but sitting tenants keep their agreed rent.
- Similarly for macro events (tech_boom +2%, recession -2% at lines 1357/1366): these should only adjust `baseRent`/`monthlyIncome` on vacant properties. For occupied properties, only `marketValue` and `value` change — rent stays locked until tenant turns over or Section 13 is served.

### 3. Verify taxation is not double-applied

**Finding:** Tax logic looks correct — it fires once per game-year in April (line 1246 checks `currentTaxYear > lastTaxYear`). The yearly accumulators reset after each tax event. There is no double-taxation bug.

However, the activity feed shows two separate "Annual income tax" entries for different rent amounts in the screenshot. This is likely because two tax years passed (the game ran for 24+ months). No code change needed here, but I will add the tax year number to each tax record description so the player can distinguish them (e.g., "Year 2 income tax").

### Files to modify

- `src/stores/gameStore.ts` — all three changes above
- `src/types/game.ts` — add `moveInMonth` to `PropertyTenant` type

### Technical details

**moveInMonth field:**
```
// In PropertyTenant type
moveInMonth?: number;
```

Set in `selectTenant` action and tenant hydration. Existing tenants without it default to 0 (will never trigger the guard, so they behave as before — safe fallback).

**Annual uplift guard:**
```
// Only uplift vacant properties
const hasTenant = newTenants.some(t => t.propertyId === property.id);
if (hasTenant) return property; // sitting tenant — rent locked
```

**Macro event guard:** Same pattern — skip `monthlyIncome`/`baseRent` changes for properties with a sitting tenant.
