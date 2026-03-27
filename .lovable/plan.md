

# Fix Auction Contrast + Make Mortgages Harder

## Problem 1: Auction House Text Unreadable
The auction house uses hardcoded light-theme colors (`bg-blue-50`, `bg-red-50`, `bg-white`, `text-red-700`, etc.) that clash with the dark glass-morphism theme. Text becomes invisible against these backgrounds.

## Problem 2: Mortgages Too Easy in Estate Agent
- The estate agent mortgage slider is hardcoded to max 75% with no credit/LTV eligibility check
- All mortgage providers are listed without disabling ineligible ones
- The `buyProperty` function in `useGameState.ts` never calls `checkMortgageEligibility` -- it blindly creates the mortgage
- Credit score barely moves: only +1/month if DTI is healthy, starting at 650 which already qualifies for Halifax (640 min)

## Problem 3: Credit Score Too Static
- Gains: +1/month (with healthy DTI) and +15 for paying off a mortgage
- Losses: -2/month if DTI > 60%
- Starting at 650, a player qualifies for Halifax immediately and reaches Nationwide (680) in ~30 months with zero effort

---

## Changes

### 1. Fix Auction House Colors (`src/components/ui/auction-house.tsx`)
Replace all hardcoded light-theme colors with dark-theme-compatible equivalents:
- `bg-blue-50` → `glass` or `bg-[hsl(var(--card))]`
- `bg-red-50` / `border-red-500` → `glass border-red-500/50`
- `bg-orange-50` → glass styling
- `bg-white` (bid history, auctioneer message) → `bg-[hsl(var(--muted))]`
- `text-red-700` → `text-red-400`
- `text-orange-600/700` → `text-orange-400`
- `text-blue-600` → `text-blue-400`
- `text-green-600` → `text-green-400`

### 2. Enforce Mortgage Eligibility in Estate Agent (`src/components/ui/estate-agent-window.tsx`)
- Calculate max LTV the player actually qualifies for based on credit score, and cap the mortgage slider to that value (instead of hardcoded 75%)
- Filter provider dropdown to only show providers the player qualifies for (credit score + LTV check)
- Show a warning if credit score is too low for any mortgage ("Credit too low for mortgage financing")
- If no providers match, disable the mortgage slider entirely

### 3. Add Eligibility Check to Buy Function (`src/hooks/useGameState.ts`)
- In `buyProperty`, call `checkMortgageEligibility` before creating the mortgage
- If rejected, show a toast with the reason and abort the purchase
- This catches edge cases where the UI might not fully prevent ineligible applications

### 4. Make Credit Score More Dynamic (`src/hooks/useGameState.ts`)
**Slower gains, more penalties, more meaningful progression:**
- Reduce monthly mortgage-holding bonus from +1 to +0.5 (rounds to 0 or 1 alternating)
- Lower starting credit score from 650 to 580 (below Halifax's 640 minimum)
- Add new credit events:
  - Missed rent (tenant default): -10 credit score
  - Property damage unrepaired for 2+ months: -5
  - Successful property sale: +5
  - Each consecutive 6 months with no defaults: +3 bonus
  - Taking on very high LTV (>85%): -3 per mortgage at that level
  - Paying off overdraft: +5
- Cap at 850, floor at 300

### 5. Fix Auction Dialog Colors (`src/components/ui/auction-dialog.tsx`)
- Same pattern: replace `bg-muted/50` text visibility issues

---

## Files Modified

| File | Changes |
|---|---|
| `src/components/ui/auction-house.tsx` | Replace all hardcoded light colors with dark-theme classes |
| `src/components/ui/auction-dialog.tsx` | Fix muted background contrast |
| `src/components/ui/estate-agent-window.tsx` | Add credit-based mortgage eligibility, cap slider to qualified LTV, filter providers |
| `src/hooks/useGameState.ts` | Add eligibility check in buyProperty, lower starting credit to 580, add credit events for defaults/sales/damage |

