
# Fix Properties Showing as Free (£0 Price Bug)

## Problem Identified

Properties are appearing with £0 price because of a calculation bug when generating "affordable" properties at Level 1.

### Root Cause

For Level 1, the game defines `{ min: 0, max: 100000 }` as the price range. The code then tries to generate properties at the "lower 50% of the level range" using this formula:

```
targetPrice = levelMin + Math.random() * (levelMin * 0.5)
```

When `levelMin = 0`:
- `targetPrice = 0 + Math.random() * 0 = 0`
- Properties get created with £0 price and £0 rent

This bug appears in two places in the code:
1. **Line 506**: When regenerating properties after level change
2. **Line 645**: When ensuring minimum affordable properties

---

## Solution

### Fix 1: Always Use a Minimum Realistic Price Floor

Instead of relying on `levelMin` for calculations, use a minimum floor of £40,000 (which is already defined elsewhere in the code as a realistic minimum property value).

**Changes to property generation logic:**

```
Before:
const targetPrice = levelMin + Math.random() * (levelMin * 0.5);

After:
const priceFloor = Math.max(40000, levelMin);
const targetPrice = priceFloor + Math.random() * (priceFloor * 0.5);
```

### Fix 2: Add Validation Before Adding Properties

Add a check to ensure no property with price <= 0 ever gets added to the list:

```
if (property.price > 0 && property.monthlyIncome > 0) {
  list.push(property);
}
```

---

## Files to Modify

**`src/hooks/useGameState.ts`** - Two locations:

### Location 1: Lines 504-509 (Level change property generation)
- Replace the targetPrice calculation with a floor of £40,000
- Ensure monthlyIncome is calculated from the actual price

### Location 2: Lines 643-652 (Affordable property generation)
- Apply the same fix using £40,000 floor
- Add validation to prevent £0 properties

---

## Technical Changes

### In `useGameState.ts` around line 504-509:

Change from:
```javascript
const targetPrice = min + Math.random() * (min * 0.5);
prop.price = Math.max(min, Math.min(max, Math.floor(targetPrice)));
```

To:
```javascript
const priceFloor = Math.max(40000, min);
const targetPrice = priceFloor + Math.random() * (priceFloor * 0.5);
prop.price = Math.max(priceFloor, Math.min(max, Math.floor(targetPrice)));
```

### In `useGameState.ts` around line 645-652:

Change from:
```javascript
const targetPrice = levelMin + Math.random() * (levelMin * 0.5);
const adjustedPrice = Math.max(levelMin, Math.min(levelMax, Math.floor(targetPrice)));
```

To:
```javascript
const priceFloor = Math.max(40000, levelMin);
const targetPrice = priceFloor + Math.random() * (priceFloor * 0.5);
const adjustedPrice = Math.max(priceFloor, Math.min(levelMax, Math.floor(targetPrice)));
```

---

## Expected Outcome

After this fix:
- All properties will have a minimum price of £40,000
- Monthly income will be properly calculated (6-15% annual yield)
- No more "free" houses appearing in the estate agent
- Level 1 properties will range from £40,000 to £100,000
