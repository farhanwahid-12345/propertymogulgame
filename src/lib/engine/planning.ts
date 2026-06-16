/**
 * Pure planning-permission probability helpers.
 *
 * Both the Zustand store (when the user submits an application) and the
 * renovation dialog (for the "approval likelihood" badge) call these so the
 * displayed odds match the actual roll exactly.
 */

import { getCeilingPrice } from "./constants";

export interface ApprovalProbabilityInputs {
  /** Base probability declared on the renovation type (0..1). Defaults to 0.7. */
  baseProb?: number;
  /** Property's current value in pounds (NOT pennies). */
  propertyValuePounds: number;
  /** Property neighborhood — drives ceiling lookup + conservative-area penalty. */
  neighborhood: string;
  /** Property type — drives ceiling lookup + luxury penalty. */
  propertyType: 'residential' | 'commercial' | 'luxury';
  /** Renovation category — only conversion/extension trigger the conservative-area penalty. */
  renovationCategory: 'maintenance' | 'improvement' | 'extension' | 'conversion';
  /** Total approved applications across player history. */
  approvalsCount: number;
  /** Total refused applications across player history. */
  refusalsCount: number;
}

export interface ApprovalProbabilityModifier {
  label: string;
  delta: number; // signed, e.g. -0.10 or +0.05
}

export interface ApprovalProbabilityResult {
  /** Final probability, clamped 0.05..0.95. */
  prob: number;
  /** Base probability before modifiers. */
  base: number;
  /** Ordered list of modifiers applied (for transparent UI breakdowns). */
  modifiers: ApprovalProbabilityModifier[];
}

const CONSERVATIVE_AREAS = new Set(['Nunthorpe', 'Marton']);

export function computePlanningApprovalProbability(
  inputs: ApprovalProbabilityInputs,
): ApprovalProbabilityResult {
  const base = inputs.baseProb ?? 0.7;
  const ceiling = getCeilingPrice({ neighborhood: inputs.neighborhood, type: inputs.propertyType });
  const modifiers: ApprovalProbabilityModifier[] = [];

  // Over-development penalty — value already pushing area ceiling.
  // Item 14: halved from -0.10 → -0.05.
  if (ceiling > 0 && inputs.propertyValuePounds > 0.7 * ceiling) {
    modifiers.push({ label: 'Over-developed for area', delta: -0.05 });
  }

  // Conservative area / luxury type — stricter on conversions & extensions.
  // Item 14: halved from -0.10 → -0.05.
  const conservative =
    inputs.propertyType === 'luxury' || CONSERVATIVE_AREAS.has(inputs.neighborhood);
  if (conservative && (inputs.renovationCategory === 'conversion' || inputs.renovationCategory === 'extension')) {
    modifiers.push({ label: 'Conservative neighborhood', delta: -0.05 });
  }

  // Track-record adjustment, capped ±10%
  const rawTrack = inputs.approvalsCount * 0.01 - inputs.refusalsCount * 0.02;
  const trackAdj = Math.max(-0.10, Math.min(0.10, rawTrack));
  if (Math.abs(trackAdj) >= 0.005) {
    modifiers.push({
      label: trackAdj >= 0 ? 'Good planning track record' : 'Recent refusals on file',
      delta: Math.round(trackAdj * 100) / 100,
    });
  }

  const sumModifiers = modifiers.reduce((s, m) => s + m.delta, 0);
  const prob = Math.max(0.05, Math.min(0.95, base + sumModifiers));

  return { prob, base, modifiers };
}

/**
 * Effective internal sqft for a property = current internalSqft + sqft from any
 * extension renovations whose planning permission is APPROVED but not yet built
 * (i.e. not in active renovations and not completed). Used by the renovation
 * dialog AND the store's startRenovation path so a conversion sized against an
 * approved-but-unbuilt extension gets the right cost/rent/value uplift.
 */
export function getEffectiveInternalSqft(
  internalSqft: number | undefined,
  planningApplications: Array<{ propertyId: string; renovationTypeId: string; status: string; sqftAppliedAtPlanning?: boolean }> | undefined,
  propertyId: string,
  renovationOptions: Array<{ id: string; sqftAdded?: number }>,
  activeRenovationIds: string[] = [],
  completedRenovationIds: string[] = [],
): number {
  const base = internalSqft || 0;
  if (!planningApplications) return base;
  const pending = planningApplications
    .filter(a => a.propertyId === propertyId && a.status === 'approved')
    .reduce((sum, a) => {
      const r = renovationOptions.find(o => o.id === a.renovationTypeId);
      if (!r || !r.sqftAdded) return sum;
      // Phase 6 #15 — once the uplift has been baked into base internalSqft at
      // approval, skip it here to avoid double-counting (regardless of whether
      // the renovation is active or already completed).
      if (a.sqftAppliedAtPlanning) return sum;
      if (activeRenovationIds.includes(r.id) || completedRenovationIds.includes(r.id)) return sum;
      return sum + (r.sqftAdded || 0);
    }, 0);
  return base + pending;
}
