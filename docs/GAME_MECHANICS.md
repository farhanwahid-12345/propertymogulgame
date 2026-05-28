# Game Mechanics Reference

A single source of truth for the simulation rules wired through `src/lib/engine/*`
and `src/stores/gameStore.ts`. Numbers here may be tuned in the linked file —
this doc tracks the *shape* of each system rather than every literal.

> All monetary values inside the engine are stored as **integer pennies**
> (`src/lib/formatCurrency.ts`). UI converts to pounds at the boundary.

---

## Time

- 1 in-game month = **180 real seconds** at 1× speed
  (`MONTH_DURATION_SECONDS` in `engine/constants.ts`).
- Player-selectable speed: 0.5× / 1× / 2× / 4× via `gameSpeed` on the store.
- Driven by a Web Worker (`workers/gameClock.worker.ts`) so the clock keeps
  running when the tab is backgrounded.
- Game pauses automatically when blocking modals are queued: pending debits,
  chain-collapse, payoff events, planning decisions, macro events.

## Rent

Computed in `src/lib/tenantRent.ts`.

- Base rent comes from the property listing (`monthlyIncome`) at purchase.
- Tenant profile applies a `rentMultiplier` (premium ≈ 1.15, standard 1.0,
  budget 0.9, risky 0.8).
- Furnishing multiplier: unfurnished 1.0, part-furnished 1.10, fully 1.24.
- **Annual cap**: 3% YoY for sitting tenants (UK rent control).
- **Section 13**: raises above the auto-cap go through a negotiation dialog
  (propose → counter → tribunal). Tribunal upheld 60% / overturned 40%.
- Auto-increases on month rollover **skip occupied properties**; only
  Section 13 or tenant turnover changes rent on a let property.

## Condition & Decay

Continuous 0–100 score per property (`conditionScore`).

- Tier mapping (`conditionTierFromScore`): ≥80 premium, ≥45 standard, else
  dilapidated.
- Monthly decay = `BASE_CONDITION_DECAY × TENANT_WEAR_MULTIPLIER[profile]`.
- Neglect alone won't drop a property below `CONDITION_DECAY_FLOOR (5)`;
  only damage events can.
- Top-ups cost `CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT` and are capped at
  `MAX_TOPUP_POINTS_PER_MONTH` per property per month.

## Tenant Satisfaction

- Range 0–100. Starts at ~70 on move-in.
- **Passive recovery**: +0.5 to +1.0 pt/month *only* when condition is standard
  or premium and the property has no open `tenantConcerns`.
- Tenant concerns generate monthly, with 1–2 month grace before satisfaction
  begins to decay. UI shows countdown vs decay badge.
- Satisfaction 0 → guaranteed walkout next month.
- Satisfaction < 25 → 8% monthly walkout chance.

## Mortgages

`src/lib/mortgageEligibility.ts` + `src/lib/engine/financials.ts`.

- 5 lenders ranked by rate / max-LTV / minimum credit score (HSBC → Easy
  Finance Ltd). Live rates fluctuate ±1.5% around `currentMarketRate`.
- ICR (interest coverage) stress test gates approvals; 125% for portfolio
  loans.
- Fixed-term products carry a sliding **ERC** (`computeErcRate` in
  `engine/constants.ts`): 2-yr {3,2}, 5-yr {5,4,3,2,1}, 10-yr {6,5,4,3,2,1,…}.
- Portfolio mortgages unlock at 3+ properties; collateral is bundled.
- Equity extraction via `mortgage-refinance` — releases capital without a
  cash match.

## Depreciation

- Furniture is an asset, included in net worth, depreciated **straight-line
  over 60 months** to zero.
- Property value follows monthly drift ~3%/yr with frequent dips
  (`MARKET_DIP_PROB`). Per-tick clamp ±6%.
- Soft ceiling at 2.5× purchase price on booked value; hard ceiling per
  postcode/type in `NEIGHBORHOOD_CEILINGS`.

## Renovations

`src/lib/engine/renovation.ts` + `src/components/game/renovation-dialog.tsx`.

- Categories: maintenance, improvement, extension, conversion.
- One major renovation per property at a time.
- Major works require planning permission (`engine/planning.ts`): fee, 2–3
  month wait, probabilistic outcome, 6-month cooldown on refusal.
- Value uplift tapers as the property approaches its
  `NEIGHBORHOOD_CEILINGS` cap.
- Distressed (`needsRefurb`) stock clears the flag once both
  `kitchen_upgrade` and `bathroom_renovation` complete, re-entering the
  mortgageable pool.

## EPC / MEES

- Every property carries an `epcRating` A–G. Band defaults from condition
  (`defaultEpcForCondition`): premium → B, standard → D, dilapidated → F.
- Renovation dialog has an EPC target dropdown; cost scales per band jump.
- Letting blocks:
  - **Today**: below Band E (i.e. F or G) cannot be let.
  - **From in-game 2030 (month 60)**: below Band C cannot be let.
- A one-time pop-up fires 12 months before the 2030 deadline for occupied
  D/E lets, in addition to the persistent tenant concern.

## Macro Events

`engine/market.ts`. Fire every 8–16 months with weighted small/no-op
outcomes (interest-rate shock, bank failures, regulation tweaks, etc.).
Each event pauses the clock until acknowledged.

## Taxation

`src/lib/engine/taxation.ts`. Dual UK regime:

- **Sole Trader**: income tax bands + Class 2/4 NIC; rental profit on the
  self-assessment cycle (April–April).
- **Limited Company**: 19% corporation tax; mortgage interest fully
  deductible (vs Section 24 restrictions for sole traders).
- Losses carry forward and offset future profit within the same entity type.

## Persistence & Migrations

- Zustand `persist` middleware writes through `createDebouncedStorage`
  (2 s debounce + `beforeunload` flush) so a tick mid-write isn't lost.
- Save shape carries `_version`. `migrateState()` in `gameStore.ts` walks
  every persisted blob through the per-version ladder; the typed registry
  lives in `src/lib/migrations.ts` for future moves.
- `partialize` strips all function fields generically — adding actions
  never bloats the save.

## RNG

`src/lib/rng.ts` exposes a `mulberry32`-backed seeded generator. New game
logic should prefer `gameRandom()` over `Math.random()` so saves can be
replayed deterministically (e.g. bug repro from a user's save). The seed
persists on the store as `rngSeed` when enabled.

---

## Where to look next

| Topic | File |
|---|---|
| Constants & tunables | `src/lib/engine/constants.ts` |
| Named probabilities | `src/lib/engine/probabilities.ts` |
| Rent & tenancy math | `src/lib/tenantRent.ts` |
| Mortgage eligibility | `src/lib/mortgageEligibility.ts` |
| Auction loop | `src/lib/engine/auction.ts` |
| Renovation & planning | `src/lib/engine/renovation.ts`, `src/lib/engine/planning.ts` |
| Tax | `src/lib/engine/taxation.ts` |
| Monthly tick orchestration | `src/stores/gameStore.ts` (`advanceMonth`) |
