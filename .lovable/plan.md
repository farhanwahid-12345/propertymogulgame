# Improvements 18–20

## 18. Stop tax notifications blocking sub-menus

**Problem (screenshot 6)**: The "📋 Income Tax Due!" / "📋 Corporation Tax Due!" toast pops over the Renovation dialog and other sub-menus, blocking clicks on the right-hand actions ("Completed" badges, install/upgrade buttons, etc.).

**Cause**: `src/stores/gameStore.ts` (lines ~1340 and ~1353) calls `showToast(...)` for the annual tax bill. The toast renders in the top-right toast region which overlaps open dialogs.

**Changes**:
- `src/stores/gameStore.ts`
  - Remove the two `showToast("📋 Income Tax Due!", ...)` / `showToast("📋 Corporation Tax Due!", ...)` calls.
  - In their place, push an entry into the existing **activity feed** so the user still sees the bill in the Alerts panel: `addActivityFeedEntry({ type: 'tax', title: 'Income Tax Paid', description: 'Annual income tax £X (gross £Y − §24 credit £Z)', month })` — mirror the pattern already used for macro events. Use `'corporation_tax'` description for LTD.
  - Keep the `taxRecords.push(...)` write unchanged so the Tax tab still shows the year's record.
- `src/components/ui/tax-breakdown.tsx`
  - Add a small "Last bill" row under the schedule footer showing the most recent `taxRecords` entry (date + amount), so the user has an obvious place to see the bill that previously came via toast.

**Acceptance**: Opening the Renovation dialog while the in-game year ticks past 5 April no longer covers the right-hand "Completed" / install controls. The bill appears in the activity feed and at the bottom of the Tax tab.

---

## 19. Verify the in-year tax estimate

**Problem (screenshot 7)**: The "Estimated tax this year" figure climbs by a few hundred pounds every month, which the user wants sanity-checked.

**Investigation summary (no code change unless verification fails)**:
- `TaxBreakdown` calls `calculateCorporationTax(yearlyGrossRent, yearlyMortgageInterest, yearlyDeductibleExpenses)`.
- The store accumulates those three fields **monthly** (`accumulatedGrossRent = prev.yearlyGrossRent + monthlyIncome`, etc.) and only resets them in April.
- Therefore the displayed estimate is **year-to-date tax on year-to-date income**, not a *projected* full-year liability. Each new month adds another month of rent → tax goes up. Mathematically correct, but the *label* "Estimated tax this year" misleads — users read it as a forecast.

**Changes**:
- `src/components/ui/tax-breakdown.tsx`
  - Compute `monthsElapsedInTaxYear = ((monthsPlayed - lastTaxYearStartMonth) % 12) + 1` (pass `monthsPlayed` and `lastCorporationTaxMonth` as props from `Index.tsx`).
  - Show **two** figures in the summary band:
    1. `Year-to-date tax` = current calculation (rename the existing line).
    2. `Projected full-year tax` = run `calculateIncomeTax` / `calculateCorporationTax` on `(ytdRent / monthsElapsed) * 12` and the same scaled mortgage interest + expenses. Label clearly: "Projected at year-end (extrapolated)".
  - Add a one-line caption: "Estimate updates each month as rent is collected — projected figure smooths this out."
- `src/pages/Index.tsx`
  - Pass `monthsPlayed={gameState.monthsPlayed}` and `lastCorporationTaxMonth={gameState.lastCorporationTaxMonth}` to `<TaxBreakdown />`.

**No engine math changes** — the calculation is already correct; the UI just gets clearer labels and a projected figure.

**Acceptance**: The Tax tab shows both YTD and projected tax. The user can see the YTD climb is expected behaviour and the projected number stays roughly stable month-to-month (only moving when rent roll, expenses, or interest actually change).

---

## 20. Lift yields on cheaper stock toward ~15%

**Problem (screenshot 8)**: 113 The Crescent — price £118,800, market value £119,089 — was quoted well under 10% gross yield. The user expects sub-£150k Middlesbrough stock to land closer to 15%.

**Cause**: `src/lib/engine/market.ts → yieldForValue()` currently centres £75k–£150k at **11%** with ±1.5% jitter, so realistic outputs are 9.5–12.5%. Doesn't reach 15%.

**Changes**:
- `src/lib/engine/market.ts`
  - Lift the lower brackets of `yieldForValue`:
    - `≤ £75k`: centre **15** (was 13)
    - `≤ £150k`: centre **13** (was 11)
    - `≤ £300k`: centre **10.5** (was 9)
    - `≤ £600k`: centre **8.5** (was 7.5)
    - `≤ £1.2M`: centre 6.5 (unchanged)
    - `> £1.2M`: centre 5.5 (unchanged)
  - Keep ±1.5% jitter and the `[3, 16]` clamp.
- `src/lib/engine/constants.ts`
  - The seed properties under £150k were already boosted in improvement 14. Re-derive their `monthlyIncome` from the new centres so seeds match the curve (sub-£100k seeds nudge up another ~15%, £100k–£150k seeds nudge up ~10%).
- No changes to `getMarketRentPounds` (refurb premium model stays). Existing owned properties keep their stored `yield` value, so this only affects newly-generated stock and seeds — which matches the user's "estate agent quoted under 10%" complaint.

**Acceptance**: Browsing the Estate Agent for a fresh batch of sub-£150k Middlesbrough houses shows quoted yields clustering around 12–15%. A ~£120k property like 113 The Crescent now shows ~£1,300–£1,500/mo income (≈13–15% gross).

---

## Files

- **Modified**: `src/stores/gameStore.ts`, `src/components/ui/tax-breakdown.tsx`, `src/pages/Index.tsx`, `src/lib/engine/market.ts`, `src/lib/engine/constants.ts`
- **New**: none

## Out of scope

- Re-pricing already-owned stock (would invalidate saved games and feels like cheating in the user's favour).
- Reworking the toast region's z-index globally — only the tax toast was flagged.
- Changing the UK tax-year boundary or band thresholds.
