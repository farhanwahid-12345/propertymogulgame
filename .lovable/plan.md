

# Property Market Improvements Plan

## Overview

This plan addresses three main issues:
1. Properties under your current level minimum are still visible at estate agents
2. Selling properties is too slow and tedious  
3. Lack of realistic negotiation with buyers

---

## Problem Analysis

### Why Properties Under 100k Are Still Showing

When you level up to Level 2, the game correctly blocks purchases of properties below £100,000. However, the estate agent's filter only checks if you can **afford** a property (cash + mortgage), not whether you're **allowed** to buy it based on your level. This means cheap properties from Level 1 still appear in the list even though clicking "Buy" would fail.

### Why Selling Is Difficult

Current selling has two main issues:
- **Auctions**: 30-second live bidding is engaging but stressful for quick sales
- **Estate Agent**: Offers come every 3-5 days but require manual acceptance; no way to speed things up or negotiate

---

## Solution Summary

### For Estate Agents (Buying)

Add level restriction filtering alongside affordability filtering - only show properties within your current level's value range (e.g., Level 2 = £100k-£250k only)

### For Selling (Faster Sales)

1. **Quicker Auctions**: Add an "Express Auction" option with 15-second duration
2. **Faster Estate Agent Sales**: Increase offer frequency and add a "Price Reduction" feature that attracts more buyers quickly

### For Negotiations

Add a counter-offer system where:
1. You receive an offer
2. You can counter with a different price
3. Buyer responds with acceptance, rejection, or their own counter
4. Back-and-forth continues until agreement or walkaway

---

## Technical Implementation

### Task 1: Filter Properties by Level at Estate Agent

**Changes to `estate-agent-window.tsx`:**
- Add level-based filtering in addition to affordability
- Only show properties where value is between min and max for current level
- Update the "hidden properties" message to explain level restrictions

```
Current affordable filter:
  - Checks cash + max mortgage >= purchase cost

New filter:
  - Also checks property.value >= levelMin AND property.value <= levelMax
```

### Task 2: Express Auction Option

**Changes to `auction-house.tsx`:**
- Add option to start a 15-second express auction
- Lower reserve prices (75% instead of 85%) for quick sales
- Fewer AI bidders (2-3) for faster resolution

### Task 3: Estate Agent Speed Improvements

**Changes to `useGameState.ts`:**
- Add "Reduce Price" action that:
  - Drops asking price by 5-10%
  - Immediately generates 1-2 new offers
  - Increases chance of offers meeting auto-accept threshold

- Speed up offer generation to every 2-3 days

**Changes to `estate-agent-window.tsx`:**
- Add "Reduce Price" button on listings
- Show time since last offer received

### Task 4: Counter-Offer Negotiation System

**New interface for offers:**
```
PropertyOffer {
  ...existing fields...
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'buyer-countered'
  counterAmount?: number  // Player's counter-offer
  buyerCounterAmount?: number  // Buyer's response
  negotiationRound: number  // Track rounds (max 3)
}
```

**Negotiation Flow:**
1. Buyer makes initial offer (e.g., £85,000)
2. Player can:
   - **Accept**: Sale proceeds
   - **Reject**: Offer removed, buyer may return later
   - **Counter**: Propose different price (e.g., £92,000)
3. If countered, buyer responds (after 1-2 in-game days):
   - 60% chance: Accept player's counter
   - 25% chance: Make new counter-offer (split difference)
   - 15% chance: Walk away
4. Maximum 3 negotiation rounds before buyer gives final answer

**UI Changes to `estate-agent-window.tsx`:**
- Add "Counter Offer" button with price input
- Show negotiation history on each offer
- Display buyer's response after countering

### Task 5: Ensure Minimum Affordable Properties

**Changes to `useGameState.ts`:**
- When generating properties, ensure at least 5 are within BOTH:
  - Level range (e.g., £100k-£250k for Level 2)
  - Affordability (cash + max mortgage)
- Generate new properties at the lower end of the level range when needed

---

## Files to Modify

1. `src/components/ui/estate-agent-window.tsx`
   - Add level filtering to property display
   - Add "Counter Offer" UI for negotiations
   - Add "Reduce Price" button for listings

2. `src/hooks/useGameState.ts`
   - Add counter-offer state management
   - Implement buyer response logic
   - Add price reduction functionality
   - Fix affordable property generation to respect level ranges

3. `src/components/ui/auction-house.tsx`
   - Add express auction option (15 seconds)
   - Adjust AI bidder behavior for express mode

---

## Expected Outcomes

- **Estate Agent Buying**: Only properties you can actually purchase (both by level and affordability) will appear
- **Faster Selling**: Express auctions complete in 15 seconds; price reductions attract immediate offers
- **Realistic Negotiations**: Back-and-forth counter-offers with buyers, feeling more like real property transactions
- **Never Boring**: Always 5+ properties available that you can actually buy

