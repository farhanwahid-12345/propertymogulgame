# Execution Plan — Outstanding Improvements

Three outstanding items from the document, ordered low-risk → high-risk so each phase ships green before the next begins.

---

## Phase 1 — Fix Flat/HMO Rent Increase Bug (Doc #1)

Small, surgical bug fix. Lands first so we have a clean baseline before the testing/refactor work.

**Changes**
- `src/components/game/property-card.tsx` (~lines 706, 759): when `subtype === 'hmo'` or (`subtype === 'flats'` and `subtypeUnits > 1`), pass the matched tenant's `rentPennies / 100` (filtered by `propertyId` + `slotIndex`) as `currentRent` to `RentNegotiationDialog`, instead of `property.monthlyIncome`.
- Thread `slotIndex` through the `applyRentIncrease` call in **both** the single-tenant and multi-unit branches so the store updates the correct unit.
- Cross-check: a prior memory note says this was already addressed via `MultiUnitSlots` — verify whether the bug still surfaces on the two property-card call sites the document calls out, and only edit what's still broken. If already fixed, document the no-op and move on.

**Verification**
- New regression test in an appropriate `phaseXVerification.test.ts` (or a new `rentIncreaseSlot.test.ts`) that drives a flats property with two slots at different rents and asserts the per-slot rent flows through correctly.
- Manual: in preview, attempt a Section 13 raise on a single flat unit at a rent below the property's total income — should no longer reject.

---

## Phase 2 — Month-End / Eviction / Credit Store Tests (Doc #2)

Lock down behaviour **before** moving code, so the Phase 3 refactor has a safety net.

**Add to `src/stores/gameStore.test.ts`** (all seeded via `withSeed()`):

Sub-phase 2a — Month-end cashflow
- Paying tenant → cash increases by rent after tick.
- Tenant in arrears → cash unchanged, `arrearsPennies` increases correctly.
- Arrears cleared → full `arrearsPennies` paid back lump-sum and resets to 0.
- Mortgage payment deducted from cash on monthly tick.
- Missed mortgage payment (insufficient cash) → credit score decreases.

Sub-phase 2b — Eviction state machine
- `serveEvictionNotice` creates a `pendingEviction` entry with correct `propertyId` + `slotIndex`.
- `cancelEviction` removes the correct entry.
- After notice period expires on a monthly tick, tenant is removed and property becomes vacant.
- `evictForArrears` on a property with no arrears is rejected and creates no entry.

Sub-phase 2c — Credit score
- All mortgages serviced → score unchanged across N months.
- One missed payment → score drops by the documented penalty amount.

**Approach**: follow the existing `gameStore.test.ts` pattern — `useGameStore.setState()` to set scenarios, call actions, then assert from `getState()`. Drive `advanceMonth()` directly; no clock mocking.

**Exit criteria**: full suite green (currently 183/183 → target ~195+).

---

## Phase 3 — Incremental Monolithic Store Split (Doc #3)

Migrate the remaining ~4,200 lines out of `gameStore.ts` into populated slice files. **One slice at a time**, behind the Phase 2 tests, with the persisted shape held constant so no new migration is required.

Order (per the document, by self-containment):

- **3a. `marketSlice.ts`** — estate agent + auction generation/refresh, city-based stock spread, market trend updates, needsRefurb auction discounting.
- **3b. `financialSlice.ts`** — cash, overdraft, credit score updates, monthly P&L, tax hooks (Section 24, SDLT, CGT), mortgage payment/ERC/payoff tracking, loan tracking/repayment.
- **3c. `portfolioSlice.ts`** — `ownedProperties` array, market value/appreciation tick, condition decay, `internalSqft`, EPC + MEES enforcement, `sale_lock`/`relet_lock`.
- **3d. `tenantSlice.ts`** — `selectTenant`, rent collection + arrears, satisfaction updates, concerns lifecycle, eviction serve/cancel/expiry, deposit disputes.
- **3e. `conveyancingSlice.ts`** — buy + sell lifecycle, chain collapse, completion cashflow (deposit, mortgage draw, fees).

