/**
 * Improvements #7 item 6 — bank investment actions.
 *
 * Holdings hold a pennies balance per product; withdrawals go through a notice
 * period and land back in cash when they settle. Every money movement is also
 * appended to `investmentLedger` for the transaction-history view.
 */
import { fromPennies } from '@/lib/formatCurrency';
import { showToast, debit, credit } from '../storeHelpers';
import {
  INVESTMENT_PRODUCTS, monthlyReturn, type InvestmentKind,
} from '@/lib/engine/investments';
import type { InvestmentHolding, InvestmentWithdrawal, InvestmentLedgerEntry } from '@/types/game';

type SetFn = (partial: any) => void;
type GetFn = () => any;

const LEDGER_LIMIT = 400;

/** Append ledger entries (newest first) and cap the log length. */
function appendLedger(prev: any, entries: InvestmentLedgerEntry[]): InvestmentLedgerEntry[] {
  const existing: InvestmentLedgerEntry[] = Array.isArray(prev.investmentLedger) ? prev.investmentLedger : [];
  return [...entries, ...existing].slice(0, LEDGER_LIMIT);
}

let ledgerSeq = 0;
function ledgerId(kind: string, type: string) {
  ledgerSeq += 1;
  return `invl_${kind}_${type}_${Date.now()}_${ledgerSeq}`;
}

