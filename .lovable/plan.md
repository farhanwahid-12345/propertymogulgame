
# Fix Estate Agent Empty Property List

## Problem Identified

When you're at Level 3 (£250k-£500k range) with plenty of cash (£470M), the estate agent shows zero properties because:

1. **Property generation ignores level minimum**: When generating "affordable" properties, the code sometimes creates properties below the level minimum price
2. **Initial property list is too small**: The base `AVAILABLE_PROPERTIES` array only has 4 properties for Level 3 (IDs 14-17)
3. **Random generation may not respect level bounds**: The `generateRandomProperty` function works correctly, but the "affordable property" adjustment (lines 607-610) can push prices below the level minimum

## Root Cause

In `useGameState.ts` lines 601-610:
```javascript
const { min: levelMin } = getPropertyValueRangeForLevel(gameState.level);
const affordableMax = Math.min(levelMin + (levelMin * 0.3), gameState.cash * 4);
const adjustedPrice = Math.max(40000, Math.floor(levelMin + Math.random() * (affordableMax - levelMin)));
```

When `affordableMax` is close to or equals `levelMin`, the generated properties cluster at the minimum, but when passed through estate agent filtering, they may still not meet affordability checks due to fees.

The bigger issue: **The generation only happens when `needsMoreAffordable` is true**, but the affordability check happens BEFORE level filtering. So properties below level minimum count as "affordable" but then get filtered out in the UI.

## Solution

### Fix 1: Generate Properties Within Level Range Only

Modify the property generation logic to:
1. Always ensure generated properties are within the player's current level range
2. Check affordability AFTER ensuring level compliance
3. Generate enough properties to guarantee minimum 5 are both affordable AND within level range

### Fix 2: Ensure Minimum Available Properties

Add a check that:
1. Counts properties that pass BOTH level range AND affordability filters
2. If fewer than 5, generates more at the lower end of the level range
3. Generates properties at prices the player can actually afford (considering their cash + max LTV)

### Fix 3: Regenerate Properties on Level Change

When the player levels up, the old lower-level properties become invisible. The game should:
1. Detect level changes
2. Clear out properties outside the new level range
3. Generate fresh properties within the new level range

---

## Technical Implementation

### Changes to `src/hooks/useGameState.ts`

**Update the property generation effect (around lines 555-641):**

1. Change the affordability check to also verify level range:
```javascript
// Count properties that are BOTH affordable AND within level range
const levelAffordableCount = estateAgentProperties.filter(p => 
  p.price >= min && p.price <= max && 
  isAffordable(p, gameState.cash, gameState.creditScore)
).length;
```

2. When generating affordable properties, ensure they stay within level bounds:
```javascript
// Generate properties at the lower end of the current level range
const targetPrice = min + Math.random() * (min * 0.5); // Lower 50% of level range
const adjustedPrice = Math.max(min, Math.min(max, Math.floor(targetPrice)));
```

3. Add level change detection to regenerate properties:
```javascript
// Track previous level and regenerate when it changes
const prevLevelRef = useRef(gameState.level);
useEffect(() => {
  if (prevLevelRef.current !== gameState.level) {
    // Level changed - regenerate estate agent properties
    setEstateAgentProperties([]);
    prevLevelRef.current = gameState.level;
  }
}, [gameState.level]);
```

4. Increase minimum guarantee from 5 to 8 properties

### Ensure Estate Agent Always Has Properties

Add a fallback that generates properties if the filtered list is empty:

```javascript
// If after all filtering we have zero properties, force-generate some
if (levelAffordableCount === 0) {
  // Generate 8 properties at the minimum of the level range
  const newProperties = [];
  for (let i = 0; i < 8; i++) {
    const prop = generateRandomProperty(gameState.level);
    // Adjust price to be exactly at level minimum + small variance
    prop.price = min + Math.floor(Math.random() * (min * 0.3));
    prop.value = prop.price;
    prop.monthlyIncome = Math.floor((prop.price * (6 + Math.random() * 9) / 100) / 12);
    newProperties.push(prop);
  }
  setEstateAgentProperties(prev => [...prev, ...newProperties]);
}
```

---

## Expected Outcome

After these changes:
- Estate agent will always show at least 5-8 properties that the player can actually buy
- Properties will always be within the player's current level range
- When leveling up, new properties appropriate for the new level will appear
- The "X properties hidden" message will show accurate counts
