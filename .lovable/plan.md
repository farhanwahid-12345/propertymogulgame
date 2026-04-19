

# Plan: Tenant Satisfaction, Background Clock, Rent £0 Bug Fix

Three changes from the screenshot annotations.

---

## 1. Background-running game clock (Web Worker)

**Problem:** Browsers throttle `setInterval` to ≥1 minute when a tab is hidden, so the in-game clock effectively pauses when the user switches tabs. Current loop lives in `src/hooks/useGameEngine.ts` using plain `setInterval`.

**Fix:** Move the tick driver into a **Web Worker** (`src/workers/gameClock.worker.ts`) which is not throttled. The worker posts a `tick` message every 1000 ms; `useGameEngine` listens and calls the same store actions (`clockTick`, `processMonthEnd`, `replenishMarket`, `processMarketUpdate`, `processCounterResponses`).

Implementation:
- New file `src/workers/gameClock.worker.ts` — posts `{type:'tick', delta:elapsedMs}` based on `performance.now()` deltas, so even if the worker is briefly throttled the store catches up the correct number of seconds.
- Update `useGameEngine.ts` to `new Worker(new URL('../workers/gameClock.worker.ts', import.meta.url), { type: 'module' })` and dispatch tick handlers based on `delta` (sum elapsed seconds, decrement timer accordingly, fire month-end when crossed).
- Vite supports module workers natively — no config changes needed.
- Fallback: if `Worker` is unavailable, fall back to current `setInterval`.

---

## 2. Fix £0/mo monthly income with tenant assigned

**Root cause analysis:** Looking at `gameStore.ts` line 342–349, monthly income is summed only if `hasTenant && !isInVoid`. The property card uses `property.monthlyIncome` directly, which is set in `selectTenant` to `calcTenantRent(...)`. Two failure paths:
1. **Stale `voidPeriod`** — when a tenant is selected, `selectTenant` removes the void *for that property*, but the **property-card display** in screenshot reads `monthlyIncome` (which is correct/non-zero), yet shows `£0/mo`. The card likely uses cashflow logic (skips income when `isInVoid` evaluated against legacy timestamps).
2. **Conveyancing flag** — if the property is mid-conveyancing, the income is suppressed in totals but the per-property card may also skip rendering it.

**Fix:**
- In `src/components/ui/property-card.tsx`: display `property.monthlyIncome` directly (after pennies → pounds via `useGameState`). Remove any local "is in void" check that hides the value when a tenant is actually assigned.
- In `selectTenant` (`gameStore.ts`): also clear any expired `voidPeriods` and update `lastRentIncrease = monthsPlayed` so the new rent is recognised.
- Add a sanity guard in `processMonthEnd`'s income loop: if `hasTenant && voidPeriod.endDate < now`, treat as not in void (currently the filter is `endDate <= currentTime` — verify and fix off-by-one).
- Add a small debug pill on the card when `hasTenant && monthlyIncome === 0` ("Rent pending — tenant just moved in") so the player understands.

---

## 3. Tenant Satisfaction System

**New mechanic:** Each tenant has a satisfaction score 0–100 that decays based on neglect and influences default risk, rent renewal acceptance, and early-exit chance.

### 3a. Data model — `src/types/game.ts`
Extend `PropertyTenant`:
```ts
satisfaction: number;          // 0-100, starts at 80
lastSatisfactionUpdate: number; // monthsPlayed snapshot
```

### 3b. Monthly satisfaction update — `gameStore.ts processMonthEnd`
For each tenanted property, adjust satisfaction:
- **−15** if condition is `dilapidated`
- **−5** if condition is `standard` and tenant profile is `premium` (premium tenants want more)
- **+3** if condition is `premium`
- **−10** if a damage event is unrepaired this month
- **−8** per rent increase in the last 3 months
- **+2** baseline drift back toward 70 if none of above
- Clamp 0–100.

### 3c. Effects of satisfaction
- **Default risk multiplier** — extend the existing default chance in `processMarketUpdate`/`processMonthEnd`: multiply by `(1 + (60 - satisfaction) / 100)` so a satisfaction of 30 → ~1.3× default risk.
- **Early exit** — if satisfaction < 25, 8%/month chance tenant leaves (creates void period).
- **Rent increase rejection** — when player tries to bump rent (via tenant change to a higher-paying band), if satisfaction < 40 there's a 50% chance the tenant defaults instead of accepting.

### 3d. UI — `src/components/ui/property-card.tsx`
Add a thin satisfaction bar under the tenant name button:
- Heart icon + colored bar (green ≥70, yellow 40–69, red <40)
- Tooltip listing top 2 reasons (e.g. "Dilapidated condition (-15)", "Recent rent hike (-8)")

### 3e. UI — `src/components/ui/tenant-selector.tsx`
Show current satisfaction in the "Currently renting" card so the player can see the impact of their decisions.

---

## Files Modified

| File | Change |
|---|---|
| `src/workers/gameClock.worker.ts` *(new)* | Tab-throttle-resistant tick driver |
| `src/hooks/useGameEngine.ts` | Use Web Worker for clock; delta-based catch-up |
| `src/types/game.ts` | Add `satisfaction`, `lastSatisfactionUpdate` to `PropertyTenant` |
| `src/stores/gameStore.ts` | Satisfaction monthly update; default/exit modifiers; rent-display fix |
| `src/components/ui/property-card.tsx` | Satisfaction bar; fix £0/mo display when tenant assigned |
| `src/components/ui/tenant-selector.tsx` | Show current satisfaction |

