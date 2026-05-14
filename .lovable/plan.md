# Phase 4 — Realism & Polish Pass

Ten focused changes from the screenshot. Grouped by system so related edits land together.

## 1. EPC Ratings (properties + renovation)
- Add `epcRating: 'A'..'G'` to `Property` (default by condition: pristine→B, standard→D, dilapidated→F).
- Show EPC badge on `property-card.tsx` (and on listed/buying tiles).
- Annual **electrical safety / EICR** cost (~£180–£250 per residential property) charged once per 12 months in `processMonthEnd`, surfaced in cashflow breakdown.
- New renovation option in `renovation-dialog.tsx`: **EPC Upgrade** (insulation/boiler) — cost scales with sqft, lifts EPC by 1–2 grades, mild value uplift. Properties below E become illegal to let (block new tenancies, warn in Upcoming Events).

## 2. Loan ↔ Cashflow ↔ Credit Sync
- `loans-panel.tsx` payments currently bypass monthly cashflow. Route loan interest + principal through `processMonthEnd` so they appear in cashflow breakdown and DTI.
- Missed loan payment (cash < due) → arrears flag, **−15 credit score**, +2% penalty rate; consecutive misses escalate (default at 3).
- On-time streak (12 months) → **+5 credit score**.

## 3. Tenant Concerns Chime
- Wire `playSound('concern')` in `sound.ts` when a new concern is generated in `processMonthEnd`. Respect existing mute toggle.

## 4. Early Repayment Charges (ERCs)
- Add `ercPercent` and `ercExpiresMonth` to `Mortgage` for fixed-term products (2yr fix → 3%/2%, 5yr → 5/4/3/2/1, 10yr → 6→1 sliding).
- Apply ERC fee on settle/refinance before fix expiry; show in `mortgage-settlement.tsx` and `mortgage-management.tsx` confirmation card.
- SVR/tracker remain ERC-free.

## 5. Conversions Require Vacancy
- In `renovation-dialog.tsx` and `engine/renovation.ts`, block any **conversion** category renovation if the property has an active tenant. Show inline reason: "Serve notice or wait for vacancy before converting."

## 6. Investor Finance (Friends & Family Loans)
- New loan product in `loans-panel.tsx`: **Investor Loan** — high rate (12–18%), short term (12–36 mo), no credit check, capped by reputation (need landlordReputation ≥ 40, max £25k–£75k by level).
- Default penalty: heavy reputation hit (−15) and cash clawback if cash available.

## 7. Concerns Frequency + Marketing Discount
- Reduce monthly concern roll probability (~40% lower) and add 1-month grace after move-in.
- When listing a property with active concerns at the estate agent, apply automatic listing-price discount equal to the estimated remediation cost (sum of `concern.estimatedCost`). Show breakdown in listing dialog.

## 8. Full Property Card Info While Buying
- Update `useConveyancingDisplay.ts` to carry through `monthlyIncome`, `sqft`, `yieldPercent`, `type`, `neighborhood`, `epcRating` from the source listing snapshot.
- Render normal stats on pending tiles; only actions stay disabled.

## 9. Renovation ROI Uplift
- In `engine/renovation.ts`, raise headline value uplifts ~20–30% across categories so successful rolls produce realistic post-reno comparables (still capped by `NEIGHBORHOOD_CEILINGS`).
- Re-tune probability bands so **good outcome ≥ 55%** for standard refurb, ≥ 40% for major.

## 10. Withdraw During Conveyancing
- Add `withdrawFromPurchase(propertyId)` action on the buy side (mirrors existing sale withdraw).
- Forfeit fee = solicitor £600 already paid + **0.5% of purchase price** abort fee. Confirmation dialog explains cost.
- Returns property to market inventory; clears conveyancing record.

## Cross-cutting
- Bump `SAVE_VERSION` to **16**; add migration defaults (`epcRating` from condition, `ercPercent: 0` for legacy mortgages).
- Update Upcoming Events to surface: EICR due, EPC-illegal lets, ERC expiry windows, investor loan due dates.
- Cashflow breakdown gains rows: **EICR**, **Investor loan interest**, **ERC paid (one-off)**.

## Files touched (high level)
- `src/types/game.ts`, `src/stores/gameStore.ts`, `src/lib/sound.ts`
- `src/lib/engine/renovation.ts`, `src/lib/engine/financials.ts`
- `src/components/ui/property-card.tsx`, `renovation-dialog.tsx`, `loans-panel.tsx`, `mortgage-management.tsx`, `mortgage-settlement.tsx`, `tenant-concerns-feed.tsx`
- `src/hooks/useConveyancingDisplay.ts`, `src/components/sections/UpcomingEvents.tsx`, `src/components/ui/tax-breakdown.tsx` (cashflow rows)
- New: `src/components/ui/withdraw-purchase-dialog.tsx`, `src/components/ui/investor-loan-dialog.tsx`

Want me to implement all 10 in one pass, or split into two PRs (1–5 then 6–10)?