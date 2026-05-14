# Improvements 21–27

## 21. Renovations counted as expenses where tax law allows (item 6a)

UK rule: **revenue-style repairs/maintenance are deductible** against rental income; **capital improvements (extensions, conversions, premium upgrades)** are NOT — they instead increase the CGT base. Today every renovation cost just leaves cash and never feeds `yearlyDeductibleExpenses` or `improvementCosts`.

- `src/lib/engine/renovation.ts`
  - Add `isDeductibleRevenueRenovation(typeId, category): boolean` — `true` for `category === 'maintenance'` and the dilapidated→standard condition upgrade; `false` for `'extension' | 'conversion'` and standard→premium.
- `src/stores/gameStore.ts`
  - In `startRenovation` (~line 2635), after the `debit(...)`:
    - If revenue-style → add the scaled cost into a new monthly bucket: `pendingDeductibleAddon += scaledCostPennies` and fold into `accumulatedDeductibleExpenses` on the next tick (or directly add to `yearlyDeductibleExpenses` in the action).
    - If capital → push onto a new per-property accumulator `property.capitalImprovementsPennies` (extend `Property` type) for later CGT use.
  - In the sale path that calls `calculateCGT(...)`, pass `improvementCosts = property.capitalImprovementsPennies || 0` (currently passed as 0).
- `src/types/game.ts` — add `capitalImprovementsPennies?: number` on `Property`.
- `src/components/ui/tax-breakdown.tsx` — add a small caption under "Allowable expenses" noting "includes repair-type renovations; extensions/conversions reduce CGT only".

**Acceptance**: Doing a maintenance renovation visibly bumps the YTD "Allowable expenses" tile and reduces projected tax. Doing an extension does NOT — but selling that property later applies the extension cost as CGT relief.

---

## 22. Slow tenant satisfaction decay (item 7)

Current monthly decay drops are too steep — `dilapidated -8`, unrepaired damage `-5`, premium-tenant-on-standard `-3`, recent rent hike `-2`, plus per-concern penalties stacking up to `-4` cap.

- `src/stores/gameStore.ts` (lines ~879–934)
  - Halve the structural penalties: dilapidated `-8 → -4`, damage `-5 → -3`, premium-on-standard `-3 → -2`, recent rent hike `-2 → -1`.
  - Lift the monthly net-drop cap from `-4` to `-3`.
  - Lengthen the recent-rent-hike window from 3 months → 6 months but with the smaller penalty.
  - Strengthen the upward drift toward 75 baseline: when no negative pressure, `+2` if `<75`, `+1` if `75–85`, `0` if `>85` (was `+2/-1/+1`).
- `src/stores/gameStore.ts` (concerns block ~1080)
  - Cap the per-tick concern penalty at `-2` total per tenant per month (today multiple concerns can stack uncapped before the global `-4` cap).

**Acceptance**: A standard-condition property with one open mid-priority concern no longer drops a tenant from 80 to 60 in a couple of months; it stabilises around 65–70 unless multiple problems pile up.

---

## 23. Lenient but rule-bound DTI / ICR for mortgages (item 8)

Today portfolio ICR uses *current* tenanted income, so a vacant fresh purchase fails the 125% test even when it would clearly let. Plan: count **expected** rent on every owned property (ignoring void state) and tighten the lenient track instead.

- `src/lib/mortgageEligibility.ts`
  - Rename request field semantics (no API break): `totalRentalIncome` should now be the **expected** monthly rent across owned properties (`property.monthlyIncome` regardless of tenancy), and `propertyMonthlyRent` is the expected rent on the new collateral.
  - Single-property branch (owns < 3): keep ICR ≥ 1.0 but switch from "actual rent" to "expected rent".
  - Portfolio branch (owns ≥ 3): drop the threshold from **1.25 → 1.20** to match how real BTL portfolios stress test, but enforce on **expected** income.
  - DTI check: same swap to expected income; raise QuickCash/EasyLoan from 0.80 → 0.85 to match their riskier positioning; HSBC stays 0.50.
- `src/hooks/useGameState.ts` and call-sites in Estate Agent / Auction House / Refinance / Portfolio Mortgage
  - Pass `totalRentalIncome = ownedProperties.reduce((s, p) => s + p.monthlyIncome, 0)` instead of "tenanted only".
  - Pass `propertyMonthlyRent` from the prospective property's `monthlyIncome` (already expected rent).
- `src/components/ui/mortgage-provider-selector.tsx` & `src/components/ui/game-stats.tsx`
  - Compute the player-facing DTI gauge from the same expected-income basis so the displayed % matches what the engine checks.

**Acceptance**: Buying a sub-£150k Middlesbrough house at 75% LTV is approved by Halifax/Nationwide even when the property is vacant on day one; HSBC still rejects the same deal at >50% DTI.

---

## 24. Delete bridging loans (item 9)

- `src/components/ui/loans-panel.tsx` — remove the `'bridging'` option from `LoanKind`, `KIND_META`, the `<SelectItem>`, the collateral picker block, the bridging-only monthly/bullet rendering, and the `kind === 'bridging'` branches.
- `src/lib/engine/constants.ts` — remove the `bridging` entry from `LOAN_PRODUCTS`.
- `src/stores/gameStore.ts`
  - Remove `'bridging'` from the `applyForLoan` signature (and store interface line ~320).
  - Drop the bridging branch in the loan-amortisation block (~line 1485) and the bridging collateral handling in `applyForLoan` (~line 3063).
  - Any pre-existing `'bridging'` rows in saved-state get filtered out on rehydrate.
