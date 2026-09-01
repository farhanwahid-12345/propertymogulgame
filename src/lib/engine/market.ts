// Property generation — pure functions, all monetary values in pennies
import type { Property } from "@/types/game";
import { toPennies } from "@/lib/formatCurrency";
import {
  MIDDLESBROUGH_STREETS, NEIGHBORHOODS,
  CITY_LHA_MONTHLY_PENNIES, LHA_TENANT_TIER_MULT, bedroomsForSqft,
  roomRentDiscountForSubtype, clampFlatUnitRentPennies,
} from "./constants";
import { getPropertyValueRangeForLevel, getFurnitureValuePennies } from "./financials";
import { getFurnishingRentMultiplier } from "@/lib/tenantRent";
import { getCityConfig, pickTypeForCity, type CityId } from "./cities";
import { generateSittingCommercialTenant } from "@/components/game/tenant-selector";

/**
 * Phase 4 (items 9–12) — LHA-anchored expected monthly rent (pennies) for a
 * property listing. Replaces the inflated `value × yield / 12` baseline.
 *
 *  - Bedroom band is inferred from per-unit sqft (HMO/multi-let split by unit)
 *    or per-unit value bands for flats subtype where sqft isn't subdivided.
 *  - Tier defaults to 'standard' (1.30× LHA), the market "asking" expectation.
 */
export function lhaAnchoredMonthlyRentPennies(args: {
  cityId?: string;
  internalSqft: number;
  valuePennies: number;
  subtype?: 'standard' | 'hmo' | 'flats' | 'multi-let';
  subtypeUnits?: number;
  tier?: 'risky' | 'budget' | 'standard' | 'premium';
}): number {
  const cityKey = (args.cityId ?? 'middlesbrough').toLowerCase();
  const table = CITY_LHA_MONTHLY_PENNIES[cityKey] ?? CITY_LHA_MONTHLY_PENNIES.middlesbrough;
  const units = Math.max(1, args.subtypeUnits ?? 1);

  // Per-unit bedroom inference.
  let bedrooms: number;
  if (args.subtype === 'flats' && units > 1) {
    // Per-unit value → sqft-equivalent band via price.
    const perUnitValuePounds = (args.valuePennies / 100) / units;
    if (perUnitValuePounds < 60_000) bedrooms = 1;
    else if (perUnitValuePounds < 110_000) bedrooms = 2;
    else if (perUnitValuePounds < 180_000) bedrooms = 3;
    else bedrooms = 4;
  } else if ((args.subtype === 'hmo' || args.subtype === 'multi-let') && units > 1) {
    bedrooms = bedroomsForSqft(Math.round(args.internalSqft / units));
  } else {
    bedrooms = bedroomsForSqft(args.internalSqft);
  }

  const lhaPerUnit = table[bedrooms] ?? table[2];
  const tier = args.tier ?? 'standard';
  const mult = LHA_TENANT_TIER_MULT[tier];
  // Phase 1 #4a — HMO rooms are single rooms in a shared house, not self-contained
  // lets. Halve the LHA-derived rent per room so aggregate HMO rent lands in the
  // realistic £280–£380/room band for Middlesbrough. Same principle applies to
  // multi-let bedsits (slightly less discount since they include their own kitchen).
  const hmoRoomDiscount = roomRentDiscountForSubtype(args.subtype);
  let perUnitRent = Math.round(lhaPerUnit * mult * hmoRoomDiscount);
  // Improvements #7 item 3 — self-contained flats are clamped to a realistic
  // per-unit band for the city, skewed to the lower median.
  if (args.subtype === 'flats' && units > 1) {
    perUnitRent = clampFlatUnitRentPennies(perUnitRent, args.cityId);
  }
  // Multi-unit properties aggregate rent across all units.
  const aggregate = (args.subtype === 'hmo' || args.subtype === 'flats' || args.subtype === 'multi-let')
    ? perUnitRent * units
    : perUnitRent;
  return Math.max(toPennies(400), aggregate);
}




