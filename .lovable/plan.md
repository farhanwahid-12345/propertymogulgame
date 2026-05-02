## Renovation uplift % accuracy + ceiling tempering

Two related problems on the renovation dialog:

1. **Capital uplift % is misleading.** The screenshot HMO shows Cost £21,050, Value range £2,790–£9,300, Capital uplift (expected) **+37.6%**. That's mathematically `(£9,300 × 0.85) ÷ £21,050`, i.e. it treats the value uplift as pure return and ignores that £21,050 of cash was spent. With expected uplift well below cost, the true ROI is *negative* — but the UI shows green `+37.6%`. User wants a number that goes negative when the renovation is expected to lose money.
2. **Ceiling prices bite too hard.** The diminishing-returns curve starts trimming at 60% of ceiling and reaches 90% reduction at the cap. Combined with conservative ceiling values (e.g. Linthorpe residential £200k), even modest properties hit the taper early, making most renovations look like losses. User wants ceilings tempered down somewhat (i.e. less restrictive).

### Changes

#### 1. `src/components/ui/renovation-dialog.tsx` — fix uplift maths

Replace the per-card ROI block (lines ~529-560) so the displayed numbers describe the same probability-weighted distribution used by the engine and report **net** ROI:

- Use the true expected multiplier from the outcome roll: `expectedMult = 0.6×1.0 + 0.25×0.7 + 0.10×0.3 + 0.05×0 = 0.805` (single shared constant).
- `expectedValueUplift = cappedValueUp * expectedMult` (expected gross capital gain).
- `expectedRentUplift  = rentUp * expectedMult * (0.5 + 0.5 × diminishingFactor)` to mirror the rent factor applied at completion in `gameStore.ts` line 1483.
- **Capital ROI (net)** = `(expectedValueUplift − cost) / cost × 100` — can go negative.
- **Income ROI / yr (net of voids)** = `(expectedRentUplift × 12 × 0.85) / cost × 100`.
- **Combined 5-yr ROI** (new, optional helper line) = `(expectedValueUplift + expectedRentUplift × 60 × 0.85 − cost) / cost × 100` — gives a clearer "is this worth doing" signal.
- **Payback** = `cost / max(1, expectedRentUplift × 0.85)`.
- Colour: green when capital ROI > 0, amber when between -10% and 0%, red when < -10%. Replaces the current ceiling-based colouring (we already show the ceiling banner separately).
- Update the small italic line under the range to match the same expected mult: `"Outcomes vary: expected ≈ £{round(expectedValueUplift)}, 5% chance of total write-off."`.
- Also align `valueLow` / `valueHigh` so the range reflects the full distribution: keep `valueHigh = cappedValueUp` (60% case), set `valueLow = round(cappedValueUp × 0.3)` for the underwhelming case (already matches), and add a tooltip on `Value + (range)` explaining the 5% write-off tail.

Result for the screenshot example: Cost £21,050, expected gain ≈ £9,300 × 0.805 ≈ £7,486, **Capital ROI ≈ −64%** (red) — exactly the negative signal the user expects.

#### 2. `src/lib/engine/renovation.ts` — temper the diminishing curve

Soften `applyCeilingDiminishingReturns` so renovations remain viable closer to ceiling:

- Move the inflection from `ratio ≤ 0.6 → factor 1.0` up to `ratio ≤ 0.75 → factor 1.0`.
- Cap the floor at `0.35` (was `0.10`) so even at-ceiling properties keep ~35% of the uplift instead of being almost worthless.
- Linear taper between 0.75 and 1.0 from 1.0 → 0.35.

#### 3. `src/lib/engine/constants.ts` — temper `NEIGHBORHOOD_CEILINGS`

Raise residential and luxury ceilings ~15-25% to better reflect achievable Middlesbrough finished-product prices and stop choking renovation ROI in mid-tier areas:

- Linthorpe res 200k → 260k, lux 320k → 400k
- Acklam res 220k → 280k, lux 380k → 460k
- Marton res 280k → 340k
- Nunthorpe res 380k → 450k, lux 700k → 850k
- Middlesbrough Centre res 180k → 230k
- Hemlington res 200k → 240k
- Pallister Park res 130k → 165k
- North Ormesby res 110k → 140k
- South Bank res 110k → 140k
- Port Clarence res 95k → 120k
- Captain Cook Square res 220k → 280k
- Bump `DEFAULT_CEILING` residential 180k → 230k, luxury 350k → 430k.

Commercial ceilings left as-is (already comfortably above current commercial stock).

#### 4. Memory updates

Update `mem://game-mechanics/property-management/ceiling-prices` to record the softer curve (`≤0.75` flat, `0.35` floor) and the tempered ceiling values, so future plans don't regress these numbers.

### Files modified

- `src/components/ui/renovation-dialog.tsx` — net-ROI maths, alignment with displayed range, colour thresholds, tooltip.
- `src/lib/engine/renovation.ts` — softer `applyCeilingDiminishingReturns` (engine + dialog both consume this, so completion outcomes match the new preview).
- `src/lib/engine/constants.ts` — raised neighborhood ceilings + default ceiling.
- `mem://game-mechanics/property-management/ceiling-prices` — refreshed.

### Out of scope

- Changing the underlying outcome distribution (60/25/10/5 split stays).
- Changing per-renovation base costs/uplifts in `RENOVATION_OPTIONS`.
- Reworking how completion toasts report value gains.
