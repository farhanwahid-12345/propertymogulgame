

# Overhaul Auction House + Make Mortgages More Realistic

## Part 1: Auction House Overhaul

### Problems
1. Only 1 auction property enforced (line 528 caps to exactly 1)
2. Buying requires 100% cash -- `onBuyProperty(prev.property, prev.currentBid, 0)` passes mortgage at 0%
3. Selling auctions use `Date.now()` real-time timestamps but completion checks run on `monthsPlayed` changes, so they rarely complete
4. AI bidder valuations use `property.price` (guide) instead of `property.value` (market)

### Changes

**Multiple Auction Properties (`useGameState.ts`, lines 527-586):**
- Change target from 1 to 5 auction properties
- Remove logic that moves extras back to estate agent
- Replenish from estate agent pool or generate new properties when one sells

**Mortgage Support for Auction Buying (`auction-house.tsx`):**
- Add mortgage percentage selector (0%, 50%, 75%, 90%) and provider dropdown before entering an auction
- Update bid slider max to reflect total budget (cash + mortgage capacity) not just cash
- Pass selected mortgage details through `onBuyProperty` when auction is won
- Show "cash required" (deposit + fees) so player knows affordability
- Validate total budget in `placeBid` and auto-bid logic

**Fix Selling Auctions (`auction-house.tsx`):**
- Replace `Date.now()` timing with `monthsPlayed` tracking -- auction completes when `monthsPlayed` advances by 1
- Generate final sale price using market-value-anchored 70/15/15 distribution (same as estate agent)
- Store `listMonth` and `auctionMonth` instead of real-time dates

**Anchor AI Bidding to Market Value (`auction-house.tsx`, lines 274-331):**
- Use `property.value` instead of `property.price` for reserve price, starting bid, and AI valuations

---

## Part 2: More Realistic Mortgages

### Problems
1. **Rate fluctuation is negligible** -- rates only move +/- 0.3% from base, capped within 0.5% of base. HSBC stays at ~4.2% forever
2. **Credit score is too easy to max** -- base 600 + net worth bonus (up to 200) + level bonus means a Level 3 player with modest portfolio easily hits 720+ (HSBC threshold)
3. **No debt-to-income check** -- players can stack unlimited mortgages regardless of rental income vs payments
4. **No application rejection** -- if you meet credit score and LTV, you always get approved
5. **Provider rates don't meaningfully differentiate** -- the spread between best (4.2%) and mid (5.5%) is too narrow to matter

### Changes

**Widen Rate Fluctuation (`useGameState.ts`, lines 364-381):**
- Allow rates to drift +/- 1.5% from base (instead of 0.5%)
- Add market cycle influence: rates trend up or down for several months before reversing
- Make cheaper providers more volatile (HSBC swings more, Easy Finance stays stable)

**Tougher Credit Score Requirements:**
- Lower base credit score from 600 to 550
- Reduce net worth bonus cap from 200 to 100 points
- Add debt-to-income penalty: if total mortgage payments > 60% of rental income, subtract 50-100 points
- Add portfolio size penalty: each property beyond 3 adds a small DTV pressure check
- Result: HSBC (720 required) becomes genuinely hard to qualify for early/mid game

**Add Debt-to-Income (DTI) Check (`useGameState.ts`, buy/refinance functions):**
- Calculate DTI = total monthly mortgage payments / total monthly rental income
- Strict providers (HSBC, Nationwide) reject if DTI > 50%
- Mid providers (Halifax) reject if DTI > 65%
- Lenient providers (QuickCash, Easy Finance) reject if DTI > 80%
- Show DTI ratio in mortgage provider selector UI

**Add Mortgage Application Chance (`useGameState.ts`):**
- Even when meeting all criteria, introduce a small rejection chance (5-15%) for premium providers
- Rejection triggers a 1-month cooldown before reapplying with that provider
- Lenient providers always approve if criteria are met

**Update Mortgage Provider Selector UI (`mortgage-provider-selector.tsx`):**
- Show DTI status (pass/fail) alongside existing LTV and credit score badges
- Show "Application risk" indicator (high/medium/low) based on how close the player is to limits
- Grey out providers where DTI exceeds their threshold

**Widen Provider Rate Spread:**
- HSBC: 3.5% base (was 4.2%) -- genuinely rewarding if you qualify
- Nationwide: 4.5% (was 4.8%)
- Halifax: 5.8% (was 5.5%)
- QuickCash: 9.5% (was 8.9%)
- Easy Finance: 15% (was 13.5%)
- This makes the reward for qualifying at a better provider much more significant

---

## Technical Summary

### Files Modified

| File | Changes |
|---|---|
| `useGameState.ts` | Multiple auction properties (5), wider rate fluctuation, tougher credit score calc, DTI validation in buy/refinance, updated provider base rates, application rejection logic |
| `auction-house.tsx` | Mortgage selector UI, market-value-anchored AI bidding, monthsPlayed-based sell timing, budget = cash + mortgage |
| `mortgage-provider-selector.tsx` | DTI badge, application risk indicator |

