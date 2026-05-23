// Property generation — pure functions, all monetary values in pennies
import type { Property } from "@/types/game";
import { toPennies } from "@/lib/formatCurrency";
import { MIDDLESBROUGH_STREETS, NEIGHBORHOODS } from "./constants";
import { getPropertyValueRangeForLevel, getFurnitureValuePennies } from "./financials";
import { getFurnishingRentMultiplier } from "@/lib/tenantRent";

/** Map a property value (pennies) to a plausible gross rental yield %.
 *  Cheaper stock yields more; prime stock yields less. ±1.5% jitter, clamped [2.5, 14]. */
export function yieldForValue(valuePennies: number): number {
  const v = valuePennies / 100; // pounds
  let centre: number;
  if (v <= 75_000) centre = 15;
  else if (v <= 150_000) centre = 13;
  else if (v <= 300_000) centre = 10.5;
  else if (v <= 600_000) centre = 8.5;
  else if (v <= 1_200_000) centre = 6.5;
  else centre = 5.5;
  const jittered = centre + (Math.random() - 0.5) * 3; // ±1.5
  return Math.max(3, Math.min(16, jittered));
}

export function generateRandomProperty(level: number): Property {
  const id = `gen_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const types: Property['type'][] = ['residential', 'commercial', 'luxury'];
  const type = types[Math.floor(Math.random() * types.length)];

  const { min, max } = getPropertyValueRangeForLevel(level);
  const actualMin = Math.max(toPennies(40_000), min);
  const basePrice = actualMin + Math.random() * (max - actualMin);
  // Round to nearest £1,000 (in pennies = 100_000)
  const price = Math.floor(basePrice / 100_000) * 100_000;
  const value = price;

  const averageYield = yieldForValue(value);
  const baseMonthlyIncome = Math.floor((price * (averageYield / 100)) / 12);

  const neighborhood = NEIGHBORHOODS[Math.floor(Math.random() * NEIGHBORHOODS.length)];
  const streetName = MIDDLESBROUGH_STREETS[Math.floor(Math.random() * MIDDLESBROUGH_STREETS.length)];
  const houseNumber = Math.floor(1 + Math.random() * 200);

  // Random condition for generated properties
  const conditionRoll = Math.random();
  const condition = conditionRoll < 0.2 ? 'dilapidated' as const : conditionRoll < 0.85 ? 'standard' as const : 'premium' as const;

  // EPC rating weighted by condition (UK housing stock distribution)
  const epcRoll = Math.random();
  let epcRating: 'A'|'B'|'C'|'D'|'E'|'F'|'G';
  if (condition === 'premium') {
    epcRating = epcRoll < 0.15 ? 'A' : epcRoll < 0.55 ? 'B' : epcRoll < 0.9 ? 'C' : 'D';
  } else if (condition === 'dilapidated') {
    epcRating = epcRoll < 0.05 ? 'D' : epcRoll < 0.45 ? 'E' : epcRoll < 0.85 ? 'F' : 'G';
  } else {
    epcRating = epcRoll < 0.1 ? 'B' : epcRoll < 0.45 ? 'C' : epcRoll < 0.85 ? 'D' : epcRoll < 0.97 ? 'E' : 'F';
  }

  // Sqft generation by type
  let internalSqft: number, plotSqft: number;
  if (type === 'commercial') {
    internalSqft = Math.round(800 + Math.random() * 3200);
    plotSqft = Math.round(internalSqft * 1.2);
  } else if (type === 'luxury') {
    internalSqft = Math.round(1500 + Math.random() * 3500);
    plotSqft = Math.round(5000 + Math.random() * 15000);
  } else {
    internalSqft = Math.round(500 + Math.random() * 1300);
    plotSqft = Math.round(1500 + Math.random() * 4500);
  }

  return {
    id,
    name: `${houseNumber} ${streetName}`,
    type,
    price,
    value,
    neighborhood,
    monthlyIncome: Math.max(toPennies(400), baseMonthlyIncome),
    image: "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=400&h=300&fit=crop",
    marketTrend: "stable",
    yield: averageYield,
    lastRentIncrease: 0,
    condition,
    monthsSinceLastRenovation: 0,
    internalSqft,
    plotSqft,
    subtype: 'standard',
    epcRating,
  };
}

/** Roll a furnishing tier for new-stock listings. ~78% unfurnished / 15% part / 7% full. */
function rollListingFurnishing(): { tier: 'unfurnished' | 'part_furnished' | 'fully_furnished'; monthsRemaining?: number } {
  const r = Math.random();
  if (r < 0.07) return { tier: 'fully_furnished', monthsRemaining: 18 + Math.floor(Math.random() * 37) };
  if (r < 0.22) return { tier: 'part_furnished', monthsRemaining: 18 + Math.floor(Math.random() * 37) };
  return { tier: 'unfurnished' };
}

/** Wrap `generateRandomProperty` to occasionally list pre-furnished stock with bumped price & rent. */
export function generateMarketProperty(level: number): Property {
  const base = generateRandomProperty(level);
  const roll = rollListingFurnishing();
  if (roll.tier === 'unfurnished') return base;
  const tempForFurniture = { ...base, furnishingTier: roll.tier, furnishingMonthsRemaining: roll.monthsRemaining };
  const furniturePennies = getFurnitureValuePennies(tempForFurniture);
  const rentMult = getFurnishingRentMultiplier(roll.tier);
  const bumpedPrice = base.price + furniturePennies;
  const bumpedValue = base.value + furniturePennies;
  const bumpedRent = Math.floor(base.monthlyIncome * rentMult);
  return {
    ...base,
    price: bumpedPrice,
    value: bumpedValue,
    monthlyIncome: bumpedRent,
    furnishingTier: roll.tier,
    furnishingMonthsRemaining: roll.monthsRemaining,
  };
}

/** Derive plausible sqft for legacy properties that don't have it stored. */
export function deriveSqft(p: { type: 'residential' | 'commercial' | 'luxury'; value: number; internalSqft?: number; plotSqft?: number }): { internalSqft: number; plotSqft: number } {
  if (p.internalSqft && p.plotSqft) return { internalSqft: p.internalSqft, plotSqft: p.plotSqft };
  // Use value as a rough proxy (pennies → pounds → sqft band)
  const valuePounds = p.value / 100;
  if (p.type === 'commercial') {
    const internal = Math.round(800 + (valuePounds / 350) ); // gentle scaling
    return { internalSqft: Math.min(4000, Math.max(800, internal)), plotSqft: Math.round(Math.min(4000, Math.max(800, internal)) * 1.2) };
  }
  if (p.type === 'luxury') {
    const internal = Math.round(1500 + (valuePounds / 200));
    return { internalSqft: Math.min(5000, Math.max(1500, internal)), plotSqft: Math.round(5000 + (valuePounds / 80)) };
  }
  const internal = Math.round(500 + (valuePounds / 150));
  return { internalSqft: Math.min(1800, Math.max(500, internal)), plotSqft: Math.round(1500 + (valuePounds / 50)) };
}

/**
 * Fair monthly market rent in POUNDS for a property, accounting for condition
 * (renovations push effective rent up). Blends the property's stored yield
 * (preserves traits/location) with a condition-anchored yield, then scales by
 * a quality multiplier reflecting refurb premium.
 *
 * Inputs read in pounds (UI side); callers in pennies should divide first.
 */
export function getMarketRentPounds(p: {
  value: number; // pounds
  marketValue?: number; // pounds — prefer when present
  yield?: number; // %
  condition?: 'premium' | 'standard' | 'dilapidated';
  subtype?: 'standard' | 'hmo' | 'flats' | 'multi-let';
  subtypeUnits?: number;
  completedRenovationIds?: string[];
  /** Cumulative renovation spend in pennies — fuels a refurb-spend uplift. */
  totalRenovationSpendPennies?: number;
  /** Item #6: furnished comparables command higher rent — apply the same
   *  multiplier used by `calcTenantRent` so the market reference matches. */
  furnishingTier?: 'unfurnished' | 'part_furnished' | 'fully_furnished';
  /** Item #1: EPC band shifts effective rent (renters pay for energy-efficient stock). */
  epcRating?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
}): number {

  const baseValue = (typeof p.marketValue === 'number' && p.marketValue > 0) ? p.marketValue : p.value;
  if (!baseValue || baseValue <= 0) return 0;
  let conditionYield =
    p.condition === 'dilapidated' ? 0.085 :
    p.condition === 'premium'     ? 0.065 :
                                    0.075;
  // Subtype-aware yield bump (HMO/flats command higher gross yield)
  if (p.subtype === 'hmo') conditionYield += 0.015;
  else if (p.subtype === 'flats') conditionYield += 0.010;
  else if (p.subtype === 'multi-let') conditionYield += 0.005;

  const ownYield = (typeof p.yield === 'number' ? p.yield : 7) / 100;
  const blended = ownYield * 0.4 + conditionYield * 0.6;

  // Quality premium
  let qualityMult =
    p.condition === 'premium'     ? 1.12 :
    p.condition === 'dilapidated' ? 0.92 :
                                    1.0;
  // Fit-out premium: named premium-tier renos add up to +15%
  const PREMIUM_RENOS = [
    'kitchen_upgrade', 'bathroom_renovation', 'central_heating', 'double_glazing',
    'extension', 'loft_conversion', 'garage_conversion', 'garden_landscaping',
    'solar_panels', 'epc_upgrade',
  ];
  if (p.completedRenovationIds && p.completedRenovationIds.length) {
    const done = PREMIUM_RENOS.filter(id => p.completedRenovationIds!.includes(id)).length;
    qualityMult += Math.min(0.15, done * 0.025);
  }
  // Heavy refurb spend (catch-all): up to +20% based on spend/value ratio
  if (p.totalRenovationSpendPennies && p.totalRenovationSpendPennies > 0 && baseValue > 0) {
    const spendPounds = p.totalRenovationSpendPennies / 100;
    const spendRatio = spendPounds / baseValue;
    qualityMult += Math.min(0.20, spendRatio * 0.8);
  }

  // Per-unit multiplier for multi-unit subtypes
  let unitMult = 1;
  const units = Math.max(1, p.subtypeUnits ?? 1);
  if (p.subtype === 'hmo') unitMult = Math.min(1.32, 1 + 0.04 * (units - 1));
  else if (p.subtype === 'flats') unitMult = Math.min(1.4, 1 + 0.06 * (units - 1));

  // Furnishing premium — mirrors `getFurnishingRentMultiplier`.
  const furnishingMult = getFurnishingRentMultiplier(p.furnishingTier);

  // EPC multiplier — A/B properties command a small rent premium; F/G a discount.
  const epcMult =
    p.epcRating === 'A' ? 1.05 :
    p.epcRating === 'B' ? 1.03 :
    p.epcRating === 'C' ? 1.01 :
    p.epcRating === 'D' ? 1.00 :
    p.epcRating === 'E' ? 0.98 :
    p.epcRating === 'F' ? 0.95 :
    p.epcRating === 'G' ? 0.92 :
                          1.00;

  return Math.round((baseValue * blended * qualityMult * unitMult * furnishingMult * epcMult) / 12);
}


