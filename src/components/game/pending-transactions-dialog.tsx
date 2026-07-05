import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies, toPennies } from "@/lib/formatCurrency";
import { LOAN_PRODUCTS, MORTGAGE_PROVIDERS } from "@/lib/engine/constants";
import type { PendingTransaction, PendingTransactionType, Mortgage, Property } from "@/types/game";
import { useShallow } from "zustand/react/shallow";

const ICONS: Record<PendingTransactionType, string> = {
  insurance: "🛡️",
  council_tax: "🏛️",
  income_tax: "🧾",
  corporation_tax: "🏢",
  eicr: "⚡",
  hmo_licence_required: "🏠",
  other: "💷",
};

const LABELS: Record<PendingTransactionType, string> = {
  insurance: "Landlord Insurance",
  council_tax: "Council Tax",
  income_tax: "Income Tax",
  corporation_tax: "Corporation Tax",
  eicr: "EICR (Electrical Safety)",
  hmo_licence_required: "HMO Licence Required",
  other: "Other Debit",
};

type RescueMode = 'none' | 'loan' | 'sell' | 'refinance';
type LoanKind = 'personal' | 'business' | 'investor';

export function PendingTransactionsDialog() {
  const {
    pendingTransactions,
    cash,
    overdraftLimit,
    overdraftUsed,
    ownedProperties,
    mortgages,
    creditScore,
    currentMarketRate,
    currentLoanRates,
    landlordReputation,
    entityType,
    loans,
    annualAccounts,
    mortgageProviderRates,
  } = useGameStore(
    useShallow((s: any) => ({
      pendingTransactions: (s.pendingTransactions || []) as PendingTransaction[],
      cash: s.cash as number,
      overdraftLimit: s.overdraftLimit as number,
      overdraftUsed: s.overdraftUsed as number,
      ownedProperties: s.ownedProperties as Property[],
      mortgages: s.mortgages as Mortgage[],
      creditScore: s.creditScore as number,
      currentMarketRate: s.currentMarketRate as number,
      currentLoanRates: s.currentLoanRates,
      landlordReputation: (s.landlordReputation ?? 50) as number,
      entityType: s.entityType,
      loans: (s.loans || []) as Array<any>,
      annualAccounts: (s.annualAccounts || []) as Array<any>,
      mortgageProviderRates: s.mortgageProviderRates,
    })),
  );
  const approveOne = useGameStore((s: any) => s.approvePendingTransaction);
  const approveAll = useGameStore((s: any) => s.approveAllPendingTransactions);
  const applyForLoan = useGameStore((s: any) => s.applyForLoan);
  const forceQuickSale = useGameStore((s: any) => s.forceQuickSale);
  const handleRefinance = useGameStore((s: any) => s.handleRefinance);
  const triggerBankruptcy = useGameStore((s: any) => s.triggerBankruptcy);

  const open = pendingTransactions.length > 0;
  const total = pendingTransactions.reduce((s, t) => s + t.amount, 0);
  const available = cash + Math.max(0, overdraftLimit - overdraftUsed);
  const canApproveAll = total <= available;
  const shortfall = Math.max(0, total - available);

  const [rescueMode, setRescueMode] = useState<RescueMode>('none');
  const [confirmBankruptcy, setConfirmBankruptcy] = useState<boolean>(false);

  // ── Loan sub-panel state ──────────────────────────────────────────
  const [loanKind, setLoanKind] = useState<LoanKind>('investor');
  const loanProduct = (LOAN_PRODUCTS as any)[loanKind];

  // Mirror of dynamicMax from loans-panel — single useMemo per kind.
  const loanLimitFor = useMemo(() => (kind: LoanKind) => {
    const product = (LOAN_PRODUCTS as any)[kind];
    const rentRoll = ownedProperties.reduce((s, p) => s + p.monthlyIncome, 0);
    const mortPmts = mortgages.reduce((s, m) => s + m.monthlyPayment, 0);
    const existingLoanPmts = loans.reduce((s, l: any) => s + (l.monthlyPayment || 0), 0);
    const netMonthly = Math.max(0, rentRoll - mortPmts - existingLoanPmts);
    const creditFactor = Math.max(0.5, Math.min(1.4, creditScore / 700));
    const profitableYears = annualAccounts.filter((a: any) => (a?.netProfitBeforeTax ?? 0) > 0).length;
    const trackRecordFactor = Math.min(1.4, 0.8 + profitableYears * 0.08);
    const dtiForHealth = rentRoll > 0 ? (mortPmts + existingLoanPmts) / rentRoll : 1;
    const healthFactor = (creditScore >= 750 && dtiForHealth < 0.35) ? 1.3
      : (creditScore >= 650 && dtiForHealth < 0.5) ? 1.0 : 0.7;
    const reputationFactor = Math.max(0.25, Math.min(2.5, landlordReputation / 60));
    const investorTotalFactor = Math.max(0.15, Math.min(4.0, reputationFactor * trackRecordFactor * healthFactor));
    const creditTierMult = creditScore < 500 ? 0.4 : creditScore < 650 ? 0.7 : creditScore < 750 ? 1.0 : 1.25;
    if (kind === 'personal') return Math.floor(Math.min(product.hardCapPennies * creditTierMult, netMonthly * 6) * creditFactor);
    if (kind === 'business') return Math.floor(Math.min(product.hardCapPennies * creditTierMult, netMonthly * 12 * 4) * creditFactor);
    return Math.floor(product.hardCapPennies * investorTotalFactor);
  }, [ownedProperties, mortgages, loans, creditScore, annualAccounts, landlordReputation]);

  const kindEligible = (kind: LoanKind): boolean => {
    const product = (LOAN_PRODUCTS as any)[kind];
    if (kind !== 'investor' && creditScore < product.minCreditScore) return false;
    if (kind === 'business') {
      if (entityType !== 'ltd') return false;
      if (ownedProperties.length < 2) return false;
    }
    if (kind === 'investor') {
      const minRep = product.minReputation ?? 40;
      if (landlordReputation < minRep) return false;
    }
    return loanLimitFor(kind) >= shortfall;
  };

  const loanMax = loanLimitFor(loanKind);
  const loanMin = Math.min(loanMax, Math.max(50000, shortfall)); // pennies, floor £500
  const [loanAmountPennies, setLoanAmountPennies] = useState<number>(Math.min(loanMax, Math.max(shortfall, toPennies(500))));
  // Recompute APR (mirrors applyForLoan)
  const loanCreditPenalty = loanKind === 'investor'
    ? 0
    : creditScore >= 800 ? -0.005 : creditScore >= 650 ? 0 : creditScore >= 500 ? 0.01 : 0.02;
  const reputationRateAdj = loanKind === 'investor'
    ? Math.max(-0.08, Math.min(0.10, (60 - landlordReputation) * 0.002))
    : 0;
  const loanSpread = loanKind === 'investor'
    ? loanProduct.baseSpread
    : ((currentLoanRates as any)?.[loanKind] ?? loanProduct.baseSpread);
  const loanRate = Math.max(0.02, currentMarketRate + loanSpread + loanCreditPenalty + reputationRateAdj);
  const loanTermMonths = Math.max(loanProduct.minTermMonths, Math.min(loanProduct.maxTermMonths, 36));
  const loanMonthlyRate = loanRate / 12;
  const loanMonthlyPayment = loanTermMonths > 0
    ? Math.round((loanAmountPennies * loanMonthlyRate) / (1 - Math.pow(1 + loanMonthlyRate, -loanTermMonths)))
    : 0;

  // ── Sell sub-panel state ──────────────────────────────────────────
  const sellable = ownedProperties.filter(p => !mortgages.some(m => (m.collateralPropertyIds || []).includes(p.id)));
  const [sellPropertyId, setSellPropertyId] = useState<string>(sellable[0]?.id ?? '');

  // ── Refinance sub-panel state ─────────────────────────────────────
  const mortgagedProps = ownedProperties
    .map(p => {
      const m = mortgages.find(mt => mt.propertyId === p.id && !mt.collateralPropertyIds?.length);
      if (!m) return null;
      const currentLTV = m.remainingBalance / Math.max(1, p.value);
      const targetBalance = Math.round(p.value * 0.8);
      const cashRelease = targetBalance - m.remainingBalance;
      return { property: p, mortgage: m, currentLTV, targetBalance, cashRelease };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.cashRelease > 0);
  const [refiPropertyId, setRefiPropertyId] = useState<string>(mortgagedProps[0]?.property.id ?? '');
  const selectedRefi = mortgagedProps.find(x => x.property.id === refiPropertyId);

  const handleTakeLoan = () => {
    if (loanAmountPennies < shortfall) return;
    applyForLoan(loanKind, loanAmountPennies, loanTermMonths);
    setRescueMode('none');
  };

  const handleQuickSale = () => {
    if (!sellPropertyId) return;
    forceQuickSale(sellPropertyId);
    setRescueMode('none');
  };

  const handleDoRefinance = () => {
    if (!selectedRefi) return;
    // Default to Halifax-equivalent provider, 25y repayment.
    const provider = MORTGAGE_PROVIDERS.find(p => p.id === selectedRefi.mortgage.providerId) || MORTGAGE_PROVIDERS[1];
    handleRefinance(selectedRefi.property.id, selectedRefi.targetBalance, provider.id, 25, 'repayment', 0);
    setRescueMode('none');
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⏸️ Approve Pending Debits
            <Badge variant="secondary" className="text-[10px]">{pendingTransactions.length}</Badge>
          </DialogTitle>
          <DialogDescription>
            The game is paused until you approve these bills. Mortgage payments and rent still settle automatically — only tax,
            insurance and council tax now require sign-off.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
          {pendingTransactions.map((tx) => (
            <div key={tx.id} className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/50 px-3 py-2">
              <span className="text-2xl leading-none mt-0.5">{ICONS[tx.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{LABELS[tx.type]}</div>
                <div className="text-xs text-muted-foreground break-words">{tx.description}</div>
              </div>
              <div className="text-sm font-bold tabular-nums whitespace-nowrap">£{fromPennies(tx.amount).toLocaleString()}</div>
              <Button size="sm" variant="outline" onClick={() => approveOne(tx.id)}>
                Approve
              </Button>
            </div>
          ))}
        </div>

        {!canApproveAll && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-300">
              ⚠️ You're £{fromPennies(shortfall).toLocaleString()} short — raise cash to continue:
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant="outline" className="text-xs h-8 border-amber-400/30" onClick={() => setRescueMode(rescueMode === 'loan' ? 'none' : 'loan')}>
                💰 Emergency loan
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-8 border-amber-400/30" onClick={() => setRescueMode(rescueMode === 'sell' ? 'none' : 'sell')}>
                🏠 Sell a property
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-8 border-amber-400/30" onClick={() => setRescueMode(rescueMode === 'refinance' ? 'none' : 'refinance')}>
                🔄 Refinance
              </Button>
            </div>

            {rescueMode === 'loan' && (
              <div className="mt-2 space-y-2 rounded-lg border border-border/40 bg-card/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Emergency loan</span>
                  <Select value={loanKind} onValueChange={(v) => {
                    const k = v as LoanKind;
                    setLoanKind(k);
                    setLoanAmountPennies(Math.min(loanLimitFor(k), Math.max(shortfall, toPennies(500))));
                  }}>
                    <SelectTrigger className="h-7 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investor" disabled={!kindEligible('investor') && loanKind !== 'investor'}>Investor</SelectItem>
                      <SelectItem value="business" disabled={!kindEligible('business') && loanKind !== 'business'}>Business</SelectItem>
                      <SelectItem value="personal" disabled={!kindEligible('personal') && loanKind !== 'personal'}>Personal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {loanMax < shortfall ? (
                  <p className="text-xs text-red-400">
                    Max £{fromPennies(loanMax).toLocaleString()} ({loanKind}) is below the £{fromPennies(shortfall).toLocaleString()} shortfall — try another kind or sell a property.
                  </p>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">
                      Amount: <strong className="text-foreground">£{fromPennies(loanAmountPennies).toLocaleString()}</strong>
                      <span className="ml-2">(min £{fromPennies(loanMin).toLocaleString()} · max £{fromPennies(loanMax).toLocaleString()})</span>
                    </div>
                    <Slider
                      min={loanMin}
                      max={loanMax}
                      step={50000}
                      value={[loanAmountPennies]}
                      onValueChange={([v]) => setLoanAmountPennies(v)}
                    />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">APR <strong className="text-foreground">{(loanRate * 100).toFixed(2)}%</strong></span>
                      <span className="text-muted-foreground">Monthly <strong className="text-foreground">£{fromPennies(loanMonthlyPayment).toLocaleString()}</strong> · {loanTermMonths}mo</span>
                    </div>
                    <Button size="sm" className="w-full h-8 text-xs" onClick={handleTakeLoan} disabled={loanAmountPennies < shortfall}>
                      Take loan
                    </Button>
                  </>
                )}
              </div>
            )}

            {rescueMode === 'sell' && (
              <div className="mt-2 space-y-2 rounded-lg border border-border/40 bg-card/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Sell a property at auction (90 % of value)</span>
                </div>
                {sellable.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No properties available to quick-sell.</p>
                ) : (
                  <>
                    <Select value={sellPropertyId} onValueChange={setSellPropertyId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {sellable.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — ~£{fromPennies(Math.round(p.value * 0.9)).toLocaleString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const p = sellable.find(x => x.id === sellPropertyId);
                      if (!p) return null;
                      const sale = Math.round(p.value * 0.9);
                      const own = mortgages.find(m => m.propertyId === p.id && !m.collateralPropertyIds?.length);
                      const net = sale - (own?.remainingBalance || 0);
                      return (
                        <p className="text-xs text-muted-foreground">
                          Sale £{fromPennies(sale).toLocaleString()} − mortgage £{fromPennies(own?.remainingBalance || 0).toLocaleString()} ={' '}
                          <strong className={net >= 0 ? 'text-emerald-300' : 'text-red-300'}>£{fromPennies(net).toLocaleString()}</strong>
                        </p>
                      );
                    })()}
                    <Button size="sm" className="w-full h-8 text-xs" onClick={handleQuickSale}>
                      List for immediate sale (90 % auction price)
                    </Button>
                  </>
                )}
              </div>
            )}

            {rescueMode === 'refinance' && (
              <div className="mt-2 space-y-2 rounded-lg border border-border/40 bg-card/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Refinance to 80 % LTV</span>
                </div>
                {mortgagedProps.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No single-property mortgages with releasable equity.</p>
                ) : (
                  <>
                    <Select value={refiPropertyId} onValueChange={setRefiPropertyId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {mortgagedProps.map(({ property, currentLTV, cashRelease }) => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.name} · LTV {(currentLTV * 100).toFixed(0)}% → 80% (+£{fromPennies(cashRelease).toLocaleString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedRefi && (() => {
                      // Estimate new monthly payment at market rate.
                      const provider = MORTGAGE_PROVIDERS.find(p => p.id === selectedRefi.mortgage.providerId) || MORTGAGE_PROVIDERS[1];
                      const liveRate = mortgageProviderRates?.[provider.id] ?? provider.baseRate;
                      const monthlyRate = liveRate / 12;
                      const n = 25 * 12;
                      const newPmt = monthlyRate > 0
                        ? Math.round((selectedRefi.targetBalance * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1))
                        : 0;
                      return (
                        <div className="text-xs space-y-0.5">
                          <div className="text-muted-foreground">
                            Release: <strong className="text-emerald-300">£{fromPennies(selectedRefi.cashRelease).toLocaleString()}</strong> · New balance £{fromPennies(selectedRefi.targetBalance).toLocaleString()}
                          </div>
                          <div className="text-muted-foreground">
                            New monthly @ {(liveRate * 100).toFixed(2)}% APR: <strong className="text-foreground">£{fromPennies(newPmt).toLocaleString()}</strong>{' '}
                            (was £{fromPennies(selectedRefi.mortgage.monthlyPayment).toLocaleString()})
                          </div>
                        </div>
                      );
                    })()}
                    <Button size="sm" className="w-full h-8 text-xs" onClick={handleDoRefinance} disabled={!selectedRefi}>
                      Refinance to 80% LTV
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2">
          <span>Total: <strong className="text-foreground">£{fromPennies(total).toLocaleString()}</strong></span>
          <span>Available: £{fromPennies(available).toLocaleString()}</span>
        </div>

        {confirmBankruptcy && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 space-y-2">
            <div className="text-sm font-semibold text-red-300">Declare bankruptcy?</div>
            <div className="text-xs text-red-200/90">
              This will permanently end your game. Your entire portfolio will be liquidated at 70% value.
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setConfirmBankruptcy(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => { setConfirmBankruptcy(false); triggerBankruptcy(); }}
              >
                Confirm bankruptcy
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {canApproveAll ? (
            <Button onClick={approveAll} className="w-full">
              Approve all (£{fromPennies(total).toLocaleString()})
            </Button>
          ) : (
            <div className="flex gap-2 w-full">
              <Button
                variant="ghost"
                className="flex-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => setConfirmBankruptcy(true)}
                disabled={confirmBankruptcy}
              >
                Declare bankruptcy
              </Button>
              <Button onClick={approveAll} disabled className="flex-1">
                Approve individually ↑
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
