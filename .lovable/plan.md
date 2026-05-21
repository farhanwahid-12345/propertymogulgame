Four scoped fixes covering tenant-rent preview + furniture economics, conveyancing net-worth math, advertised-yield consistency, and renovation-dialog eligibility/cooldown scope.

---

## 1. Furnishing actually raises rent on tenant select + furniture is a sellable asset + pre-furnished stock

**1a. Preview rent in tenant selector matches what the tenant pays**
- `src/components/ui/tenant-selector.tsx` line 345: `calcTenantRent(displayBaseRent, tenant, condition)` is missing the `furnishingTier` argument. The store-side `selectTenant` (`gameStore.ts:2742`) already passes it, so the tenant *pays* the boosted rent — only the dialog preview is wrong.
- Add a `furnishingTier` prop on `TenantSelectorProps`, thread it through from `property-card.tsx` (which already knows the property), and pass it into `calcTenantRent`.
- Update the "Base rent" copy to display `displayBaseRent × furnishingMult × conditionMult` so the listed base + the per-tenant card both reflect the furnishing bump.

**1b. Furniture is already in net worth — surface it on the property card and uplift sale price**
- `getFurnitureValuePennies` already counts in `useGameState` net worth. Add a small "Furniture: £X (Y mo left)" chip on `property-card.tsx` next to the furnishing badge so the asset is visible.
- When listing a furnished property for sale (`gameStore.listPropertyForSale` + the auto-suggested asking price in `estate-agent-window.tsx`'s list-property dialog), add `furnitureValuePennies` to the suggested asking-price floor and the "Suggested price" label.
- On completed sell conveyancing (`gameStore.ts` ~line 580-640), nothing extra is needed — sale proceeds already reflect whatever buyer paid. The change is purely advisory pricing so the player can recoup the furniture.

**1c. Estate-agent inventory occasionally lists pre-furnished stock**
- `src/lib/engine/market.ts` `generateRandomProperty`: ~15% chance to roll `part_furnished`, ~7% chance `fully_furnished` (else unfurnished). When furnished:
  - Set `furnishingTier` and `furnishingMonthsRemaining` between 18 and 54 months (representing existing wear).
  - Bump listed `price` and `value` by the depreciated furniture value (so the agent asks more).
  - Bump `monthlyIncome` by `getFurnishingRentMultiplier(tier)` so the advertised rent and yield card show the furnished premium.
- On purchase completion (`gameStore.ts` ~line 540-553), preserve the incoming `furnishingTier` / `furnishingMonthsRemaining` on the owned property (currently those fields are copied via `...prop` spread — verify and keep).

## 2. Mortgage-aware net worth (no "free money" after buy completes)

`src/hooks/useGameState.ts` line 127 computes:

```
netWorth = cash + inflightBuyCapital + renovationWIP + furnitureValue + Σ value − overdraftUsed
```

It never subtracts mortgages. While a buy is in-flight, `cash` is down by `cashHeld` and `inflightBuyCapital` adds it back (net flat). On completion the inflight slot disappears (−cashHeld) and the full property `value` is added (+price), but the new mortgage debt is NOT subtracted, so the player gains roughly `mortgageAmount − fees` of phantom net worth. Subsequent store recomputes (level-up, bankruptcy) then correct it — explaining the "drops a fair bit later" symptom.

- Update the formula to: `cash + inflightBuyCapital + renovationWIP + furnitureValue + Σ value − totalDebt − overdraftUsed`. `totalDebt` (mortgages + loans, line 157) is already computed in the same hook.
- Sanity-check the dashboard/stat panels that read `netWorth` from this hook — none of them should re-subtract debt independently. Search `useGameState().netWorth` and verify call sites.

## 3. Advertised yield == realised yield

`gameStore.ts` ~line 526-553 completes a buy. Happy path uses the listed `prop.yield`. Bug path (line 529-534) fires when the property is missing from `estateAgentProperties` / `auctionProperties` at completion (e.g. it was removed/refreshed) and reconstructs with a *fresh* random yield `6 + Math.random() * 9`, so the player sees a different yield than the agent advertised.

- Persist the canonical yield on the conveyancing entry at offer time: extend `Conveyancing` with `advertisedYield?: number` and `advertisedMonthlyIncome?: number` (pennies). Populate in `buyProperty` / `buyPropertyAtPrice` (lines 2243 / 2339).
- In the completion block, prefer `conv.advertisedYield` and `conv.advertisedMonthlyIncome` over any random fallback. Only fall back to `6 + Math.random()*9` if literally nothing is stored (legacy saves).
- Re-derive `effectiveRent` from `settledValue × storedYield / 12` so the rent matches the yield label even when the buyer underpaid.

## 4. Renovation dialog — extension sqft + per-renovation cooldown

**4a. Eligibility counts in-progress extensions too**

`src/components/ui/renovation-dialog.tsx` lines 317-327 builds `effectiveInternalSqft = internalSqft + Σ sqftAdded of *approved-not-yet-started* extensions`. It explicitly skips extensions that are `activeRenovations.includes(r.id)` — but those are the most relevant ones: planning approved, build under way, sqft *will* exist by the time the new conversion completes. The user screenshot shows "Needs 650+ sqft int (have 595)" while another extension is already in progress.

- Change the filter to: include any extension that is approved (`status === 'approved'`) OR currently in `activeRenovations`, and only skip those already in `completedRenovationIds` (those are already baked into `internalSqft`).
- Same effective sqft is used for the conversion's `scaleInputs` so cost/rent/value scale to the post-extension footprint, matching the existing batch behaviour (line 938).

**4b. Planning refusal cooldown applies only to the refused renovation, not the whole property**

Currently `PropertyLock { reason: 'planning_cooldown' }` is scoped only by `propertyId`, so a refused extension blocks ALL planning resubmissions on the property — including unrelated conversions.

- `src/types/game.ts` `PropertyLock`: add optional `renovationTypeId?: string` (alongside the existing `slotIndex`).
- `gameStore.ts` line 1257-1264 (refusal handling): push the lock with `renovationTypeId: app.renovationTypeId` so the cooldown is per-renovation.
- `gameStore.ts` lines 3325-3332 and 3422-3428 (block guards in `submitPlanningApplication` + `submitBatchPlanningApplications`): tighten the find to also match `renovationTypeId === currentRenovationTypeId`. Untyped legacy locks (no `renovationTypeId`) keep the old property-wide behaviour so existing saves stay safe.
- `gameStore.ts` line 849-851 (renovation eligibility block in monthly tick): same match tightening.
- `renovation-dialog.tsx` line 81 + 643 + the `inPlanningCooldown` prop: compute cooldown *per renovation card* by matching `propertyLocks` `renovationTypeId === r.id`. Pass the full `propertyLocks` array into the dialog (or pre-compute a `Set<renoId>` of locked renovations) instead of the single boolean.
- `planning-refused-dialog.tsx`: already lists the specific refused renovation; no behaviour change needed, just keep the per-reno cooldown copy.

---

## Technical notes

- `Conveyancing.advertisedYield` and `advertisedMonthlyIncome` initialise to `undefined` for existing saves; the fallback path keeps them safe.
- `PropertyLock.renovationTypeId` is optional, so legacy `planning_cooldown` entries without an id still block (broad behaviour) until they expire — chosen over a migration to avoid touching persisted state.
- Furnished stock in the agent gets a `marketValue` bumped by furniture value too, so on-purchase `settledValue` math (line 540) doesn't book a paper loss from the premium price.
- `getFurnitureValuePennies` already handles `furnishingMonthsRemaining` — no engine changes needed for depreciation on pre-furnished stock.
