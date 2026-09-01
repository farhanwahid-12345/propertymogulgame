import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PiggyBank, TrendingUp, TrendingDown, Landmark, Hourglass, Rocket, Bitcoin, ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";
import { fromPennies, toPennies } from "@/lib/formatCurrency";
import {
  INVESTMENT_PRODUCTS, annualisedRate, type InvestmentKind,
} from "@/lib/engine/investments";
import type { InvestmentHolding, InvestmentWithdrawal, InvestmentLedgerEntry } from "@/types/game";

interface Props {
  /** Player cash in pennies. */
  cashPennies: number;
  boeRate: number;
  monthsPlayed: number;
  investments: InvestmentHolding[];
  withdrawals: InvestmentWithdrawal[];
  /** Newest-first transaction history of deposits and withdrawals. */
  ledger?: InvestmentLedgerEntry[];
  onInvest: (kind: InvestmentKind, amountPennies: number) => void;
  onWithdraw: (kind: InvestmentKind, amountPennies: number) => void;
}


const ICONS: Record<InvestmentKind, typeof PiggyBank> = {
  savings: PiggyBank,
  bonds: Landmark,
  index: TrendingUp,
  risky: Rocket,
  crypto: Bitcoin,
};

const ORDER: InvestmentKind[] = ['savings', 'bonds', 'index', 'risky', 'crypto'];

/**
 * Improvements #8 item 7 — put spare cash to work: high-interest savings,
 * Premium Bonds (£50k cap), an S&P 500 tracker, risky stocks and crypto.
 */
