
# Execution Plan — Lovable Improvements

Grouped into 6 phases. Each phase is independently shippable and leaves the app in a stable state. Items in `[#N]` reference the document.

---

## Phase 1 — Critical Financial Correctness (data integrity)

Fix all money/math bugs first so later UI work displays correct values.

- **[#3a/b/c] Net worth & cash flow audit**
  - Trace `useGameState` net worth, `usePortfolioMetrics`, and any duplicate math in components.
  - Reconcile: net worth = cash + Σ property value + Σ furniture residual + reno WIP + conveyancing cashHeld − total debt (mortgages + overdraft + portfolio facilities). Identify why current calc diverges (suspects: stale `marketValue` vs `value`, double-counting furniture, missing/extra overdraft, fee accruals).
  - Separate **Income** (gross rent) from **Cash Flow** (net of costs) in the UI labels and underlying selectors.
  - Add unit-level invariants (assert in dev) so regressions surface immediately.

- **[#8] Mortgage rate fidelity**
  - Audit mortgage signup → storage → display chain (`mortgage-provider-selector`, `gameStore` mortgage creation, `mortgage-management`).
  - Ensure the displayed rate on Manage Mortgages equals the rate at signup. If product is variable/base-rate-linked, store `spreadOverBase` and render `Base + spread = current` explicitly; if fixed, lock the rate for the fix term.

- **[#11] Renovation cost parity**
  - Quoted cost in `renovation-dialog` must equal cash actually debited in `gameStore` reno completion. Single source of truth in `src/lib/engine/renovation.ts`; UI reads from there.

- **[#13] Renovation value uplift recalibration**
  - Tighten reno ROI: target total spend + 5–80% random profit (skewed so ≥60% of renos profit). Adjust `getConditionValueUplift` and renovation completion uplift in `gameStore`.

## Phase 2 — Engine Isolation & Automated Tests [#14]

- Move every monetary calculation (net worth, cash flow, mortgage schedules, tax projection, furniture residual, reno P&L) into `src/lib/engine/financials.ts` (or sibling modules). UI components/hooks call pure functions only.
- Set up **Vitest** + scripts; add `tests/` colocated with engine modules.
- Cover: net worth composition, cash flow components, mortgage amortization (fixed & variable), Section 24 tax, CGT, corp tax, furniture depreciation, conveyancing cash held, condition drift, renovation cost/uplift.
- Use Phase 1 reconciliation cases as fixtures so the bugs cannot regress.

## Phase 3 — Sqft, EPC & Furniture Mechanics

- **[#4] Sqft preservation on extensions/conversions**
  - Audit `gameStore` renovation completion paths. Extensions must **add** to `internalSqft`/`plotSqft`; conversions must redistribute units **without reducing original sqft**. Add tests in Phase 2 fixtures.

- **[#1] EPC dropdown in renovation dialog**
  - `renovation-dialog.tsx`: EPC selector (A–G) with cost scaling per band jump.
  - Persist on `property.epcRating`; feed into `value` (multiplier in `getConditionValueUplift`-style helper) and rent calc in `getMarketRentPounds`.
  - Property card already shows EPC badge — ensure it updates live.

- **[#6] Furniture in market-rent comparable**
  - `getMarketRentPounds`: when comparing, treat furnished comparables' rent uplift via `getFurnishingRentMultiplier`. Surface "Furnished comparable" line in `rent-negotiation-dialog`.

## Phase 4 — UI Polish

- **[#2a] Shorter property cards** — reduce vertical padding, collapse more by default, hide tenant block behind toggle when collapsed. Target ≤220px collapsed height so 1×3 fits 734px viewport without scroll.
- **[#2b] Button label fit** — ensure "Propose Rent Increase" etc. fit (truncate vs wrap vs shorten label "Propose Rent ↑").
- **[#9] Card label** — replace "Equity" callout with "Market Value Gain" (= marketValue − purchasePrice).
- **[#10] Estate agent sorting** — add sort dropdown: Price / Yield / Base Rent (asc/desc).
- **[#12] Multi-tenant collapse** — tenant list collapsible like "Details"; flash/pulse tenant row when satisfaction low or concern open.
- **[#7] Failed-purchase toast + chime** — emit toast + play `playSound` on chain collapse / mortgage rejection / insufficient funds.
- **[#5] Phantom tenant concerns** — audit concern generator vs Operations Center list; ensure concerns that expire/resolve also clear the badge counter; dedupe by id.

## Phase 5 — Architecture Refactor

- **[#15] Component directory cleanup**
  - Create `src/components/game/`. Move game-specific components (`estate-agent-window`, `conveyancing-tracker`, `portfolio-mortgage`, `mortgage-management`, `mortgage-refinance`, `tenant-concerns-feed`, `property-card`, `renovation-dialog`, `furnishing-dialog`, `auction-*`, `eviction-*`, `rent-negotiation-dialog`, etc.) out of `ui/`.
  - Keep only shadcn primitives in `ui/`. Update all imports.

- **[#16] Zustand slice split**
  - Slices: `portfolioSlice`, `bankingSlice` (mortgages, overdraft, credit), `marketSlice` (listings, macro), `tenantSlice`, `taxSlice`, `timeSlice` (clock/speed), `notificationsSlice`.
  - Compose into root store; preserve persisted shape (write migration if keys move).
  - Update selectors/hooks; ensure `useGameState` adapter still returns the pounds-converted facade.

## Phase 6 — Performance: Worker & Saving

- **[#17] Worker optimization**
  - `gameClock.worker.ts` posts only `{type: 'tick', month, speed}` events. Remove state shipping across boundary.
  - Tick handler on main thread runs engine mutations via store actions.

- **[#18] Debounced save + render hygiene**
  - After slicing, re-verify `debouncedSave` snapshots every slice.
  - Audit subscribers: use `useStore(selector, shallow)` to prevent full-app rerenders on each tick.
  - Confirm `beforeunload` flush still fires; add test snapshot of persisted shape.

---

## Technical notes

- Phases 1 & 2 are coupled — write the test in Phase 2 immediately after each Phase 1 fix to lock it.
- Phase 5's slice split happens after engine isolation so slices import pure functions, not duplicate math.
- Persisted-state migrations needed in: Phase 3 (EPC field already exists), Phase 5 (slice key reshape).
- No new dependencies except `vitest` + `@testing-library/react` (Phase 2).

Awaiting approval before starting Phase 1.
