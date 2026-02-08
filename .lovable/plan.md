

# Realistic Negotiation System for Buying and Selling

## Overview

Two problems to fix:
1. **Buying**: You can slide the offer down to 85% and it always gets accepted instantly -- no vendor pushback
2. **Selling**: Offers cluster too close to asking price even when it's far above market value

---

## Buying: Vendor Counter-Offer System

Currently, clicking "Buy Property" at any slider price instantly purchases the property. Instead, the vendor should respond realistically:

### How It Will Work

1. You select a property and set your offer amount using the slider
2. You click "Submit Offer" (renamed from "Buy Property")
3. The vendor responds based on how your offer compares to market value:

| Your Offer vs Market Value | Vendor Response |
|---|---|
| 100%+ | Instant acceptance |
| 95-99% | 80% accept, 20% counter at asking price |
| 90-94% | 30% accept, 50% counter (split difference), 20% reject |
| 85-89% | 10% accept, 40% counter, 50% reject |
| Below 85% | 5% accept, 25% counter, 70% reject |

4. If the vendor counters, you see their counter-offer and can:
   - **Accept** their counter (purchase proceeds at their price)
   - **Counter again** (up to 3 rounds total)
   - **Walk away** (no purchase)

5. Each negotiation round, the vendor moves slightly toward your price but never below ~92% of market value

### UI Changes

- Replace "Buy Property" button with "Submit Offer"
- Add a negotiation panel that shows the back-and-forth
- Show vendor response with a brief delay (1-2 seconds) for realism
- Display negotiation status: "Vendor considering...", "Counter-offer received", etc.

---

## Selling: More Realistic Offer Amounts

Current problem: even if you list at 200% of market value, offers come in at 85-95% of market value, which is still close to reasonable. The issue is offers should be even lower relative to asking when the price is truly unrealistic.

### Changes to Offer Generation

The existing offer logic (lines 196-218 of estate-agent-window.tsx) will be updated:

| Asking Price vs Market | Offer Range | Speed |
|---|---|---|
| Below 90% of market | 100-108% of asking (bidding war) | Every 3-5 seconds |
| 90-100% of market | 95-103% of market value | Every 5-10 seconds |
| 100-110% of market | 88-98% of market value | Every 10-15 seconds |
| 110-130% of market | 80-92% of market value | Every 20-30 seconds |
| 130-150% of market | 70-85% of market value | Every 40-60 seconds |
| Over 150% of market | 60-75% of market value (lowball) | Every 60-90 seconds |

Key difference: when the asking price is ridiculous, offers anchor to market value and go significantly below it, not near asking price. Buyers in the real world don't offer close to an absurd asking price.

---

## Technical Implementation

### Files to Modify

**1. `src/components/ui/estate-agent-window.tsx`**

- Add buying negotiation state: `vendorResponse`, `negotiationRound`, `isNegotiating`, `vendorCounterAmount`
- Replace instant buy with offer submission that triggers vendor response
- Add negotiation UI panel showing offer history and vendor responses
- Update selling offer generation ranges (lines 196-218) to be more market-anchored for overpriced listings
- Adjust check intervals for very overpriced properties (add 40-90 second tiers)

**2. `src/pages/Index.tsx`**

- No changes needed -- `onBuyProperty` and `buyPropertyAtPrice` already support custom prices

### New Buying Flow (in estate-agent-window.tsx)

```
State additions:
- vendorResponse: 'pending' | 'accepted' | 'countered' | 'rejected' | null
- vendorCounterAmount: number | null  
- buyNegotiationRound: number
- isVendorThinking: boolean

On "Submit Offer":
1. Set isVendorThinking = true
2. After 1.5s delay, calculate vendor response based on offer/value ratio
3. If accepted: call onBuyProperty with offer amount
4. If countered: show vendor's counter-offer, let player accept/counter/walk away
5. If rejected: show rejection message, let player try new offer

Vendor counter-offer logic:
- Vendor counters at: marketValue - (marketValue - playerOffer) * 0.3
  (Vendor moves 30% toward your price each round)
- Vendor never goes below 92% of market value
- Max 3 rounds before vendor gives final "take it or leave it"
```

### Updated Selling Offer Logic

Replace lines 196-218 with wider offer ranges that anchor more strongly to market value, especially for grossly overpriced properties. Add two new pricing tiers for 130-150% and 150%+ overpriced listings where offers come in dramatically lower.

---

## Expected Outcomes

- **Buying**: You can no longer get properties at 85% of value easily; vendors will negotiate and most hold out for close to market value
- **Selling overpriced**: Listing at double the market value will result in very rare, very low offers rather than offers near market value
- **Selling underpriced**: Listing below market generates a flurry of competitive offers above asking
- **Realistic feel**: Both buying and selling involve genuine negotiation rather than instant transactions
