/**
 * Game-control action bundle — clock tick, pause/speed, reset, approval queue,
 * chain-collapse/payoff/economic-event dismissal.
 *
 * Outstanding Improvements v4 Step 4: extracted verbatim from `gameStore.ts`
 * behind a factory so the store literal stays a thin composer. Behaviour and
 * persisted shape are unchanged. Cross-slice reads via `get()` only.
 */
import type { PendingTransaction } from '@/types/game';
import { DEFAULT_GAME_SETTINGS } from '@/types/game';
import { fromPennies } from '@/lib/formatCurrency';
import { showToast, debit } from '../storeHelpers';
import { createInitialState } from '../gameStore';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createGameControlActions(set: SetFn, get: GetFn) {
  return {
    clockTick: () =>
      set((s: any) => ({ timeUntilNextMonth: Math.max(0, s.timeUntilNextMonth - 1) })),

    resetGame: () => {
      const fresh = createInitialState();
      set(fresh);
      try { window.localStorage.removeItem('pm_onboarding_done'); } catch { /* noop */ }
      showToast("Game Reset", "Started fresh with £100K!");
    },

    updateSettings: (patch: Record<string, boolean>) => {
      const prev = get();
      set({ settings: { ...DEFAULT_GAME_SETTINGS, ...(prev.settings || {}), ...patch } });
    },

    /**
     * Quick win #1 — auto-management pass, run straight after `processMonthEnd`.
     * Honours the opt-in flags in `settings`:
     *   • autoRenewCommercialIfRentIncreaseGte3 — signs queued commercial
     *     renewals on a fresh 5-year term at a 3% uplift.
     *   • autoPayDamagesUnder500 — settles small repair bills from cash.
     * (autoAcceptOffersWithin5Percent is handled where offers arrive.)
     */
    applyAutoManagement: () => {
      const settings = { ...DEFAULT_GAME_SETTINGS, ...(get().settings || {}) };

      if (settings.autoRenewCommercialIfRentIncreaseGte3) {
        const queued = [...((get().pendingLeaseRenewals) || [])];
        queued.forEach((r: any) => {
          const props = get().ownedProperties || [];
          const property = props.find((p: any) => p.id === r.propertyId);
          if (!property || property.type !== 'commercial') return;
          const currentRent = Math.max(1, Math.round(r.currentRentPennies || property.monthlyIncome || 0));
          const agreedRentPennies = Math.round(currentRent * 1.03);
          if (agreedRentPennies < Math.round(currentRent * 1.03)) return;
          (get() as any).renewCommercialLease?.(r.propertyId, {
            agreedRentPennies,
            termMonths: 60,
            reviewFrequencyMonths: 60,
            breakClause: { type: 'none' as const },
          });
        });
      }

      if (settings.autoPayDamagesUnder500) {
        const threshold = 500 * 100; // pennies
        const smallDamages = ((get().pendingDamages) || [])
          .filter((d: any) => (d?.repairCost ?? 0) > 0 && d.repairCost < threshold);
        smallDamages.forEach((d: any) => {
          if ((get().cash || 0) < d.repairCost) return;
          (get() as any).payDamageWithCash?.(d.id);
        });
      }
    },

    setGameSpeed: (speed: number) => {
      const clamped = Math.max(0.25, Math.min(8, speed));
      set({ gameSpeed: clamped });
    },

    togglePause: () => {
      set({ isPaused: !get().isPaused });
    },

    setPaused: (paused: boolean) => {
      set({ isPaused: !!paused });
    },

    approvePendingTransaction: (id: string) => {
      const s = get();
      const queue: PendingTransaction[] = Array.isArray(s.pendingTransactions) ? s.pendingTransactions : [];
      const tx = queue.find((t) => t.id === id);
      if (!tx) return;
      // Phase 8 — HMO licence approval delegates to the dedicated action
      // (debits the fee + flips the property's licence status to 'applied').
      if (tx.type === 'hmo_licence_required') {
        if (!tx.propertyId) return;
        const before = (get().ownedProperties || []).find((p: any) => p.id === tx.propertyId);
        (get() as any).applyForHmoLicence(tx.propertyId);
        const after = (get().ownedProperties || []).find((p: any) => p.id === tx.propertyId);
        const didApply = after?.hmoLicenceStatus === 'applied' && before?.hmoLicenceStatus !== 'applied';
        if (!didApply) return; // toast already shown (insufficient funds / wrong subtype)
        const s2 = get();
        const remaining = (s2.pendingTransactions || []).filter((t) => t.id !== id);
        set({
          pendingTransactions: remaining,
          isPaused: remaining.length === 0 ? false : s2.isPaused,
        });
        return;
      }
      const result = debit({ cash: s.cash, overdraftUsed: s.overdraftUsed, overdraftLimit: s.overdraftLimit }, tx.amount);
      if (!result) {
        showToast("Insufficient funds", `Cannot approve £${fromPennies(tx.amount).toLocaleString()} — raise cash or extend overdraft first.`, 'destructive');
        return;
      }
      const remaining = queue.filter((t) => t.id !== id);
      set({
        cash: result.cash,
        overdraftUsed: result.overdraftUsed,
        pendingTransactions: remaining,
        isPaused: remaining.length === 0 ? false : s.isPaused,
      });
      if (result.usedOverdraft > 0) {
        showToast("Approved (overdraft used)", `£${fromPennies(tx.amount).toLocaleString()} paid — £${fromPennies(result.usedOverdraft).toLocaleString()} via overdraft.`);
      } else {
        showToast("Approved", `£${fromPennies(tx.amount).toLocaleString()} — ${tx.description}`);
      }
    },

    approveAllPendingTransactions: () => {
      const s = get();
      const queue: PendingTransaction[] = Array.isArray(s.pendingTransactions) ? s.pendingTransactions : [];
      if (queue.length === 0) return;
      let cash = s.cash;
      let overdraftUsed = s.overdraftUsed;
      const remaining: PendingTransaction[] = [];
      let approvedAmount = 0;
      let usedOverdraftTotal = 0;
      for (const tx of queue) {
        // Phase 8 — HMO licence approval is processed via the dedicated action.
        if (tx.type === 'hmo_licence_required') {
          if (!tx.propertyId) { remaining.push(tx); continue; }
          const before = (get().ownedProperties || []).find((p: any) => p.id === tx.propertyId);
          (get() as any).applyForHmoLicence(tx.propertyId);
          const after = (get().ownedProperties || []).find((p: any) => p.id === tx.propertyId);
          const didApply = after?.hmoLicenceStatus === 'applied' && before?.hmoLicenceStatus !== 'applied';
          if (didApply) {
            // applyForHmoLicence already debited via its own action; resync local cash trackers.
            const fresh = get();
            cash = fresh.cash;
            overdraftUsed = fresh.overdraftUsed;
            approvedAmount += tx.amount;
          } else {
            remaining.push(tx);
          }
          continue;
        }
        const result = debit({ cash, overdraftUsed, overdraftLimit: s.overdraftLimit }, tx.amount);
        if (!result) {
          remaining.push(tx);
          continue;
        }
        cash = result.cash;
        overdraftUsed = result.overdraftUsed;
        approvedAmount += tx.amount;
        usedOverdraftTotal += result.usedOverdraft;
      }
      set({
        cash,
        overdraftUsed,
        pendingTransactions: remaining,
        isPaused: remaining.length === 0 ? false : s.isPaused,
      });
      if (remaining.length > 0) {
        showToast(
          "Partial approval",
          `Approved £${fromPennies(approvedAmount).toLocaleString()}. ${remaining.length} item(s) skipped — insufficient funds.`,
          'destructive',
        );
      } else {
        showToast("All approved", `£${fromPennies(approvedAmount).toLocaleString()} paid${usedOverdraftTotal > 0 ? ` (£${fromPennies(usedOverdraftTotal).toLocaleString()} via overdraft)` : ''}.`);
      }
    },

    dismissChainCollapseEvent: (id: string) => {
      const s = get();
      const remaining = (s.chainCollapseEvents || []).filter((e: any) => e.id !== id);
      const stillHasPending = (s.pendingTransactions?.length || 0) > 0;
      set({
        chainCollapseEvents: remaining,
        isPaused: remaining.length === 0 && !stillHasPending ? false : s.isPaused,
      });
    },

    dismissAllChainCollapseEvents: () => {
      const s = get();
      const stillHasPending = (s.pendingTransactions?.length || 0) > 0;
      set({
        chainCollapseEvents: [],
        isPaused: !stillHasPending ? false : s.isPaused,
      });
    },

    dismissPayoffEvent: (id: string) => {
      const s = get();
      const remaining = ((s.payoffEvents || []) as any[]).filter((e) => e.id !== id);
      set({ payoffEvents: remaining });
    },

    dismissAllPayoffEvents: () => {
      set({ payoffEvents: [] });
    },

    dismissPoliceLetter: (id: string) => {
      const s: any = get();
      set({ pendingPoliceLetters: (s.pendingPoliceLetters || []).filter((l: any) => l.id !== id) });
    },

    dismissCourtResolution: (caseId: string) => {
      const s: any = get();
      set({ pendingCourtResolutions: (s.pendingCourtResolutions || []).filter((id: string) => id !== caseId) });
    },

    acceptOverdraftPrompt: () => {
      const s: any = get();
      const prompt = s.pendingOverdraftPrompt;
      if (!prompt) return;
      set({
        overdraftLimit: Math.max(s.overdraftLimit || 0, prompt.eligibleLimit),
        pendingOverdraftPrompt: null,
      });
    },

    dismissOverdraftPrompt: () => {
      set({ pendingOverdraftPrompt: null });
    },

    markEconomicEventsSeen: (ids: string[]) => {
      if (!ids || ids.length === 0) return;
      const s = get();
      const prevSeen: string[] = Array.isArray(s.seenEconomicEventIds) ? s.seenEconomicEventIds : [];
      const next = Array.from(new Set([...prevSeen, ...ids])).slice(-50);
      set({ seenEconomicEventIds: next });
    },

    /**
     * Player-triggered bankruptcy from the rescue panel. Liquidates the entire
     * portfolio at a 70 % auction haircut, pays off mortgages first, then loans,
     * then any remaining pending transactions. Whatever cash is left (positive
     * or negative) becomes the player's final net worth and is recorded in
     * `bankruptcySummary` for the end-game modal.
     */
    triggerBankruptcy: () => {
      const prev: any = get();
      if (prev.isBankrupt) return;

      const propertiesSoldFor: Array<{ name: string; soldFor: number; mortgagePaid: number; net: number }> = [];
      let cash = prev.cash;
      let proceeds = 0;

      // 1) Liquidate every owned property at 70 % auction value.
      for (const property of prev.ownedProperties as any[]) {
        const soldFor = Math.round(property.value * 0.7);
        const ownMortgage = (prev.mortgages as any[]).find((m) => m.propertyId === property.id && !m.collateralPropertyIds?.length);
        const portfolioShare = (prev.mortgages as any[])
          .filter((m) => (m.collateralPropertyIds || []).includes(property.id))
          .reduce((s, m) => s + Math.round(m.remainingBalance / Math.max(1, (m.collateralPropertyIds?.length || 1))), 0);
        const mortgagePaid = (ownMortgage?.remainingBalance || 0) + portfolioShare;
        const net = soldFor - mortgagePaid;
        proceeds += net;
        propertiesSoldFor.push({ name: property.name, soldFor, mortgagePaid, net });
      }
      cash += proceeds;

      // 2) Pay remaining loans (personal/business/investor/bridging).
      const outstandingLoans = ((prev.loans || []) as any[]).reduce((s, l) => s + (l.remainingBalance || 0), 0);
      cash -= outstandingLoans;

      // 3) Clear any pending transactions (tax / insurance / council tax).
      const pendingDebits = ((prev.pendingTransactions || []) as any[]).reduce((s, t) => s + (t.amount || 0), 0);
      cash -= pendingDebits;

      // 4) Settle overdraft from whatever cash remains.
      cash -= prev.overdraftUsed || 0;

      const totalDebt = ((prev.mortgages || []) as any[]).reduce((s, m) => s + m.remainingBalance, 0)
        + outstandingLoans
        + pendingDebits
        + (prev.overdraftUsed || 0);

      const summary = {
        month: prev.monthsPlayed,
        totalDebt,
        propertiesLostCount: (prev.ownedProperties || []).length,
        remainingCash: cash, // doubles as final net worth
        propertiesSoldFor,
      };

      set({
        isBankrupt: true,
        bankruptcySummary: summary,
        cash,
        overdraftUsed: 0,
        ownedProperties: [],
        mortgages: [],
        loans: [],
        tenants: [],
        voidPeriods: [],
        tenantConcerns: [],
        pendingEvictions: [],
        propertyLocks: [],
        pendingTransactions: [],
        isPaused: false,
      });

      showToast(
        "Bankruptcy Filed",
        `Portfolio liquidated. Final net worth: £${fromPennies(cash).toLocaleString()}.`,
        cash < 0 ? "destructive" : undefined,
      );
    },
  };
}
