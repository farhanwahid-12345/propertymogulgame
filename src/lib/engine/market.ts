// Property generation — pure functions, all monetary values in pennies
import type { Property } from "@/types/game";
import { toPennies } from "@/lib/formatCurrency";
import { MIDDLESBROUGH_STREETS, NEIGHBORHOODS } from "./constants";
import { getPropertyValueRangeForLevel } from "./financials";

/** Map a property value (pennies) to a plausible gross rental yield %.
 *  Cheaper stock yields more; prime stock yields less. ±1.5% jitter, clamped [2.5, 14]. */
export function yieldForValue(valuePennies: number): number {
  const v = valuePennies / 100; // pounds
  let centre: number;
  if (v <= 75_000) centre = 13;
  else if (v <= 150_000) centre = 11;
  else if (v <= 300_000) centre = 9;
  else if (v <= 600_000) centre = 7.5;
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
  yield?: number; // %
  condition?: 'premium' | 'standard' | 'dilapidated';
}): number {
  if (!p.value || p.value <= 0) return 0;
  const conditionYield =
    p.condition === 'dilapidated' ? 0.085 :
    p.condition === 'premium'     ? 0.065 :
                                    0.075;
  const ownYield = (typeof p.yield === 'number' ? p.yield : 7) / 100;
  // Blend: keep some of the property's individuality, anchor to condition norms
  const blended = ownYield * 0.4 + conditionYield * 0.6;
  // Quality premium: refurbished stock commands more than yield alone implies
  const qualityMult =
    p.condition === 'premium'     ? 1.12 :
    p.condition === 'dilapidated' ? 0.92 :
                                    1.0;
  return Math.round((p.value * blended * qualityMult) / 12);
}
