/**
 * Renovation cost/benefit scaling.
 *
 * Headline costs in `RENOVATION_OPTIONS` are calibrated for an "average"
 * Middlesbrough property: ~900 sqft internal floor area and ~£150k market
 * value. Renovating a 2,500 sqft luxury house (or a £400k commercial unit)
 * should clearly cost more — and yield more — than renovating a tiny
 * back-to-back terrace.
 *
 * We derive a single multiplier blending two factors:
 *   - sizeMult  → sqrt(internalSqft / 900). Sub-linear so a 4× sqft
 *                 property is ~2× cost, not 4×.
 *   - valueMult → (value / 150_000) ^ 0.4, clamped 0.7-2.0. Prestige
 *                 finishes track value, but not 1:1.
 *
 * Final cost multiplier is clamped 0.5-4.0 to avoid extremes.
 *
 * Benefits (rent uplift, value uplift) scale by the same multiplier so the
 * ROI shape stays roughly stable regardless of property size.
 *
 * All functions are pure — no side effects, no React.
 */

export interface RenovationScaleInputs {
  /** Internal floor area in square feet. Falls back to 900 if missing. */
  internalSqft?: number;
  /** Market value in pounds (NOT pennies). Falls back to 150_000 if missing. */
  propertyValue: number;
}

const REFERENCE_SQFT = 900;
const REFERENCE_VALUE = 150_000;

/** Returns the cost/benefit multiplier for a given property profile. */
export function getRenovationScaleMultiplier({ internalSqft, propertyValue }: RenovationScaleInputs): number {
  const sqft = internalSqft && internalSqft > 0 ? internalSqft : REFERENCE_SQFT;
  const value = propertyValue && propertyValue > 0 ? propertyValue : REFERENCE_VALUE;

  const sizeMult = Math.sqrt(sqft / REFERENCE_SQFT);
  const rawValueMult = Math.pow(value / REFERENCE_VALUE, 0.4);
  const valueMult = Math.max(0.7, Math.min(2.0, rawValueMult));

  const combined = sizeMult * valueMult;
  return Math.max(0.5, Math.min(4.0, combined));
}

/** Scales a base cost (pounds) for a property. Returns rounded pounds. */
export function scaleRenovationCost(baseCost: number, inputs: RenovationScaleInputs): number {
  const mult = getRenovationScaleMultiplier(inputs);
  return Math.round(baseCost * mult / 50) * 50; // round to nearest £50
}

/** Scales a base rent uplift (£/mo) for a property. */
export function scaleRenovationRent(baseRent: number, inputs: RenovationScaleInputs): number {
  const mult = getRenovationScaleMultiplier(inputs);
  return Math.round(baseRent * mult / 5) * 5; // round to nearest £5
}

/** Scales a base value uplift (pounds) for a property. */
export function scaleRenovationValue(baseValue: number, inputs: RenovationScaleInputs): number {
  const mult = getRenovationScaleMultiplier(inputs);
  return Math.round(baseValue * mult / 100) * 100; // round to nearest £100
}
