
# Completed: Fix Repair Frequency + Toughen Mortgage Difficulty

## Changes Made

### Repairs Made Realistic
- Lowered damageRisk: Premium 0.5-1%, Standard 1-3%, Budget 2-5%, Risky 5-10%
- Per-property cooldown increased from 30 to 48 months
- Global portfolio cooldown: max 1 damage event per 6 months across all properties

### Mortgage Difficulty Toughened
- Credit score net worth scaling slowed (divisor 20000, was 10000)
- Level bonus capped at 20 points (was uncapped)
- Removed compounding feedback loop from stored credit improvements
- Portfolio penalty increased to -8 per property beyond 3 (was -5)
- Monthly credit improvement now requires DTI < 40% (was unconditional)
- DTI > 60% now applies flat -2 penalty (was proportional)
- HSBC minimum credit score raised to 740 (was 720)