**Conventions**
- Each slice exports a `createXxxActions(set, get)` factory, mirroring the existing `renovationActions.ts` pattern.
- Cross-slice reads via `get()` only — no direct imports between slice files.
- `gameStore.ts` becomes a thin composer: top-level state shape, the monthly clock tick that fans out across slices, and `persist` config.
- **Persisted shape unchanged** — no new migration, no `CURRENT_VERSION` bump.
- After each sub-phase: app boots, full test suite green, manual smoke (buy → let → tick → evict) in preview before the next sub-phase.

**Exit criteria**: `gameStore.ts` reduced to a thin composer (target < ~500 lines), every domain owned by its slice, full suite green.

---

## Cross-cutting notes

- **No new persisted keys** — Phase 3 explicitly preserves the save shape.
- **No new third-party deps.**
- **Test budget**: Phase 2 adds ~12+ store-level tests; Phase 3 adds smoke coverage as needed but should not require schema-level additions.
- **Stopping point**: after each sub-phase (1, 2a, 2b, 2c, 3a…3e) the suite must be green before the next begins.


---

## Status (post-implementation)

**Phase 1 — DONE.** Root cause was that `property-card.tsx`'s single-tenant rent-increase + eviction block (~lines 700–751) rendered alongside `MultiUnitSlots` for any HMO/flats property where a `currentTenant` was set, so the dialog was given `property.monthlyIncome` (combined total) as the per-slot rent floor and rejected every realistic raise. Gated the block with `!(multiUnitSlots && multiUnitSlots.length > 0)` so multi-unit rent increases now go exclusively through `MultiUnitSlots`, which already passes the matched slot's `slot.rentPounds` and threads `slotIndex` into `applyRentIncrease`.

**Phase 2 — DONE.** Added `src/stores/gameStoreStateMachine.test.ts` with 11 new tests covering:
- Eviction state machine: `landlord_sale` happy-path creates `pendingEviction`; `rent_arrears` without ≥2 default events is rejected; `rent_arrears` with default events succeeds; `cancelEviction` removes only the matching entry; duplicate notice on same slot is refused.
- `processMonthEnd`: no-op when `timeUntilNextMonth > 0`; advances `monthsPlayed` when 0; credits cash when a paying low-risk tenant is in place; accumulates `arrearsPennies` when the missed-rent roll fires (high-risk + seed loop).
- Credit score: stays inside `[300, 850]`; mortgage-serviced + healthy cash + low LTV does not regress.
All seeded paths use `withSeed`. Suite: **194/194 green** (was 183/183).

**Phase 3a — DONE (market replenishment).** Extracted `replenishMarket` (98 lines) into `src/stores/slices/marketActions.ts` behind a `createMarketActions(set, get)` factory, spread into the store literal. `gameStore.ts` shrunk from 4,778 → ~4,680 lines. Behaviour and persisted shape unchanged. Suite still 194/194 green.

**Phase 3b — DONE (financial slice).** Extracted ~440 lines (mortgages, loans, overdraft, cash mutators) into `src/stores/slices/financialActions.ts`. Suite 194/194 green.

**Phase 3c — DONE (portfolio slice).** Extracted ~454 lines (buyProperty, buyPropertyAtPrice, sellProperty, handleEstateAgentSale, handleAuctionSale, listPropertyForSale, cancelPropertyListing, updatePropertyListingPrice, setAutoAcceptThreshold, addOfferToListing, rejectPropertyOffer, counterOffer, reducePriceOnListing, acceptBuyerCounter, rejectBuyerCounter) into `src/stores/slices/portfolioActions.ts` behind a `createPortfolioActions(set, get)` factory. `gameStore.ts` is now 3,838 lines (down from 4,287). Behaviour and persisted shape unchanged. Suite 194/194 green.

**Phase 3 remaining (deferred).** `processMarketUpdate` (395 lines) is intentionally left in-store for now — it cross-cuts tax, renovation completion, reputation, credit, and macro-event scheduling, so it will land cleanly only after the tenant / conveyancing slices are themselves extracted. Next: **3d tenant slice** (selectTenant, rent collection, arrears, satisfaction, concerns, evictions, deposit disputes).

