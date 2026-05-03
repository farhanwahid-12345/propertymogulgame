## Property card + activity + eviction polish

Four related fixes from the screenshots.

---

### 1. Stop premium → standard degradation when all upgrade renos are done

**Symptom:** Properties in standard condition with every improvement already completed still anger premium tenants and still degrade further. Player has no recourse.

**Fix in `src/stores/gameStore.ts` depreciation block (lines ~828-855):**
- Before degrading `premium → standard`, check `canUpgradeToPremium`-style eligibility in reverse: if the property has all four improvement-tier renos in `completedRenovationIds` (`kitchen_upgrade`, `bathroom_renovation`, `central_heating`, `double_glazing`), keep `condition = 'premium'` and just reset `monthsSinceLastRenovation` to a partial value (e.g. half the depreciation window) so it cycles slowly without ever falling. Skip the toast.
- This makes a fully-upgraded property "permanently premium" — it can still take damage from concerns/dilapidation pathways, but neglect alone won't drop it.

**Helper:** add `isFullyUpgraded(completedRenovationIds)` to `src/lib/engine/renovation.ts` next to `canUpgradeToPremium` so both call sites share the predicate. The satisfaction branch at line 870-884 already handles "no premium upgrade available → no penalty" — leave it as-is.

---

### 2. Break Profit/Loss into Purchase + Renovation spend on the property card

**Track renovation spend per property.**
- Add `totalRenovationSpendPennies?: number` to `Property` in `src/types/game.ts` and the migration in `gameStore.ts` (default 0).
- In `startRenovation` (line 2495), increment `property.totalRenovationSpendPennies += costPennies` on the property record being charged. Persist alongside the existing `set({ ... })`. (Renovations are non-refundable so we don't need to roll it back on outcome rolls.)

**Render the breakdown in `src/components/ui/property-card.tsx` (lines 287-303):**
Replace the single Profit/Loss row with a small block:

```text
Purchase Price:    £52,300
Renovation Spend:  £18,400
Total Invested:    £70,700
Market Value:      £130,146
Equity vs Market:  +£59,446 (+84.1%)   ← red/green
                   * 23.4% above market
```

- Compute `totalCost = property.price + renovationSpendPounds`.
- `equityVsMarket = marketValueToUse - totalCost`.
- "above/below market" % = `(marketValueToUse - totalCost) / totalCost * 100` (replaces the existing `profitPercent`).
- Hide the Renovation Spend / Total Invested rows when spend is £0 to keep cards compact for un-renovated stock.

---

### 3. Move the Activity feed off the Operations tab strip into a slim top ticker

**Symptom:** Activity tab eats horizontal space inside Operations and rarely has anything actionable.

- Remove the `activity` tab from `src/components/ui/operations-center.tsx` (drop the entry on line 117, the `TabsContent` block on lines 198-210, and the `count.activity` from `allEmpty`/`defaultTab` logic). `TabsList` becomes `grid-cols-4`.
- New component `src/components/ui/activity-ticker.tsx`: a horizontal, single-line marquee using the same data feeds (`tenantHistory`, `tenantEvents`, `economicEvents`, `renovations`, `conveyancing`, `taxRecords`). Shows only the latest ~8 events as `· {month} {short label}` separated by middots; CSS-only auto-scroll (paused on hover). Glass-pill styling, ~36 px tall.
- Mount it at the top of the dashboard in `src/pages/Index.tsx` directly above the hero block. Pass through the same props the operations centre already receives.
- A "View all" button on the ticker opens a Sheet/Drawer with the full `ActivityFeed` for users who want detail — keeps the existing component reachable without giving it a permanent tab.

---

### 4. Eviction appeals: tenant-initiated only, and enforce cooldowns

Two bugs: the player can voluntarily pay £400 to appeal their own eviction (nonsense), and the `appeal_cooldown` lock is recorded but never checked when serving a fresh notice.

**`src/components/ui/eviction-timeline-feed.tsx`:** remove the `EvictionAppealDialog` trigger entirely (lines 127-135) and drop `onAppealEviction` from the props/Index wiring. The dialog file can stay (re-used for the auto flow below) but is no longer invoked by the player.

**`src/stores/gameStore.ts` — make appeals tenant-driven:**
- When a notice is served via `evictTenant` (lines 2261-2320), roll a one-shot `tenantWillAppeal` chance based on tenant profile + satisfaction + ground:
  - `landlord_sale` / `landlord_move_in`: base 35%
  - `rent_arrears`: base 5%
  - `antisocial_behaviour`: base 10%
  - +15% if tenant satisfaction ≥ 60, −10% if profile is `risky`.
- Persist the decision on the `PendingEviction` record (`appealFiled: boolean`, `appealResolveMonth: number` ≈ servedMonth + 1).
- In the monthly tick (around line 1063 where evictions are processed), when `appealResolveMonth` arrives:
  - Charge the tribunal fee to the **tenant** (no cost to player), then run the existing 60/40 upheld/overturned roll using the same outcome paths already in `appealEviction` (lines 2361-2401). Refactor that body into a private helper `resolveEvictionAppeal(state, eviction)` so both the manual and automatic paths share it; delete the public `appealEviction` action and its store-interface entry.
  - Show a toast: "Tenant filed a tribunal appeal — ruling: upheld/overturned".

**Enforce the cooldowns in `evictTenant` (line 2261):** before validating the ground, look up `propertyLocks` for this property:
- `appeal_cooldown` → block any `landlord_sale` or `landlord_move_in` notice until `untilMonth`. Toast: "Tribunal cooldown active until month X".
- `sale_lock` → block re-letting (already exists conceptually) **and** add a check in `selectTenant` (line 2125) mirroring the existing `relet_lock` block, so a player who served `landlord_sale` actually has to sell before getting new tenants. Toast: "You served a sale-grounds notice — list this property for sale before re-letting (unlocks month X)."

This also fixes the "I can get more tenants after evicting" report — currently only `relet_lock` (move-in ground) is enforced; `sale_lock` is recorded but ignored.

---

### Files modified

- `src/lib/engine/renovation.ts` — add `isFullyUpgraded`.
- `src/stores/gameStore.ts` — depreciation guard, renovation spend tracking, automatic tenant appeals + cooldown enforcement, drop `appealEviction` action.
- `src/types/game.ts` — `Property.totalRenovationSpendPennies`, `PendingEviction.appealFiled` / `appealResolveMonth`.
- `src/components/ui/property-card.tsx` — new profit/loss breakdown.
- `src/components/ui/operations-center.tsx` — drop Activity tab.
- `src/components/ui/activity-ticker.tsx` — new horizontal ticker.
- `src/pages/Index.tsx` — mount ticker, drop `onAppealEviction` prop wiring.
- `src/components/ui/eviction-timeline-feed.tsx` — remove appeal trigger.

### Out of scope

- Reworking the deposit-dispute / TDS flow.
- Changing tenant appeal probabilities beyond the table above (tunable later).
- Persisting historical renovation spend onto pre-existing save games beyond the `?? 0` migration default.
