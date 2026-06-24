/**
 * Game-control action bundle — clock tick, pause/speed, reset, approval queue,
 * chain-collapse/payoff/economic-event dismissal.
 *
 * Outstanding Improvements v4 Step 4: extracted verbatim from `gameStore.ts`
 * behind a factory so the store literal stays a thin composer. Behaviour and
 * persisted shape are unchanged. Cross-slice reads via `get()` only.
 */
import type { PendingTransaction } from '@/types/game';
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
  };
}
