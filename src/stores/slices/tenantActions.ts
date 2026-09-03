/**
 * Tenant action bundle — letting, rent increases, evictions, deposit disputes.
 *
 * Phase 3d: extracted verbatim from `gameStore.ts` behind a factory so the
 * store literal stays a thin composer. Behaviour and persisted shape are
 * unchanged. Cross-slice reads via `get()` only.
 */
import type {
  GameState,
  PropertyTenant, EvictionGround, PendingEviction,
} from '@/types/game';
import type { Tenant } from '@/components/game/tenant-selector';
import { fromPennies, toPennies } from '@/lib/formatCurrency';
import { calcTenantRent } from '@/lib/tenantRent';
import { gameRandom } from '@/lib/rng';
import { showToast, debit, debitStrict, calcDeposit } from '../storeHelpers';

/**
 * Commercial lease transaction fees (in pounds).
 * - Agent fee: 10% of the first year's rent.
 * - Solicitor: flat £750 (Improvements #7 item 4).
 * - Land Registry: only registrable when term > 7yr (84mo); HMLR sliding scale
 *   computed against the lease "premium" = annualRent × termYears / 5.
 */
function calcCommercialLeaseFeesPounds(monthlyRentPennies: number, termMonths: number): { solicitor: number; landRegistry: number; agentFee: number } {
  const termYears = termMonths / 12;
  const solicitor = 750;
  const agentFee = Math.round((monthlyRentPennies / 100) * 12 * 0.10);
  let landRegistry = 0;
  if (termMonths > 84) {
    const annualRentPounds = fromPennies(monthlyRentPennies) * 12;
    const premium = annualRentPounds * termYears / 5;
    if (premium < 100_000) landRegistry = 20;
    else if (premium < 200_000) landRegistry = 45;
    else if (premium < 500_000) landRegistry = 95;
    else {
      const extraThousands = Math.ceil((premium - 500_000) / 1000);
      landRegistry = Math.min(500, 140 + extraThousands * 5);
    }
  }
  return { solicitor, landRegistry, agentFee };
}
import { checkAndUnlockAchievements, ACHIEVEMENTS } from '@/lib/achievements';
import {
  CONCERN_RESOLVE_CONDITION_LIFT,
  CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT,
  MAX_TOPUP_POINTS_PER_MONTH,
  conditionTierFromScore,
  scoreFromConditionTier,
} from '@/lib/engine/constants';

