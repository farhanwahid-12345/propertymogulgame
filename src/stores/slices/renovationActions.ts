/**
 * Renovation + planning action bundle.
 *
 * Phase 5 follow-up (v5): logic extracted verbatim from `gameStore.ts` so the
 * monolith can keep shrinking without changing behaviour or persisted shape.
 * The factory takes Zustand's `set`/`get` and returns an object that is
 * spread into the store literal in `gameStore.ts`.
 */

import type { Renovation, PlanningApplication, PropertyCondition } from '@/types/game';
import { RENOVATION_OPTIONS, type RenovationType } from '@/components/game/renovation-dialog';
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { showToast, debit, debitStrict } from '../storeHelpers';
import { gameRandom } from '@/lib/rng';
import { computePlanningApprovalProbability, getEffectiveInternalSqft } from '@/lib/engine/planning';
import { deriveSqft } from '@/lib/engine/market';
import {
  scaleRenovationCost, scaleRenovationRent, scaleRenovationValue,
  scaleRenovationForProperty, isDeductibleRevenueRenovation,
} from '@/lib/engine/renovation';
import {
  getConditionRentMultiplier, getConditionUpgradeCost, getConditionValueUplift,
} from '@/lib/engine/taxation';
import { getFurnishingCostPerSqft } from '@/lib/engine/financials';
import { getFurnishingRentMultiplier, getConditionRentMultiplierShared } from '@/lib/tenantRent';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createRenovationActions(set: SetFn, get: GetFn) {
  return {
    startRenovation: (propertyId: string, renovationType: RenovationType) => {
      const prev = get();

      // Conversion-specific gates: only one conversion per property.
      if (renovationType.category === 'conversion') {
        const propertyForCheck = prev.ownedProperties.find((p: any) => p.id === propertyId);
        const subtype = propertyForCheck?.subtype;
        if (subtype && subtype !== 'standard') {
          showToast(
            "Already Converted",
            `This property has already been converted to ${subtype}.`,
            "destructive",
          );
          return;
        }
        const completedConversion = (propertyForCheck?.completedRenovationIds || []).find(
          (id: string) => id === 'convert_hmo' || id === 'convert_flats' || id === 'convert_multi_let',
        );
        if (completedConversion) {
          showToast(
            "Already Converted",
            "Only one conversion type per property.",
            "destructive",
          );
          return;
        }
      }

      // Renovations needing planning permission must be applied for first —
      // route the call to the planning-application flow instead of starting
      // work immediately. The store's monthly tick will auto-start the
      // renovation when (and if) the LPA approves.
      if (renovationType.requiresPlanning) {
        const approved = (prev.planningApplications || []).find(
          (a: any) => a.propertyId === propertyId &&
            a.renovationTypeId === renovationType.id &&
            a.status === 'approved',
        );
        if (!approved) {
          (get() as any).submitPlanningApplication(propertyId, renovationType);
          return;
        }
      }

      // Conversion works can only begin once every tenant has vacated.
      if (renovationType.category === 'conversion') {
        if (prev.tenants.some((t: any) => t.propertyId === propertyId)) {
          showToast(
            "Conversion Blocked",
            "Vacate every unit (serve eviction notice) before converting.",
            "destructive",
          );
          return;
        }
      }

      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      const activeRenoIds = prev.renovations.filter((r: any) => r.propertyId === propertyId).map((r: any) => r.type.id);
      const completedRenoIds = (property?.completedRenovationIds || []);
      const effectiveSqft = property
        ? getEffectiveInternalSqft(
            property.internalSqft && property.internalSqft > 0
              ? property.internalSqft
              : deriveSqft({ type: property.type, value: fromPennies(property.value), internalSqft: property.internalSqft, plotSqft: property.plotSqft }).internalSqft,
            prev.planningApplications,
            propertyId,
            RENOVATION_OPTIONS,
            activeRenoIds,
            completedRenoIds,
          )
        : undefined;
      const scaleInputs = property
        ? { internalSqft: effectiveSqft, propertyValue: fromPennies(property.value) }
        : { propertyValue: fromPennies(renovationType.cost) * 5 };
      const scaled = scaleRenovationForProperty(renovationType as any, scaleInputs);
      const scaledCostPounds = scaled.cost;
      const scaledRent = scaled.rent;
      const scaledValue = scaled.value;

      const costPennies = toPennies(scaledCostPounds);
      const debited = debitStrict(prev, costPennies);
      if (!debited) { showToast("Insufficient Cash", `Need £${scaledCostPounds.toLocaleString()} in cash to start this renovation — overdraft can't fund renovations.`, "destructive"); return; }
      if (prev.renovations.some((r: any) => r.propertyId === propertyId && r.type.id === renovationType.id)) { showToast("Already In Progress", `${renovationType.name} is already underway on this property.`, "destructive"); return; }

      const scaledRenovationType = {
        ...renovationType,
        cost: scaledCostPounds,
        rentIncrease: scaledRent,
        valueIncrease: scaledValue,
      };
      const monthsToComplete = Math.max(1, Math.round(renovationType.duration / 30));
      const startMonth = prev.monthsPlayed;

      const prerequisiteExtensions: Array<{ renoType: RenovationType; scaledCost: number; scaledRent: number; scaledValue: number; costPennies: number; months: number }> = [];
      if (renovationType.category === 'conversion' && property) {
        const activeAndCompleted = new Set([...activeRenoIds, ...completedRenoIds]);
        const approvedExtensionApps = (prev.planningApplications || []).filter((a: any) =>
          a.propertyId === propertyId && a.status === 'approved',
        );
        for (const app of approvedExtensionApps) {
          const opt = RENOVATION_OPTIONS.find(o => o.id === app.renovationTypeId);
          if (!opt || opt.category !== 'extension') continue;
          if (activeAndCompleted.has(opt.id)) continue;
          const extScale = { internalSqft: property.internalSqft, propertyValue: fromPennies(property.value) };
          const extCostPounds = scaleRenovationCost(opt.cost, extScale);
          const extRent = scaleRenovationRent(opt.rentIncrease, extScale);
          const extValue = scaleRenovationValue(opt.valueIncrease, extScale);
          const extCostPennies = toPennies(extCostPounds);
          const extMonths = Math.max(1, Math.round(opt.duration / 30));
          prerequisiteExtensions.push({ renoType: opt, scaledCost: extCostPounds, scaledRent: extRent, scaledValue: extValue, costPennies: extCostPennies, months: extMonths });
        }
      }

      const extraCostPennies = prerequisiteExtensions.reduce((s, e) => s + e.costPennies, 0);
      let cashAfter = debited.cash;
      const overdraftAfter = prev.overdraftUsed;
      if (extraCostPennies > 0) {
        const extraDebited = debitStrict({ cash: cashAfter }, extraCostPennies);
        if (!extraDebited) {
          showToast(
            "Insufficient Cash",
            `Conversion needs an extra £${fromPennies(extraCostPennies).toLocaleString()} in cash to also build the approved extension(s) — overdraft can't fund renovations.`,
            "destructive",
          );
          return;
        }
        cashAfter = extraDebited.cash;
      }

      const longestPrereqMonths = prerequisiteExtensions.reduce((m, e) => Math.max(m, e.months), 0);
      const effectiveConversionMonths = Math.max(monthsToComplete, longestPrereqMonths);
      const completionMonth = startMonth + effectiveConversionMonths;
      const renovation: Renovation = {
        id: `${propertyId}_${renovationType.id}_${Date.now()}`, propertyId,
        type: scaledRenovationType, startDate: Date.now(),
        completionDate: Date.now() + (effectiveConversionMonths * 180 * 1000),
        startMonth,
        completionMonth,
      };
      const extensionRenovations: Renovation[] = prerequisiteExtensions.map((e, i) => ({
        id: `${propertyId}_${e.renoType.id}_${Date.now()}_${i}`,
        propertyId,
        type: { ...e.renoType, cost: e.scaledCost, rentIncrease: e.scaledRent, valueIncrease: e.scaledValue },
        startDate: Date.now(),
        completionDate: Date.now() + (e.months * 180 * 1000),
        startMonth,
        completionMonth: startMonth + e.months,
      }));

      const prereqNote = prerequisiteExtensions.length > 0
        ? ` Bundled with ${prerequisiteExtensions.map(e => e.renoType.name).join(', ')}.`
        : '';
      showToast("Renovation Started!", `${renovationType.name} begun.${prereqNote}`);

      const consumedExtIds = new Set(prerequisiteExtensions.map(e => e.renoType.id));
      const consumedPlanning = (prev.planningApplications || []).filter((a: any) => {
        if (a.propertyId !== propertyId) return true;
        if (a.status !== 'approved') return true;
        if (renovationType.requiresPlanning && a.renovationTypeId === renovationType.id) return false;
        if (consumedExtIds.has(a.renovationTypeId)) return false;
        return true;
      });

      const isRevenue = isDeductibleRevenueRenovation(renovationType.category);
      const mainCapital = isRevenue ? 0 : costPennies;
      const mainRevenue = isRevenue ? costPennies : 0;
      const extCapital = prerequisiteExtensions.reduce((s, e) =>
        s + (isDeductibleRevenueRenovation(e.renoType.category) ? 0 : e.costPennies), 0);
      const extRevenue = prerequisiteExtensions.reduce((s, e) =>
        s + (isDeductibleRevenueRenovation(e.renoType.category) ? e.costPennies : 0), 0);
      const totalSpend = costPennies + extraCostPennies;
      const totalCapital = mainCapital + extCapital;
      const updatedOwned = prev.ownedProperties.map((p: any) =>
        p.id === propertyId
          ? {
              ...p,
              totalRenovationSpendPennies: (p.totalRenovationSpendPennies || 0) + totalSpend,
              capitalImprovementsPennies: (p.capitalImprovementsPennies || 0) + totalCapital,
            }
          : p,
      );
      const newDeductibleExpenses = (prev.yearlyDeductibleExpenses || 0) + mainRevenue + extRevenue;
      set({
        cash: cashAfter,
        overdraftUsed: overdraftAfter,
        renovations: [...prev.renovations, renovation, ...extensionRenovations],
        planningApplications: consumedPlanning,
        ownedProperties: updatedOwned,
        yearlyDeductibleExpenses: newDeductibleExpenses,
      });
    },

    // ─── PLANNING PERMISSION ──────────────
    submitPlanningApplication: (propertyId: string, renovationType: RenovationType) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) { showToast("Property Not Found", "Cannot submit planning application.", "destructive"); return; }

      if (renovationType.category === 'conversion') {
        if (property.subtype && property.subtype !== 'standard') {
          showToast("Already Converted", `This property has already been converted to ${property.subtype}.`, "destructive");
          return;
        }
        const completedConversion = (property.completedRenovationIds || []).find(
          (id: string) => id === 'convert_hmo' || id === 'convert_flats' || id === 'convert_multi_let',
        );
        if (completedConversion) {
          showToast("Already Converted", "Only one conversion type per property.", "destructive");
          return;
        }
      }

      const cooldown = (prev.propertyLocks || []).find(
        (l: any) => l.propertyId === propertyId
          && l.reason === 'planning_cooldown'
          && l.untilMonth > prev.monthsPlayed
          && (l.renovationTypeId === undefined || l.renovationTypeId === renovationType.id),
      );
      if (cooldown) {
        showToast(
          "Planning Cooldown",
          `Cannot resubmit ${renovationType.name} until month ${cooldown.untilMonth} (${cooldown.untilMonth - prev.monthsPlayed} mo).`,
          "destructive",
        );
        return;
      }

      if ((prev.planningApplications || []).some(
        (a: any) => a.propertyId === propertyId && a.renovationTypeId === renovationType.id && a.status === 'pending',
      )) {
        showToast("Already Submitted", "An application is already pending for this work.", "destructive");
        return;
      }

      const feePounds = renovationType.planningFee ?? 250;
      const feePennies = toPennies(feePounds);
      const debited = feePennies > 0 ? debit(prev, feePennies) : { cash: prev.cash, overdraftUsed: prev.overdraftUsed, usedOverdraft: 0 };
      if (!debited) {
        showToast("Insufficient Funds", `Need £${feePounds.toLocaleString()} for planning fee.`, "destructive");
        return;
      }

      const history = prev.planningApplications || [];
      const approvalsCount = history.filter((a: any) => a.status === 'approved').length;
      const refusalsCount = history.filter((a: any) => a.status === 'refused').length;
      const valuePounds = fromPennies(property.value);
      const { prob } = computePlanningApprovalProbability({
        baseProb: renovationType.baseApprovalProb,
        propertyValuePounds: valuePounds,
        neighborhood: property.neighborhood,
        propertyType: property.type,
        renovationCategory: renovationType.category,
        approvalsCount,
        refusalsCount,
      });

      const approved = gameRandom() < prob;
      const refusalReasons = [
        'Over-development for the area — would harm street character.',
        'Loss of family housing stock conflicts with the Local Plan.',
        'Insufficient parking provision for proposed unit count.',
        'Daylight/sunlight impact on neighbouring properties.',
        'Inadequate amenity space for proposed occupancy.',
      ];
      const refusalReason = approved ? undefined : refusalReasons[Math.floor(gameRandom() * refusalReasons.length)];

      const waitMonths = Math.max(1, renovationType.planningWaitMonths ?? 2);
      const application: PlanningApplication = {
        id: `pp_${propertyId}_${renovationType.id}_${Date.now()}`,
        propertyId,
        renovationTypeId: renovationType.id,
        renovationCostPennies: toPennies(scaleRenovationForProperty(renovationType as any, {
          internalSqft: property.internalSqft,
          propertyValue: valuePounds,
        }).cost),
        renovationName: renovationType.name,
        submittedMonth: prev.monthsPlayed,
        decisionMonth: prev.monthsPlayed + waitMonths,
        status: 'pending',
        feePaid: feePennies,
        approvalProb: prob,
        approved,
        refusalReason,
      };

      showToast(
        "Planning Submitted 📋",
        `${renovationType.name} on ${property.name} — decision in ${waitMonths} mo. Fee £${feePounds.toLocaleString()} paid.`,
      );

      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        planningApplications: [...history, application],
      });
    },

    submitBatchPlanningApplications: (propertyId: string, renovationTypes: RenovationType[]) => {
      const items = (renovationTypes || []).filter(r => r && r.requiresPlanning);
      if (items.length === 0) return;
      if (items.length === 1) {
        (get() as any).submitPlanningApplication(propertyId, items[0]);
        return;
      }
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) { showToast("Property Not Found", "Cannot submit planning application.", "destructive"); return; }

      const batchIds = new Set(items.map(r => r.id));
      const cooldown = (prev.propertyLocks || []).find(
        (l: any) => l.propertyId === propertyId
          && l.reason === 'planning_cooldown'
          && l.untilMonth > prev.monthsPlayed
          && (l.renovationTypeId === undefined || batchIds.has(l.renovationTypeId)),
      );
      if (cooldown) {
        const which = cooldown.renovationTypeId
          ? items.find(r => r.id === cooldown.renovationTypeId)?.name || 'one of these items'
          : 'this property';
        showToast("Planning Cooldown", `${which} is in cooldown until month ${cooldown.untilMonth} (${cooldown.untilMonth - prev.monthsPlayed} mo).`, "destructive");
        return;
      }
      const history = prev.planningApplications || [];
      const filtered = items.filter(r => !history.some(
        (a: any) => a.propertyId === propertyId && a.renovationTypeId === r.id && a.status === 'pending',
      ));
      if (filtered.length === 0) {
        showToast("Already Submitted", "Applications already pending for these works.", "destructive");
        return;
      }

      const batchExtensionSqft = filtered
        .filter(r => r.category === 'extension')
        .reduce((s, r) => s + (r.sqftAdded || 0), 0);

      const rawFeePounds = filtered.reduce((s, r) => s + (r.planningFee ?? 250), 0);
      const discount = filtered.length >= 2 ? 0.10 : 0;
      const totalFeePounds = Math.round(rawFeePounds * (1 - discount));
      const totalFeePennies = toPennies(totalFeePounds);
      const debited = totalFeePennies > 0 ? debit(prev, totalFeePennies) : { cash: prev.cash, overdraftUsed: prev.overdraftUsed, usedOverdraft: 0 };
      if (!debited) {
        showToast("Insufficient Funds", `Need £${totalFeePounds.toLocaleString()} for combined planning fees.`, "destructive");
        return;
      }

      const approvalsCount = history.filter((a: any) => a.status === 'approved').length;
      const refusalsCount = history.filter((a: any) => a.status === 'refused').length;
      const valuePounds = fromPennies(property.value);
      const refusalReasons = [
        'Over-development for the area — would harm street character.',
        'Loss of family housing stock conflicts with the Local Plan.',
        'Insufficient parking provision for proposed unit count.',
        'Daylight/sunlight impact on neighbouring properties.',
        'Inadequate amenity space for proposed occupancy.',
      ];

      const newApps: PlanningApplication[] = filtered.map((r, i) => {
        const { prob } = computePlanningApprovalProbability({
          baseProb: r.baseApprovalProb,
          propertyValuePounds: valuePounds,
          neighborhood: property.neighborhood,
          propertyType: property.type,
          renovationCategory: r.category,
          approvalsCount,
          refusalsCount,
        });
        const approved = gameRandom() < prob;
        const refusalReason = approved ? undefined : refusalReasons[Math.floor(gameRandom() * refusalReasons.length)];
        const waitMonths = Math.max(1, r.planningWaitMonths ?? 2);
        const sizingSqft = r.category === 'conversion'
          ? (property.internalSqft || 0) + batchExtensionSqft
          : property.internalSqft;
        return {
          id: `pp_${propertyId}_${r.id}_${Date.now()}_${i}`,
          propertyId,
          renovationTypeId: r.id,
          renovationCostPennies: toPennies(scaleRenovationForProperty(r as any, {
            internalSqft: sizingSqft,
            propertyValue: valuePounds,
          }).cost),
          renovationName: r.name,
          submittedMonth: prev.monthsPlayed,
          decisionMonth: prev.monthsPlayed + waitMonths,
          status: 'pending',
          feePaid: Math.round(toPennies(r.planningFee ?? 250) * (1 - discount)),
          approvalProb: prob,
          approved,
          refusalReason,
        } as PlanningApplication;
      });

      const maxWait = Math.max(...filtered.map(r => r.planningWaitMonths ?? 2));
      const savedPounds = rawFeePounds - totalFeePounds;
      const discountNote = savedPounds > 0 ? ` (−£${savedPounds.toLocaleString()} bundle discount)` : '';
      showToast(
        "Batch Planning Submitted 📋",
        `${filtered.length} applications on ${property.name} — decisions in up to ${maxWait} mo. Fee £${totalFeePounds.toLocaleString()}${discountNote}.`,
      );

      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        planningApplications: [...history, ...newApps],
      });
    },

    acknowledgePlanningDecision: (applicationId: string) => {
      const prev = get();
      const app = (prev.planningApplications || []).find((a: any) => a.id === applicationId);
      if (!app) return;
      if (app.status === 'pending') return;
      set({ planningApplications: prev.planningApplications.filter((a: any) => a.id !== applicationId) });
    },

    dismissPlanningCelebration: (applicationId: string) => {
      const prev = get() as any;
      const list: string[] = prev.pendingPlanningCelebrations || [];
      set({ pendingPlanningCelebrations: list.filter(id => id !== applicationId) } as any);
    },

    clearPlanningCelebrations: () => {
      set({ pendingPlanningCelebrations: [] } as any);
    },

    dismissPlanningRefusal: (applicationId: string) => {
      const prev = get() as any;
      const list: string[] = prev.pendingPlanningRefusals || [];
      set({
        pendingPlanningRefusals: list.filter(id => id !== applicationId),
        planningApplications: (prev.planningApplications || []).filter((a: any) => a.id !== applicationId),
      } as any);
    },

    clearPlanningRefusals: () => {
      const prev = get() as any;
      const ids = new Set<string>(prev.pendingPlanningRefusals || []);
      set({
        pendingPlanningRefusals: [],
        planningApplications: (prev.planningApplications || []).filter((a: any) => !ids.has(a.id)),
      } as any);
    },

    upgradeCondition: (propertyId: string, targetCondition: PropertyCondition) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) return;
      if (prev.conveyancing.some((c: any) => c.propertyId === propertyId)) {
        showToast("In Conveyancing", "Cannot renovate during conveyancing.", "destructive"); return;
      }
      const cost = getConditionUpgradeCost(property.value, property.condition, targetCondition);
      if (cost <= 0) { showToast("Invalid Upgrade", "Cannot upgrade to this condition.", "destructive"); return; }
      const debited = debit(prev, cost);
      if (!debited) { showToast("Insufficient Funds", `Need £${fromPennies(cost).toLocaleString()} (even with overdraft).`, "destructive"); return; }

      const baseRent = property.baseRent || property.monthlyIncome;
      const newRent = Math.floor(baseRent * getConditionRentMultiplier(targetCondition));

      const valueMultiplier = getConditionValueUplift(property.condition, targetCondition);
      const newValue = Math.round(property.value * valueMultiplier);
      const newMarketValue = Math.round((property.marketValue ?? property.value) * valueMultiplier);
      const valueDelta = newValue - property.value;

      showToast(
        "🔨 Condition Upgrade!",
        `${property.name} upgraded to ${targetCondition}. Rent £${fromPennies(newRent).toLocaleString()}/mo, value +£${fromPennies(valueDelta).toLocaleString()}`,
      );
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        ownedProperties: prev.ownedProperties.map((p: any) =>
          p.id === propertyId
            ? { ...p, condition: targetCondition, monthsSinceLastRenovation: 0, monthlyIncome: newRent, value: newValue, marketValue: newMarketValue }
            : p
        ),
      });
    },

    furnishProperty: (propertyId: string, tier: 'unfurnished' | 'part_furnished' | 'fully_furnished') => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) return;
      if (prev.tenants.some((t: any) => t.propertyId === propertyId)) {
        showToast("Tenant in Place", "Furnish between tenancies — can't refit while occupied.", "destructive");
        return;
      }
      if (prev.conveyancing.some((c: any) => c.propertyId === propertyId)) {
        showToast("In Conveyancing", "Cannot furnish during conveyancing.", "destructive");
        return;
      }
      const sqft = property.internalSqft || 800;
      const costPerSqft = getFurnishingCostPerSqft(tier);
      const cost = toPennies(sqft * costPerSqft);
      if (cost > 0) {
        const debited = debit(prev, cost);
        if (!debited) {
          showToast("Insufficient Funds", `Need £${fromPennies(cost).toLocaleString()} to furnish (even with overdraft).`, "destructive");
          return;
        }
        const newMonthlyIncome = Math.floor(
          (property.baseRent || property.monthlyIncome) *
            getFurnishingRentMultiplier(tier) *
            getConditionRentMultiplierShared(property.condition),
        );
        set({
          cash: debited.cash,
          overdraftUsed: debited.overdraftUsed,
          ownedProperties: prev.ownedProperties.map((p: any) =>
            p.id === propertyId
              ? { ...p, furnishingTier: tier, furnishingMonthsRemaining: 60, monthlyIncome: newMonthlyIncome }
              : p
          ),
        });
        showToast("Furnishings Installed 🛋️", `${property.name} now ${tier.replace('_', ' ')}. Advertised rent £${newMonthlyIncome.toLocaleString()}/mo. Cost £${fromPennies(cost).toLocaleString()}.`);
      } else {
        const newMonthlyIncome = Math.floor(
          (property.baseRent || property.monthlyIncome) *
            getConditionRentMultiplierShared(property.condition),
        );
        set({
          ownedProperties: prev.ownedProperties.map((p: any) =>
            p.id === propertyId
              ? { ...p, furnishingTier: 'unfurnished', furnishingMonthsRemaining: undefined, monthlyIncome: newMonthlyIncome }
              : p
          ),
        });
        showToast("Furnishings Removed", `${property.name} reverted to unfurnished. Advertised rent £${newMonthlyIncome.toLocaleString()}/mo.`);
      }
    },
  };
}