export function createInvestmentActions(set: SetFn, get: GetFn) {
  return {
    /** Move cash into an investment product. `amountPennies` must clear the minimum. */
    investCash: (kind: InvestmentKind, amountPennies: number) => {
      const prev = get();
      const product = INVESTMENT_PRODUCTS[kind];
      if (!product) return;
      const amount = Math.floor(amountPennies);
      if (amount < product.minDepositPennies) {
        showToast(
          'Below minimum',
          `${product.name} needs at least £${fromPennies(product.minDepositPennies).toLocaleString()}.`,
          'destructive',
        );
        return;
      }
      // Improvements #8 item 7b — enforce per-product holding caps (Premium Bonds £50k).
      if (product.maxHoldingPennies !== undefined) {
        const held = (prev.investments || []).find((h: InvestmentHolding) => h.kind === kind)?.balancePennies ?? 0;
        const headroom = Math.max(0, product.maxHoldingPennies - held);
        if (amount > headroom) {
          showToast(
            'Holding cap reached',
            `${product.name} is capped at £${fromPennies(product.maxHoldingPennies).toLocaleString()} — you can add £${fromPennies(headroom).toLocaleString()} more.`,
            'destructive',
          );
          return;
        }
      }
      const debited = debit(prev, amount);
      if (!debited) {
        showToast('Insufficient cash', `You need £${fromPennies(amount).toLocaleString()} available.`, 'destructive');
        return;
      }
      const holdings: InvestmentHolding[] = [...(prev.investments || [])];
      const existing = holdings.find(h => h.kind === kind);
      if (existing) {
        existing.balancePennies += amount;
        existing.contributedPennies += amount;
      } else {
        holdings.push({
          id: `inv_${kind}_${Date.now()}`,
          kind,
          balancePennies: amount,
          contributedPennies: amount,
          openedMonth: prev.monthsPlayed,
          lifetimeGainPennies: 0,
          lastMonthReturn: 0,
        });
      }
      set({
        ...debited,
        investments: holdings,
        investmentLedger: appendLedger(prev, [{
          id: ledgerId(kind, 'deposit'),
          kind,
          type: 'deposit',
          amountPennies: amount,
          month: prev.monthsPlayed,
          at: Date.now(),
          note: product.name,
        }]),
      });
      showToast('Investment placed', `£${fromPennies(amount).toLocaleString()} into ${product.name}.`);
    },

    /** Request a withdrawal. Settles after the product's notice period. */
    requestInvestmentWithdrawal: (kind: InvestmentKind, amountPennies: number) => {
      const prev = get();
      const product = INVESTMENT_PRODUCTS[kind];
      const holdings: InvestmentHolding[] = [...(prev.investments || [])];
      const holding = holdings.find(h => h.kind === kind);
      if (!product || !holding) return;
      const amount = Math.min(holding.balancePennies, Math.floor(amountPennies));
      if (amount <= 0) return;

      const monthsHeld = prev.monthsPlayed - holding.openedMonth;
      const penalty = monthsHeld < product.lockMonths
        ? Math.round(amount * product.earlyExitPenalty)
        : 0;

      holding.balancePennies -= amount;
      const remaining = holdings.filter(h => h.balancePennies > 0 || h.kind !== kind);

      if (product.noticeMonths === 0) {
        const credited = credit(prev, amount - penalty);
        set({
          ...credited,
          investments: remaining,
          investmentLedger: appendLedger(prev, [{
            id: ledgerId(kind, 'settled'),
            kind,
            type: 'withdrawal_settled',
            amountPennies: amount,
            penaltyPennies: penalty,
            month: prev.monthsPlayed,
            at: Date.now(),
            note: `${product.name} — instant access`,
          }]),
        });
        showToast(
          'Withdrawal complete',
          `£${fromPennies(amount - penalty).toLocaleString()} back in cash${penalty > 0 ? ` (£${fromPennies(penalty).toLocaleString()} exit fee)` : ''}.`,
        );
        return;
      }

      const withdrawals: InvestmentWithdrawal[] = [
        ...(prev.investmentWithdrawals || []),
        {
          id: `invw_${kind}_${Date.now()}`,
          kind,
          grossPennies: amount,
          penaltyPennies: penalty,
          requestedMonth: prev.monthsPlayed,
          settlesMonth: prev.monthsPlayed + product.noticeMonths,
        },
      ];
      set({
        investments: remaining,
        investmentWithdrawals: withdrawals,
        investmentLedger: appendLedger(prev, [{
          id: ledgerId(kind, 'requested'),
          kind,
          type: 'withdrawal_requested',
          amountPennies: amount,
          penaltyPennies: penalty,
          month: prev.monthsPlayed,
          at: Date.now(),
          note: `${product.name} — ${product.noticeMonths}mo notice`,
        }]),
      });
      showToast(
        'Withdrawal requested',
        `£${fromPennies(amount - penalty).toLocaleString()} settles in ${product.noticeMonths} month${product.noticeMonths === 1 ? '' : 's'}.`,
      );
    },

    /**
     * Monthly tick: apply returns to every holding and settle any matured
     * withdrawals. Called from the engine right after `processMonthEnd`.
     */
    processInvestmentsMonth: () => {
      const prev = get();
      const holdings: InvestmentHolding[] = prev.investments || [];
      const withdrawals: InvestmentWithdrawal[] = prev.investmentWithdrawals || [];
      if (holdings.length === 0 && withdrawals.length === 0) return;

      const boe = prev.currentMarketRate ?? 0.045;
      const updated = holdings.map(h => {
        const r = monthlyReturn(h.kind, boe);
        const gain = Math.round(h.balancePennies * r);
        return {
          ...h,
          balancePennies: Math.max(0, h.balancePennies + gain),
          lifetimeGainPennies: (h.lifetimeGainPennies || 0) + gain,
          lastMonthReturn: r,
        };
      });

      const due = withdrawals.filter(w => prev.monthsPlayed >= w.settlesMonth);
      const stillPending = withdrawals.filter(w => prev.monthsPlayed < w.settlesMonth);
      let patch: any = { investments: updated, investmentWithdrawals: stillPending };
      if (due.length > 0) {
        const total = due.reduce((s, w) => s + (w.grossPennies - w.penaltyPennies), 0);
        patch = {
          ...credit(get(), total),
          ...patch,
          investmentLedger: appendLedger(prev, due.map(w => ({
            id: ledgerId(w.kind, 'settled'),
            kind: w.kind,
            type: 'withdrawal_settled' as const,
            amountPennies: w.grossPennies,
            penaltyPennies: w.penaltyPennies,
            month: prev.monthsPlayed,
            at: Date.now(),
            note: `${INVESTMENT_PRODUCTS[w.kind].name} — notice served`,
          }))),
        };
        showToast(
          'Investment funds settled',
          `£${fromPennies(total).toLocaleString()} from ${due.length} withdrawal${due.length === 1 ? '' : 's'} is now in cash.`,
        );
      }
      set(patch);

      const blowUp = updated.find(h => (h.lastMonthReturn ?? 0) <= -0.15);
      if (blowUp) {
        showToast(
          'Market shock 📉',
          `${INVESTMENT_PRODUCTS[blowUp.kind].name} fell ${Math.abs((blowUp.lastMonthReturn ?? 0) * 100).toFixed(1)}% this month.`,
          'destructive',
        );
      }
    },
  };
}
