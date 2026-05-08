# Three Improvements

## 1. Stop phantom "New Tenant Concern" notifications

**Problem**: Toast fires saying "1 new concern raised — check the feed" even when nothing is in the feed. Cause: in `src/stores/gameStore.ts` (~L1026) the toast counts `newConcerns.length` from generation, but the feed (`tenant-concerns-feed.tsx`) filters by `ownedIds.has(c.propertyId)` and `!c.resolvedMonth`. Concerns generated for properties that are mid-sale, just sold, or whose tenant has departed in the same tick get pushed but never appear.

**Fix**:
- Before pushing into `newConcerns`, also verify the property is still owned and the tenant `t` is still in `newTenants` post-tick (it currently iterates `newTenants` but property may not be in `updatedOwnedProperties` after a concurrent sale completion).
- After building the final `updatedConcerns`, derive `visibleNew = newConcerns.filter(c => ownedIds.has(c.propertyId) && !c.resolvedMonth)` and gate the toast on `visibleNew.length > 0` using that count.
- Same defensive filter applied to the activity-feed entry if one exists.

## 2. Choose entity (Sole Trader vs LTD) at game start + visible tax breakdown

**Current state**: `entityType` defaults to `'sole_trader'` (`gameStore.ts` L350) and the setter (`L612`) charges £1,000 to switch to LTD, but there is no UI for the choice at start and no detailed tax view.

**Changes**:

- **Start-of-game entity picker**: Add a one-time onboarding modal (`src/components/ui/entity-onboarding-dialog.tsx`) shown when `monthsPlayed === 0` and a new persisted flag `entityChosen === false`. Two cards:
  - **Sole Trader** — no setup fee, income tax bands + NI, mortgage interest only 20% relievable, 18/24% CGT on sales.
  - **LTD Company** — £1,000 incorporation fee, 19–25% corp tax, full mortgage interest deduction, no CGT (corp tax on gains), higher commercial mortgage costs / lower LTV.
  - Buttons call existing `setEntityType` action; set `entityChosen: true` after.
  - Add migration bumping persisted version, defaulting `entityChosen` to `true` for existing saves so they aren't re-prompted.

- **Tax detail panel**: New tab inside the Bank section (or a sub-section of the existing tax summary) — `src/components/ui/tax-breakdown.tsx`. Shows for the current tax year:
  - Gross rental income, allowable expenses, mortgage interest (split by relief rule), taxable profit.
  - Tax due by band (sole trader: PA / basic / higher / additional with the 20% finance-cost credit displayed; LTD: small-profits / marginal / main rate).
  - CGT realized YTD (sole trader only).
  - Payment schedule note (Self-Assessment Jan/Jul payments-on-account vs corp tax 9 months + 1 day).
  - Reads from existing `taxRecords` and recomputes using `src/lib/engine/taxation.ts` helpers; no engine logic changes required beyond exposing intermediate band-level numbers (extend `calculateIncomeTax` to optionally return a breakdown).

- **Tax mechanics already differ** by entity in `taxation.ts` — no rule changes, just surface them.

## 3. Market rent reflects renovations / condition

**Current**: `property-card.tsx` L523 computes `marketRent = value * (yield/100) / 12`. Since renovations raise `value`, market rent already partially scales — but `yield` is a fixed per-property number set at purchase, so a refurbished dilapidated property keeps its old (often high) yield and the resulting market rent ends up *below* current rent (as in the screenshot: £2,039 current, £1,437 market).

**Fix** — recompute a "fair market rent" that accounts for condition rather than the raw stored yield:

- Add helper `getMarketRent(property)` in `src/lib/engine/market.ts`:
  ```ts
  // Base yield by condition tier, anchored to the local Middlesbrough range
  const conditionYield = {
    dilapidated: 0.085,
    standard:    0.075,
    premium:     0.065, // higher value → lower yield, but higher absolute rent
  }[property.condition] ?? 0.075;
  // Blend with the property's original yield so traits still matter
  const blended = (property.yield/100) * 0.4 + conditionYield * 0.6;
  return Math.round((property.value * blended) / 12);
  ```
- Replace the inline calc in `property-card.tsx` and any other call site (search for `value * ((property.yield`).
- This keeps the figure realistic per UK letting regs (rents track property quality, not headline yields) and ensures a renovated property shows a market rent ≥ its current rent, unlocking justified Section 13 increases.

## Files

- **New**: `src/components/ui/entity-onboarding-dialog.tsx`, `src/components/ui/tax-breakdown.tsx`
- **Modified**: `src/stores/gameStore.ts` (concern toast filter, `entityChosen` field + migration), `src/lib/engine/market.ts` (export `getMarketRent`), `src/lib/engine/taxation.ts` (optional breakdown return), `src/components/ui/property-card.tsx` (use helper), `src/pages/Index.tsx` (mount onboarding dialog + tax panel)

## Out of scope
- Re-balancing yields globally or changing how rent is collected.
- Switching entity mid-game UI (the existing `setEntityType` action stays as-is).
