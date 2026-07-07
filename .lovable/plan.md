# Execution Plan — Lovable Improvements #6

Eight distinct issues extracted from the document, grouped into 4 phases by system area to keep the app stable between deploys.

---

## Phase 1 — Yield & Rent Realism (Items 1, 4a)

**1.1 Fix yield display + further reduce yields (Item 1)**
- Property cards show "YIELD 14.9%" / "18.4%" / "15.8%" while rents are £678–£788/mo on £48–£84k values. Two problems:
  - Displayed yield is based on **purchase price**, not current market value. Recompute displayed yield as `(annualRent / currentMarketValue) × 100` in `src/components/game/property-card.tsx` (and any hook feeding it, e.g. `usePortfolioMetrics.ts`).
  - Underlying rents are still too high vs. Middlesbrough LHA. Lower `CITY_LHA_MONTHLY_PENNIES.middlesbrough` further (target: 1‑bed £395, 2‑bed £475, 3‑bed £565, 4‑bed £655) and audit `AVAILABLE_PROPERTIES` seed rents in `src/lib/engine/constants.ts` so headline yields land in the 5–8% band for Middlesbrough terraces.

**1.2 HMO room rents (Item 4a)**
- In whichever engine generates HMO per-room rents (search `hmo` / `multi-unit-slots`), halve the Middlesbrough HMO room rate to a realistic £280–£380/room/mo range, anchored to a bedroom-share of LHA rather than full-flat LHA.

---

## Phase 2 — Property Card & Tag Fixes (Items 2, 4b, 4c, 5)

**2.1 Hover popovers hidden under header (Item 2)**
- Persistent z-index bug. In `src/index.css` and/or the tooltip/popover wrappers (`components/ui/tooltip.tsx`, `popover.tsx`), raise their portal `z-index` above the sticky HeroHeader (which sits around `z-40`). Set tooltip/popover content to `z-[60]` and confirm they render into a Portal at document body, not clipped by an ancestor `overflow-hidden`. Audit the header/dashboard containers for `overflow-hidden` that would clip child popovers.

**2.2 HMO cards missing agent / RGI toggles (Item 4b)**
- In `src/components/game/multi-unit-slots.tsx` (or wherever the HMO variant of `property-card.tsx` renders), add the same "Hire agent (10%)" and "Add RGI (3%)" checkboxes present on single-let cards, wired to the same store actions but scoped to the HMO property id.

**2.3 Per-room Section 13 (Item 4c)**
- Section 13 in `src/components/game/rent-negotiation-dialog.tsx` / `tenantActions.ts` currently mutates the parent HMO rent. Change the flow to accept a `roomId` (or `unitIndex`) so rent increases apply only to the specific room's tenant. Update store shape if HMO room rents are stored as an array on the property; if they were previously a single field, migrate to per-room storage with a version bump + migration.

**2.4 Commercial property mis-tagged as Residential during conveyancing (Item 5)**
- In the buying-phase render path of `property-card.tsx` and `conveyancing-tracker.tsx`, the type badge is hard-coded / falling back to "Residential". Read `property.type` from the conveyancing record instead and render the correct badge (`Commercial` / `Luxury` / `Residential`).

---

## Phase 3 — Estate Agent Level Gating & Commercial Evictions (Items 6, 7)

**3.1 Estate agent showing sub-level properties (Item 6)**
- In `src/components/game/estate-agent-window.tsx` / `PropertyMarket.tsx` and the market inventory generator (`marketSlice.ts` / `marketActions.ts`), filter listings so only properties at the player's **current** level are shown (currently the filter is `level <= playerLevel`, which is why buying is blocked at the transaction stage). The purchase-blocking notification stays as a safety net but should never fire during normal play.

**3.2 Commercial arrears → eviction (Item 7)**
- Extend the eviction flow to commercial tenants. In `tenantActions.ts` / `eviction-dialog.tsx`:
  - Detect commercial leases with arrears (typically 21+ days under UK commercial forfeiture rules).
  - Offer a "Forfeit lease / peaceable re-entry" action (no 6.8/8 grounds — commercial uses lease forfeiture).
  - Wire into Operations → Evictions panel with a distinct commercial badge and shorter timeline (no Renters' Rights Act protection).

---

## Phase 4 — Financial Consistency (Items 3, 8)

**4.1 Net worth mismatch + unexplained drops (Item 3, 3b)**
- Two symptoms of the same problem: net worth calculated in two places (HeroHeader / dashboard tile vs. Statements tab / Performance chart) diverge.
  - Consolidate to a single memoised selector in `usePortfolioMetrics.ts` (or a new `selectors/netWorth.ts`) that every consumer imports. Delete duplicate inline calculations.
  - For the "sharp drop after month 39" chart artefact: audit `performance-chart.tsx` and the monthly snapshot writer in `monthEndActions.ts` for cases where a mid-month value (e.g. cash after a large expense but before rent) is snapshotted, or where furniture depreciation / macro-event revaluation is double-applied. Log intermediate values under a dev flag to reproduce, then patch the specific ordering bug.

**4.2 Mortgage rates ignore BoE rate (Item 8)**
- In `src/lib/mortgageEligibility.ts` and `mortgage-provider-selector.tsx`, the displayed rate uses `provider.baseRate` (static from `MORTGAGE_PROVIDERS` constant) instead of `currentMarketRate + providerSpread`. Refactor to `finalRate = currentMarketRate + provider.spread` (add a `spread` field to `MortgageProvider`, derive from existing `baseRate - BASE_MARKET_RATE`). Verify the same formula is used everywhere: eligibility check, quote display, provider comparison table, and mortgage creation in `bankingSlice.ts`.

---

## Technical Notes

- All money remains in pennies; convert at UI boundary only.
- Any store-shape change (per-room HMO rents, MortgageProvider.spread) needs a version bump in `src/lib/migrations.ts` and a migration seeding existing rows sensibly.
- After each phase: `tsgo` typecheck + a targeted vitest run on the relevant slice(s).
- No visual redesign — reuse existing glass/section styling throughout.

---

## Out of Scope
- No new UI language or theme changes.
- No changes to the tutorial engine, save-slot system, or achievements.
- No new economic-event types.

Awaiting your approval before starting Phase 1.
