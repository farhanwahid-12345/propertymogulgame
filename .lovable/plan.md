

# Plan: Three property economics fixes

Three small, surgical edits in `src/stores/gameStore.ts` + a memory update for the valuation rule reversal.

---

## 1. Below-market purchases lower the market value

**Where:** `processMonthEnd`, the `completedBuys.forEach` block (around line 496-503) inside `src/stores/gameStore.ts`.

Today, when conveyancing completes the property's `marketValue` is set to `Math.max(prop.value, conv.purchasePrice)`. That means a £80k purchase of a £100k-listed property still becomes a £100k asset on day one — opposite of what you want.

**Change:** when the purchase price is **below** the listed value, set both `value` and `marketValue` to the purchase price. When at-or-above the listed value, keep current behaviour (value stays at listing, marketValue clamped to purchase price so you don't book an instant paper loss from fees on overpayment).

```ts
const listedValue = prop.value;
const paid = conv.purchasePrice || prop.price;
const settledValue = Math.min(listedValue, paid); // bargain reflected in net worth
const purchased: Property = {
  ...prop,
  owned: true,
  price: paid,
  value: settledValue,
  marketValue: Math.max(settledValue, paid),
  // ...rest unchanged
};
```

Net worth (cash + Σ property.value − debt) will now correctly reflect the bargain at zero — no more "instant £20k of free equity from buying cheap".

**Memory update:** `mem://game-mechanics/property-management/valuation-adjustment` currently says *"below-market purchases instantly match full market price"*. Rewrite it to say the opposite — market value tracks the purchase price for bargains; monthly appreciation drift will close the gap to true market over time.

---

## 2. Realistic rents inline with the listed yield

**Where:** `completedBuys.forEach` again, lines 491-502.

Right now, `effectiveRent = property.monthlyIncome` is used unchanged. But because we just lowered `value` to the purchase price (fix #1), the **stored rent (£/mo) was generated against the original listed value** — so the realised yield against the new lower value would silently be inflated. Conversely, properties whose `monthlyIncome` was rounded down at generation can drift away from the displayed yield.

**Change:** recompute rent at conveyancing-completion from the **stored displayed yield** and the **purchased value**:

```ts
const effectiveYield = prop.yield || (6 + Math.random() * 9);
// Rent is yield-of-property × value / 12 — keeps the displayed yield honest
const effectiveRent = settledValue > 0
  ? Math.floor((settledValue * (effectiveYield / 100)) / 12)
  : prop.monthlyIncome;
```

This ties the actual rent the player collects to the yield label they saw in the estate agent / auction. Same formula already used in the `market.ts` generator and the inline-conveyancing fallback — we're just making it the canonical source of truth at completion too.

---

## 3. Condition upgrade increases market value

**Where:** `upgradeCondition` action, lines 1612-1633 in `src/stores/gameStore.ts`.

Today the action mutates `condition`, `monthsSinceLastRenovation`, and `monthlyIncome`. It never touches `value` or `marketValue`, so a premium upgrade gives you more rent but no asset uplift.

**Change:** apply a value multiplier mirroring the rent multiplier already exported from `taxation.ts`.

- standard → premium: **+15%** to value & marketValue
- dilapidated → standard: **+25%** to value & marketValue (recovery of neglect)
- dilapidated → premium: **+40%** to value & marketValue

```ts
const valueMultiplier = getConditionValueUplift(property.condition, targetCondition);
const newValue = Math.round(property.value * valueMultiplier);
const newMarketValue = Math.round((property.marketValue ?? property.value) * valueMultiplier);

set({
  cash: prev.cash - cost,
  ownedProperties: prev.ownedProperties.map(p =>
    p.id === propertyId
      ? { ...p, condition: targetCondition, monthsSinceLastRenovation: 0,
          monthlyIncome: newRent, value: newValue, marketValue: newMarketValue }
      : p
  ),
});
```

Add `getConditionValueUplift(from, to)` as a new pure helper in `src/lib/engine/taxation.ts` next to the rent multiplier — returns `1.0` if no upgrade, else the multiplier from the table above.

Toast copy updated to mention the value bump:
`"${property.name} upgraded to ${targetCondition}. Rent £${newRent}/mo, value +£${(newValue - property.value)}"`.

---

## Files modified

| File | Change |
|---|---|
| `src/stores/gameStore.ts` | Conveyancing-complete: settle `value`/`marketValue` to purchase price for bargains; recompute rent from yield × value. `upgradeCondition`: bump value & marketValue. |
| `src/lib/engine/taxation.ts` | Add `getConditionValueUplift(from, to)` helper. |
| `mem://game-mechanics/property-management/valuation-adjustment` | Reverse the rule — bargains stay as bargains; appreciation closes the gap over time. |

No UI files touched — `useGameState` already converts `value` and `marketValue` for display, and the cards already read `value` from the store.

