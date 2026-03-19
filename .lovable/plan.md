

# Allow Negotiated-Down Properties to Be Purchased

## Problem

In `buyPropertyAtPrice` (useGameState.ts, line 1324), the level restriction checks if `purchasePrice < minValue`. This means a Level 2 player who negotiates a £105,000 property down to £95,000 gets blocked because £95,000 < £100,000 (Level 2 minimum).

The property itself is a valid Level 2 property — it's listed in the Level 2 range. The negotiated price should not disqualify it.

## Fix

**File: `src/hooks/useGameState.ts` (line 1324)**

Change the validation from checking the **purchase price** against the level minimum to checking the **property's market value** instead:

```
Before: if (purchasePrice < minValue)
After:  if (property.value < minValue)
```

This way, if the property's market value falls within the player's level range, the purchase goes through regardless of the negotiated discount. A £105k property negotiated to £95k is still a valid Level 2 property.

One line change, no other files affected.

