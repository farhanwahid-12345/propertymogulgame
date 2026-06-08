# Execution Plan — Complete the Monolithic Store Split

The attached doc lists **one outstanding item**: finish the `gameStore.ts` split. It breaks down into three sequenced steps. Each phase ends with a green test suite (currently 194/194) before the next begins. Persisted save shape stays unchanged throughout.

---

## Phase 1 — Extract `processMonthEnd` into `monthEndActions.ts` (highest priority)

`processMonthEnd` is ~2,056 lines and 69% of `gameStore.ts`. This is the single biggest win.

**Steps**
1. Create `src/stores/slices/monthEndActions.ts` exporting `createMonthEndActions(set, get)`, mirroring the existing slice pattern (`renovationActions.ts`, `orchestratorActions.ts`).
2. Move the `processMonthEnd` body **verbatim** — no logic, variable, or shape changes. Pure relocation.
3. Convert any direct `this`/closure references into `get()` reads and `set(...)` writes, matching how `orchestratorActions.ts` does it.
4. In `gameStore.ts`, import and spread: `...createMonthEndActions(set as any, get as any)`.
5. Run full suite; manual smoke in preview (buy → let → tick a month → evict).

**Exit criteria**: 194/194 green, `gameStore.ts` drops by ~2,000 lines.

---

## Phase 2 — Complete `conveyancingActions.ts`

Currently only `withdrawFromConveyancing` (55 lines) lives there. The full sale/listing lifecycle is still inline.

**Sub-phase 2a — Sale completion handlers**
- Migrate `handleEstateAgentSale`, `handleAuctionSale` (these touch conveyancing hand-off and cashflow on completion).

**Sub-phase 2b — Listing lifecycle**
- Migrate `listPropertyForSale`, `cancelPropertyListing`, `updatePropertyListingPrice`, `reducePriceOnListing`.

**Sub-phase 2c — Offer & counter flow**
- Migrate `addOfferToListing`, `rejectPropertyOffer`, `counterOffer`, `acceptBuyerCounter`, `rejectBuyerCounter`.

> Note: these currently live in `portfolioActions.ts` per the prior phase 3c. The doc explicitly asks them to be regrouped into `conveyancingActions.ts` since they drive the sale conveyancing flow. Confirm with a quick smoke (list → receive offer → counter → accept → conveyancing → completion) after each sub-phase.

**Exit criteria after 2c**: `gameStore.ts` contains only — initial state object, persist config, slice imports + spreads, `clockTick` (calling `processMonthEnd` + `processMarketUpdate`), and `resetGame`. Suite still 194/194.

---

## Phase 3 — Populate the four state-shape slice files

Lower priority; finishes the intended architecture. Each file gains selectors + any state-initialisation helpers for its domain.

**3a — `portfolioSlice.ts`**: selectors for `ownedProperties`, property lock helpers, EPC band selectors.

**3b — `tenantSlice.ts`**: selectors for `tenants`, arrears helpers, satisfaction selectors.

**3c — `marketSlice.ts`**: selectors for `estateAgentProperties` and `auctionProperties`, plus market-trend selectors.

**3d — `bankingSlice.ts`**: selectors for `cash`, `overdraft`, `creditScore`, `mortgages`, `loans` (extend the existing thin file).

For each: add the selectors, refactor a couple of consuming components to use them (sanity-check ergonomics), keep the rest as a follow-up. Tests stay green.

---

## Target end state

- `gameStore.ts` < 300 lines: state shape + persist config + slice composition + `clockTick` + `resetGame`.
- All domain logic owned by slice files.
- Persisted save shape unchanged (no migration bump).
- 194/194 tests green at every phase boundary.

---

## Technical notes

- Follow the existing factory signature: `export function createXxxActions(set: SetFn, get: GetFn) { return { ... } }`.
- Cross-slice reads via `get()` only — no direct slice-to-slice imports.
- No new third-party deps. No new persisted keys.
- Stopping point after each sub-phase (1, 2a, 2b, 2c, 3a, 3b, 3c, 3d).

Awaiting your approval before starting Phase 1.
