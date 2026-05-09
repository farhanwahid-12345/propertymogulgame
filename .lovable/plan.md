# Improvements 6–11

## 6. Apply for planning without renovation funds

**Today**: `renovation-dialog.tsx` requires the player to confirm both planning fee + full renovation cost upfront. Cash check blocks submission even though build doesn't start until approval.

**Fix**:
- Split the flow. Planning submission only needs `planningFee + £600` (or whatever the LPA fee is). Renovation cost is reconfirmed at approval time.
- In `gameStore.submitPlanningApplication`: check cash against `planningFee` only, store the renovation type + a "snapshot" cost.
- When planning resolves approved, surface a new "Start renovation" CTA in the Renovation dialog / planning tracker. If cash < cost at that point → keep the approval valid for N months (e.g. 12) so the player can save up. Show countdown + warning when nearing expiry. Lapses become refusals (no fee refund) after expiry.
- Update `planning.ts` types to add `renovationStarted: boolean` and `expiresMonth: number`.

## 7. Slow tenant satisfaction decay

**Today** (`gameStore.ts` ~L878–925): satisfaction can fall ~5–10/mo from compounded penalties (concerns, condition, recent rent hike, premium-tenant mismatch). Tenants exit too fast.

**Fix** (numbers only — no new mechanics):
- Halve concern decay penalties (`satisfactionPenaltyIfIgnored * 0.5`) and extend grace period from 1–2 mo to 3 mo.
- Apply a monthly "happiness drift" of +1 when satisfaction is between 40–80 and no active concern (today drift only triggers below 70).
- Cap monthly net drop at −4 (clamp `delta`).
- Keep the satisfaction=0 walkout rule, but raise probabilistic exit threshold from <25 to <15 and chance from 8% → 5%.

Save migration not required (numeric tuning only).

## 8. Withdraw a property from estate-agent sale

**Today**: once listed (`propertyListings`), the only exits are accept-offer or auction. No cancel.

**Fix**:
- Add `withdrawListing(propertyId)` action in `gameStore.ts`. Charges a flat **£500 solicitor fee + £250 estate-agent admin** (configurable in `constants.ts` as `LISTING_WITHDRAWAL_FEE`).
- Removes the listing, drops all pending offers, restores the property to "for management" state. If a buyer was already in conveyancing (chain in progress), fee bumps to £1,500 and a "chain collapse" toast fires.
- UI: "Withdraw from sale" button in `listed-properties.tsx` card with an `AlertDialog` confirmation showing the cost.

## 9. Realistic auction selling (seller side)

**Today** (`auction-house.tsx` & gameStore monthly auction tick L234+): when player is **selling** at auction, the AI logic just rolls a final price between guide and a small premium then floors at reserve, so fairly-priced lots sometimes get zero bids and overpriced lots still hit reserve.

**Fix** — replace the seller-side auction resolver with a bidder-pool simulation analogous to the buy-side one:
- Compute `fairValue = property.value`. Derive `interestLevel` from `reservePrice / fairValue`:
  - `< 0.85` → hot (6–10 bidders)
  - `0.85–1.05` → normal (3–6 bidders)
  - `1.05–1.20` → cool (1–3 bidders)
  - `> 1.20` → cold (0–1 bidders)
- Each bidder has a private valuation = `fairValue * (0.9 + rand*0.25)`. Run an ascending bid simulation: highest valuation wins at second-highest + increment.
- If top valuation < reserve → **lot fails to sell** (no auto-pass at reserve like today). Player keeps property + pays £400 auction fee. Toast "Reserve not met — no sale."
- If reserve met → sell at simulated hammer price (could be exactly reserve when only one bidder, or well above when hot).
- Same model used for the live auction's AI behaviour (already realistic on buy-side; just ensure the seller-side monthly resolver uses the new function).

New helper: `src/lib/engine/auction.ts` exporting `simulateAuctionSale({ fairValue, reservePrice, guidePrice })`.