type SetFn = (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void;
type GetFn = () => GameState;

export function createTenantActions(set: SetFn, get: GetFn) {
  return {
    selectTenant: (propertyId: string, tenant: Tenant, slotIndex: number = 0) => {
      const prev = get();
      const property = prev.ownedProperties.find((p) => p.id === propertyId);
      if (!property) return;
      // Phase 8 (item 22) — HMOs cannot accept tenants without an active licence.
      if (property.subtype === 'hmo' && property.hmoLicenceStatus !== 'licensed') {
        showToast(
          "HMO Licence Required",
          "HMO licence required before tenanting. Apply from the property card.",
          "destructive",
        );
        return;
      }
      if (prev.conveyancing.some((c) => c.propertyId === propertyId)) {
        showToast("In Conveyancing", "Cannot change tenants during conveyancing.", "destructive"); return;
      }
      const activeReno = (prev.renovations || []).find((r) => {
        if (r.propertyId !== propertyId) return false;
        if (typeof r.completionMonth === 'number') return prev.monthsPlayed < r.completionMonth;
        return Date.now() < r.completionDate;
      });
      if (activeReno) {
        showToast(
          "Works in Progress",
          `Cannot let — ${activeReno.type?.name || 'a renovation'} is underway. Wait for completion.`,
          "destructive",
        );
        return;
      }
      const releLock = prev.propertyLocks.find((l) => l.propertyId === propertyId && l.reason === 'relet_lock' && prev.monthsPlayed < l.untilMonth && (l.slotIndex === undefined || l.slotIndex === slotIndex));
      if (releLock) {
        showToast("Re-let Locked", `You evicted on 'move-in' grounds. Cannot re-let this slot until month ${releLock.untilMonth}.`, "destructive");
        return;
      }
      const saleLock = prev.propertyLocks.find((l) => l.propertyId === propertyId && l.reason === 'sale_lock' && prev.monthsPlayed < l.untilMonth);
      if (saleLock) {
        showToast(
          "Sale Lock Active",
          `You served a sale-grounds notice — list this property for sale before re-letting (unlocks month ${saleLock.untilMonth}).`,
          "destructive",
        );
        return;
      }

      const epc = property.epcRating;
      const post2030 = prev.monthsPlayed >= 60;
      const epcIllegal = epc === 'F' || epc === 'G' || (post2030 && (epc === 'D' || epc === 'E'));
      if (epcIllegal) {
        showToast(
          "Letting Blocked — MEES",
          `Property is EPC ${epc}. ${post2030
            ? 'From 2030 you must reach Band C before letting.'
            : 'F/G properties cannot be let. Upgrade EPC first.'}`,
          "destructive",
        );
        return;
      }

      const isMultiUnit = property.subtype === 'hmo' || property.subtype === 'flats';
      const unitCount = isMultiUnit ? Math.max(1, property.subtypeUnits || 1) : 1;
      const safeSlot = Math.max(0, Math.min(unitCount - 1, slotIndex));

      if (prev.tenants.some((t) => t.propertyId === propertyId && (t.slotIndex ?? 0) === safeSlot)) {
        showToast(
          "Slot Occupied",
          isMultiUnit
            ? `Slot already let — serve a valid eviction notice on that unit first.`
            : "You can't replace a sitting tenant — serve a valid eviction notice first.",
          "destructive"
        );
        return;
      }

      let propertyBaseRent = property.baseRent || property.monthlyIncome;
      if (propertyBaseRent <= 0 && property.value > 0) {
        const yieldPct = property.yield ?? 7;
        propertyBaseRent = Math.floor((property.value * (yieldPct / 100)) / 12);
      }
      const slotBaseRent = isMultiUnit
        ? Math.floor(propertyBaseRent / unitCount)
        : propertyBaseRent;
      const slotRent = calcTenantRent(slotBaseRent, tenant, property.condition, property.furnishingTier, {
        cityId: property.city,
        internalSqft: property.internalSqft,
        subtype: property.subtype,
        subtypeUnits: property.subtypeUnits,
        valuePennies: property.value,
        unit: 'pennies',
      });

      if (!isMultiUnit) {
        const isIncrease = slotRent > property.monthlyIncome;
        if (isIncrease && property.lastTenantChange !== undefined) {
          const months = prev.monthsPlayed - property.lastTenantChange;
          if (months < 3) {
            showToast("Too Soon", `Wait ${3 - months} more month(s) for a higher-paying tenant.`, "destructive");
            return;
          }
        }
      }

      const requiredDeposit = calcDeposit(slotRent);

      const updatedVoids = prev.voidPeriods.filter((vp) => vp.propertyId !== propertyId);
      const rec: PropertyTenant = {
        propertyId,
        slotIndex: safeSlot,
        tenant,
        rentMultiplier: tenant.rentMultiplier,
        startDate: Date.now(),
        satisfaction: 80,
        lastSatisfactionUpdate: prev.monthsPlayed,
        satisfactionReasons: [],
        moveInMonth: prev.monthsPlayed,
        depositHeld: requiredDeposit,
        rentPennies: slotRent,
      };
      const updatedTenants = [...prev.tenants, rec];

      const newMonthlyIncome = isMultiUnit
        ? updatedTenants
            .filter((t) => t.propertyId === propertyId)
            .reduce((sum: number, t) => sum + (t.rentPennies ?? 0), 0)
        : slotRent;

      const updatedProps = prev.ownedProperties.map((p) =>
        p.id === propertyId ? { ...p, monthlyIncome: newMonthlyIncome, baseRent: propertyBaseRent, lastTenantChange: prev.monthsPlayed, lastRentIncrease: prev.monthsPlayed } : p
      );
      const slotLabel = isMultiUnit ? ` (${property.subtype === 'flats' ? 'Flat' : 'Room'} ${safeSlot + 1})` : '';
      showToast(
        "Tenant Moved In!",
        `${tenant.name}${slotLabel} renting at £${fromPennies(slotRent).toLocaleString()}/mo. 5-week deposit (£${fromPennies(requiredDeposit).toLocaleString()}) protected via TDS.`
      );
      set({ tenants: updatedTenants, ownedProperties: updatedProps, voidPeriods: updatedVoids });
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pm:tenant-selected', { detail: { propertyId } })); } catch { /* noop */ }
    },

    // Phase 2 — Heads of Terms: sign a commercial lease at agreed terms.
    signCommercialLease: (
      propertyId: string,
      tenant: Tenant,
      terms: {
        agreedRentPennies: number;
        termMonths: number;
        reviewFrequencyMonths: number;
        breakClause: { type: 'none' | 'tenant' | 'mutual'; atMonth?: number };
      },
    ) => {
      const prev = get();
      const property = prev.ownedProperties.find((p) => p.id === propertyId);
      if (!property) return;
      if (property.type !== 'commercial') {
        showToast("Not Commercial", "Heads of Terms only apply to commercial property.", "destructive"); return;
      }
      if (prev.conveyancing.some((c) => c.propertyId === propertyId)) {
        showToast("In Conveyancing", "Cannot sign a lease during conveyancing.", "destructive"); return;
      }
      if (prev.tenants.some((t) => t.propertyId === propertyId)) {
        showToast("Already Let", "This unit already has a tenant in place.", "destructive"); return;
      }

      const agreedRent = Math.max(1, Math.round(terms.agreedRentPennies));
      const requiredDeposit = calcDeposit(agreedRent);

      // Commercial lease transaction fees — agent + solicitor + (optional) HMLR registration.
      const fees = calcCommercialLeaseFeesPounds(agreedRent, terms.termMonths);
      const totalFees = fees.solicitor + fees.landRegistry + fees.agentFee;
      const totalFeesPennies = toPennies(totalFees);
      const debited = debitStrict(prev, totalFeesPennies);
      if (!debited) {
        showToast(
          "Insufficient Funds",
          `Need £${totalFees.toLocaleString()} in cash to cover agent (£${fees.agentFee.toLocaleString()}) + solicitor (£${fees.solicitor.toLocaleString()}) + land registry (£${fees.landRegistry.toLocaleString()}) fees.`,
          "destructive",
        );
        return;
      }

      const startMonth = prev.monthsPlayed;
      const lease = {
        fri: true,
        termMonths: terms.termMonths,
        startMonth,
        expiryMonth: startMonth + terms.termMonths,
        reviewFrequencyMonths: terms.reviewFrequencyMonths,
        breakClause: terms.breakClause,
        conditionScoreAtLeaseStart: typeof property.conditionScore === 'number'
          ? property.conditionScore
          : scoreFromConditionTier(property.condition),
        negotiatedRentPennies: agreedRent,
      };

      const rec: PropertyTenant = {
        propertyId,
        slotIndex: 0,
        tenant,
        rentMultiplier: tenant.rentMultiplier ?? 1,
        startDate: Date.now(),
        satisfaction: 80,
        lastSatisfactionUpdate: prev.monthsPlayed,
        satisfactionReasons: [],
        moveInMonth: prev.monthsPlayed,
        depositHeld: requiredDeposit,
        rentPennies: agreedRent,
      };
      const updatedTenants = [...prev.tenants, rec];
      const updatedVoids = prev.voidPeriods.filter((vp) => vp.propertyId !== propertyId);
      const updatedProps = prev.ownedProperties.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              commercialLease: lease,
              monthlyIncome: agreedRent,
              baseRent: agreedRent,
              lastTenantChange: prev.monthsPlayed,
              lastRentIncrease: prev.monthsPlayed,
              commercialVacantSinceMonth: undefined,
            }
          : p,
      );
      // Drop any queued applicants for this property — the unit is now let.
      const updatedPendingApplicants = (prev.pendingCommercialApplicants || [])
        .filter((a) => a.propertyId !== propertyId);

      const breakLabel = terms.breakClause.type === 'none'
        ? 'no break clause'
        : `${terms.breakClause.type} break @ month ${terms.breakClause.atMonth ?? '?'}`;
      showToast(
        "Heads of Terms Signed 📄",
        `${tenant.companyName ?? tenant.name} — £${fromPennies(agreedRent).toLocaleString()}/mo on a ${Math.round(terms.termMonths / 12)}-yr FRI lease (${breakLabel}, ${terms.reviewFrequencyMonths}-mo reviews). 5-week deposit £${fromPennies(requiredDeposit).toLocaleString()} held.`,
      );
      showToast(
        "Commercial lease signed",
        `Agent fee: £${fees.agentFee.toLocaleString()} | Solicitor: £${fees.solicitor.toLocaleString()} | Land Registry: £${fees.landRegistry.toLocaleString()} | Total: £${totalFees.toLocaleString()} deducted.`,
      );
      set({
        tenants: updatedTenants,
        ownedProperties: updatedProps,
        voidPeriods: updatedVoids,
        cash: debited.cash,
        pendingCommercialApplicants: updatedPendingApplicants,
      });
    },

    // Phase 3 — settle a pending commercial rent review at the agreed rent.
    settleRentReview: (propertyId: string, agreedRentPennies: number) => {
      const prev = get();
      const property = prev.ownedProperties.find((p) => p.id === propertyId);
      if (!property || property.type !== 'commercial') {
        showToast("Not Commercial", "Rent reviews only apply to commercial leases.", "destructive"); return;
      }
      const pending = (prev.pendingRentReviews || []).find((r) => r.propertyId === propertyId);
      if (!pending) {
        showToast("No review due", "There is no outstanding rent review for this property.", "destructive"); return;
      }
      const agreed = Math.max(1, Math.round(agreedRentPennies));

      const updatedProps = prev.ownedProperties.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              monthlyIncome: agreed,
              baseRent: agreed,
              lastRentIncrease: prev.monthsPlayed,
              commercialLease: p.commercialLease
                ? { ...p.commercialLease, negotiatedRentPennies: agreed }
                : p.commercialLease,
            }
          : p,
      );

      const updatedTenants = prev.tenants.map((t) =>
        t.propertyId === propertyId
          ? { ...t, lastRentReviewMonth: prev.monthsPlayed, rentPennies: agreed }
          : t,
      );

      const remainingReviews = (prev.pendingRentReviews || []).filter((r) => r.id !== pending.id);
      const deltaPct = pending.currentRentPennies > 0
        ? ((agreed - pending.currentRentPennies) / pending.currentRentPennies) * 100
        : 0;
      showToast(
        "Rent review settled",
        `${property.name} reviewed to £${fromPennies(agreed).toLocaleString()}/mo (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%).`,
      );
      set({ tenants: updatedTenants, ownedProperties: updatedProps, pendingRentReviews: remainingReviews });
    },

    // Phase 4 — sign a renewal Heads of Terms for a sitting commercial tenant.
    renewCommercialLease: (
      propertyId: string,
      terms: {
        agreedRentPennies: number;
        termMonths: number;
        reviewFrequencyMonths: number;
        breakClause: { type: 'none' | 'tenant' | 'mutual'; atMonth?: number };
      },
    ) => {
      const prev = get();
      const property = prev.ownedProperties.find((p) => p.id === propertyId);
      if (!property || property.type !== 'commercial') {
        showToast("Not Commercial", "Renewals only apply to commercial leases.", "destructive"); return;
      }
      const tenantRec = prev.tenants.find((t) => t.propertyId === propertyId);
      if (!tenantRec) {
        showToast("No sitting tenant", "There is no tenant to renew.", "destructive"); return;
      }
      const agreed = Math.max(1, Math.round(terms.agreedRentPennies));
      const startMonth = prev.monthsPlayed;
      const newLease = {
        fri: true,
        termMonths: terms.termMonths,
        startMonth,
        expiryMonth: startMonth + terms.termMonths,
        reviewFrequencyMonths: terms.reviewFrequencyMonths,
        breakClause: terms.breakClause,
        conditionScoreAtLeaseStart: typeof property.conditionScore === 'number'
          ? property.conditionScore
          : scoreFromConditionTier(property.condition),
        negotiatedRentPennies: agreed,
      };
      const updatedProps = prev.ownedProperties.map((p) =>
        p.id === propertyId
          ? { ...p, commercialLease: newLease, monthlyIncome: agreed, baseRent: agreed, lastRentIncrease: startMonth }
          : p,
      );
      const updatedTenants = prev.tenants.map((t) =>
        t.propertyId === propertyId
          ? { ...t, lastRentReviewMonth: startMonth, rentPennies: agreed }
          : t,
      );
      const remainingRenewals = (prev.pendingLeaseRenewals || []).filter((r) => r.propertyId !== propertyId);
      showToast(
        "Lease Renewed 📄",
        `${(tenantRec.tenant.companyName ?? tenantRec.tenant.name)} re-signed for ${Math.round(terms.termMonths / 12)} years at £${fromPennies(agreed).toLocaleString()}/mo.`,
      );
      set({ ownedProperties: updatedProps, tenants: updatedTenants, pendingLeaseRenewals: remainingRenewals });
    },

    // Phase 4 — player declines a renewal; lease will end at expiry.
    declineLeaseRenewal: (propertyId: string) => {
      const prev = get();
      const updatedProps = prev.ownedProperties.map((p) =>
        p.id === propertyId && p.commercialLease
          ? { ...p, commercialLease: { ...p.commercialLease, endingAtExpiry: true } }
          : p,
      );
      const remainingRenewals = (prev.pendingLeaseRenewals || []).filter((r) => r.propertyId !== propertyId);
      showToast("Renewal Declined", "Lease will terminate at expiry. Dilapidations claim assessed on hand-back.");
      set({ ownedProperties: updatedProps, pendingLeaseRenewals: remainingRenewals });
    },





    applyRentIncrease: (
      propertyId: string,

      newRentPennies: number,
      outcome: 'accepted' | 'counter_accepted' | 'tribunal_landlord' | 'tribunal_tenant',
      tribunalFeePennies: number,
      slotIndex?: number,
    ) => {
      const prev = get();
      const property = prev.ownedProperties.find((p) => p.id === propertyId);
      const isMultiUnitProp = (property?.subtype === 'hmo' || property?.subtype === 'flats') && (property?.subtypeUnits ?? 1) > 1;
      const effectiveSlotIndex = slotIndex ?? (isMultiUnitProp ? 0 : undefined);
      const tenantRec = prev.tenants.find((t) =>
        t.propertyId === propertyId && (effectiveSlotIndex === undefined || (t.slotIndex ?? 0) === effectiveSlotIndex)
      );
      if (!property || !tenantRec) {
        showToast("No Tenant", "Cannot raise rent on a vacant property.", "destructive"); return;
      }
      if (property.type === 'commercial') {
        const hasScheduledReview = (prev.pendingRentReviews || []).some((r) => r.propertyId === propertyId);
        if (!hasScheduledReview) {
          showToast(
            "Rent Review Required",
            "Commercial rents can only be increased at scheduled rent review dates as per the lease terms.",
            "destructive",
          );
          return;
        }
      }
      const currentSlotRent = tenantRec.rentPennies ?? property.monthlyIncome;
      if (newRentPennies <= currentSlotRent) {
        showToast("No Increase", "Proposed rent is not higher than current rent.", "destructive"); return;
      }

      let cashUpdate: Partial<{ cash: number; overdraftUsed: number }> = {};
      if (tribunalFeePennies > 0) {
        const debited = debit(prev, tribunalFeePennies);
        if (!debited) {
          showToast("Insufficient Funds", `Need £${fromPennies(tribunalFeePennies).toLocaleString()} for the tribunal fee.`, "destructive"); return;
        }
        cashUpdate = { cash: debited.cash, overdraftUsed: debited.overdraftUsed };
      }

      const satDelta =
        outcome === 'accepted'          ? -3 :
        outcome === 'counter_accepted'  ? -2 :
        outcome === 'tribunal_landlord' ? -10 :
        outcome === 'tribunal_tenant'   ? -5 : -3;

      const reasonLabel =
        outcome === 'tribunal_landlord' ? 'Tribunal sided with landlord' :
        outcome === 'tribunal_tenant'   ? 'Tribunal sided with tenant'   :
        outcome === 'counter_accepted'  ? 'Accepted tenant counter-offer' :
                                           'Section 13 rent rise accepted';

      const newSatisfaction = Math.max(0, Math.min(100, tenantRec.satisfaction + satDelta));
      const newReasons = [
        { reason: reasonLabel, delta: satDelta },
        ...(tenantRec.satisfactionReasons || []).slice(0, 4),
      ];

      const updatedTenants = prev.tenants.map((t) =>
        t.propertyId === propertyId && (effectiveSlotIndex === undefined || (t.slotIndex ?? 0) === effectiveSlotIndex)
          ? { ...t, rentPennies: newRentPennies, satisfaction: newSatisfaction, satisfactionReasons: newReasons, lastSatisfactionUpdate: prev.monthsPlayed }
          : t
      );
      const recomputedMonthlyIncome = isMultiUnitProp
        ? updatedTenants.filter((t) => t.propertyId === propertyId).reduce((sum: number, t) => sum + (t.rentPennies ?? 0), 0)
        : newRentPennies;
      const updatedProps = prev.ownedProperties.map((p) =>
        p.id === propertyId
          ? { ...p, monthlyIncome: recomputedMonthlyIncome, baseRent: isMultiUnitProp ? p.baseRent : newRentPennies, lastRentIncrease: prev.monthsPlayed }
          : p
      );

      showToast(
        outcome === 'tribunal_landlord' || outcome === 'tribunal_tenant'
          ? '⚖️ Tribunal Decision Applied'
          : '📜 Rent Increase Applied',
        `${reasonLabel}. New rent: £${fromPennies(newRentPennies).toLocaleString()}/mo${tribunalFeePennies > 0 ? ` (tribunal fee £${fromPennies(tribunalFeePennies).toLocaleString()})` : ''}.`
      );

      // Achievement wiring — tribunal won in landlord's favour pushes a
      // reputationLog marker and triggers the court_win unlock immediately.
      let achievementsPatch: Record<string, number> | undefined;
      let extraRepLog: NonNullable<GameState['reputationLog']> = [];
      if (outcome === 'tribunal_landlord') {
        extraRepLog = [{
          id: `rep_tribunal_win_${propertyId}_${prev.monthsPlayed}`,
          month: prev.monthsPlayed,
          reason: 'Tribunal sided with landlord',
          delta: 0,
          category: 'tribunal' as const,
        }];
        const snapshot = {
          ...prev,
          ownedProperties: updatedProps,
          tenants: updatedTenants,
          reputationLog: [...(prev.reputationLog || []), ...extraRepLog],
        };
        const { unlocked, newlyUnlockedIds } = checkAndUnlockAchievements(snapshot);
        if (newlyUnlockedIds.length) {
          for (const id of newlyUnlockedIds) {
            const def = ACHIEVEMENTS.find(a => a.id === id);
            if (def) showToast(`🏅 ${def.title}`, def.description);
          }
          achievementsPatch = unlocked;
        }
      }

      set({
        ...cashUpdate,
        ownedProperties: updatedProps,
        tenants: updatedTenants,
        ...(extraRepLog.length
          ? { reputationLog: [...((prev.reputationLog) || []), ...extraRepLog].slice(-40) }
          : {}),
        ...(achievementsPatch ? { achievements: achievementsPatch } : {}),
      });
    },

    evictTenant: (propertyId: string, ground: EvictionGround, slotIndex: number = 0) => {
      const prev = get();
      const tenant = prev.tenants.find((t) => t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex);
      if (!tenant) { showToast("No Tenant", "There is no tenant to evict.", "destructive"); return; }
      if (prev.pendingEvictions.some((e) => e.propertyId === propertyId && (e.slotIndex ?? 0) === slotIndex)) {
        showToast("Eviction Already Served", "Notice already in effect for this slot. Cancel it first.", "destructive"); return;
      }

      const property = prev.ownedProperties.find((p) => p.id === propertyId);
      const isCommercial = property?.type === 'commercial';
      const lease = property?.commercialLease;

      if (isCommercial) {
        if (ground === 'landlord_sale' || ground === 'landlord_move_in' || ground === 'antisocial_behaviour' || ground === 'rent_arrears') {
          showToast(
            "Wrong Eviction Grounds",
            "Commercial properties follow different lease law — use forfeiture, lease expiry, break clause, or persistent default as grounds.",
            "destructive",
          );
          return;
        }
      } else {
        if (ground === 'lease_expiry' || ground === 'tenant_default' || ground === 'break_clause' || ground === 'commercial_forfeiture' || ground === 'commercial_arrears') {
          showToast(
            "Wrong Eviction Grounds",
            "These grounds apply to commercial leases only.",
            "destructive",
          );
          return;
        }
      }

      if (ground === 'landlord_sale' || ground === 'landlord_move_in') {
        const appealCd = (prev.propertyLocks || []).find(
          (l) => l.propertyId === propertyId && l.reason === 'appeal_cooldown' && prev.monthsPlayed < l.untilMonth && (l.slotIndex === undefined || l.slotIndex === slotIndex),
        );
        if (appealCd) {
          showToast(
            "Tribunal Cooldown",
            `Cannot re-serve a landlord-grounds notice until month ${appealCd.untilMonth} (${appealCd.untilMonth - prev.monthsPlayed} mo).`,
            "destructive",
          );
          return;
        }
      }

      // Phase 1 fix — tenantEvents is capped at 24 and cleared when a court case opens,
      // so fall back to the tenant's authoritative arrearsMonths counter.
      const recentDefaults = Math.max(
        prev.tenantEvents.filter((e) => e.propertyId === propertyId && e.type === 'default').length,
        (tenant as any)?.arrearsMonths ?? 0,
      );
      const concerns = prev.tenantConcerns.filter((c) => c.propertyId === propertyId && !c.resolvedMonth);
      const longstandingASB = concerns.some((c) =>
        (c.category === 'noise' || c.category === 'safety') && (prev.monthsPlayed - c.raisedMonth) >= 1
      );

      let noticeMonths = 4;
      let validReason = '';

      switch (ground) {
        case 'rent_arrears':
          if (recentDefaults < 2) {
            showToast("Invalid Ground", "Rent arrears requires ≥2 missed payments.", "destructive"); return;
          }
          noticeMonths = 1;
          validReason = `Rent arrears (${recentDefaults} missed payments)`;
          break;
        case 'antisocial_behaviour':
          if (tenant.tenant.profile !== 'risky' || !longstandingASB) {
            showToast("Invalid Ground", "ASB requires risky tenant + unresolved noise/safety concern >1 month.", "destructive"); return;
          }
          noticeMonths = 1;
          validReason = 'Antisocial behaviour';
          break;
        case 'landlord_sale':
          noticeMonths = 4;
          validReason = 'Landlord intends to sell (4-month notice)';
          break;
        case 'landlord_move_in':
          noticeMonths = 4;
          validReason = 'Landlord moving in (4-month notice)';
          break;
        case 'lease_expiry': {
          if (!lease?.expiryMonth) {
            showToast("Invalid Ground", "No active lease on file for this property.", "destructive"); return;
          }
          if (prev.monthsPlayed < lease.expiryMonth - 6) {
            const monthsUntil = lease.expiryMonth - prev.monthsPlayed;
            showToast(
              "Too Early",
              `Lease expiry grounds can only be served within 6 months of expiry (currently ${monthsUntil} months away).`,
              "destructive",
            );
            return;
          }
          noticeMonths = 6;
          validReason = `Lease expiry @ month ${lease.expiryMonth} (6-month notice)`;
          break;
        }
        case 'tenant_default': {
          const arrears = tenant.arrearsMonths ?? 0;
          if (arrears < 3 && recentDefaults < 3) {
            showToast(
              "Invalid Ground",
              "Commercial tenant default requires ≥3 months of arrears before formal action.",
              "destructive",
            );
            return;
          }
          noticeMonths = 3;
          validReason = `Persistent tenant default (${Math.max(arrears, recentDefaults)} months arrears, 3-month notice)`;
          break;
        }
        case 'break_clause': {
          const bc = lease?.breakClause;
          if (!bc || bc.type === 'none' || !bc.atMonth) {
            showToast("Invalid Ground", "This lease has no break clause.", "destructive"); return;
          }
          if (prev.monthsPlayed < bc.atMonth) {
            showToast(
              "Break Not Yet Available",
              `Break clause cannot be exercised until month ${bc.atMonth} (${bc.atMonth - prev.monthsPlayed} mo).`,
              "destructive",
            );
            return;
          }
          noticeMonths = 6;
          validReason = `Break clause exercised @ month ${bc.atMonth} (6-month notice)`;
          break;
        }
        case 'commercial_forfeiture': {
          const arrears = tenant.arrearsMonths ?? 0;
          if (arrears < 1 && recentDefaults < 1) {
            showToast(
              "Invalid Ground",
              "Commercial forfeiture requires the tenant to be at least 21 days (1 month) in arrears.",
              "destructive",
            );
            return;
          }
          // Peaceable re-entry: no protected notice period under the Renters'
          // Rights Act (commercial leases sit outside its scope).
          noticeMonths = 0;
          validReason = `Commercial forfeiture — peaceable re-entry (${Math.max(arrears, recentDefaults)} mo arrears)`;
          break;
        }
        case 'commercial_arrears': {
          // Commercial arrears flow — forfeiture through the courts: serve a
          // s.146-style formal demand (1 month) then queue for a possession
          // hearing. Safer than re-entry (tenant rarely wins relief) but slow.
          const arrears = tenant.arrearsMonths ?? 0;
          if (arrears < 2 && recentDefaults < 2) {
            showToast(
              "Invalid Ground",
              "Court forfeiture for rent arrears requires ≥2 months of unpaid commercial rent.",
              "destructive",
            );
            return;
          }
          noticeMonths = 1;
          validReason = `Commercial rent arrears — formal demand served (${Math.max(arrears, recentDefaults)} mo arrears, 1-month notice)`;
          break;
        }
      }

      let appealChance =
        ground === 'landlord_sale' || ground === 'landlord_move_in' ? 0.35 :
        ground === 'antisocial_behaviour' ? 0.10 :
        // Commercial tenants can apply for relief from forfeiture; a peaceable
        // re-entry is far more vulnerable than a court-sanctioned possession.
        ground === 'commercial_forfeiture' ? 0.30 :
        ground === 'commercial_arrears' ? 0.10 :
        0.05;
      if ((tenant.satisfaction ?? 50) >= 60) appealChance += 0.15;
      if (tenant.tenant.profile === 'risky') appealChance -= 0.10;
      appealChance = Math.max(0, Math.min(0.85, appealChance));
      const willAppeal = gameRandom() < appealChance;

      // Commercial forfeiture bypasses the court queue (peaceable re-entry).
      // The court route for commercial arrears sits in a 2–5 month backlog.
      const courtBacklogMonths =
        ground === 'commercial_forfeiture' ? 0 :
        ground === 'commercial_arrears' ? 2 + Math.floor(gameRandom() * 4) :
        3 + Math.floor(gameRandom() * 4);
      const effectiveMonth = prev.monthsPlayed + noticeMonths + courtBacklogMonths;
      const updatedTenants = prev.tenants.map((t) =>
        t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex
          ? { ...t, evictionNoticeMonth: prev.monthsPlayed, evictionGround: ground }
          : t
      );
      const newEviction: PendingEviction = {
        propertyId,
        slotIndex,
        tenantName: tenant.tenant.name,
        ground,
        servedMonth: prev.monthsPlayed,
        effectiveMonth,
        appealFiled: willAppeal,
        appealResolveMonth: willAppeal ? prev.monthsPlayed + 1 : undefined,
      };
      const appealNote = willAppeal ? ' Tenant has filed a tribunal appeal — ruling next month.' : '';
      showToast(
        "Eviction Notice Served",
        `${validReason}. ${noticeMonths}mo notice + ~${courtBacklogMonths}mo court backlog — possession by month ${effectiveMonth}.${appealNote}`,
      );

      set({
        tenants: updatedTenants,
        pendingEvictions: [...prev.pendingEvictions, newEviction],
      });
    },

    cancelEviction: (propertyId: string, slotIndex: number = 0) => {
      const prev = get();
      if (!prev.pendingEvictions.some((e) => e.propertyId === propertyId && (e.slotIndex ?? 0) === slotIndex)) return;
      showToast("Eviction Withdrawn", "Notice cancelled — tenant stays.");
      set({
        pendingEvictions: prev.pendingEvictions.filter((e) => !(e.propertyId === propertyId && (e.slotIndex ?? 0) === slotIndex)),
        tenants: prev.tenants.map((t) =>
          t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex
            ? { ...t, evictionNoticeMonth: undefined, evictionGround: undefined }
            : t
        ),
      });
    },

    disputeDeposit: (disputeId: string) => {
      const prev = get();
      const dispute = (prev.depositDisputes || []).find((d) => d.id === disputeId && d.status === 'open');
      if (!dispute) {
        showToast("No Open Dispute", "This dispute is no longer open.", "destructive");
        return;
      }
      const roll = gameRandom();
      let outcome: 'won' | 'settled' | 'lost';
      let extraRefund = 0;
      if (roll < 0.35) { outcome = 'won'; extraRefund = 0; }
      else if (roll < 0.85) { outcome = 'settled'; extraRefund = Math.floor(dispute.withheldAmount * 0.5); }
      else { outcome = 'lost'; extraRefund = dispute.withheldAmount; }

      if (extraRefund > 0) {
        const debited = debit(prev, extraRefund);
        if (!debited) {
          showToast(
            "Insufficient Funds",
            `Tribunal ordered £${fromPennies(extraRefund).toLocaleString()} refund — you can't cover it even with overdraft.`,
            "destructive",
          );
          return;
        }
        set({
          cash: debited.cash,
          overdraftUsed: debited.overdraftUsed,
          depositDisputes: prev.depositDisputes.map((d) =>
            d.id === disputeId
              ? { ...d, status: outcome, refundedAmount: d.refundedAmount + extraRefund, resolvedMonth: prev.monthsPlayed }
              : d,
          ),
        });
      } else {
        set({
          depositDisputes: prev.depositDisputes.map((d) =>
            d.id === disputeId
              ? { ...d, status: outcome, resolvedMonth: prev.monthsPlayed }
              : d,
          ),
        });
      }

      const titles: Record<typeof outcome, string> = {
        won: "Adjudication: Landlord Wins",
        settled: "Adjudication: Partial Settlement",
        lost: "Adjudication: Tenant Wins",
      };
      const descriptions: Record<typeof outcome, string> = {
        won: `TDS sided with you — no further refund owed on ${dispute.propertyName}.`,
        settled: `TDS ordered a 50/50 split — £${fromPennies(extraRefund).toLocaleString()} refunded to ${dispute.tenantName}.`,
        lost: `TDS sided with the tenant — full £${fromPennies(extraRefund).toLocaleString()} withheld amount refunded.`,
      };
      showToast(titles[outcome], descriptions[outcome], outcome === 'lost' ? 'destructive' : undefined);
    },

    dismissDispute: (disputeId: string) => {
      const prev = get();
      const dispute = (prev.depositDisputes || []).find((d) => d.id === disputeId);
      if (!dispute) return;
      if (dispute.status === 'open') {
        const debited = debit(prev, dispute.withheldAmount);
        if (!debited) {
          showToast(
            "Insufficient Funds",
            `You can't afford the £${fromPennies(dispute.withheldAmount).toLocaleString()} refund.`,
            "destructive",
          );
          return;
        }
        set({
          cash: debited.cash,
          overdraftUsed: debited.overdraftUsed,
          depositDisputes: prev.depositDisputes.map((d) =>
            d.id === disputeId
              ? { ...d, status: 'lost', refundedAmount: d.refundedAmount + dispute.withheldAmount, resolvedMonth: prev.monthsPlayed }
              : d,
          ),
        });
        showToast("Refund Issued", `Full £${fromPennies(dispute.withheldAmount).toLocaleString()} refunded to ${dispute.tenantName}.`);
      } else {
        set({ depositDisputes: prev.depositDisputes.filter((d) => d.id !== disputeId) });
      }
    },

    // ─── Outstanding Improvements v4 Step 1: migrated from gameStore.ts ───

    resolveTenantConcern: (concernId: string) => {
      const prev = get();
      const concerns = prev.tenantConcerns || [];
      const concern = concerns.find((c) => c.id === concernId && !c.resolvedMonth);
      if (!concern) return;
      // MEES/EPC concerns are auto-dismissed once epcRating is upgraded to C or above.
      // No manual resolve path — the "Plan EPC upgrade" CTA routes the player to Renovations.
      if (concern.id.startsWith('mees2030_warn_')) return;
      const debited = debit(prev, concern.resolveCost);
      if (!debited) {
        showToast("Insufficient Funds", `Need £${fromPennies(concern.resolveCost).toLocaleString()} (even with overdraft) to resolve.`, "destructive");
        return;
      }
      const updatedTenants = prev.tenants.map((t) =>
        t.propertyId === concern.propertyId
          ? { ...t, satisfaction: Math.min(100, t.satisfaction + 8) }
          : t
      );
      const lift = CONCERN_RESOLVE_CONDITION_LIFT[concern.category] ?? 3;
      const updatedOwned = prev.ownedProperties.map((p) => {
        if (p.id !== concern.propertyId) return p;
        const score = Math.max(0, Math.min(100, (p.conditionScore ?? scoreFromConditionTier(p.condition)) + lift));
        return { ...p, conditionScore: score, condition: conditionTierFromScore(score) };
      });

      let updatedAnnual = prev.annualRepairCosts;
      let updatedHistory = prev.damageHistory;
      if (concern.source === 'damage') {
        const currentYear = Math.floor(prev.monthsPlayed / 12);
        const existing = prev.annualRepairCosts.find((a) => a.propertyId === concern.propertyId && a.year === currentYear);
        updatedAnnual = existing
          ? prev.annualRepairCosts.map((a) =>
              a.propertyId === concern.propertyId && a.year === currentYear
                ? { ...a, totalCost: a.totalCost + concern.resolveCost }
                : a
            )
          : [...prev.annualRepairCosts, { propertyId: concern.propertyId, year: currentYear, totalCost: concern.resolveCost }];
        const dmgHist = prev.damageHistory.find((dh) => dh.propertyId === concern.propertyId);
        updatedHistory = dmgHist
          ? prev.damageHistory.map((dh) =>
              dh.propertyId === concern.propertyId
                ? { ...dh, lastDamageMonth: prev.monthsPlayed }
                : dh
            )
          : [...prev.damageHistory, { propertyId: concern.propertyId, lastDamageMonth: prev.monthsPlayed }];
        showToast("🔧 Damage Repaired", `Spent £${fromPennies(concern.resolveCost).toLocaleString()} on repairs.`);
      } else {
        showToast("Concern Resolved ✅", `Spent £${fromPennies(concern.resolveCost).toLocaleString()} — tenant happier.`);
      }

      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        tenants: updatedTenants,
        ownedProperties: updatedOwned,
        annualRepairCosts: updatedAnnual,
        damageHistory: updatedHistory,
        tenantConcerns: concerns.map((c) =>
          c.id === concernId ? { ...c, resolvedMonth: prev.monthsPlayed } : c
        ),
      });
    },

    topUpCondition: (propertyId: string, pointsRequested: number) => {
      const prev = get();
      const property = prev.ownedProperties.find((p) => p.id === propertyId);
      if (!property) return;
      const currentScore = property.conditionScore ?? scoreFromConditionTier(property.condition);
      const headroomToCap = Math.max(0, 100 - currentScore);
      const monthlyUsed = (property.conditionLastTopUpMonth === prev.monthsPlayed)
        ? (property.conditionTopUpPointsThisMonth ?? 0) : 0;
      const monthlyHeadroom = Math.max(0, MAX_TOPUP_POINTS_PER_MONTH - monthlyUsed);
      const pts = Math.max(0, Math.min(pointsRequested, headroomToCap, monthlyHeadroom));
      if (pts <= 0) {
        showToast("Nothing to do", "Already at the cap (100) or this month's spend limit reached.");
        return;
      }
      const sqft = Math.max(400, property.internalSqft ?? 900);
      const cost = Math.max(1, Math.round(CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT * sqft * pts / 100));
      const debited = debit(prev, cost);
      if (!debited) {
        showToast("Insufficient Funds", `Need £${fromPennies(cost).toLocaleString()} (even with overdraft) for ${pts} points of repairs.`, "destructive");
        return;
      }
      const newScore = Math.min(100, currentScore + pts);
      const newMonthlyUsed = monthlyUsed + pts;
      const updated = prev.ownedProperties.map((p) =>
        p.id !== propertyId ? p : ({
          ...p,
          conditionScore: newScore,
          condition: conditionTierFromScore(newScore),
          conditionLastTopUpMonth: prev.monthsPlayed,
          conditionTopUpPointsThisMonth: newMonthlyUsed,
        })
      );

      let absorbedConcerns = 0;
      let updatedConcerns = prev.tenantConcerns;
      if (newScore >= 80 && currentScore < 80) {
        updatedConcerns = (prev.tenantConcerns || []).map((c) => {
          if (
            c && !c.resolvedMonth && c.propertyId === propertyId &&
            c.source !== 'damage' &&
            (c.category === 'maintenance' || c.category === 'mould')
          ) {
            absorbedConcerns += 1;
            return { ...c, resolvedMonth: prev.monthsPlayed };
          }
          return c;
        });
      }

      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        ownedProperties: updated,
        tenantConcerns: updatedConcerns,
      });
      const absorbedSuffix = absorbedConcerns > 0
        ? ` Cleared ${absorbedConcerns} lingering concern${absorbedConcerns > 1 ? 's' : ''}.`
        : '';
      showToast("🛠 Repairs", `${property.name}: +${pts} condition (£${fromPennies(cost).toLocaleString()}).${absorbedSuffix}`);
    },

    dismissTenantConcern: (_concernId: string) => {
      showToast("Concern Snoozed", "It'll keep nagging until resolved.");
    },

    sendArrearsToCourt: (propertyId: string, slotIndex: number = 0) => {
      const s = get();
      const tenant = s.tenants.find((t) => t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex);
      const prop = s.ownedProperties.find((p) => p.id === propertyId);
      if (!tenant || !prop) {
        showToast("Cannot file claim", "Tenant or property not found.", "destructive");
        return;
      }
      const arrearsMonths = tenant.arrearsMonths ?? 0;
      const arrearsPennies = tenant.arrearsPennies ?? 0;
      if (arrearsMonths < 2 || arrearsPennies <= 0) {
        showToast("Not eligible", "Tenant needs at least 2 months of arrears to file in court.", "destructive");
        return;
      }
      const existing = (s.debtRecoveryCases || []).find((c) => c.propertyId === propertyId && c.tenantName === tenant.tenant.name && c.status === 'in_court');
      if (existing) {
        showToast("Already filed", "A court case is already in progress for this tenant.", "destructive");
        return;
      }
      const FILING_FEE = 32500;
      const debited = debit(s, FILING_FEE);
      if (!debited) {
        showToast("Insufficient funds", "You need £325 (incl. overdraft) to file the claim.", "destructive");
        return;
      }
      const lbaBonus = (tenant.letterBeforeActionMonth !== undefined
        && s.monthsPlayed - tenant.letterBeforeActionMonth <= 6) ? 0.12 : 0;
      const roll = gameRandom();
      const recoveredCutoff = 0.55 + lbaBonus;
      const partialCutoff = 0.85 + (lbaBonus * 0.5);
      const status: 'recovered' | 'partial' | 'unrecoverable' =
        roll < recoveredCutoff ? 'recovered' : roll < partialCutoff ? 'partial' : 'unrecoverable';
      const resolveMonth = s.monthsPlayed + 6 + Math.floor(gameRandom() * 7);
      const newCase: import('@/types/game').DebtRecoveryCase & { _predeterminedStatus?: 'recovered' | 'partial' | 'unrecoverable' } = {
        id: `dr_${propertyId}_${slotIndex}_${s.monthsPlayed}_${gameRandom().toString(36).slice(2, 6)}`,
        propertyId,
        propertyName: prop.name,
        tenantName: tenant.tenant.name,
        originalArrearsPennies: arrearsPennies,
        filedMonth: s.monthsPlayed,
        resolveMonth,
        status: 'in_court' as const,
        recoveryFeePct: 0.25,
      };
      newCase._predeterminedStatus = status;

      const newTenants = s.tenants.map((t) =>
        t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex
          ? { ...t, arrearsMonths: 0, arrearsPennies: 0 }
          : t,
      );
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        tenants: newTenants,
        // Phase 1 #3 — clear historical 'default' events so the property card
        // doesn't show "Xmo owed" after the case is filed (arrears reset to 0).
        tenantEvents: (s.tenantEvents || []).filter(
          (e: any) => !(e.propertyId === propertyId && e.type === 'default'),
        ),
        debtRecoveryCases: [...(s.debtRecoveryCases || []), newCase],
        opsFlashAt: Date.now(),
      });
      showToast("⚖️ Claim filed", `£325 filing fee paid. Expect a decision in 6–12 months for ${tenant.tenant.name} (£${fromPennies(arrearsPennies).toLocaleString()} owed).`);
    },

    issueLetterBeforeAction: (propertyId: string, slotIndex: number = 0) => {
      const s = get();
      const tenant = s.tenants.find((t) => t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex);
      if (!tenant) { showToast("Cannot send letter", "Tenant not found.", "destructive"); return; }
      if ((tenant.arrearsMonths ?? 0) < 1) {
        showToast("Not needed", "Tenant has no arrears.", "destructive"); return;
      }
      if (tenant.letterBeforeActionMonth !== undefined) {
        showToast("Already sent", "A Letter Before Action has already been issued.", "destructive"); return;
      }
      const FEE = 5000;
      const debited = debit(s, FEE);
      if (!debited) { showToast("Insufficient funds", "Need £50 (incl. overdraft) to issue the letter.", "destructive"); return; }
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        tenants: s.tenants.map((t) =>
          t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex
            ? { ...t, letterBeforeActionMonth: s.monthsPlayed }
            : t,
        ),
      });
      showToast("📨 Letter Before Action sent", `Formal demand issued to ${tenant.tenant.name}. CCJ filings within 6 months get a recovery boost.`);
    },

    escalateToHighCourt: (caseId: string) => {
      const s = get();
      const cases = s.debtRecoveryCases || [];
      const idx = cases.findIndex((c) => c.id === caseId);
      if (idx < 0) { showToast("Case not found", "Cannot escalate.", "destructive"); return; }
      const c = cases[idx];
      if (c.status !== 'partial' && c.status !== 'unrecoverable') {
        showToast("Not eligible", "Only partial / unrecoverable CCJs can be escalated to HCE.", "destructive"); return;
      }
      if (c.escalatedToHighCourtMonth !== undefined) {
        showToast("Already escalated", "This case is already with the High Court.", "destructive"); return;
      }
      const fee = 7100 + Math.round(c.originalArrearsPennies * 0.075);
      const debited = debit(s, fee);
      if (!debited) { showToast("Insufficient funds", `Need £${fromPennies(fee).toLocaleString()} (incl. overdraft).`, "destructive"); return; }
      const residual = Math.max(0, c.originalArrearsPennies - (c.netRecoveredPennies ?? 0));
      const willRecover = gameRandom() < 0.4;
      const hceExpected = willRecover ? Math.round(residual * (0.7 + gameRandom() * 0.2)) : 0;
      const updated = [...cases];
      updated[idx] = {
        ...c,
        escalatedToHighCourtMonth: s.monthsPlayed,
        hceExpectedRecoveryPennies: hceExpected,
        hceResolveMonth: s.monthsPlayed + 3,
        hceResolved: false,
      };
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        debtRecoveryCases: updated,
      });
      showToast("⚖️ Escalated to High Court", `£${fromPennies(fee).toLocaleString()} HCE fee paid. Decision in 3 months.`);
    },

    // ── Phase 2 — Ex-tenant debt recovery ───────────────────
    fileExTenantCCJ: (debtId: string) => {
      const s = get();
      const debts = (s.exTenantDebts || []) as import('@/types/game').ExTenantDebt[];
      const debt = debts.find((d) => d.id === debtId);
      if (!debt) return;
      if (debt.status !== 'chasing') {
        showToast("Cannot file", "This debt is not in the chasing stage.", "destructive");
        return;
      }
      const FEE = 10000; // £100 in pennies
      const debited = debit(s, FEE);
      if (!debited) {
        showToast("Insufficient funds", "You need £100 to file a CCJ.", "destructive");
        return;
      }
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        exTenantDebts: debts.map((d) =>
          d.id === debtId ? { ...d, status: 'ccj_filed' as const, ccjFiledMonth: s.monthsPlayed } : d,
        ),
        opsFlashAt: Date.now(),
      });
      showToast("⚖️ CCJ filed", `Claim filed against ${debt.tenantName} for £${fromPennies(debt.remainingDebtPennies).toLocaleString()}.`);
    },

    negotiateExTenantSettlement: (debtId: string, pct: number) => {
      const s = get();
      const debts = (s.exTenantDebts || []) as import('@/types/game').ExTenantDebt[];
      const debt = debts.find((d) => d.id === debtId);
      if (!debt) return;
      if (debt.status === 'settled' || debt.status === 'written_off') {
        showToast("Already closed", "This debt is no longer open.", "destructive");
        return;
      }
      const clamped = Math.max(0.4, Math.min(0.7, pct));
      const recovered = Math.round(debt.remainingDebtPennies * clamped);
      set({
        cash: s.cash + recovered,
        exTenantDebts: debts.map((d) =>
          d.id === debtId
            ? {
                ...d,
                status: 'settled' as const,
                remainingDebtPennies: 0,
                totalRecoveredPennies: d.totalRecoveredPennies + recovered,
              }
            : d,
        ),
        opsFlashAt: Date.now(),
      });
      showToast("Settlement agreed", `${debt.tenantName} paid £${fromPennies(recovered).toLocaleString()} as final settlement.`);
    },

    writeOffExTenantDebt: (debtId: string) => {
      const s = get();
      const debts = (s.exTenantDebts || []) as import('@/types/game').ExTenantDebt[];
      const debt = debts.find((d) => d.id === debtId);
      if (!debt) return;
      if (debt.status === 'settled' || debt.status === 'written_off') return;
      set({
        exTenantDebts: debts.map((d) =>
          d.id === debtId ? { ...d, status: 'written_off' as const } : d,
        ),
        creditScore: Math.max(300, Math.min(850, s.creditScore + 2)),
        landlordReputation: Math.max(0, Math.min(100, (s.landlordReputation ?? 50) + 1)),
      });
      showToast("Debt written off", `${debt.tenantName}'s debt closed. Small reputation gain for being reasonable.`);
    },

    refileExTenantCCJ: (debtId: string) => {
      const s = get();
      const debts = (s.exTenantDebts || []) as import('@/types/game').ExTenantDebt[];
      const debt = debts.find((d) => d.id === debtId);
      if (!debt) return;
      if (debt.status !== 'ccj_filed') {
        showToast("Cannot re-file", "Only a previously-filed CCJ can be re-filed.", "destructive");
        return;
      }
      const filedMo = debt.ccjFiledMonth ?? 0;
      if (s.monthsPlayed - filedMo < 6) {
        const wait = 6 - (s.monthsPlayed - filedMo);
        showToast("Too soon", `Re-file available in ${wait} more month(s).`, "destructive");
        return;
      }
      const FEE = 10000;
      const debited = debit(s, FEE);
      if (!debited) {
        showToast("Insufficient funds", "You need £100 to re-file.", "destructive");
        return;
      }
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        exTenantDebts: debts.map((d) =>
          d.id === debtId ? { ...d, ccjFiledMonth: s.monthsPlayed } : d,
        ),
        opsFlashAt: Date.now(),
      });
      showToast("⚖️ CCJ re-filed", `New monthly roll begins for ${debt.tenantName}.`);
    },

    chaseCommercialAgent: (propertyId: string) => {
      const s = get();
      const property = s.ownedProperties.find(p => p.id === propertyId);
      if (!property || property.type !== 'commercial') {
        showToast("Not Commercial", "Only commercial vacancies can be chased.", "destructive"); return;
      }
      if (property.commercialLease) {
        showToast("Already Let", "This unit is already leased.", "destructive"); return;
      }
      const chaseMap = { ...(s.commercialAgentChase || {}) } as Record<string, number>;
      const last = chaseMap[propertyId] ?? -999;
      if (s.monthsPlayed - last < 2) {
        const wait = 2 - (s.monthsPlayed - last);
        showToast("Already Chased", `The agent has been chased recently. Try again in ${wait} month${wait === 1 ? '' : 's'}.`, "destructive");
        return;
      }
      chaseMap[propertyId] = s.monthsPlayed;
      const update: import('@/types/game').CommercialSearchUpdate = {
        id: `csu_${propertyId}_${s.monthsPlayed}_chase`,
        propertyId,
        month: s.monthsPlayed,
        kind: 'chase',
        leadCount: (s.pendingCommercialApplicants || []).filter(a => a.propertyId === propertyId).length,
        message: `You chased the agent. They've promised to push harder this month.`,
      };
      set({
        commercialAgentChase: chaseMap,
        commercialSearchUpdates: [...(s.commercialSearchUpdates || []), update].slice(-200),
        opsFlashAt: Date.now(),
      });
      showToast("📣 Agent chased", `${property.name} — agent will redouble efforts this month.`);
    },
  };
}
