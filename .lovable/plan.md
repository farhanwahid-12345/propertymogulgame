## Four fixes from the screenshot

### 1. "Offers" panel calls market value the asking price

**Problem:** `src/components/ui/property-offers.tsx` computes "% of asking price" and the "Full Price / Strong Offer / Below Asking" badges against `property.value` (current market value). When the player lists at a price higher than market value, every offer is mislabelled.

**Fix:**
- Add an `askingPrice?: number` prop to `PropertyOffers`.
- Replace all four uses of `property.value` (lines 80, 143, 154, 155) with `askingPrice ?? property.value`.
- Update the single caller (the standalone `<PropertyOffers>` outside the estate-agent submenu — `rg -n "<PropertyOffers" src/`) to pass the matching listing's `askingPrice` (read from `propertyListings.find(l => l.propertyId === property.id)?.askingPrice`).
- The header "£{property.value}" stays as the market value, but add a small "Asking £X" line beside it so the player understands the comparison basis.

### 2. Carried-forward losses are invisible in the tax sub-menu

**Problem:** `unusedLosses` already exists in state and `tax-breakdown.tsx` renders a single "Losses brought forward" row, but there's no explanation of how those losses were used (or accumulated) this year. The player can't see why their tax bill is lower than expected.

**Fix in `src/components/ui/tax-breakdown.tsx` (and the upstream calc in `gameStore.processMonthEnd`):**
- Surface two more numbers per year in the breakdown:
  - **Losses applied this year** (the `offsetUsed` value from `gameStore.ts` lines 1389 / 1413) — needs to be persisted on state (new field `lossesAppliedThisYear`, reset each April) so the UI can read it.
  - **Losses generated this year** (cumulative `grossLoss` / `-preTaxProfit` added to `newUnusedLosses` this tax year) — same persistence pattern.
- New "Loss relief" sub-block in tax-breakdown showing: opening balance → minus applied → plus generated → closing balance, with one-liner help text "UK rental losses can be carried forward indefinitely to offset future rental profits."
- No tax-math changes; this is purely surfacing values already computed.

### 3. Selling a property tied to a portfolio mortgage needs lender consent

**Problem:** `gameStore.ts` lines 3432–3433 currently *blocks* sale outright (`"Part of a portfolio mortgage."`). The user wants a consent flow: lender approves if remaining collateral keeps the portfolio within LTV/ICR, otherwise the player must refinance first.

**Fix:**
- New helper `evaluatePortfolioSaleConsent(mortgage, propertyBeingSold, otherCollateralProperties, requiredRedemption)` in `src/lib/mortgageEligibility.ts`. Returns `{ ok: true, redemptionRequired }` or `{ ok: false, reason, shortfallPennies, suggestedRefinanceAmount }`. Logic:
  - Compute remaining portfolio value after removing the property being sold.
  - Compute portfolio LTV using existing eligibility framework (75% cap default, adjusted by credit score per existing rules).
  - Compute portfolio ICR using current rents and stress rate (125% cap per memory).
  - If both pass → consent granted; lender takes a redemption slice = `mortgage.remainingBalance × (propertyValue / sumOfAllCollateralValues)` from sale proceeds, debt reduces by that amount.
  - If either fails → block with a structured reason and the shortfall the player needs to clear via refinance / extra equity.
- Replace the hard `showToast(...) ; return` at lines 3432–3433 with a call to this helper. On `ok: true`, apply the partial redemption inside the same sale state mutation. On `ok: false`, show a "Lender consent refused" dialog (`src/components/ui/lender-consent-dialog.tsx`, new) that lists the shortfall and offers two buttons: "Refinance now" (jumps to BankingPanel) or "Cancel sale".
- Estate Agent + Auction sale paths both go through the same gate (search `collateralPropertyIds?.includes` in `gameStore.ts` for any other entry points).

### 4. Conversions ignore approved extension sqft

**Problem (per screenshot):** The conversion preview/calc uses only `property.internalSqft` and disregards approved-but-not-yet-built extension sqft.

**Current state:** `renovation-dialog.tsx` already computes `effectiveInternalSqft = internalSqft + approvedSqftPending` and uses it for the min-sqft gate and `scaleInputs`. But two paths still use the raw `internalSqft`:
- The unit-count slider max for conversions (HMO bedrooms, flat count) — `conversionUnits` cap is derived from raw sqft.
- The store's `startRenovation` path (`gameStore.ts` ~line 3061) recomputes `scaleInputs` from `property.internalSqft` *without* the approved extension delta, so cost/rent/value uplifts shrink the moment the work actually starts.

**Fix:**
- Renovation dialog: derive the conversion unit-cap from `effectiveInternalSqft` (search the dialog for where `conversionUnits` max is computed). Add a footnote "Includes Xsqft approved but not yet built" when `approvedSqftPending > 0`.
- `gameStore.ts` `startRenovation`: compute `effectiveSqft = property.internalSqft + sumApprovedPendingExtensionSqft(property.id)` and pass it to `scaleInputs`, mirroring the dialog. Add a helper `getEffectiveInternalSqft(property, planningApplications)` in `src/lib/engine/planning.ts` and use it in both places (single source of truth).
- When the conversion is started solo and an approved-but-unbuilt extension exists, queue the extension as a prerequisite (consume its planning approval, debit its scaled cost, set the conversion's `completionMonth` to `max(extensionDuration, conversionDuration) + start`). This matches plan item 4(c) from the prior plan but wasn't actually wired in `gameStore.ts`.
- Update the consume-approval step (lines 3094–3097) so it removes *both* the conversion's and the prerequisite extension's approvals when the combined path fires.

### Files to touch

- `src/components/ui/property-offers.tsx` — accept `askingPrice` prop, swap denominator.
- Caller of `<PropertyOffers>` (find via rg) — pass `askingPrice` from `propertyListings`.
- `src/components/ui/tax-breakdown.tsx` — add loss-relief sub-block.
- `src/stores/gameStore.ts` — persist `lossesAppliedThisYear` / `lossesGeneratedThisYear`; route portfolio-sale through new consent helper; use effective sqft + prerequisite-extension logic in `startRenovation`.
- `src/types/game.ts` — two new GameState fields for loss tracking; bump SAVE_VERSION.
- `src/lib/mortgageEligibility.ts` — `evaluatePortfolioSaleConsent` helper.
- `src/lib/engine/planning.ts` — `getEffectiveInternalSqft` helper.
- `src/components/ui/renovation-dialog.tsx` — unit-cap uses effective sqft, footnote.
- `src/components/ui/lender-consent-dialog.tsx` — new modal.

### Out of scope
- No changes to the tax math itself (loss offset rules already correct).
- No changes to base mortgage eligibility framework — sale-consent helper composes existing LTV/ICR checks.
- No backend changes, no new dependencies.
