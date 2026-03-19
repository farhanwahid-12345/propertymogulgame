

# Fix Selling Offer Generation to Anchor to Market Value

## Problem

Two issues found:

1. **"Reduce Price 7%" generates offers based on asking price, not market value.** The code at line 2088 in `useGameState.ts` uses `0.92 + Math.random() * 0.13` multiplied by the *new asking price*. So a property worth £60,000 listed at £83,700, reduced to £77,841, gets offers of £71,614-£81,733 -- all far above market value.

2. **The user wants 70%+ of offers to cluster around market value**, with the remainder spread above and below for variability.

## Solution

### 1. Fix "Reduce Price" Offer Generation (`useGameState.ts`, lines 2086-2100)

Replace the current logic that uses `newPrice * priceMultiplier` with market-value-anchored logic:

- 70% of offers: within 90-105% of **market value**
- 15% of offers: below market value (80-90%)
- 15% of offers: above market value (105-115%) but capped at the new asking price

```text
Before:
  priceMultiplier = 0.92 + Math.random() * 0.13  // 92-105% of asking
  amount = newPrice * priceMultiplier

After:
  roll = Math.random()
  if roll < 0.70:  amount = marketValue * (0.90 + Math.random() * 0.15)  // 90-105%
  elif roll < 0.85: amount = marketValue * (0.80 + Math.random() * 0.10) // 80-90%
  else:             amount = marketValue * (1.05 + Math.random() * 0.10) // 105-115%
  amount = min(amount, newPrice)  // Never exceed asking price
```

Also increase the number of immediate offers from 1-2 to 1-3 to make the price reduction feel impactful.

### 2. Fix Periodic Offer Generation (`estate-agent-window.tsx`, lines 322-345)

Apply the same 70/15/15 distribution within each pricing tier. Currently the tiers correctly anchor to market value, but offers within each tier are uniformly distributed. Update each tier to use the weighted distribution:

- For overpriced listings (priceRatio > 1.1): 70% of offers at 88-100% of market, 15% at 78-88%, 15% at 100-108%
- For fairly priced listings (0.95-1.1): 70% of offers at 93-103% of market, 15% at 88-93%, 15% at 103-108%
- For underpriced listings (< 0.95): keep the bidding war logic as-is (offers above asking)

### 3. No UI changes needed

The UI already shows market value, asking price, and expected offer ranges correctly. The fix is purely in the offer amount calculations.

---

## Technical Details

### File: `src/hooks/useGameState.ts` (lines 2086-2100)

Replace the offer generation in `reduceListingPrice`:

```typescript
const newOffers: PropertyOffer[] = [];
const numNewOffers = Math.random() > 0.3 ? (Math.random() > 0.5 ? 3 : 2) : 1;

for (let i = 0; i < numNewOffers; i++) {
  const roll = Math.random();
  let offerAmount: number;

  if (roll < 0.70) {
    // 70% cluster around market value (90-105%)
    offerAmount = property.value * (0.90 + Math.random() * 0.15);
  } else if (roll < 0.85) {
    // 15% below market (80-90%)
    offerAmount = property.value * (0.80 + Math.random() * 0.10);
  } else {
    // 15% above market (105-115%)
    offerAmount = property.value * (1.05 + Math.random() * 0.10);
  }

  // Never exceed the new asking price
  offerAmount = Math.min(offerAmount, newPrice);

  newOffers.push({
    id: `offer-${Date.now()}-reduce-${i}`,
    buyerName: buyerNames[Math.floor(Math.random() * buyerNames.length)],
    amount: Math.floor(offerAmount),
    daysOnMarket: 0,
    isChainFree: Math.random() > 0.5,
    mortgageApproved: Math.random() > 0.25,
    timestamp: Date.now(),
    status: 'pending',
    negotiationRound: 0
  });
}
```

### File: `src/components/ui/estate-agent-window.tsx` (lines 322-345)

Update the periodic offer generation to use weighted distribution. For each pricing tier, apply the 70/15/15 split anchored to market value:

```typescript
let offerAmount: number;
const roll = Math.random();

if (priceRatio > 1.3) {
  // Very overpriced: most offers well below market
  if (roll < 0.70) offerAmount = marketValue * (0.82 + Math.random() * 0.13); // 82-95%
  else if (roll < 0.85) offerAmount = marketValue * (0.70 + Math.random() * 0.12); // 70-82%
  else offerAmount = marketValue * (0.95 + Math.random() * 0.08); // 95-103%
} else if (priceRatio > 1.1) {
  // Overpriced: offers around market value
  if (roll < 0.70) offerAmount = marketValue * (0.88 + Math.random() * 0.12); // 88-100%
  else if (roll < 0.85) offerAmount = marketValue * (0.78 + Math.random() * 0.10); // 78-88%
  else offerAmount = marketValue * (1.00 + Math.random() * 0.05); // 100-105%
} else if (priceRatio >= 0.95) {
  // Fairly priced: offers close to market
  if (roll < 0.70) offerAmount = marketValue * (0.93 + Math.random() * 0.10); // 93-103%
  else if (roll < 0.85) offerAmount = marketValue * (0.88 + Math.random() * 0.05); // 88-93%
  else offerAmount = marketValue * (1.03 + Math.random() * 0.05); // 103-108%
} else {
  // Underpriced: bidding war above asking
  offerAmount = askingPrice * (1.0 + Math.random() * 0.08);
}

// Never exceed asking price for overpriced listings
if (priceRatio > 1.0) {
  offerAmount = Math.min(offerAmount, askingPrice);
}
```

## Expected Outcome

- A £60,000 property listed at £83,700 will get offers mostly around £54,000-£63,000 (near market value), not £77,000-£84,000
- "Reduce Price 7%" still generates interest, but offers are anchored to the £60,000 market value
- 70% of offers cluster around market value, with realistic spread above and below
- Underpriced listings still generate competitive bidding wars above asking

