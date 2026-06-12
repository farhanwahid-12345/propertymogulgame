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
import { checkAndUnlockAchievements, ACHIEVEMENTS } from '@/lib/achievements';
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

      // Achievement wiring — tribunal won in landlord's favour pushes a
      // reputationLog marker and triggers the court_win unlock immediately.
      let achievementsPatch: Record<string, number> | undefined;
      let extraRepLog: any[] = [];
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
          reputationLog: [...((prev as any).reputationLog || []), ...extraRepLog],
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
          ? { reputationLog: [...(((prev as any).reputationLog) || []), ...extraRepLog].slice(-40) }
          : {}),
        ...(achievementsPatch ? { achievements: achievementsPatch } : {}),
      });
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

    // ─── Outstanding Improvements v4 Step 1: migrated from gameStore.ts ───

    resolveTenantConcern: (concernId: string) => {
      const prev = get();
      const concerns = prev.tenantConcerns || [];
      const concern = concerns.find((c: any) => c.id === concernId && !c.resolvedMonth);
      if (!concern) return;
      const debited = debit(prev, concern.resolveCost);
      if (!debited) {
        showToast("Insufficient Funds", `Need £${fromPennies(concern.resolveCost).toLocaleString()} (even with overdraft) to resolve.`, "destructive");
        return;
      }
      const updatedTenants = prev.tenants.map((t: any) =>
        t.propertyId === concern.propertyId
          ? { ...t, satisfaction: Math.min(100, t.satisfaction + 8) }
          : t
      );
      const lift = CONCERN_RESOLVE_CONDITION_LIFT[concern.category] ?? 3;
      const updatedOwned = prev.ownedProperties.map((p: any) => {
        if (p.id !== concern.propertyId) return p;
        const score = Math.max(0, Math.min(100, (p.conditionScore ?? scoreFromConditionTier(p.condition)) + lift));
        return { ...p, conditionScore: score, condition: conditionTierFromScore(score) };
      });

      let updatedAnnual = prev.annualRepairCosts;
      let updatedHistory = prev.damageHistory;
      if (concern.source === 'damage') {
        const currentYear = Math.floor(prev.monthsPlayed / 12);
        const existing = prev.annualRepairCosts.find((a: any) => a.propertyId === concern.propertyId && a.year === currentYear);
        updatedAnnual = existing
          ? prev.annualRepairCosts.map((a: any) =>
              a.propertyId === concern.propertyId && a.year === currentYear
                ? { ...a, totalCost: a.totalCost + concern.resolveCost }
                : a
            )
          : [...prev.annualRepairCosts, { propertyId: concern.propertyId, year: currentYear, totalCost: concern.resolveCost }];
        const dmgHist = prev.damageHistory.find((dh: any) => dh.propertyId === concern.propertyId);
        updatedHistory = dmgHist
          ? prev.damageHistory.map((dh: any) =>
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
        tenantConcerns: concerns.map((c: any) =>
          c.id === concernId ? { ...c, resolvedMonth: prev.monthsPlayed } : c
        ),
      });
    },

    topUpCondition: (propertyId: string, pointsRequested: number) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
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
      const updated = prev.ownedProperties.map((p: any) =>
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
        updatedConcerns = (prev.tenantConcerns || []).map((c: any) => {
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
      const tenant = s.tenants.find((t: any) => t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex);
      const prop = s.ownedProperties.find((p: any) => p.id === propertyId);
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
      const existing = (s.debtRecoveryCases || []).find((c: any) => c.propertyId === propertyId && c.tenantName === tenant.tenant.name && c.status === 'in_court');
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
      const newCase: any = {
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

      const newTenants = s.tenants.map((t: any) =>
        t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex
          ? { ...t, arrearsMonths: 0, arrearsPennies: 0 }
          : t,
      );
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        tenants: newTenants,
        debtRecoveryCases: [...(s.debtRecoveryCases || []), newCase],
        opsFlashAt: Date.now(),
      });
      showToast("⚖️ Claim filed", `£325 filing fee paid. Expect a decision in 6–12 months for ${tenant.tenant.name} (£${fromPennies(arrearsPennies).toLocaleString()} owed).`);
    },

    issueLetterBeforeAction: (propertyId: string, slotIndex: number = 0) => {
      const s = get();
      const tenant = s.tenants.find((t: any) => t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex);
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
        tenants: s.tenants.map((t: any) =>
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
      const idx = cases.findIndex((c: any) => c.id === caseId);
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
  };
}
