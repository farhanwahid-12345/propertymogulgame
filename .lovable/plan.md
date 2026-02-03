
# Property Mogul Game Improvements Plan

## Summary of Issues Identified

After analyzing the codebase, I've identified the following issues that need to be addressed:

1. **Rent increases don't apply when selecting new tenants with higher rent** - The tenant system applies immediate adjustments but doesn't respect timing
2. **Negotiating prices to buy property doesn't work** - The estate agent calls `buyProperty` instead of `buyPropertyAtPrice`, ignoring the offer amount
3. **Fast auction for selling doesn't work properly** - Just sells quickly at a default price, not a proper quick auction
4. **Normal auction prices are unrealistic** - Houses always go too expensive, need more variance
5. **Selling in auction doesn't work properly** - The auction house sell tab uses local state and doesn't integrate well
6. **Estate agent sales are too slow** - 30-90 day wait is too long
7. **Properties you can't afford are shown** - Should filter based on affordability
8. **Need to ensure enough affordable houses are always available**

---

## Implementation Plan

### Task 1: Fix Negotiated Price Buying at Estate Agents

**Problem**: When buying from estate agent with a negotiated offer amount, the `onBuyProperty` callback passes `offerAmount` but `Index.tsx` ignores it and only passes `mortgagePercentage`.

**Solution**:
- Update `Index.tsx` to call `buyPropertyAtPrice` when an offer amount is provided that differs from property value
- The estate agent already captures `offerAmount` from the slider, just needs proper routing

**Files to modify**:
- `src/pages/Index.tsx` - Fix the `onBuyProperty` callback to use `buyPropertyAtPrice`

---

### Task 2: Fix Tenant Rent Upgrade Timing

**Problem**: When selecting a higher-paying tenant (e.g., premium), the rent should only increase after an appropriate time has passed, not immediately.

**Solution**:
- Track `lastTenantChange` on properties
- Only allow higher rent tenants after 3+ months since last tenant change
- Allow immediate switching to lower rent tenants (downgrades always possible)
- Show a message when a higher-paying tenant is unavailable due to timing

**Files to modify**:
- `src/components/ui/property-card.tsx` - Add `lastTenantChange?: number` to Property interface
- `src/hooks/useGameState.ts` - Track tenant change timing in `selectTenant`
- `src/components/ui/tenant-selector.tsx` - Filter/disable tenants based on timing, show appropriate messaging

---

### Task 3: Remove Fast Auction (Auction Button from Property Cards)

**Problem**: The "Auction (Fast)" button on property cards doesn't work properly - it just sells at a default quick price without real auction mechanics.

**Solution**:
- Remove the "Auction (Fast)" button from `PropertyCard`
- Keep only "List for Sale" for estate agent selling
- Consolidate auction selling through the Auction House dialog only

**Files to modify**:
- `src/components/ui/property-card.tsx` - Remove the "Auction (Fast)" button

---

### Task 4: Fix Normal Auction Price Variance

**Problem**: Auctions always end at high prices. Need more realistic variance where sometimes properties go below reserve or at bargain prices.

**Solution**:
- Adjust AI bidder valuations to be more varied (70% - 110% of guide price instead of 85% - 115%)
- Reduce AI bidder aggression overall
- Add chance that some auctions have fewer interested bidders (cold auctions)
- Add a "cooling market" factor where 30% of auctions have subdued bidding

**Files to modify**:
- `src/components/ui/auction-house.tsx` - Adjust `startLiveAuction` AI bidder generation

---

### Task 5: Fix Auction House Selling Tab

**Problem**: The auction sell tab uses local state (`listings`) that doesn't persist or integrate with the game. It should use the same listing system as estate agents but with auction mechanics.

**Solution**:
- Use `propertyListings` from game state instead of local listings
- When listing for auction, set `isAuction: true` in the listing
- Process auction listings differently - they complete faster with different pricing
- Remove local `listings` state

**Files to modify**:
- `src/components/ui/auction-house.tsx` - Integrate with `propertyListings` state
- `src/pages/Index.tsx` - Pass required props for listing management
- `src/hooks/useGameState.ts` - Improve auction listing processing

---

### Task 6: Speed Up Estate Agent Sales

**Problem**: Sales take 30-90 days which is too slow. Need faster cycle.

**Solution**:
- Reduce estate agent sale time to 14-45 days
- Increase offer generation frequency (every 3-5 days instead of 7-14)
- Make offers more likely when priced competitively

**Files to modify**:
- `src/hooks/useGameState.ts` - Adjust `daysToSell` calculation and offer timing

---

### Task 7: Filter Properties by Affordability

**Problem**: Estate agent shows properties the player cannot afford, cluttering the UI.

**Solution**:
- Filter `availableProperties` to only show properties where:
  - Cash + max mortgage (95% LTV with best eligible provider) >= total cost
  - Property value is within level range
- Show a message when properties are filtered out

**Files to modify**:
- `src/components/ui/estate-agent-window.tsx` - Add affordability filtering and messaging

---

### Task 8: Ensure Enough Affordable Properties Available

**Problem**: Game can become boring if no affordable properties are available.

**Solution**:
- Guarantee minimum 5 properties within player's current level and affordability
- When affordable inventory drops below 5, generate new properties at the lower end of level range
- Add a "market refresh" that cycles in new inventory every few in-game months

**Files to modify**:
- `src/hooks/useGameState.ts` - Enhance property generation to ensure minimum affordable inventory

---

## Technical Details

### Property Interface Update
```text
Property {
  ...existing fields...
  lastTenantChange?: number  // Month when tenant was last changed
}
```

### Tenant Timing Logic
```text
When selecting a tenant:
1. Calculate rent adjustment for new tenant
2. If new rent > current rent:
   - Check if 3+ months since lastTenantChange
   - If not enough time, show message and prevent selection
3. If new rent <= current rent: allow immediately
4. Update lastTenantChange to current month
```

### Affordability Calculation
```text
For each property:
1. Get max mortgage % player qualifies for (based on credit score and provider LTV)
2. Calculate: maxMortgageAmount = propertyPrice * maxMortgagePct
3. Calculate: cashNeeded = propertyPrice - maxMortgageAmount + fees
4. Property is affordable if: playerCash >= cashNeeded
```

### Auction Price Variance
```text
Current: AI valuations = 85% - 115% of guide
New: AI valuations = 70% - 110% of guide

Add "cold auction" chance (30%):
- Reduce bidder count to 2-3
- Reduce all valuations by additional 10%
- Result: some properties sell near/below reserve
```

---

## Order of Implementation

1. Fix negotiated price buying (quick fix)
2. Remove fast auction button (quick fix)
3. Speed up estate agent sales (quick fix)
4. Fix auction price variance (moderate)
5. Fix tenant rent timing (moderate)
6. Filter properties by affordability (moderate)
7. Ensure enough affordable properties (moderate)
8. Fix auction house selling integration (complex)
