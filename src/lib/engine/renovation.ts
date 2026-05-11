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

/**
 * Shrinks a renovation's value uplift as the current value approaches the
 * postcode/area ceiling. Tempered curve — buyers still pay something for
 * a quality finish even at ceiling.
 *
 *   ratio ≤ 0.75 → factor 1.0 (full uplift)
 *   ratio  1.0  → factor 0.35 (floor)
 *   linear taper between
 */
export function applyCeilingDiminishingReturns(
  rawUplift: number,
  currentValue: number,
  ceilingPrice: number,
): { uplift: number; diminishingFactor: number } {
  if (ceilingPrice <= 0) return { uplift: rawUplift, diminishingFactor: 1 };
  const ratio = Math.min(1, currentValue / ceilingPrice);
  let factor: number;
  if (ratio <= 0.75) factor = 1.0;
  else factor = Math.max(0.35, 1.0 - ((ratio - 0.75) / 0.25) * 0.65);
  return { uplift: Math.round(rawUplift * factor), diminishingFactor: factor };
}

/**
 * Probability-weighted expected outcome multiplier for a renovation.
 * Mirrors the engine's completion roll in `gameStore.ts`:
 *   60% × 1.0 + 25% × 0.7 + 10% × 0.3 + 5% × 0 = 0.805
 * Exported so the dialog preview reports the same expected value the engine
 * delivers on average.
 */
export const RENOVATION_EXPECTED_MULTIPLIER = 0.805;

/**
 * Conversion-only expected multiplier. Conversions (HMO / flats / change-of-use)
 * are GDV plays — when they land they over-perform; failures are rarer.
 *   50%×1.0 + 30%×1.4 + 15%×0.7 + 5%×0.2 ≈ 1.035
 */
export const CONVERSION_EXPECTED_MULTIPLIER = 1.035;

/**
 * Value-aware uplift multiplier for conversions. Bigger / more valuable
 * buildings convert into HMOs and flats with much larger absolute uplifts —
 * a £400k Victorian terrace into a 6-bed HMO produces several times the
 * rent uplift of a £120k one. Combine multiplicatively with `units`.
 */
export function getConversionScaleMultiplier(args: {
  propertyValue: number;          // pounds
  subtype: 'hmo' | 'flats' | 'multi-let' | 'standard';
  units?: number;                 // rooms (HMO) or flats (flats). Defaults sensibly.
}): number {
  const v = args.propertyValue || 150_000;
  // Sub-linear scaling on value: a 4× value building gets ~2× uplift
  const valueMult = Math.max(0.7, Math.min(3.5, Math.pow(v / 150_000, 0.55)));
  const units = Math.max(1, args.units || (args.subtype === 'flats' ? 2 : 4));
  // HMOs scale per room with diminishing returns; flats roughly linear
  let unitMult: number;
  if (args.subtype === 'hmo') {
    unitMult = 0.55 + 0.18 * units; // 4 rooms → ~1.27, 6 → ~1.63, 8 → ~1.99
  } else if (args.subtype === 'flats') {
    unitMult = 0.55 + 0.4 * units;  // 2 → 1.35, 3 → 1.75, 4 → 2.15
  } else {
    unitMult = 1.0;
  }
  return Math.max(0.5, Math.min(7.0, valueMult * unitMult));
}

/**
 * Returns true when the property can realistically be upgraded to "premium"
 * condition via an in-game improvement renovation. Used by the satisfaction
 * tick to decide whether to penalise a premium tenant in a standard property.
 *
 * Eligibility:
 *   - Property currently in `standard` condition
 *   - At least one improvement-tier renovation is still un-done
 *     (kitchen_upgrade / bathroom_renovation / central_heating / double_glazing)
 *   - No active `planning_cooldown` lock (refused major works recently)
 */
const PREMIUM_UPGRADE_RENOS = [
  'kitchen_upgrade',
  'bathroom_renovation',
  'central_heating',
  'double_glazing',
];

export function canUpgradeToPremium(args: {
  condition?: string;
  completedRenovationIds?: string[];
  hasPlanningCooldown?: boolean;
}): boolean {
  if (args.condition !== 'standard') return false;
  if (args.hasPlanningCooldown) return false;
  const done = new Set(args.completedRenovationIds || []);
  return PREMIUM_UPGRADE_RENOS.some(id => !done.has(id));
}

/** Renovation type IDs that, when completed on a standard property, lift it to premium. */
export function isConditionUpgradeRenovation(renovationTypeId: string): boolean {
  return PREMIUM_UPGRADE_RENOS.includes(renovationTypeId);
}

/**
 * True when every premium-tier upgrade renovation has been completed.
 * A fully-upgraded property won't degrade premium → standard from neglect alone.
 */
export function isFullyUpgraded(completedRenovationIds?: string[]): boolean {
  const done = new Set(completedRenovationIds || []);
  return PREMIUM_UPGRADE_RENOS.every(id => done.has(id));
}
