Four scoped fixes from the screenshot annotations.

---

## 1. Show current rate & bank on refinance menus (individual + portfolio)

Each refinanceable property tile currently shows name, neighborhood, value and outstanding balance — but not the existing mortgage's lender or interest rate, so players can't tell if a refinance saves money.

- **`src/components/ui/mortgage-refinance.tsx`** (property selection card lines 116–143):
  - Add a `mortgages` and `mortgageProviders` lookup. Find the existing mortgage by `propertyId`, resolve provider name from `providerId`, and render a third line: `Lender · {rate}% · {repayment|interest-only} · {termRemaining}y left`.
  - Color-code the new "Refinance Options" detail card (lines 161–181) to compare side-by-side: old rate vs new rate, old monthly vs new monthly, with a green/red delta.
- **`src/components/ui/portfolio-mortgage.tsx`** (property selection lines 148–175):
  - Same enrichment per tile — show existing lender + rate so the player can see what each property is currently financed at before bundling it into a portfolio facility.
  - Add a "Currently financed by" summary row above the loan slider listing distinct lenders across the selected set and their weighted-average rate.
- Both dialogs already receive `ownedProperties`; add `mortgages` and `mortgageProviders` props (portfolio-mortgage already has providers). Update the two call sites in `BankingPanel.tsx` to pass `gameState.mortgages`.

## 2. Compact property cards so first row fits in one viewport

At 1001×734 the current cards (lines 248–956 of `property-card.tsx`) stack price + market value + equity + monthly cashflow + tenant block + actions — single card is ~600px tall, so the first row of three doesn't fit above the fold.

- **`src/components/ui/property-card.tsx`**:
  - Collapse the financial block (Price / Market Value / Renovation Spend / Total Invested / Equity / Profit-Loss) into a single dense 3-column grid: `Value · Rent · Equity`. Move the rest behind a "Details" expand toggle (reusing the existing `CollapsibleSection`).
  - Hide the "Monthly Costs" breakdown by default; surface only `Net £X/mo` chip with a hover-card for the breakdown (mortgage / insurance / maintenance / council tax).
  - Tenant block: render satisfaction + risk + name in a single compact row instead of multi-line.
  - Action buttons: collapse "Furnish / Renovate / List / Sell" into a single overflow `…` menu when the card is in collapsed mode (keep tenant CTAs primary).
  - Target ~260px collapsed card height so a 1×3 row fits inside a 734px viewport with the hero header above it.
- **`src/components/sections/PortfolioGrid.tsx`** line 68: keep `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` but tighten `gap-3 → gap-2` and add `xl:grid-cols-4` for high-DPI players.
- Add a local `expanded` state in `PropertyCard` so any card can be expanded inline without affecting siblings; persist nothing (per-session).

## 3. Property condition affects value

Today value drifts purely on macro noise (`gameStore.ts:1312–1332`); condition only influences rent (`market.ts:getMarketRentPounds`) and a one-shot uplift on renovation completion (`gameStore.ts:3605`). Dilapidated properties never depreciate vs the market and premium ones never trade at a premium drift.

- **`src/stores/gameStore.ts` lines 1317–1332**: replace the constant `monthlyDrift` with a condition-aware mean:
  - `premium`     → +0.30%/mo mean (~3.6%/yr)
  - `standard`    → +0.20%/mo mean (~2.4%/yr, today's default)
  - `dilapidated` → −0.05%/mo mean (~−0.6%/yr — soft decay; renovate to reverse)
  - Keep the ±0.15% jitter and the 4% dip roll for variance.
  - Apply the same drift to `marketValue` so the "asking signal" tracks too.
  - Keep the existing 2.5× purchase-basis cap (still valid).
- **`src/lib/engine/taxation.ts`** (asset uplift on condition change, line 168): increase the gap so swing-based renovations reflect the new long-run delta — dilapidated→standard +18%, standard→premium +12% (currently smaller). Tune so renovation ROI stays the headline lever but the passive drift difference is felt over years.
- Verify `useGameState` net-worth and the conveyancing/sales code already read `property.value`, so no further wiring is needed.

## 4. Section 13 market rent reflects renovations

`property-card.tsx:668–677` already passes `condition`, `subtype`, `subtypeUnits`, `completedRenovationIds` into `getMarketRentPounds` — but the market rent shown in the Section 13 dialog still anchors low because:
- `getMarketRentPounds` (market.ts:145) only counts 4 hard-coded "premium" renos and caps the bonus at +6%.
- It uses `value` (which today doesn't reflect condition — fixed in item 3) as the base.
- It ignores conversions (HMO / flats per-unit rent uplift is already in but capped low).

- **`src/lib/engine/market.ts` `getMarketRentPounds`**:
  - Expand `PREMIUM_RENOS` to also include `extension`, `loft_conversion`, `garage_conversion`, `garden_landscaping`, `solar_panels`, `epc_upgrade` (the renos that materially affect rent in real-world Middlesbrough lets).
  - Raise the per-reno premium from 1.5% to 2.5% and the cap from +6% to +15%.
  - Add a `totalRenovationSpendPennies?` input — when provided, blend in a `min(0.20, spend / value × 0.8)` uplift so heavy refurbs further raise market rent independent of the named-reno list.
  - Add a `marketValue?` input and prefer it over `value` when present (post-item-3 it tracks condition).
- **`src/components/ui/property-card.tsx`** lines 668–677: pass `totalRenovationSpendPennies: property.totalRenovationSpendPennies` and `marketValue: property.marketValue` into `getMarketRentPounds`.
- **`src/components/ui/rent-negotiation-dialog.tsx`**: keep the headline "Local market: £X/mo" copy but add a sub-line "Includes condition + £Y refurb uplift" when `totalRenovationSpendPennies > 0`, so the player understands why the figure jumped.
- Re-test the `acceptanceProb` formula (line 68) — the new market rent should naturally lift the cap on proposed rents without code changes.

---

## Technical notes

- Item 1 prop additions are additive; no breaking changes to existing callers if defaults are used.
- Item 2's `expanded` flag stays in component state — keeps PortfolioGrid pure and avoids store churn.
- Item 3's drift change persists into existing saves automatically (no migration; the state shape is unchanged, only the per-tick math).
- Item 4 keeps `marketRent` in pounds (UI unit) — `getMarketRentPounds` already returns pounds, so callers stay unchanged.