export function InvestmentsPanel({
  cashPennies, boeRate, monthsPlayed, investments, withdrawals, ledger = [], onInvest, onWithdraw,
}: Props) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [showAllHistory, setShowAllHistory] = useState(false);

  const totals = useMemo(() => {
    const invested = investments.reduce((s, h) => s + h.balancePennies, 0);
    const pending = withdrawals.reduce((s, w) => s + (w.grossPennies - w.penaltyPennies), 0);
    const gains = investments.reduce((s, h) => s + (h.lifetimeGainPennies || 0), 0);
    return { invested, pending, gains };
  }, [investments, withdrawals]);

  const history = useMemo(
    () => [...ledger].sort((a, b) => (b.at || 0) - (a.at || 0)),
    [ledger],
  );
  const visibleHistory = showAllHistory ? history : history.slice(0, 8);


  return (
    <Card className="glass border-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <PiggyBank className="h-4 w-4 text-[hsl(var(--stat-credit))]" />
          Investments
          <Badge variant="outline" className="text-[10px]">
            Invested £{fromPennies(totals.invested).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] ${totals.gains >= 0 ? 'text-success border-success/30' : 'text-danger border-danger/30'}`}
          >
            {totals.gains >= 0 ? '+' : '−'}£{Math.abs(fromPennies(totals.gains)).toLocaleString(undefined, { maximumFractionDigits: 0 })} lifetime
          </Badge>
          {totals.pending > 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-400/30">
              <Hourglass className="h-3 w-3 mr-1" />
              £{fromPennies(totals.pending).toLocaleString(undefined, { maximumFractionDigits: 0 })} settling
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {ORDER.map((kind) => {
          const product = INVESTMENT_PRODUCTS[kind];
          const Icon = ICONS[kind];
          const holding = investments.find(h => h.kind === kind);
          const balance = holding?.balancePennies ?? 0;
          const last = holding?.lastMonthReturn ?? 0;
          const rate = annualisedRate(product, boeRate);
          const raw = amounts[kind] ?? '';
          const amountPennies = raw ? toPennies(Number(raw) || 0) : 0;
          // Improvements #8 item 7b — Premium Bonds are capped at £50,000 held.
          const headroom = product.maxHoldingPennies !== undefined
            ? Math.max(0, product.maxHoldingPennies - balance)
            : Infinity;
          const canInvest = amountPennies >= product.minDepositPennies
            && amountPennies <= cashPennies
            && amountPennies <= headroom;
          const locked = holding ? (monthsPlayed - holding.openedMonth) < product.lockMonths : false;
          const pendingForKind = withdrawals.filter(w => w.kind === kind);

          return (
            <div key={kind} className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {product.name}
                    <Badge variant="outline" className="text-[10px]">{product.riskLabel}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{product.blurb}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[hsl(var(--stat-credit))]">
                    {(rate * 100).toFixed(1)}% <span className="text-[10px] font-normal text-muted-foreground">est. p.a.</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Held £{fromPennies(balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  {holding && last !== 0 && (
                    <div className={`text-[10px] flex items-center justify-end gap-1 ${last >= 0 ? 'text-success' : 'text-danger'}`}>
                      {last >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {(last * 100).toFixed(1)}% last month
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder={`Min £${fromPennies(product.minDepositPennies).toLocaleString()}`}
                  value={raw}
                  onChange={(e) => setAmounts(prev => ({ ...prev, [kind]: e.target.value }))}
                  className="h-8 w-32 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!canInvest}
                  onClick={() => { onInvest(kind, amountPennies); setAmounts(prev => ({ ...prev, [kind]: '' })); }}
                >
                  Invest
                </Button>
                {balance > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => onWithdraw(kind, Math.min(balance, amountPennies || balance))}
                    >
                      Withdraw {amountPennies > 0 && amountPennies < balance ? `£${Number(raw).toLocaleString()}` : 'all'}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      {product.noticeMonths === 0
                        ? 'Instant access'
                        : `${product.noticeMonths}mo notice`}
                      {locked && product.earlyExitPenalty > 0 &&
                        ` · ${(product.earlyExitPenalty * 100).toFixed(0)}% early-exit fee`}
                    </span>
                  </>
                )}
              </div>

              {pendingForKind.length > 0 && (
                <div className="text-[10px] text-amber-300 flex items-center gap-1">
                  <Hourglass className="h-3 w-3" />
                  {pendingForKind.map(w => (
                    <span key={w.id}>
                      £{fromPennies(w.grossPennies - w.penaltyPennies).toLocaleString(undefined, { maximumFractionDigits: 0 })} settles month {w.settlesMonth}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-2">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
            Transaction history
            <Badge variant="outline" className="text-[10px]">{history.length}</Badge>
          </div>
          {history.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No investment transactions yet — deposits and withdrawals are logged here.
            </p>
          ) : (
            <>
              <ul className="space-y-1">
                {visibleHistory.map((e) => {
                  const isDeposit = e.type === 'deposit';
                  const label = isDeposit
                    ? 'Deposit'
                    : e.type === 'withdrawal_requested' ? 'Withdrawal requested' : 'Withdrawal settled';
                  const net = e.amountPennies - (e.penaltyPennies || 0);
                  return (
                    <li key={e.id} className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="flex items-start gap-1.5 min-w-0">
                        {isDeposit
                          ? <ArrowUpRight className="h-3 w-3 mt-0.5 text-[hsl(var(--stat-credit))] shrink-0" />
                          : <ArrowDownLeft className="h-3 w-3 mt-0.5 text-amber-300 shrink-0" />}
                        <span className="min-w-0">
                          <span className="font-medium">{label}</span>
                          <span className="text-muted-foreground"> · {INVESTMENT_PRODUCTS[e.kind].name}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            Month {e.month} · {new Date(e.at).toLocaleString(undefined, {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                            {e.penaltyPennies ? ` · £${fromPennies(e.penaltyPennies).toLocaleString(undefined, { maximumFractionDigits: 0 })} fee` : ''}
                          </span>
                        </span>
                      </span>
                      <span className={`font-semibold tabular-nums shrink-0 ${isDeposit ? 'text-danger' : 'text-success'}`}>
                        {isDeposit ? '−' : '+'}£{fromPennies(isDeposit ? e.amountPennies : net).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {history.length > 8 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] px-2"
                  onClick={() => setShowAllHistory(v => !v)}
                >
                  {showAllHistory ? 'Show less' : `Show all ${history.length}`}
                </Button>
              )}
            </>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Invested pots count toward net worth but can't be used as a deposit until they settle back into cash.
        </p>

      </CardContent>
    </Card>
  );
}
