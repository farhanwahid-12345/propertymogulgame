
# Completed: Auction House Overhaul + Realistic Mortgages

## Changes Made

### Auction House
- Multiple properties (5) in auction at all times, replenished from estate agent pool
- Mortgage support for buying: select mortgage %, provider before entering auction
- AI bidding anchored to market value (property.value) not guide price
- Selling auctions use in-game months (monthsPlayed) instead of Date.now()
- Selling uses 70/15/15 market-value-anchored price distribution
- Budget display shows total buying power with mortgage

### Mortgages Made Realistic
- Wider rate spread: HSBC 3.5%, Nationwide 4.5%, Halifax 5.8%, QuickCash 9.5%, Easy Finance 15%
- Wider rate fluctuation: ±1.5% from base (was ±0.5%), cheaper providers more volatile
- Tougher credit score: base 550 (was 600), net worth bonus capped at 100 (was 200)
- DTI checks: HSBC/Nationwide max 50%, Halifax 65%, QuickCash/EasyFinance 80%
- DTI penalty on credit score when over 60%
- Portfolio size penalty: -5 per property beyond 3
- Random application rejection: 15% HSBC, 10% Nationwide, 5% Halifax
- Mortgage provider selector updated with DTI badge and application risk indicator
