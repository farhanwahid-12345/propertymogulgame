## Five improvements: dead space, multi-reno batch, market rent realism, planning sequencing, 9-property cap

### 1. Property card & "Your Empire" dead space (Item 1 a/b)

**Problem:** Both the property card footer and the "Your Empire" summary row have a tall empty band below the controls.

**Fix:**
- `src/components/ui/property-card.tsx` — audit the bottom region: remove the spacer flex grow, drop redundant `mt-auto` / `pb-N`, and collapse the empty CardContent slot when no tenant / no actions present. Move "Sell only via Estate Agent…" hint inline next to the action row instead of stacked below.
- `src/components/sections/PortfolioGrid.tsx` — already a one-line summary; reduce `p-4` → `p-3`, drop `mb-3` to `mb-2`, and `gap-4` → `gap-3` on the grid. Remove the redundant header wrapper div that adds vertical padding.

### 2. Multi-renovation batch selection (Item 2)

**Problem:** Renovations must be applied one at a time; players want to queue multiple, see the combined cost / ROI, and pay once.

**Approach:** Introduce a selection mode inside `renovation-dialog.tsx`.
- Add `selectedIds: Set<string>` local state. Each renovation row gets a checkbox (only enabled if the renovation is currently eligible — passes all gating: cash, condition, planning, vacancy, one-shot, mutual-exclusivity).
- A sticky footer panel shows: combined cost (sum of scaled costs), combined monthly rent uplift, combined value uplift (with ceiling-diminishing returns applied to the *sum* against the same ceiling), expected ROI (using `RENOVATION_EXPECTED_MULTIPLIER` per item), and longest duration (renos run in parallel, so duration = max).
- New action `startRenovationBatch(propertyId, renovations: RenovationType[])` on the store. It iterates and calls the existing `startRenovation` path per item inside one state mutation (single debit, single toast). Planning-gated items still need an `applyForPlanning` step — surface that in the dialog by greying out the checkbox with a "Needs planning first" badge.
- Mutual exclusivity: only one conversion can be selected; selecting kitchen_upgrade disables conflicting variants. Reuse existing eligibility helpers.
- Bundle discount (subtle): when ≥3 items selected, apply a 5% cost discount (shared scaffolding / contractor savings). Mention in the footer chip.

### 3. Local market rent reflects renovations / extensions / conversions (Item 3)

**Problem:** `getMarketRentPounds` blends only `value` + `condition`. After a conversion (HMO/flats) or extension, the property has materially higher rent potential, but the Section 13 tribunal market reference doesn't move. The negotiation dialog then looks unrealistic ("market £X" same as before the works).

**Fix in `src/lib/engine/market.ts`:**
- Extend `getMarketRentPounds` signature to optionally accept `subtype`, `subtypeUnits`, `internalSqft`, `completedRenovationIds`.
- Apply a subtype-aware yield bump:
  - `hmo` → +1.5% on conditionYield, plus a small per-room multiplier (`1 + 0.04 × (units − 1)` capped at 1.32).
  - `flats` → +1.0% conditionYield, `1 + 0.06 × (units − 1)` cap 1.4.
  - `multi-let` → +0.5%, flat.
- Apply a fit-out premium when premium-tier upgrades completed (kitchen / bathroom / heating / glazing): each adds +1.5% to qualityMult, additive, cap at +6%.
- Extensions feed through indirectly: `value` already rises post-extension, so the value × yield product moves naturally; no extra term needed.
- Update callers (`rent-negotiation-dialog`, `property-card`, anywhere that calls `getMarketRentPounds`) to pass the new fields.

### 4. Extension → conversion sequencing (Item 4)

**Problem:** Currently a conversion (e.g. terrace → 4-bed HMO) uses the property's *current* internalSqft. If the player has *planning approved* for an extension but hasn't built it, they're forced to either build the extension first OR convert based on the smaller footprint — they can't get credit for the granted sqft.

**Fix:** Two-part change.
- **(a) Recognise approved-but-not-built sqft.** In `renovation-dialog.tsx` eligibility / preview, compute `effectiveInternalSqft = internalSqft + Σ(sqftAdded for planningApplications where status==='approved' and not yet started)`. Use this for: minInternalSqft gate, room/unit count preview, value uplift scaling, market-rent preview.
- **(b) Combined "extension + conversion" workflow.** When a conversion is selected via the new batch flow (Item 2) AND an approved extension exists for the same property, allow them to be queued together. Engine processes the extension `completionMonth` first, then the conversion fires on the same or following month, sharing 15% of the conversion cost as a "concurrent works" discount.
- **(c) If planning is approved but NOT yet built and conversion is started solo,** the conversion may start using the bigger footprint, but the engine then auto-schedules the extension construction as a prerequisite step (consumes the same approval, debits its cost, blocks tenants for `max(extension.duration, conversion.duration)`).
- Update `src/stores/gameStore.ts` conversion path (~line 1832) to read `effectiveInternalSqft` and to consume the linked planning approval.

### 5. Ownership cap at 9 properties (Item 5)

**Problem:** Current cap is 8 — user wants 9.

**Fix:** Single-line change in `src/lib/engine/financials.ts`:
```ts
export function getMaxPropertiesForLevel(_level: number): number { return 9; }
```
Update the "Inventory Guarantee" mental model accordingly (8 listings still fine), and confirm the limit toast in `gameStore.ts` lines 2177 / 2272 reads from the helper (it does — no further change). Update the memory note for ownership-limit afterwards.

### Files to touch

- `src/components/ui/property-card.tsx` — strip dead space, inline footer hint.
- `src/components/sections/PortfolioGrid.tsx` — tighten paddings/gaps.
- `src/components/ui/renovation-dialog.tsx` — batch checkboxes, sticky combined-ROI footer, effective sqft preview.
- `src/stores/gameStore.ts` — new `startRenovationBatch` action; conversion path uses effective sqft + consumes planning approval; bundle discount.
- `src/lib/engine/market.ts` — extend `getMarketRentPounds` for subtype/units/upgrades.
- `src/lib/engine/financials.ts` — bump cap to 9.
- Memory update afterwards: `mem://game-mechanics/property-management/ownership-limit` (8 → 9).

### Out of scope

- No backend changes. No new dependencies. Existing semantic tokens only.
- Existing Section 13 negotiation flow logic untouched — it just sees a more realistic market-rent figure.
- Single-renovation flow remains available; batch is an opt-in checkbox mode.
