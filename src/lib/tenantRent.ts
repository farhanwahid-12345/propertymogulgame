// Shared tenant rent calculator — used by both the tenant selector preview
// AND the store's selectTenant action so the displayed rent matches the
// rent the tenant actually pays.
//
// Inputs are unit-agnostic (pass pounds for UI preview, pennies for store).
// The same multiplier maths is applied in both cases.
//
// Double-counting fix: tenant profile variance is now encoded upstream in
// `market.ts` via the LHA_TENANT_TIER_MULT applied at listing generation.
// We deliberately do NOT re-apply a profile multiplier here, otherwise the
// premium / budget swing would stack on top of LHA tiering and produce
// unrealistic figures.

import type { PropertyCondition } from "@/types/game";
import {
  CITY_LHA_MONTHLY_PENNIES,
  CITY_FLAT_UNIT_RENT_BAND_PENNIES,
  roomRentDiscountForSubtype,
  bedroomsForSqft,

} from "@/lib/engine/constants";

export interface TenantRentInput {
  profile: "premium" | "standard" | "budget" | "risky";
}

/**
 * Profile-based rent offer multiplier. Listing rent is generated once at the
 * neutral 'standard' level, so applying this here is the only profile swing.
 */
export function getProfileRentMultiplier(profile: TenantRentInput["profile"]): number {
  switch (profile) {
    case "premium": return 1.10;
    case "risky":   return 1.05;
    case "budget":  return 0.90;
    case "standard":
    default:        return 1.00;
  }
}

/**
 * Property condition rent multiplier — kept here as a pure copy so both
 * UI and store agree without circular imports. Must match
 * `getConditionRentMultiplier` in `lib/engine/taxation.ts`.
 */
export function getConditionRentMultiplierShared(condition?: PropertyCondition): number {
  switch (condition) {
    case "premium":      return 1.10;
    case "dilapidated":  return 0.85;
    case "standard":
    default:             return 1.00;
  }
}

/** Rent multiplier from furnishing tier. Defaults to unfurnished (1.0). */
export function getFurnishingRentMultiplier(
  tier?: 'unfurnished' | 'part_furnished' | 'fully_furnished'
): number {
  switch (tier) {
    case 'part_furnished':  return 1.04;
    case 'fully_furnished': return 1.08;
    case 'unfurnished':
    default:                return 1.00;
  }
}

/** Optional property context used to derive a hard LHA ceiling. */
export interface RentClampContext {
  /** City id used to look up LHA bands. */
  cityId?: string;
  /** Per-property internal sqft (for bedroom inference). */
  internalSqft?: number;
  subtype?: 'standard' | 'hmo' | 'flats' | 'multi-let';
  subtypeUnits?: number;
  /** Value in PENNIES for flats-subtype bedroom inference. */
  valuePennies?: number;
  /**
   * Unit of `baseRent` passed to calcTenantRent. The LHA table is in pennies,
   * so we need to know whether the input/output are pounds or pennies to
   * compare apples to apples. Defaults to 'pennies' for store callers.
   */
  unit?: 'pennies' | 'pounds';
}

/** 1.5 × LHA per-bedroom monthly rate, in the requested unit. 0 if unknown. */
function lhaCeiling(ctx: RentClampContext | undefined): number {
  if (!ctx) return 0;
  const cityKey = (ctx.cityId ?? 'middlesbrough').toLowerCase();
  const table = CITY_LHA_MONTHLY_PENNIES[cityKey] ?? CITY_LHA_MONTHLY_PENNIES.middlesbrough;
  const units = Math.max(1, ctx.subtypeUnits ?? 1);
  let bedrooms: number;
  if (ctx.subtype === 'flats' && units > 1 && ctx.valuePennies) {
    const perUnitPounds = (ctx.valuePennies / 100) / units;
    if (perUnitPounds < 60_000) bedrooms = 1;
    else if (perUnitPounds < 110_000) bedrooms = 2;
    else if (perUnitPounds < 180_000) bedrooms = 3;
    else bedrooms = 4;
  } else if ((ctx.subtype === 'hmo' || ctx.subtype === 'multi-let') && units > 1 && ctx.internalSqft) {
    bedrooms = bedroomsForSqft(Math.round(ctx.internalSqft / units));
  } else if (ctx.internalSqft) {
    bedrooms = bedroomsForSqft(ctx.internalSqft);
  } else {
    bedrooms = 2;
  }
  const lhaPennies = table[bedrooms] ?? table[2];
  // Phase 1 #4a — HMO rooms and multi-let bedsits get a per-room discount
  // vs. self-contained LHA rates. Keep in sync with market.ts::baselineRentPennies.
  const hmoRoomDiscount = roomRentDiscountForSubtype(ctx.subtype);
  // For multi-unit aggregate rent we compare against an aggregate ceiling.
  let perUnitCeilingPennies = 1.5 * lhaPennies * hmoRoomDiscount;
  // Improvements #7 item 3 — flats ceiling respects the realistic per-unit band.
  if (ctx.subtype === 'flats' && units > 1) {
    const band = CITY_FLAT_UNIT_RENT_BAND_PENNIES[cityKey] ?? CITY_FLAT_UNIT_RENT_BAND_PENNIES.middlesbrough;
    perUnitCeilingPennies = Math.min(perUnitCeilingPennies, band.max);
  }
  const aggregatePennies = (ctx.subtype === 'hmo' || ctx.subtype === 'flats' || ctx.subtype === 'multi-let')
    ? perUnitCeilingPennies * units
    : perUnitCeilingPennies;
  return ctx.unit === 'pounds' ? aggregatePennies / 100 : aggregatePennies;

}

/**
 * Calculate tenant rent. Pass `baseRent` in any consistent unit (pounds OR pennies).
 * Returns the same unit, floored to an integer.
 *
 * Formula: baseRent × conditionMultiplier × furnishingMultiplier
 * (profile multiplier is intentionally NOT applied — see file header.)
 *
 * If `clampCtx` is provided, the result is hard-capped at 1.5 × LHA for the
 * inferred bedroom count so future multiplier combinations cannot drift the
 * rent into unrealistic territory.
 */
export function calcTenantRent(
  baseRent: number,
  tenant: { profile: TenantRentInput["profile"] },
  condition?: PropertyCondition,
  furnishingTier?: 'unfurnished' | 'part_furnished' | 'fully_furnished',
  clampCtx?: RentClampContext,
): number {
  const profileMult = getProfileRentMultiplier(tenant?.profile ?? "standard");
  const conditionMult = getConditionRentMultiplierShared(condition);
  const furnishingMult = getFurnishingRentMultiplier(furnishingTier);
  const raw = baseRent * profileMult * conditionMult * furnishingMult;
  const ceiling = lhaCeiling(clampCtx);
  const clamped = ceiling > 0 ? Math.min(raw, ceiling) : raw;
  return Math.floor(clamped);
}
