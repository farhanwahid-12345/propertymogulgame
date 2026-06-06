/**
 * Conveyancing action bundle — withdrawals from buy/sell pipelines.
 *
 * Phase 3e: extracted verbatim from `gameStore.ts` behind a factory. The
 * core monthly conveyancing progression still lives inside
 * `processMarketUpdate` and will be migrated when that orchestrator is split.
 */
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { showToast, debit, credit } from '../storeHelpers';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createConveyancingActions(set: SetFn, get: GetFn) {
  return {
    withdrawFromConveyancing: (conveyancingId: string) => {
      const prev = get();
      const conv = (prev.conveyancing || []).find((c: any) => c.id === conveyancingId);
      if (!conv) { showToast("Not Found", "That transaction is no longer in progress.", "destructive"); return; }
      if (conv.status === 'selling') {
        const feePennies = toPennies(1500);
        const dbg = debit(prev, feePennies);
        if (!dbg) {
          showToast("Insufficient Funds", `Need £1,500 (even with overdraft) to cover chain-collapse fees.`, "destructive");
          return;
        }
        showToast("Sale Withdrawn", `${conv.propertyName} pulled from sale. Chain-collapse fee £1,500 paid.`, "destructive");
        set({
          cash: dbg.cash,
          overdraftUsed: dbg.overdraftUsed,
          conveyancing: (prev.conveyancing || []).filter((c: any) => c.id !== conveyancingId),
        });
        return;
      }
      const purchase = conv.purchasePrice || 0;
      const abortFee = Math.round(purchase * 0.005);
      const escrowReturn = Math.max(0, (conv.cashHeld || 0) - abortFee);
      const credited = credit(prev, escrowReturn);
      showToast(
        "Purchase Withdrawn",
        `${conv.propertyName} aborted. Solicitor fees forfeit; £${fromPennies(abortFee).toLocaleString()} abort fee deducted.`,
        "destructive",
      );
      const reinstated = !prev.estateAgentProperties.find((p: any) => p.id === conv.propertyId)
        ? [...prev.estateAgentProperties, { id: conv.propertyId, name: conv.propertyName, type: 'residential', price: purchase, value: purchase, neighborhood: '', monthlyIncome: 0, image: '', marketTrend: 'stable', condition: 'standard', monthsSinceLastRenovation: 0 } as any]
        : prev.estateAgentProperties;
      set({
        cash: credited.cash,
        overdraftUsed: credited.overdraftUsed,
        conveyancing: (prev.conveyancing || []).filter((c: any) => c.id !== conveyancingId),
        estateAgentProperties: reinstated,
      });
    },
  };
}
