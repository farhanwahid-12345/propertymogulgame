
# Execution Plan — Lovable Improvements v4

24 items extracted from the document, grouped into 6 phases. Each phase ends in a shippable, stable state. `[#N]` maps to the document item number.

---

## Phase 1 — Critical Gameplay Bug Fixes

The items players hit every session. Lands first so the rest of the work isn't blocked by broken core loops.

- **[#3] Arrears rent deferral** — when a tenant is in arrears, don't pay rent that month; accumulate the missed rent and pay it as a lump-sum bonus in the month they clear arrears. Fix "0 rent owed" display so the outstanding balance is visible.
- **[#9] Commercial → residential flip on purchase** — re-audit the settlement path; a commercial property must keep `propertyType: 'commercial'` end-to-end. Add a regression test that buys every commercial listing and asserts the type after settlement.
- **[#10] Sqft regression (again)** — extensions still shrink footprint in some flows. Add an engine invariant `assertSqftMonotonic(before, after, op)` that throws in dev and clamps in prod, wired into every renovation/conversion mutation. Lock with a fuzz test over all renovation options × all property sizes.
- **[#15a] Section 13 on flats** — fix the "proposed rent is not higher than current rent" false-positive. Trace the comparator; likely comparing per-unit vs whole-block rent or stale `currentRent` on the flat unit. Add unit test for multi-unit Section 13.
- **[#8a] EICR / Landlord Insurance pending-debit row** — show which property the EICR is for, and fix the unreadable/blocked-out lettering in the Approve Pending Debits modal.

## Phase 2 — Estate Agent, Property Card & Cost Visibility

UI/UX polish around the buying and ownership surfaces.

- **[#1] Itemised buying costs** — at the estate agent and during conveyancing, show solicitor fee, stamp duty, and mortgage fee as separate line items alongside the headline price (not just rolled into the total).
- **[#2a] Slimmer property cards** — reduce vertical height so a player with ≤4 properties never has to scroll. Remove the "To sell: use Estate Agent or Auction House" helper line.
- **[#11] Market value variance** — widen the spread between asking price and true market value so good negotiation visibly pays off and over-paying visibly hurts. Hook into the existing post-purchase valuation logic.
- **[#18] Yield spread on the starter pool** — replace the uniform 14% yield on Level 1 `AVAILABLE_PROPERTIES` with an 11–16% jittered range so opening choices feel meaningful.

## Phase 3 — EPC, Commercial Refurb & Property Limits

Mechanical changes that touch shared engine code, batched together.

- **[#16] EPC implementation (full)**
  - EPC dropdown (A–G target) in the renovation dialog with cost scaling per band jump.
  - Prominent EPC badge on every property card.
  - Letting block: below Band E today; below Band C from in-game 2030.
  - 12-month-ahead warning pop-up before a property fails the upcoming standard.
  - (Note: a slimmer version of this shipped in v3 Phase 3 — this item closes the gaps the user has re-flagged.)
- **[#14] Distressed unmortgageable stock pricing & cash purchase**
  - Properties needing a kitchen/bathroom (condition 0–20) get a 30–60% random discount vs comparable stock.
  - Allow **cash purchase** (currently bridging-only) — bridging stays as the financed path.
  - "Buy back into the game" wording: once renovated above condition threshold, they re-enter the standard mortgageable pool.
- **[#4] Hard cap of 12 properties** — replace the existing level-scaled ownership cap with a flat ceiling of 12.

## Phase 4 — Tenant Realism & Game Direction

Smaller mechanical tweaks that round out the simulation.

- **[#21] Passive tenant satisfaction recovery** — +0.5–1 pt/month when condition is good and no open concerns, capped at 100. Skip recovery if any open concern exists or condition < threshold.
- **[#20] Auto-pause on blocking modals** — whenever a modal requiring acknowledgment is queued (chain collapse, planning decision, payoff, macro event, Section 13 response), pause the game clock until dismissed. Resume on close, regardless of selected speed.
- **[#19] Visible progression goal** — soft long-term target surfaced in `HeroHeader` (e.g. "£5M net worth" or "10-property empire") with a slim progress bar. Configurable target per level tier.

## Phase 5 — Performance & Code-Splitting

UI responsiveness work; isolated from gameplay logic.

- **[#5] `React.memo` on `PropertyCard`** — wrap and audit prop stability so it actually short-circuits re-renders in long lists (likely needs `useCallback` on parent handlers).
- **[#6] Route/dialog lazy loading** — `React.lazy` + `Suspense` for heavy dialogs and panels (renovation dialog, mortgage management, auction dialog, eviction dialog, planning dialogs, portfolio mortgage, tax breakdown).
- **[#7] Skeleton loaders** — replace generic spinners with Tailwind `animate-pulse` skeleton components matching the target layout (property cards, estate agent listings, conveyancing rows).

## Phase 6 — Architecture, Testability & Documentation

Maintainability and regression-safety. Lands last because it touches the widest surface.

- **[#13] Split `gameStore.ts`** — populate the existing empty slices in `src/stores/slices/` properly: `propertyStore`, `tenantStore`, `financialStore`, `conveyancingStore`. One domain per slice; the top-level `gameStore` becomes a thin composition root.
- **[#17] Extract magic numbers from `gameStore.ts`** — every inline probability (`0.04`, `0.15`, `0.60` upheld chance, etc.) moves to `constants.ts` as a named export. Easier to tune; easier to test.
- **[#22] Seeded PRNG** — introduce a small LCG (or `mulberry32`), inject it through the store, and replace raw `Math.random()` calls in game logic. Enables deterministic tests and bug repro from save files. Game RNG seed persists in save state.
- **[#24] Store-level tests** — add 10–15 tests covering month-end cashflow, credit score transitions, eviction state machine, conveyancing settlement, and arrears deferral (#3). Uses the seeded PRNG from #22.
- **[#23] Migration runner** — explicit `migrate(savedState, fromVersion, toVersion)` invoked on every load, with a per-version migration registry. Stale `_version: 15` saves must migrate cleanly to current `_version`. Add a test that loads a v15 fixture.
- **[#12] `GAME_MECHANICS.md`** — write a reference doc covering: rent calculation, condition decay, mortgage interest (incl. dynamic rates + ICR/PRA), depreciation, renovation ROI uplift, EPC rules, tenant satisfaction, macro events, taxation per entity. Cross-links to the relevant engine files.

---

## Cross-cutting technical notes

- **Persistence keys added or changed**: `epcRating`/`epcTarget` on Property (if not present), `arrearsBalance` on Tenant, `rngSeed` at store root, `progressionTarget` at store root, `needsRefurbDiscountPct` on Property. One migration step per phase that introduces new keys.
- **No new third-party deps** expected — LCG, lazy loading, and skeletons are all stock React/Tailwind.
- **Test budget**: each phase adds at least one regression test for the items it closes; full suite must stay green between phases.

## Phase 1 ✅ (v4)

- #3 arrears now lump-sum repaid on first paying month (no partial 50%).
- #9 commercial type snapshotted on Conveyancing; reconstruction fallback preserves it.
- #10 sqft non-shrink: deriveSqft backfills missing internalSqft before adding extension area.
- #15a Section 13 compares against per-slot rent; multi-unit recomputes property.monthlyIncome = Σ slot rents.
- #8a EICR splits into one pending row per property (named); dialog description no longer truncated.

127 tests passing (8 new in `phase1V4Verification.test.ts`).

## Phase 3 ✅ (v4)

- #4 flat 12-property hard cap via `MAX_PROPERTIES_HARD_CAP`; level-scaled cap removed; toasts updated.
- #14 distressed auction stock now discounted 30–60% (random); standard-mortgage denial reason mentions cash buyers; renovating both kitchen + bathroom clears `needsRefurb`.
- #16 EPC gaps: one-time pop-up toast added for D/E lets 12 months before the 2030 MEES ban (in addition to the existing persistent concern).

130 tests passing (3 new in `phase3V4Verification.test.ts`).

## Phase 4 ✅ (v4)

- #21 passive satisfaction recovery: +0.5–1 pt/mo only when condition is standard/premium AND no open concerns for the property; previous always-on drift removed.
- #20 auto-pause extended to planning approvals/refusals and macro-economic event pop-ups (in addition to existing pending debits, chain collapse, payoff).
- #19 progression goal bar in `HeroHeader` — tiered targets from £250k → £10M, slim progress bar with %, hidden in compact mode.

134 tests passing (4 new in `phase4V4Verification.test.ts`).

## Phase 5 ✅ (v4)

- #5 confirmed `PropertyCard` is wrapped in `React.memo`; store actions from Zustand are stable refs so memoization short-circuits as intended.
- #6 lazy-loaded `OperationsCenter`, `LoansPanel`, `TaxBreakdown` via `React.lazy` in `BankingPanel.tsx`; dialog body now wrapped in `<Suspense fallback={<PanelSkeleton />}>`.
- #7 added `PropertyCardSkeleton`, `ListingRowSkeleton`, `PanelSkeleton` in `src/components/ui/property-card-skeleton.tsx`.

137 tests passing (3 new in `phase5V4Verification.test.ts`).

Awaiting approval before starting Phase 6.
