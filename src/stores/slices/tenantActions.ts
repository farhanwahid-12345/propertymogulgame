/**
 * Tenant action bundle — letting, rent increases, evictions, deposit disputes.
 *
 * Phase 3d: extracted verbatim from `gameStore.ts` behind a factory so the
 * store literal stays a thin composer. Behaviour and persisted shape are
 * unchanged. Cross-slice reads via `get()` only.
 */
import type {
  PropertyTenant, EvictionGround, PendingEviction,
} from '@/types/game';
import { fromPennies } from '@/lib/formatCurrency';
import { calcTenantRent } from '@/lib/tenantRent';
import { gameRandom } from '@/lib/rng';
import { showToast, debit, calcDeposit } from '../storeHelpers';
import {
  CONCERN_RESOLVE_CONDITION_LIFT,
  CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT,
  MAX_TOPUP_POINTS_PER_MONTH,
  conditionTierFromScore,
  scoreFromConditionTier,
} from '@/lib/engine/constants';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createTenantActions(set: SetFn, get: GetFn) {
  return {
    selectTenant: (propertyId: string, tenant: any, slotIndex: number = 0) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) return;
      if (prev.conveyancing.some((c: any) => c.propertyId === propertyId)) {
        showToast("In Conveyancing", "Cannot change tenants during conveyancing.", "destructive"); return;
      }
      const activeReno = (prev.renovations || []).find((r: any) => {
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
      const releLock = prev.propertyLocks.find((l: any) => l.propertyId === propertyId && l.reason === 'relet_lock' && prev.monthsPlayed < l.untilMonth && (l.slotIndex === undefined || l.slotIndex === slotIndex));
      if (releLock) {
        showToast("Re-let Locked", `You evicted on 'move-in' grounds. Cannot re-let this slot until month ${releLock.untilMonth}.`, "destructive");
        return;
      }
      const saleLock = prev.propertyLocks.find((l: any) => l.propertyId === propertyId && l.reason === 'sale_lock' && prev.monthsPlayed < l.untilMonth);
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

      if (prev.tenants.some((t: any) => t.propertyId === propertyId && (t.slotIndex ?? 0) === safeSlot)) {
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
      const slotRent = calcTenantRent(slotBaseRent, tenant, property.condition, property.furnishingTier);

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

      const updatedVoids = prev.voidPeriods.filter((vp: any) => vp.propertyId !== propertyId);
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
            .filter((t: any) => t.propertyId === propertyId)
            .reduce((sum: number, t: any) => sum + (t.rentPennies ?? 0), 0)
        : slotRent;

      const updatedProps = prev.ownedProperties.map((p: any) =>
        p.id === propertyId ? { ...p, monthlyIncome: newMonthlyIncome, baseRent: propertyBaseRent, lastTenantChange: prev.monthsPlayed, lastRentIncrease: prev.monthsPlayed } : p
      );
      const slotLabel = isMultiUnit ? ` (${property.subtype === 'flats' ? 'Flat' : 'Room'} ${safeSlot + 1})` : '';
      showToast(
        "Tenant Moved In!",
        `${tenant.name}${slotLabel} renting at £${fromPennies(slotRent).toLocaleString()}/mo. 5-week deposit (£${fromPennies(requiredDeposit).toLocaleString()}) protected via TDS.`
      );
      set({ tenants: updatedTenants, ownedProperties: updatedProps, voidPeriods: updatedVoids });
    },

    applyRentIncrease: (
      propertyId: string,
      newRentPennies: number,
      outcome: 'accepted' | 'counter_accepted' | 'tribunal_landlord' | 'tribunal_tenant',
      tribunalFeePennies: number,
      slotIndex?: number,
    ) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      const tenantRec = prev.tenants.find((t: any) =>
        t.propertyId === propertyId && (slotIndex === undefined || (t.slotIndex ?? 0) === slotIndex)
      );
      if (!property || !tenantRec) {
        showToast("No Tenant", "Cannot raise rent on a vacant property.", "destructive"); return;
      }
      const currentSlotRent = (tenantRec as any).rentPennies ?? property.monthlyIncome;
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

      const isMultiUnit = (property.subtype === 'hmo' || property.subtype === 'flats') && (property.subtypeUnits ?? 1) > 1;
      const updatedTenants = prev.tenants.map((t: any) =>
        t.propertyId === propertyId && (slotIndex === undefined || (t.slotIndex ?? 0) === slotIndex)
          ? { ...t, rentPennies: newRentPennies, satisfaction: newSatisfaction, satisfactionReasons: newReasons, lastSatisfactionUpdate: prev.monthsPlayed }
          : t
      );
      const recomputedMonthlyIncome = isMultiUnit
        ? updatedTenants.filter((t: any) => t.propertyId === propertyId).reduce((sum: number, t: any) => sum + ((t as any).rentPennies ?? 0), 0)
        : newRentPennies;
      const updatedProps = prev.ownedProperties.map((p: any) =>
        p.id === propertyId
          ? { ...p, monthlyIncome: recomputedMonthlyIncome, baseRent: isMultiUnit ? p.baseRent : newRentPennies, lastRentIncrease: prev.monthsPlayed }
          : p
      );

      showToast(
        outcome === 'tribunal_landlord' || outcome === 'tribunal_tenant'
          ? '⚖️ Tribunal Decision Applied'
          : '📜 Rent Increase Applied',
        `${reasonLabel}. New rent: £${fromPennies(newRentPennies).toLocaleString()}/mo${tribunalFeePennies > 0 ? ` (tribunal fee £${fromPennies(tribunalFeePennies).toLocaleString()})` : ''}.`
      );

      set({ ...cashUpdate, ownedProperties: updatedProps, tenants: updatedTenants });
    },

    evictTenant: (propertyId: string, ground: EvictionGround, slotIndex: number = 0) => {
      const prev = get();
      const tenant = prev.tenants.find((t: any) => t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex);
      if (!tenant) { showToast("No Tenant", "There is no tenant to evict.", "destructive"); return; }
      if (prev.pendingEvictions.some((e: any) => e.propertyId === propertyId && (e.slotIndex ?? 0) === slotIndex)) {
        showToast("Eviction Already Served", "Notice already in effect for this slot. Cancel it first.", "destructive"); return;
      }

      if (ground === 'landlord_sale' || ground === 'landlord_move_in') {
        const appealCd = (prev.propertyLocks || []).find(
          (l: any) => l.propertyId === propertyId && l.reason === 'appeal_cooldown' && prev.monthsPlayed < l.untilMonth && (l.slotIndex === undefined || l.slotIndex === slotIndex),
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

      const recentDefaults = prev.tenantEvents.filter((e: any) => e.propertyId === propertyId && e.type === 'default').length;
      const concerns = prev.tenantConcerns.filter((c: any) => c.propertyId === propertyId && !c.resolvedMonth);
      const longstandingASB = concerns.some((c: any) =>
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
      }

      let appealChance =
        ground === 'landlord_sale' || ground === 'landlord_move_in' ? 0.35 :
        ground === 'antisocial_behaviour' ? 0.10 :
        0.05;
      if ((tenant.satisfaction ?? 50) >= 60) appealChance += 0.15;
      if (tenant.tenant.profile === 'risky') appealChance -= 0.10;
      appealChance = Math.max(0, Math.min(0.85, appealChance));
      const willAppeal = gameRandom() < appealChance;

      const courtBacklogMonths = 3 + Math.floor(gameRandom() * 4);
      const effectiveMonth = prev.monthsPlayed + noticeMonths + courtBacklogMonths;
      const updatedTenants = prev.tenants.map((t: any) =>
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
      if (!prev.pendingEvictions.some((e: any) => e.propertyId === propertyId && (e.slotIndex ?? 0) === slotIndex)) return;
      showToast("Eviction Withdrawn", "Notice cancelled — tenant stays.");
      set({
        pendingEvictions: prev.pendingEvictions.filter((e: any) => !(e.propertyId === propertyId && (e.slotIndex ?? 0) === slotIndex)),
        tenants: prev.tenants.map((t: any) =>
          t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex
            ? { ...t, evictionNoticeMonth: undefined, evictionGround: undefined }
            : t
        ),
      });
    },

    disputeDeposit: (disputeId: string) => {
      const prev = get();
      const dispute = (prev.depositDisputes || []).find((d: any) => d.id === disputeId && d.status === 'open');
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
          depositDisputes: prev.depositDisputes.map((d: any) =>
            d.id === disputeId
              ? { ...d, status: outcome, refundedAmount: d.refundedAmount + extraRefund, resolvedMonth: prev.monthsPlayed }
              : d,
          ),
        });
      } else {
        set({
          depositDisputes: prev.depositDisputes.map((d: any) =>
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
      const dispute = (prev.depositDisputes || []).find((d: any) => d.id === disputeId);
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
          depositDisputes: prev.depositDisputes.map((d: any) =>
            d.id === disputeId
              ? { ...d, status: 'lost', refundedAmount: d.refundedAmount + dispute.withheldAmount, resolvedMonth: prev.monthsPlayed }
              : d,
          ),
        });
        showToast("Refund Issued", `Full £${fromPennies(dispute.withheldAmount).toLocaleString()} refunded to ${dispute.tenantName}.`);
      } else {
        set({ depositDisputes: prev.depositDisputes.filter((d: any) => d.id !== disputeId) });
      }
    },
  };
}
