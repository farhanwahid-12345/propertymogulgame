

# Fix Repair Frequency + Toughen Mortgage Difficulty

## Problem 1: Repairs Too Frequent

The damage check runs **every month** with `Math.random() < tenant.damageRisk / 100`. A "standard" tenant has 3-10% damageRisk, meaning damage fires roughly every 10-33 months. The 30-month cooldown per property helps, but with multiple properties, the player constantly sees damage dialogs.

**Root cause**: The damageRisk values are too high for a monthly check, and the 30-month cooldown isn't enough when you own several properties.

### Fix

1. **Reduce tenant damageRisk values** in `tenant-selector.tsx`:
   - Premium: 0.5-1% (was 1-2%)
   - Standard: 1-3% (was 3-10%)
   - Budget: 2-5% (was 8-19%)
   - Risky: 5-10% (was 15-39%)

2. **Increase cooldown from 30 to 48 months** (4 years) per property in `useGameState.ts` line 925

3. **Add a global cooldown**: max 1 damage event across entire portfolio per 6 months, preventing multiple properties firing in quick succession

---

## Problem 2: Mortgages Still Too Easy

The credit score formula gives too many free points. Starting at 550 base, a Level 3 player with £200k net worth gets: 550 + 20 (net worth capped at 100 but scales fast) + 30 (level) + accumulated monthly improvements = easily 650+. The `calculateCreditScore` formula also feeds back the stored `gameState.creditScore` improvements at 0.5x, which compounds over time.

### Fix

**Tighten `calculateCreditScore`** in `useGameState.ts`:
- Reduce net worth divisor from 10,000 to 20,000 (slower scaling)
- Cap level bonus at 20 (was uncapped `level * 10`)
- Remove the feedback loop that adds stored credit score improvements back (line 1921) -- this causes compounding
- Increase portfolio size penalty from -5 to -8 per property beyond 3

**Slow monthly credit improvement** in the month-end logic:
- Only award +1 credit improvement if DTI is below 40% (was unconditional)
- Award +0 if DTI is 40-60%
- Apply -2 if DTI is above 60% (was -1 per 1%)

**Raise HSBC minimum credit score** from 720 to 740, making it a genuine late-game reward.

---

## Technical Details

### File: `src/components/ui/tenant-selector.tsx`

Update damageRisk ranges for each tenant profile:
- Premium: `0.5 + Math.random() * 0.5` (0.5-1%)
- Standard: `1 + Math.floor(Math.random() * 2)` (1-3%)
- Budget: `2 + Math.floor(Math.random() * 3)` (2-5%)
- Risky: `5 + Math.floor(Math.random() * 5)` (5-10%)

### File: `src/hooks/useGameState.ts`

**Line 925** -- change cooldown:
```
if (monthsSinceLastDamage >= 48)  // was 30
```

**Add global portfolio cooldown** (lines 909-953): Track `lastDamageMonth` globally, skip all damage if `monthsPlayed - lastGlobalDamageMonth < 6`.

**`calculateCreditScore` (lines 1911-1945):**
```typescript
let score = 550;
score += Math.min((netWorth - totalDebt) / 20000, 100); // slower scaling
score += Math.min(gameState.level * 10, 20); // cap at 20
// Remove line 1921 (stored credit feedback loop)
// Keep DTI and portfolio penalties as-is but increase portfolio penalty
if (propCount > 3) score -= (propCount - 3) * 8; // was 5
```

**Monthly credit improvement (lines 1072-1082):**
```typescript
let creditScoreImprovement = 0;
if (prev.mortgages.length > 0 && playerDTI < 0.40) {
  creditScoreImprovement += 1;
}
if (playerDTI > 0.60) {
  creditScoreImprovement -= 2;
}
```

**HSBC minCreditScore**: Change from 720 to 740 (line 193).

