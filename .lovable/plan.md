## Improvements 12–14

### 12. Yield rebalance + dynamic conversion ROI

**12a. Lift yield curve across the board**
Update `yieldForValue()` in `src/lib/engine/market.ts`:
| Value bracket | Current centre | New centre |
|--|--|--|
| ≤ £75k | 11% | **13%** |
| ≤ £150k | 9% | **11%** |
| ≤ £300k | 7.5% | **9%** |
| ≤ £600k | 6% | **7.5%** |
| ≤ £1.2m | 5% | **6.5%** |
| > £1.2m | 4% | **5.5%** |

Same `±1.5%` jitter, clamp raised to `[3, 16]`. Bump `monthlyIncome` on the seeded properties in `INITIAL_PROPERTIES` (`src/lib/engine/constants.ts`) by ~+20% so day-1 properties show ~13–15% yields instead of 9–10%. Cheaper stays meaningfully higher than premium — the curve just shifts up.

**12b. Bigger yield uplift on conversions for larger / higher-value buildings**
In `src/components/ui/renovation-dialog.tsx` the conversion `rentIncrease` values are flat. Replace with a value-aware scaling on top of the existing `scaleRenovationRent()` so a £400k house converted to a 6-bed HMO gains far more rent than a £120k one. New helper in `src/lib/engine/renovation.ts`:

```ts
getConversionRentMultiplier({ propertyValue, subtype, units }) // returns 1.0–2.5×
```

Applied in the renovation dialog preview and in `gameStore.completeRenovation` so booked rent matches. HMO uplift scales with `units` (rooms); flats uplift scales with `units`.

**12c. Make conversion Capital ROI realistic & dynamic**
Currently conversions in the screenshot show -64% / -41% capital ROI — they always destroy value. Adjust `valueIncrease` to scale with property value (HMO/flats add real GDV), and reroll the engine's value-uplift random multiplier (`RENOVATION_EXPECTED_MULTIPLIER` weights in `gameStore.completeRenovation`) for **conversion category only** to use:

- 50% × 1.0
- 30% × 1.4 (over-perform)
- 15% × 0.7
- 5% × 0.2 (planning-driven write-off)

Expected ≈ 1.10× — conversions are positive on average but can still flop. Other renovation categories keep their current weighting.

**12d. One-conversion-per-property cap**
Add `hasBeenConverted: boolean` to `Property` (or derive from `subtype !== 'standard'`). In `renovation-dialog.tsx` filter all `category === 'conversion'` options out when the property already has a non-standard subtype. Show a disabled card with the message "Already converted to {HMO|Flats}".

**12e. Predictions assume conversion is finished**
ROI/value previews in the renovation dialog currently use the property's pre-conversion value. When evaluating *non-conversion* options on an already-converted property, calculations should already be correct. The fix is to ensure the renovation list itself recomputes `propertyValue` after subtype change for cost/uplift scaling. Verify in the dialog's `useMemo` block (~L316) that `currentValue` reflects post-conversion value for predictions.

**12f. Selectable rooms / units on conversions**
Replace the two HMO presets (4-bed / 6-bed) and the single Flats preset with **parametric conversions**: when the player selects "Convert to HMO" or "Convert to Flats", show a slider for `units` bounded by available `internalSqft`:

- HMO: 1 room per **180 sqft**, min 3, max 8
- Flats: 1 flat per **550 sqft**, min 2, max 5

Cost, rent, value, planning approval probability, and duration all scale with chosen `units`. Stored on the property as `subtypeUnits: number`.

---

### 13. Flashing notification + sound for tenant concerns

In `src/components/ui/tenant-concerns-feed.tsx` (and the bottom-nav badge indicator):
- When `unresolved concerns count` increases, set a `flashing` class on the badge and the operations-center button. Tailwind: `animate-pulse ring-2 ring-warning/60`.
- Play a single short chime (one-shot per concern arrival, not looping). Use a small base64 WAV embedded in `src/lib/sound.ts`, gated by a `useRef(false)` "already played for this concern id" set so refreshing the page or navigating doesn't re-trigger.
- Stop the flashing as soon as the player opens the Tenant Concerns feed.
- Respect a `soundEnabled` toggle in the game store (default on); add a small speaker icon in the header to mute.

---

### 14. Skip basic repairs after redecoration / conversion

In `src/components/ui/renovation-dialog.tsx`, when filtering the available list:
- Hide `basic_repair` if `completedRenovationIds` includes `full_redecoration` **and** the completion happened within the last 24 in-game months.
- Hide `basic_repair` and `full_redecoration` for 12 months following completion of any `category === 'conversion'` renovation (the conversion already strips back and re-finishes the building).
- Add a small footnote chip on the property card: "Recently redecorated — basic maintenance not required."

No changes to maintenance damage roll itself; only to what the player can re-buy.

---

## Files

- **Modified**: `src/lib/engine/market.ts`, `src/lib/engine/constants.ts`, `src/lib/engine/renovation.ts`, `src/components/ui/renovation-dialog.tsx`, `src/stores/gameStore.ts`, `src/types/game.ts`, `src/components/ui/tenant-concerns-feed.tsx`, `src/components/ui/operations-center.tsx`, `src/components/ui/mobile-bottom-nav.tsx`, `src/pages/Index.tsx`
- **New**: `src/lib/sound.ts`

## Out of scope
- Re-pricing existing seed mortgages or recomputing historical tax against the new yields.
- Rebalancing macro-event magnitudes against new yield curve.
- Variable-rate concern chime (single sound only).