/** Phase 3 — implied yield for an income-producing commercial property based on
 *  covenant strength and remaining lease term. Clamped to 6–15%. */
/** Phase 5 (item 14) — implied commercial yield is a step function of covenant
 *  strength with London-specific yield compression. `remainingMonths` is kept
 *  in the signature for back-compatibility but no longer materially shifts the
 *  yield (covenant dominates pricing). */
export function impliedCommercialYield(
  covenantStrength: number,
  _remainingMonths: number,
  cityId?: string,
): number {
  const isLondon = (cityId ?? '').toLowerCase() === 'london';
  if (covenantStrength >= 80) return isLondon ? 0.055 : 0.06;  // national high
  if (covenantStrength >= 65) return isLondon ? 0.060 : 0.08;  // national mid
  if (covenantStrength >= 50) return isLondon ? 0.065 : 0.10;  // local high
  if (covenantStrength >= 35) return isLondon ? 0.070 : 0.11;  // local mid
  return isLondon ? 0.075 : 0.12;                              // local lower
}

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

/**
 * Phase 4 #3 — Generate a random property, optionally for a specific city.
 * When `cityId` is omitted we default to Middlesbrough so existing call-sites
 * keep their old behaviour.
 */
export function generateRandomProperty(level: number, cityId?: CityId): Property {
  const city = getCityConfig(cityId);
  const id = `gen_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const type = pickTypeForCity(city, Math.random);

  // Blend city value band with level-gated max so the player can't see absurd
  // London stock at level 1; the city sets the floor + ceiling shape, the level
  // gate clips the upper end.
  const cityMin = toPennies(city.valueRange.min);
  const cityMax = toPennies(city.valueRange.max);
  const { max: levelMax } = getPropertyValueRangeForLevel(level);
  const actualMin = Math.max(toPennies(40_000), cityMin);
  const actualMax = Math.max(actualMin + toPennies(1_000), Math.min(cityMax, levelMax));
  const basePrice = actualMin + Math.random() * (actualMax - actualMin);
  // Round to nearest £1,000 (in pennies = 100_000)
  const price = Math.floor(basePrice / 100_000) * 100_000;
  const value = price;

  const neighborhood = city.neighborhoods[Math.floor(Math.random() * city.neighborhoods.length)];
  const streetName = city.streets[Math.floor(Math.random() * city.streets.length)];
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

  // Improvements #8 item 13 — footprint rules: a new build occupies ~35% of its
  // plot (30–40% jitter) so there is real headroom to extend up to the 70%
  // planning maximum enforced by the renovation engine.
  let internalSqft: number, plotSqft: number;
  const coverage = 0.30 + Math.random() * 0.10; // 30–40%, ~35% typical
  if (type === 'commercial') {
    internalSqft = Math.round(800 + Math.random() * 3200);
    plotSqft = Math.round(internalSqft / coverage);
  } else if (type === 'luxury') {
    internalSqft = Math.round(1500 + Math.random() * 3500);
    plotSqft = Math.round(Math.max(5000, internalSqft / coverage));
  } else {
    internalSqft = Math.round(500 + Math.random() * 1300);
    plotSqft = Math.round(Math.max(1200, internalSqft / coverage));
  }

  const marketJitter = 1 + (Math.random() - 0.5) * 0.30; // ±15%
  let marketValue = Math.max(toPennies(40_000), Math.round(value * marketJitter));

  // Phase 4 (items 9–12) — anchor expected residential rent to LHA bands.
  // Commercial stock keeps yield-based pricing (handled in the sitting-tenant
  // branch below); for non-commercial we use LHA × tier with small jitter.
  let baseMonthlyIncome: number;
  if (type === 'commercial') {
    // Provisional figure; overridden by income-cap pricing if a sitting tenant
    // is generated. Otherwise we keep a yield-based asking rent for vacant
    // commercial units (no LHA reference).
    const cityYield = city.yieldRange.min + Math.random() * (city.yieldRange.max - city.yieldRange.min);
    baseMonthlyIncome = Math.floor((price * (cityYield / 100)) / 12);
  } else {
    const rentJitter = 1 + (Math.random() - 0.5) * 0.16; // ±8%
    baseMonthlyIncome = Math.round(
      lhaAnchoredMonthlyRentPennies({
        cityId: city.id,
        internalSqft,
        valuePennies: value,
        subtype: 'standard',
        subtypeUnits: 1,
        tier: 'standard',
      }) * rentJitter,
    );
  }

  let finalPrice = price;
  let finalValue = value;
  let finalMonthlyIncome = Math.max(toPennies(400), baseMonthlyIncome);
  // Yield is now back-computed from anchored rent and value.
  let finalYield = (finalMonthlyIncome * 12) / value * 100;

  let commercialLease: Property['commercialLease'] | undefined;
  let sittingTenant: Property['sittingTenant'] | undefined;

  // Phase 3 — ~50% of commercial listings carry a sitting tenant + active FRI
  // lease. Price is recomputed via income-capitalisation off the implied yield.
  if (type === 'commercial' && Math.random() < 0.5) {
    sittingTenant = generateSittingCommercialTenant(city.id as any);
    const covenantStrength = sittingTenant.covenantStrength ?? 50;
    const remainingTermMonths = 6 + Math.floor(Math.random() * 79); // 6–84
    const reviewFrequencyMonths = Math.random() < 0.5 ? 36 : 60;
    const elapsed = Math.floor(Math.random() * 24); // already-served portion
    const termMonths = remainingTermMonths + elapsed;
    const negotiatedRentPennies = Math.max(toPennies(400), baseMonthlyIncome);
    const impliedYield = impliedCommercialYield(covenantStrength, remainingTermMonths, city.id);
    const incomePrice = Math.round((negotiatedRentPennies * 12) / impliedYield);
    finalPrice = Math.max(toPennies(40_000), Math.round(incomePrice / 100_000) * 100_000);
    finalValue = finalPrice;
    marketValue = finalPrice;
    finalYield = impliedYield * 100;
    finalMonthlyIncome = negotiatedRentPennies;
    // startMonth/expiryMonth are placeholders measured in "months-from-now"
    // (negative start). They get rewritten on conveyancing-complete so that
    // remainingMonths = expiryMonth - currentMonthsPlayed stays correct.
    commercialLease = {
      fri: true,
      termMonths,
      startMonth: -elapsed,
      expiryMonth: remainingTermMonths,
      reviewFrequencyMonths,
      breakClause: { type: 'none' },
      conditionScoreAtLeaseStart: condition === 'premium' ? 85 : condition === 'dilapidated' ? 35 : 65,
      negotiatedRentPennies,
    };
  }

  // Phase 6 (items 16/17) — yield must always reflect actual rent / actual
  // price, so the estate-agent display matches the income the property will
  // generate (post sitting-tenant rewrite, post LHA anchoring).
  const actualYield = finalPrice > 0
    ? +(((finalMonthlyIncome * 12) / finalPrice) * 100).toFixed(2)
    : 0;
  finalYield = actualYield;

  return {
    id,
    name: `${houseNumber} ${streetName}`,
    type,
    price: finalPrice,
    value: finalValue,
    marketValue,
    neighborhood,
    monthlyIncome: finalMonthlyIncome,
    marketTrend: "stable",
    yield: finalYield,
    lastRentIncrease: 0,
    condition,
    monthsSinceLastRenovation: 0,
    internalSqft,
    plotSqft,
    subtype: 'standard',
    epcRating,
    city: city.id,
    ...(commercialLease ? { commercialLease } : {}),
    ...(sittingTenant ? { sittingTenant } : {}),
  };
}



/** Roll a furnishing tier for new-stock listings. ~78% unfurnished / 15% part / 7% full. */
function rollListingFurnishing(): { tier: 'unfurnished' | 'part_furnished' | 'fully_furnished'; monthsRemaining?: number } {
  const r = Math.random();
  if (r < 0.07) return { tier: 'fully_furnished', monthsRemaining: 18 + Math.floor(Math.random() * 37) };
  if (r < 0.22) return { tier: 'part_furnished', monthsRemaining: 18 + Math.floor(Math.random() * 37) };
  return { tier: 'unfurnished' };
}

/** Wrap `generateRandomProperty` to occasionally list pre-furnished stock with bumped price. */
export function generateMarketProperty(level: number, cityId?: CityId): Property {
  const base = generateRandomProperty(level, cityId);
  const roll = rollListingFurnishing();
  if (roll.tier === 'unfurnished') return base;
  const tempForFurniture = { ...base, furnishingTier: roll.tier, furnishingMonthsRemaining: roll.monthsRemaining };
  const furniturePennies = getFurnitureValuePennies(tempForFurniture);
  const bumpedPrice = base.price + furniturePennies;
  const bumpedValue = base.value + furniturePennies;
  const bumpedYield = bumpedPrice > 0
    ? +(((base.monthlyIncome * 12) / bumpedPrice) * 100).toFixed(2)
    : base.yield;
  return {
    ...base,
    price: bumpedPrice,
    value: bumpedValue,
    yield: bumpedYield,
    furnishingTier: roll.tier,
    furnishingMonthsRemaining: roll.monthsRemaining,
  };
}

/** Derive plausible sqft for legacy properties that don't have it stored. */
export function deriveSqft(p: { type: 'residential' | 'commercial' | 'luxury'; value: number; internalSqft?: number; plotSqft?: number }): { internalSqft: number; plotSqft: number } {
  if (p.internalSqft && p.plotSqft) return { internalSqft: p.internalSqft, plotSqft: p.plotSqft };
  // Use value as a rough proxy (pennies → pounds → sqft band)
  const valuePounds = p.value / 100;
  // Improvements #8 item 13 — legacy saves get a ~35% coverage plot so they can
  // still extend up to the 70% planning maximum.
  const COVERAGE = 0.35;
  if (p.type === 'commercial') {
    const internal = Math.min(4000, Math.max(800, Math.round(800 + (valuePounds / 350))));
    return { internalSqft: internal, plotSqft: Math.round(internal / COVERAGE) };
  }
  if (p.type === 'luxury') {
    const internal = Math.min(5000, Math.max(1500, Math.round(1500 + (valuePounds / 200))));
    return { internalSqft: internal, plotSqft: Math.round(Math.max(5000, internal / COVERAGE)) };
  }
  const internal = Math.min(1800, Math.max(500, Math.round(500 + (valuePounds / 150))));
  return { internalSqft: internal, plotSqft: Math.round(Math.max(1200, internal / COVERAGE)) };
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
  /** Phase 2 #9a — current contractual rent in POUNDS; market rent must never
   *  be lower than current rent + 5% (Section 13 comparator must be realistic). */
  currentRentPounds?: number;
  /** Phase 2 #9a — original advertised baseline rent (pounds), used as floor. */
  baselineRentPounds?: number;
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

  const computed = Math.round((baseValue * blended * qualityMult * unitMult * furnishingMult * epcMult) / 12);
  // Phase 2 #9a — comparator floor: at least 5% above current rent, and never
  // below the original advertised baseline rent.
  const currentFloor = p.currentRentPounds && p.currentRentPounds > 0
    ? Math.round(p.currentRentPounds * 1.05)
    : 0;
  const baselineFloor = p.baselineRentPounds && p.baselineRentPounds > 0
    ? Math.round(p.baselineRentPounds)
    : 0;
  return Math.max(computed, currentFloor, baselineFloor);
}



