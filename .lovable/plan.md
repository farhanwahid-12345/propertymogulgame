## Two realism fixes

### 1. Macro events are too frequent and too punchy

**Problem (screenshot 1):** "Tech Boom" / "Recession" / "Rate Cut" toasts are firing roughly every 3–6 in-game months and each one swings every property's value by 8–10% in one tick. Combined with monthly drift this still feels unrealistic, and there's no symmetric "rates rose, values dipped" path between full-blown recessions.

**Fixes in `src/stores/gameStore.ts` macro-event block (~lines 1080–1130):**

- **Lower frequency**: change `nextEventMonth = newMonthNumber + 3 + Math.floor(Math.random() * 4)` (3–6 mo) → `8 + Math.floor(Math.random() * 9)` (**8–16 mo** between events). Real macro shocks are years apart.
- **Add small/neutral outcomes** to the event pool so not every event is a dramatic boom/bust:
  - `mild_correction` — values −2%, rents flat
  - `rate_hike` — base rates +0.5% (no value/rent move)
  - `rate_cut_small` — base rates −0.5%
  - Plus a **30% "no event" roll** when the timer fires (just push the next event further out) so quiet stretches happen.
- **Halve the magnitudes of the dramatic ones**:
  - `tech_boom`: values **+4%** (was +8%), rents **+2%** (was +5%)
  - `recession`: values **−5%** (was −10%), rents **−2%** (was −3%), rates **+1%** (was +1.5%)
  - `rate_cut`: rates **−0.5%** (was −1%)
- **Tighten existing soft cap**: the 2.5× purchase-price cap stays, but ALSO prevent any single-tick swing > 6% (clamp `newValue` to `[p.value*0.94, p.value*1.06]` for event multipliers). Drift is already small, this only bites on macro events.
- **Update toast copy** to match new numbers.

Net effect: events fire ~2×/year at most, half are small or no-ops, and the dramatic ones move values realistically (a few percent, not 10%).

### 2. Tenant change must respect notice / Renters' Rights — and rent rises need negotiation

**Problem (screenshot 2):** Clicking the tenant selector lets you swap tenants instantly. Under the Renters' Rights Act 2024, a sitting tenant can only be removed via a valid eviction ground + notice period, and rent can only be raised once a year via a Section 13 notice the tenant can challenge at the First-tier Tribunal.

**Fix A — Block instant tenant swap when sitting tenant exists:**

In `src/stores/gameStore.ts` → `selectTenant` (~line 1780), add an early guard:
```
if (prev.tenants.some(t => t.propertyId === propertyId)) {
  showToast(
    "Tenant in Place",
    "Serve a valid eviction notice first — you can't replace a sitting tenant.",
    "destructive"
  );
  return;
}
```
This forces the player into the existing eviction flow (which already has notice periods and tribunal appeals).

In `src/components/ui/tenant-selector.tsx`:
- When `currentTenant` is set, change the trigger button label to **"Manage Tenant"** and on click open a **management view** instead of the selection grid. The management view shows:
  - Current tenant card (name, satisfaction, rent, deposit held)
  - Two CTAs: **"Propose Rent Increase"** (opens the new rent-negotiation dialog — see Fix B) and **"Serve Eviction Notice"** (re-uses existing `EvictionDialog`)
  - The fresh tenant grid is **only** shown when there is no current tenant or after eviction completes.

**Fix B — Add Section 13 rent-negotiation UI:**

New file `src/components/ui/rent-negotiation-dialog.tsx`:
- Header: "Section 13 Rent Increase Notice"
- Inputs: current rent (read-only), proposed new rent (slider/number, capped at +3%/yr per existing memory + market reference), 2-month notice acknowledgement.
- Computes a **tenant acceptance probability** based on:
  - How close proposed is to local market (use `property.value × yield/12` as market reference)
  - Tenant satisfaction (high = more likely to accept)
  - Profile (premium/standard accept more readily; budget/risky push back)
- Three outcomes when player confirms:
  1. **Accepted** (probabilistic): rent updates next month, +3% rent cap timer resets, satisfaction −5.
  2. **Counter-offered**: tenant proposes a lower figure; player can accept counter or escalate to tribunal.
  3. **Tribunal referral**: £275 fee (from cash, overdraft-aware), 60% tribunal sets player's figure, 40% tribunal lowers to market median. Either way locks rent for 12 months.
- New store action `proposeRentIncrease(propertyId, newRent)` and `referRentToTribunal(propertyId)` in `src/stores/gameStore.ts`.
- Existing yearly +3% cap (memory: `rent-control/yearly-increase-cap`) still enforced — the dialog blocks any value above current × 1.03 with a warning about the cap.

**Fix C — Tenant-selector copy:** add an info banner at the top of the selection grid (when shown) noting "New tenants can only move in once the property is empty — serve an eviction notice if you need to remove a sitting tenant."

### Files to modify
- `src/stores/gameStore.ts` — slow macro events, add new event types, halve magnitudes, clamp tick swing; add `selectTenant` sitting-tenant guard; add `proposeRentIncrease` + `referRentToTribunal` actions.
- `src/components/ui/tenant-selector.tsx` — split into "manage current tenant" vs "select new tenant" views; wire to new dialogs.
- `src/components/ui/rent-negotiation-dialog.tsx` (**new**) — Section 13 UI with acceptance/counter/tribunal flow.
- `src/hooks/useGameState.ts` — expose `proposeRentIncrease`, `referRentToTribunal`.
- `src/pages/Index.tsx` — pass new actions through.

### Memory updates
- Update `mem://game-mechanics/macro-economic-events`: new cadence (8–16mo), wider event pool incl. small/no-op outcomes, halved magnitudes, ±6% per-tick clamp.
- New `mem://game-mechanics/rent-control/section-13-negotiation`: rent rises require a Section 13 notice, tenant can accept/counter/tribunal; 12-mo lock after tribunal.
- Update `mem://game-mechanics/property-management/tenant-management` (or rent-control variant): "Sitting tenants cannot be replaced — must be evicted via valid ground first."

### Out of scope
No changes to eviction grounds, deposit handling, or appreciation drift (already tuned in last pass). No save-version bump — both changes are pure logic/UI.