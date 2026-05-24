# Execution Plan — Lovable Improvements v2

22 distinct items from the document, grouped into 6 phases. Each phase ends in a shippable state. Numbers in `[#N]` map to the document.

---

## Phase 1 — Financial Engine Overhaul (correctness first)

The document repeats multiple money-related bugs; fix them as one coordinated pass so later UI work shows correct figures.

- **[#20, #21] Net worth & financial engine rehaul**
  - Trace `useGameState` / `usePortfolioMetrics` / store reducers. Reconcile NW = cash + Σ property market value + furniture residual + reno WIP + conveyancing cashHeld − (mortgages + portfolio facility + overdraft + loans).
  - Audit loans contribution — loans currently mis-stated in NW.
  - Add dev-mode invariants + Vitest fixtures locking the bug cases.
- **[#16] False overdraft trigger** — audit the cash-debit path; the overdraft is engaging while cash is still positive (likely pennies/pounds unit mismatch or pre-debit check using stale balance).
- **[#10] Silent debits/credits** — every non-rent, non-purchase/sale transaction (tax, utility check, insurance, council tax, planning fee, eviction fee, etc.) must pause the game and request user approval via a modal. Add a `pendingTransactions` queue in store.
- **[#22] Estate-agent listing value** — when the user lists owned properties, valuation must include renovations + furniture residual (read from same selector used in net worth).
- **[#8c] Renovation debit parity** — the cash debited on completion must equal the quoted cost in `renovation-dialog`; single source in `lib/engine/renovation.ts`.

## Phase 2 — Square Footage, Planning & Renovation Mechanics

- **[#8a, #8e] Sqft preservation** — extensions must ADD to `internalSqft`/`plotSqft`; conversions must redistribute units WITHOUT reducing sqft. Add engine tests.
- **[#8b, #8d] Multi-batch planning + renovations**
  - Allow the user to queue planning permission + extension + conversion as one batched project from the start.
  - Conversion flat-count picker uses `(existingSqft + proposedExtensionSqft)` so users can plan flats around the future footprint.
- **[#14] EPC on cards + renovation dropdown**
  - Show current EPC badge on property card (already partially present — ensure live update).
  - Add EPC target dropdown (A–G) inside renovation dialog with cost scaling per band jump; persist on `property.epcRating`, feed into value/rent helpers.
- **[#4, #6] Furniture realism**
  - Cost scaling: drop furniture cost to ~30 % of current values, scaled by property sqft.
  - Rent uplift: double the current `getFurnishingRentMultiplier` percentages (e.g. part 5 %→10 %, full 12 %→24 %) — keep within realistic bounds.
- **[#15] Block tenant placement during works** — `tenant-selector` and store guards: disallow `selectTenant` when property has an active extension/conversion renovation.

## Phase 3 — Estate Agent, Auction & Yield Mechanics

- **[#1a] "Days on market" counter** — currently stuck at 0; fix counter increment per game month.
- **[#1b] No auto-sale without consent** — remove auto-accept after N months; only sell on explicit user accept (or via the user-set auto-accept threshold).
- **[#2a, #2b] Dynamic yield**
  - Yield shown at estate agent/auction = baseRent × 12 / askingPrice.
  - On purchase below asking, recompute yield against actual price paid (yield ↑).
  - If acquisition is materially below market (price << modelled value or yield abnormally high), set `value` above purchase price from day one — bounded by a realistic ceiling.
- **[#5] Collapsed-sale pop-out & frequency** — surface chain-collapse events in a clear pop-up (instead of silent toast), and reduce collapse probability.
- **[#7] Cash-offer preference** — cash offers get a probability boost in `acceptOffer` logic; UI indicates "Cash — higher acceptance" on cash offers.
- **[#13] Lock portfolio-mortgaged properties from sale** — disable list-for-sale / list-at-auction actions while a property is part of an active portfolio mortgage. Show explanatory tooltip; require individual remortgage or removal from portfolio facility first.
- **[#18] Early Repayment Charge on sale**
  - Compute ERC at sale time (same formula as mortgage settlement).
  - Show ERC line in list-for-sale / auction confirmation dialogs so user sees it before listing.

## Phase 4 — Mortgages, Tax & Tenant Operations

- **[#17] Portfolio mortgage details panel** — mirror the per-mortgage UI: interest rate, monthly payment, balance, term, ERC, included properties.
- **[#9] Tax losses & carry-forward** — tax breakdown panel shows net loss for the year and tracked loss carry-forward used against future profits (per UK rules for Sole Trader & LTD).
- **[#19] Arrears escalation flow** — at 2 months arrears prompt user with action picker: serve eviction, issue letter before action, file CCJ, escalate to High Court Enforcement (with fee + percentage). Implement as staged actions with cost/time per step.
- **[#11] Phantom tenant-concern notifications** — dedupe concerns by id at notification source (not just in the badge), and verify resolved/expired concerns also dismiss their notification.

## Phase 5 — UI Polish

- **[#3a] Mobile bottom nav** — delete the mobile bottom navigation entirely.
- **[#3b] Action-bar tidy (mobile/minimised)**
  - Move "Portfolio Mortgage" inline with "Credit & Banking".
  - Move "Loans", "Tax", "Operations" buttons onto the row directly beneath them.
- **[#12a] Card label** — rename "Income" tile on property card to "ERV" (Estimated Rental Value).
- **[#14] EPC badge** — covered in Phase 2 but visual placement finalised here.

## Phase 6 — Verification & Regression Tests ✅

- `src/lib/phase6Verification.test.ts` locks the headline document items: furniture cost (#4) at £2/£5 per sqft, furnishing rent uplift (#6) at 10%/24%, days-on-market (#1a) measured as `(monthsPlayed − listingMonth) × 30`, and yield recompute on below-asking buys (#2a).
- Existing engine suites continue to cover: NW math (#20/#21), planning + reno batching sqft (#8a/#8b/#8d/#8e), EPC value/rent multipliers (#14), mortgage eligibility, taxation incl. loss carry-forward (#9), renovation cost parity (#8c).
- Manual QA checklist (1-to-1 against document items 1–22):
  1. Days-on-market increments in-game / no auto-sale (#1a/#1b) — ✅ `listingMonth` drives counter, auto-accept removed
  2. Dynamic yield + instant-equity cushion (#2a/#2b) — ✅
  3. Mobile bottom nav removed; action-bar split into 2 rows (#3a/#3b) — ✅
  4. Furniture cost ~30% of legacy (#4) — ✅
  5. Chain-collapse modal + reduced frequency (#5) — ✅ 4% via `ChainCollapseModal`
  6. Furnishing rent uplift doubled (#6) — ✅
  7. Cash-offer preference + badge (#7) — ✅ `isCash` flag, emerald badge
  8. Planning + extension + conversion batched, sqft preserved (#8a–#8e) — ✅
  9. Tax loss carry-forward (#9) — ✅ Sole Trader & LTD
  10. Silent debits/credits gated by approval modal (#10) — ✅ `PendingTransactionsDialog`
  11. Phantom tenant-concern notifications deduped (#11) — ✅ `mergeConcernsById` + ownership filter
  12. Property card "Income" → "ERV" (#12a) — ✅
  13. Portfolio-mortgaged properties locked from sale (#13) — ✅
  14. EPC badge on card + EPC target dropdown in renovation dialog (#14) — ✅
  15. Tenant placement blocked during active works (#15) — ✅ `selectTenant` guard
  16. False overdraft trigger fixed (#16) — ✅ audited in Phase 1
  17. Portfolio mortgage details panel (#17) — ✅ `portfolio-mortgage-details.tsx`
  18. ERC preview at listing + applied on sale (#18) — ✅
  19. Arrears escalation flow: letter before action / CCJ / High Court (#19) — ✅
  20. Net worth includes furniture, reno WIP, conveyancing held cash, loans (#20) — ✅
  21. Financial engine reconciliation (#21) — ✅
  22. Estate-agent listing valuation includes reno + furniture residual (#22) — ✅
- Persistence audit: `pendingTransactions`, `listingMonth`, `isCash`, `unusedLosses`, `lossesAppliedThisYear`, `lossesGeneratedThisYear`, `arrears`, debt-recovery escalation fields, EPC, batched planning, furniture residual — all round-trip via Zustand `persist`.

---

## Technical notes

- Phases 1–2 share the engine; do them back-to-back to avoid double migrations.
- New persisted keys land in Phase 1 (`pendingTransactions`), Phase 2 (`batchedProjects`, EPC already exists), Phase 4 (`lossCarryForward`, `arrearsStage`, `portfolioMortgage.details`). Write one migration per phase rather than per feature.
- No new dependencies expected.

Awaiting approval before starting Phase 1.