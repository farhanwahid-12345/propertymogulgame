// Shared tenant rent calculator — used by both the tenant selector preview
// AND the store's selectTenant action so the displayed rent matches the
// rent the tenant actually pays.
//
// Inputs are unit-agnostic (pass pounds for UI preview, pennies for store).
// The same multiplier maths is applied in both cases.

import type { PropertyCondition } from "@/types/game";

export interface TenantRentInput {
  profile: "premium" | "standard" | "budget" | "risky";
}

/**
 * Profile-based rent multiplier. Mirrors the logic in `gameStore.selectTenant`.
 * - premium  → +10%
 * - standard → flat
 * - budget   → -10%
 * - risky    → +5% (premium for risk)
 */
export function getProfileRentMultiplier(profile: TenantRentInput["profile"]): number {
  switch (profile) {
    case "premium": return 1.10;
    case "budget":  return 0.90;
    case "risky":   return 1.05;
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
    case "premium":      return 1.25;
    case "dilapidated":  return 0.70;
    case "standard":
    default:             return 1.00;
  }
}

/**
 * Calculate tenant rent. Pass `baseRent` in any consistent unit (pounds OR pennies).
 * Returns the same unit, floored to an integer.
 */
export function calcTenantRent(
  baseRent: number,
  tenant: { profile: TenantRentInput["profile"] },
  condition?: PropertyCondition
): number {
  const profileMult = getProfileRentMultiplier(tenant.profile);
  const conditionMult = getConditionRentMultiplierShared(condition);
  return Math.floor(baseRent * profileMult * conditionMult);
}