- `src/types/game.ts` — narrow `Loan.kind` to `'personal' | 'business'`.

**Acceptance**: Bank tab → Apply for loan only shows Personal and Business. Old saves still load (legacy bridging rows are silently dropped).

---

## 25. Mount portfolio mortgages in the Bank tab (item 10)

`PortfolioMortgage` exists, the store action `handlePortfolioMortgage` exists, but the component is not imported anywhere — that's why it never appeared.

- `src/pages/Index.tsx` (Bank tab, ~line 248)
  - Import `PortfolioMortgage` and render it under the existing `MortgageSettlement / MortgageManagement / CreditOverdraft` row, **above** `LoansPanel`.
  - Wire props: `ownedProperties`, `mortgageProviders={gameState.mortgageProviders}`, `cash`, `setCash`, `creditScore`, `onPortfolioMortgage={gameState.handlePortfolioMortgage}`.
  - The component already self-hides until the player owns ≥ 3 properties.

**Acceptance**: Once the third property is owned, a "Portfolio Mortgage" card appears in the Bank tab with the multi-property selector.

---

## 26. Dynamic, fair loan interest rates + dynamic loan caps (item 11 + 11a)

- `src/lib/engine/constants.ts`
  - Convert `LOAN_PRODUCTS` rate spreads into a small range and let `gameStore` pick a current value each month, similar to overdraft/mortgage-rate fluctuation:
    - personal: spread 2.5–5.0%
    - business: spread 1.5–3.5%
  - Tie the spread floor to credit score: ≥ 800 subtract 0.5%, < 600 add 1.5% (matches the existing mortgage rate-penalty table — keep one source of truth via `getRatePenaltyForCreditScore`).
- `src/stores/gameStore.ts`
  - Add `currentLoanRates: { personal: number; business: number }` to state, fluctuate each month (+/- 0.3%) within the bracketed range above, persist with the rest of state.
  - Replace the hard `LOAN_PRODUCTS[kind].maxAmountPennies` cap inside `applyForLoan` and `LoansPanel.eligibilityIssue` with a **dynamic cap**:
    - Personal: `min(£25k, 6× monthly net rental income) × creditFactor` where `creditFactor = clamp(creditScore/700, 0.5, 1.4)`.
    - Business: `min(£150k, 4× annual net rental income) × creditFactor`, plus the existing Ltd + ≥2 properties gate.
  - Surface the live cap & rate from the store rather than the static constant.
- `src/components/ui/loans-panel.tsx`
  - Show "Max for you: £X" under the amount input, derived from the dynamic cap (mirrors the overdraft pattern).
  - Source the displayed APR from `store.currentLoanRates[kind] + creditPenalty` instead of `currentMarketRate + LOAN_PRODUCTS[kind].rateSpread`.

**Acceptance**: APRs on Personal/Business shift slightly month to month and respond to credit score. The personal-loan cap rises as the rent roll grows; a brand-new player with no rent sees a cap well below £25k.

---

## 27. Replace "Property Tax" with insurance + (vacant-only) council tax (item 12a)

UK landlords don't pay a "property tax" — they pay landlord **insurance** year-round and **council tax only when no tenant is in residence**. The engine already charges council tax only on empty properties (`gameStore.ts` ~772); the property card UI is the misleading part.

- `src/components/ui/property-card.tsx` (lines ~165–195 and 386–395)
  - Remove `PROPERTY_TAX_RATE = 0.012` and the "Property Tax (1.2%)" cost row entirely.
  - Add **Landlord Insurance** at `0.4%/yr` of property value, charged every month (`monthlyInsurance = value * 0.004 / 12`). Always visible in the cost breakdown.
  - Add **Council Tax** row only when the property is vacant (no tenant prop / `hasTenant === false`): pull the same `COUNCIL_TAX_BAND_D` figure used by the engine so UI matches engine.
  - Keep the existing **Maintenance (0.8%)** row — it's the implicit upkeep buffer and matches our reno cadence.
  - Net Monthly Income recalc updates accordingly.
- `src/stores/gameStore.ts` (~770–780, 1315)
  - Add `insurance = newOwnedProperties.reduce((s,p) => s + Math.floor(p.value * 0.004 / 12), 0)` to `totalExpenses`.
  - Add `insurance` to `accumulatedDeductibleExpenses` (legitimately deductible against rental income for both entity types).
- `src/lib/engine/financials.ts` — export a `MONTHLY_INSURANCE_RATE = 0.004 / 12` constant so card and engine share one value.

**Acceptance**: Property card shows "Insurance" every month and "Council Tax" only on empty properties; the Tax tab's "Allowable expenses" tile rises in step with insurance + (when vacant) council tax. There is no more "Property Tax" string anywhere in the UI.

---

## Files

- **Modified**: `src/stores/gameStore.ts`, `src/lib/engine/renovation.ts`, `src/lib/engine/constants.ts`, `src/lib/engine/financials.ts`, `src/lib/mortgageEligibility.ts`, `src/hooks/useGameState.ts`, `src/components/ui/property-card.tsx`, `src/components/ui/loans-panel.tsx`, `src/components/ui/mortgage-provider-selector.tsx`, `src/components/ui/game-stats.tsx`, `src/components/ui/tax-breakdown.tsx`, `src/pages/Index.tsx`, `src/types/game.ts`
- **New**: none

## Out of scope

- Re-pricing existing owned stock or recomputing past tax records.
- Building a separate "buildings vs contents" insurance toggle — single line item only.
- Reworking macro-economic event weights (handled in earlier improvement 16).
- Adding portfolio mortgages to non-Bank surfaces (Index Bank tab is the canonical home).