## 10. Mortgage flexibility & new loan products

Three sub-items:

### 10a. Show & edit existing mortgage terms
- In `mortgage-management.tsx`, render existing mortgages with **rate, term remaining, monthly payment, type, ERC estimate**. Already partly there — extend to show provider name + a "Modify" CTA leading to the existing refinance flow.
- Add an **early-repayment** action: pay off principal (full or partial). Triggers an Early Repayment Charge of `2% × remainingBalance` if within first 5 years of mortgage start. Reuses `cash` check + adds an `ERC_PERCENT` constant.

### 10b. Floating portfolio mortgage (3+ properties)
- New action `applyForPortfolioMortgage()` in `gameStore.ts`. Requires `ownedProperties.length >= 3`. Bundles selected properties as collateral; produces a single `Mortgage` with `collateralPropertyIds` populated and removes their individual mortgages (settling them with proceeds).
- Rate = lowest current provider rate + 0.75%; max LTV 70% on aggregate portfolio value; 125% portfolio ICR enforced via `calculateMortgageEligibility` in portfolio mode.
- UI: enable in `portfolio-mortgage.tsx` (currently shows "unsupported"). Update memory `portfolio-mortgages` to reflect new support.

### 10c. Personal / business / bridging loans
- New `Loan` type in `types/game.ts`: `{ id, kind: 'personal' | 'business' | 'bridging', principal, rate, termMonths, monthlyPayment, startMonth, balance }`.
- New `loans: Loan[]` slice + monthly tick deduction in `gameStore.ts`.
- Eligibility per kind:
  - **Personal**: ≤ £25k, 12–60 mo, rate = base + 4%, requires creditScore ≥ 600.
  - **Business**: ≤ £150k, 12–84 mo, rate = base + 2.5%, requires entity == `ltd` and ≥ 2 owned properties.
  - **Bridging**: ≤ 70% LTV against any single owned property, 1–12 mo, **interest-only**, rate = base + 6%. Auto-secured.
- New tab in Bank section: `loans-panel.tsx` with apply form + active loan list + early settlement.

## 11. Inline mortgage eligibility feedback

**Today**: refusal banner only appears after submitting. Screenshot shows player getting "Refinance Rejected" inside the refinance dialog after pressing apply.

**Fix**:
- `calculateMortgageEligibility` already runs reactively in `mortgage-management.tsx`, `mortgage-refinance.tsx`, `portfolio-mortgage.tsx`. Surface its `eligible / reason` **always**, not only on submit:
  - If `!eligible` → show a red inline panel above the Submit button with the exact `reason` string and a "Why?" tooltip listing which check failed (LTV / ICR / DTI / credit).
  - Disable submit + change CTA label to "Mortgage would be rejected".
  - Add a "What would qualify?" helper that recomputes max-eligible loan amount (binary search) and shows e.g. "Up to £148,000 would be approved".
- Same treatment in Estate Agent + Auction House mortgage selectors so the rejection is visible **before** committing to the purchase.

## Files

- **New**: `src/lib/engine/auction.ts`, `src/components/ui/loans-panel.tsx`
- **Modified**: `src/stores/gameStore.ts`, `src/lib/engine/planning.ts`, `src/lib/engine/constants.ts`, `src/types/game.ts`, `src/components/ui/renovation-dialog.tsx`, `src/components/ui/renovation-tracker.tsx`, `src/components/ui/listed-properties.tsx`, `src/components/ui/auction-house.tsx`, `src/components/ui/mortgage-management.tsx`, `src/components/ui/mortgage-refinance.tsx`, `src/components/ui/portfolio-mortgage.tsx`, `src/components/ui/estate-agent-window.tsx`, `src/components/ui/auction-dialog.tsx`, `src/pages/Index.tsx`

## Out of scope
- Re-balancing baseline yields, rents, or property prices.
- Multi-currency or non-UK loan products.
- Switching the in-flight refinance flow to a wizard UI.
