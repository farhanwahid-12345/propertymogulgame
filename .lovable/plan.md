
# Execution Plan — Lovable Improvements v5

13 items extracted from the document, grouped into 5 phases. Each phase ends in a shippable, green-tests state. `[#N]` maps to document item numbers.

---

## Phase 1 — Wire Up Dead Phase 6 Code & Fix Persist Version

The highest-leverage fix: three Phase 6 modules exist but nothing imports them, and saves silently skip migrations. Lands first so subsequent phases inherit deterministic RNG and a working migration path.

- **[#7a] Replace `Math.random()` in `gameStore.ts`** with `gameRandom()` from `src/lib/rng.ts`. Seed the RNG from a new persisted `rngSeed` field (auto-generated on first load).
- **[#7b] Replace inline probability literals** (`0.04`, `0.60`, `0.15`, etc.) in `gameStore.ts` with their named exports from `src/lib/engine/probabilities.ts`. Add any missing constants the store needs.
- **[#7c] Call `runMigrations()`** from `src/lib/migrations.ts` inside `migrateState()` in `gameStore.ts`. Move the inline ladder into the registry so there's a single source of truth.
- **[#8] Fix persist version mismatch** — bump `persist({ version: 12 })` to `version: 14` to match `CURRENT_VERSION`, so v12/v13 saves actually migrate.

## Phase 2 — Estate Agent & Rent-Negotiation Bug Fixes

Two surgical UI/state bugs that confuse players every session.

- **[#9] Itemised buying-cost breakdown in `estate-agent-window.tsx`** — render the already-calculated solicitor fee (£600), stamp duty, mortgage arrangement fee, and a Total additional costs line between price and the proceed button. Mirror the property-card layout.
- **[#10] Section 13 false-positive on flats/HMOs** — in `property-card.tsx` (~line 684), pass the matched tenant's `rentPennies / 100` (filtered by `propertyId` + `slotIndex`) as `currentRent` instead of `property.monthlyIncome`. Thread `slotIndex` through `applyRentIncrease` so the correct unit updates.

## Phase 3 — Landlord Reputation, Long-Term Goal & EPC Tutorial

UX/gameplay-direction items that surface existing mechanics.

- **[#1a] Reputation tied to investor loans** — reputation should only affect **investor loan size (cap) and rate**. Reflect this in the eligibility/mortgage calculation, and surface the relationship visibly on the Landlord Reputation panel (e.g. "Rep 44 → max £X at Y% APR").
- **[#1b] Reputation gain paths** — add positive triggers (e.g. on-time clean exits, long tenancies without concerns, completed renovations to standard/premium, paying off a mortgage). Reputation must be able to climb, not just fall.
- **[#4] Visible win condition / long-term goal** — add a real `goalTarget` (configurable per profile, e.g. £5M net worth or 10 owned properties) with a progress tracker in the UI. The current `HeroHeader` tier bar tracks levels; this is a single explicit endgame target with a "victory" state when hit.
- **[#6] EPC/MEES contextual tutorial** — first time a player encounters an E/F/G-rated property (at estate agent, auction, or in portfolio), fire a one-shot contextual tooltip/dialog explaining MEES enforcement (current Band E ban, 2030 Band C ban). Persist a `seenEpcTutorial` flag.

## Phase 4 — Multi-City Property Market & Title-Splitting Flats

The two largest mechanical additions. Done together because both touch property generation, valuation, and the property card.

- **[#3] Multi-city estate agent + auction**
  - City selector on estate agent and auction sub-menus.
  - Per-city configuration: value range, yield range, appreciation rate, type mix, authentic street-name dictionary.
    - Middlesbrough — £20k–£1M, 8–14% yield, slow appreciation (TS1 terraces → TS5 semis → TS7 detached + large commercial).
    - London — £250k–£50M, <5% yield, fast appreciation (flats → semis → detached → large commercial).
    - Manchester — £100k–£2M, 6–8% yield, medium appreciation (flats → detached → large commercial).
    - Leeds — £80k–£1.5M, 8–10% yield, medium appreciation (flats → detached → large commercial).
  - Per-city street-name banks; each generated property tagged with its `city` so cards display the right address.
  - Persist `city` on every property/listing; migrate existing properties to `'middlesbrough'`.
- **[#2] Title-split flats after house→flats conversion**
  - "Title split" action on a converted house's individual flat units in the renovation/property sub-menu.
  - Splitting a unit spawns a new standalone property card; remaining flats stay attached to the parent house.
  - Valuation: split flat values slightly higher per-unit than its in-house pro-rata; remaining house value adjusts down accordingly (whole > sum-of-parts pre-split, sum-of-parts > whole post-split).
  - When the last unit is split, the parent house property is removed.
  - Split flats incur leasehold ongoing costs: **service charge** 2–5% of value/year (random per-property) **+ ground rent** at peppercorn (£10) or 0.5% of value/year (chosen at split). Both surface in the cashflow breakdown.

## Phase 5 — Store Refactor + Store-Level Tests

Lands last because it touches the widest surface. Incremental, one slice at a time.

- **[#11/#12/#13] Split `gameStore.ts` into domain slices**
  - Migrate logic (not just selectors) from `gameStore.ts` into populated slice files under `src/stores/slices/`:
    - `renovationSlice.ts` (first — most self-contained)
    - `portfolioSlice.ts` (ownership, valuation, condition decay, sqft, EPC state)
    - `tenantSlice.ts` (placement, rent collection, arrears, satisfaction, concerns, eviction)
    - `financialSlice.ts` (cash, overdraft, credit, tax, P&L, mortgage tracking)
    - `conveyancingSlice.ts` (buy/sell lifecycle, chain collapse, completion)
    - `marketSlice.ts` (estate agent/auction generation, refresh, market trends — includes the new multi-city logic from Phase 4)
  - Top-level `gameStore.ts` becomes a thin Zustand composer combining the slices and owning only the monthly clock tick. Cross-slice access goes through shared `get()`.
  - Persisted shape stays identical to avoid forcing another migration.
  - **Verify the app boots and the full test suite stays green after each slice migration** before moving to the next.
- **[#5] Store-level tests for month-end & evictions** — add 10–15 tests in `src/stores/gameStore.test.ts` covering:
  - month-end cashflow (rent collection, mortgage debit, insurance, council tax, arrears deferral & lump-sum repay)
  - eviction state machine (serve → cooldown → tribunal appeal → upheld/overturned → deposit dispute)
  - credit-score transitions on missed payments and full repayments
  - conveyancing settlement happy path + chain collapse
  - all seeded via `withSeed()` from `rng.ts` for determinism.

---

## Cross-cutting technical notes

- **New persisted keys**: `rngSeed` (root), `goalTarget` + `goalAchievedAt` (root), `seenEpcTutorial` (root), `city` (Property + listings), `titleSplitOf` / `flatUnitId` (Property), `serviceChargePctAnnual` + `groundRentPennies` (Property, leasehold-only). One migration step per phase that introduces keys, registered in `src/lib/migrations.ts`.
- **No new third-party deps** expected.
- **Test budget**: each phase adds at least one regression test; full suite must stay green between phases. Phase 5 alone targets +10–15 tests.
- **RNG discipline**: from Phase 1 onward, all new probabilistic code uses `gameRandom()` / `withSeed()` — no raw `Math.random()` in `src/stores/` or `src/lib/engine/`.

Stopping here for your review — awaiting approval before starting Phase 1.
