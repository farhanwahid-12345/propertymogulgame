# Execution Plan — Lovable Improvements v3

17 distinct items extracted from the document, grouped by subsystem into 6 phases. Each phase ends in a shippable, stable state. `[#N]` maps to the document item number.

Note: items 1, 5, 6, 8, 9, 15a reference screenshots that didn't extract — interpretation is based on context and the project's recent v2 work. I'll confirm targets during implementation.

---

## Phase 1 — Cash Safety & Notification Polish (low-risk wins)

Tightens the money-approval flow before larger mechanics land on top.

- **[#3, #14] Overdraft phantom usage & approval gate** — audit every cash-debit path (renovations especially). Block any debit that would push cash negative unless the user explicitly approves overdraft use via the pending-transactions modal. Add invariant: `cash >= 0` after non-approved debits.
- **[#2] Annual landlord insurance** — switch insurance from monthly silent debit to a single yearly charge, gated by the approval modal, with a notification one in-game month ahead.
- **[#4] Loan / mortgage payoff pop-up** — fire a modal (not just a toast) when any mortgage or loan reaches zero balance.
- **[#7] Notifications history tab** — scrollable history feed in the notifications panel covering renovations (cost + value gain), purchases, and sales.

## Phase 2 — Estate Agent, Listings & Section 13 Corrections

- **[#1] Action-row layout** — move the relocated functions back inline with the other actions in a single row (revert the Phase-5/v2 split).
- **[#5] Property-card text cleanup** — delete the text the user flagged under property cards (confirm exact string during implementation; likely the "ERV" helper line).
- **[#8a] "0 days listed" bug** — `listingMonth` isn't being read on render; fix counter so days-listed increments per game month.
- **[#8b] Withdrawn-offer ghosts** — when an offer is withdrawn at the estate agent, remove it from the offers list everywhere (currently still appears in the secondary view).
- **[#9a] Section 13 market rent floor** — local market rent comparator is unrealistically low; recompute against current rent + neighbourhood baseline so the proposed rise is realistic.

## Phase 3 — Renovation, Sqft & EPC Mechanics

- **[#6a] Sqft additivity (third attempt)** — extensions must strictly `internalSqft += sqftAdded`; conversions must never shrink footprint. Add regression test reproducing the "900 → 120 sqft" bug and lock with engine invariants.
- **[#10] Planning while occupied** — allow planning submission with a sitting tenant; block only the physical renovation start until vacant.
- **[#12] Renovation ROI uplift +25%** — scale `valueMult` / rent uplift on every renovation option so realised ROI averages ~25% higher; keep neighbourhood ceiling cap intact.
- **[#15 main] EPC dropdown + card badge + legislation timeline**
  - EPC target dropdown (A–G) in renovation dialog with cost scaling per band jump.
  - Prominent EPC badge on every property card.
  - Letting block: properties below Band E today and below Band C from in-game 2030 cannot be let.
  - 12-month-ahead pop-up warning for properties not meeting the upcoming standard.

## Phase 4 — Tenant Risk, Eviction Realism & Commercial Overhaul

- **[#11] High-risk tenant frequency + Section 8/21 realism**
  - Double the per-month probability of arrears / ASB for high-risk tenant profiles.
  - Enforce Section 8 vs Section 21 distinctions (grounds, notice periods).
  - On notice served, queue a 3–6 month court-backlog void instead of instant removal.
- **[#13] Commercial property fixes & FRI leases**
  - Bug fix: commercial properties must not flip to residential on purchase.
  - FRI logic: tenant covers maintenance + insurance; lower gross yield; fewer ops pop-ups.
  - Fixed-term commercial leases (e.g. 5/10 yr) with a renewal/negotiation pop-up 6 months before expiry.
- **[#15a] Commercial use-class differentiation** — split commercial into standard retail (E-class) vs Sui Generis (hot food takeaway / betting shop) with distinct yield + friction profiles.

## Phase 5 — Auction Bridging & Portfolio Landlord (PRA) ✅

- **[#16] Unmortgageable auction stock + bridging finance** — `needsRefurb` flag on Property; ~40% of fresh auction stock tagged with a discounted price + "Needs full refurb — bridging only" badge. Standard BTL eligibility refuses these. New `takeBridgingLoan(propertyId, amount)` store action issues a 12-month, interest-only loan at 12% APR (≈1%/mo), capped at 70% LTV. Monthly tick services interest, applies a one-shot credit −80 + rate jump on expiry default.
- **[#17] Portfolio Landlord threshold (PRA)** — eligibility now accepts `mortgagedPropertyCount`; portfolio stress-test fires at 4+ mortgaged properties and the rejection message is prefixed `Portfolio Landlord (PRA):`. Legacy `ownedPropertyCount >= 3` fallback retained so older callers keep their behaviour.


## Phase 6 — Verification & Regression ✅

- Added `src/lib/phase6Regression.test.ts` covering:
  - #12 — renovation ROI +25% uplift constant & rounding.
  - #15 — MEES letting block matrix (F/G always, D/E from month 60) + 12-month warning window.
  - #11 — Section 8/21 court-backlog effective-month range (3–6mo on top of statutory notice).
  - #16 — bridging lifecycle math: 1%/mo interest, 70% LTV cap, expiry default (-80 credit, +6% rate), 12-month total cost.
- Existing locks retained:
  - Sqft additivity (`phase3Verification.test.ts`).
  - PRA stress-test + refurb refusal (`phase5Verification.test.ts`).
  - Furniture realism + days-on-market + dynamic yield (`phase6Verification.test.ts`).
  - Persisted-shape snapshot (`persistedShape.test.ts`).
- Full suite: **119 tests, all green**.

- Manual QA checklist 1-to-1 against items 1–17.
- Persistence audit for new state keys: `insurancePaymentMonth`, `notificationsHistory`, `epcDeadlineWarnedAt`, `commercialLease`, `useClass`, `bridgingMortgage`, `portfolioLandlordStatus`.

---

## Technical notes

- Phases 1–2 are small and ship fast; Phase 3 reopens the renovation engine so it should land as one batch.
- New persisted keys per phase — write one migration per phase, not per feature.
- No new third-party dependencies expected.

Awaiting approval before starting Phase 1.