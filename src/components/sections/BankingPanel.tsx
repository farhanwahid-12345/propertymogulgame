import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { MortgageSettlement } from "@/components/game/mortgage-settlement";
import { MortgageManagement } from "@/components/game/mortgage-management";
import { CreditOverdraft } from "@/components/game/credit-overdraft";
import { PortfolioMortgage } from "@/components/game/portfolio-mortgage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fromPennies } from "@/lib/formatCurrency";
import { PanelSkeleton } from "@/components/ui/property-card-skeleton";
import type { useGameState } from "@/hooks/useGameState";

// Phase 5 #6 — lazy-load heavy panels that only mount inside an opened dialog.
const OperationsCenter = lazy(() =>
  import("@/components/game/operations-center").then((m) => ({ default: m.OperationsCenter })),
);
const InvestmentsPanel = lazy(() =>
  import("@/components/game/investments-panel").then((m) => ({ default: m.InvestmentsPanel })),
);
const LoansPanel = lazy(() =>
  import("@/components/game/loans-panel").then((m) => ({ default: m.LoansPanel })),
);
const TaxBreakdown = lazy(() =>
  import("@/components/game/tax-breakdown").then((m) => ({ default: m.TaxBreakdown })),
);
const PerformanceChart = lazy(() =>
  import("@/components/game/performance-chart").then((m) => ({ default: m.PerformanceChart })),
);

type GameState = ReturnType<typeof useGameState>;

interface BankingPanelProps {
  gameState: GameState;
  getDebtForProperty: (id: string) => number;
  totalPortfolioIncome: number;
}

/** Mortgage action buttons — placed inline with the Market/Bank tab toggle. */
export function BankingPanelActions({ gameState, getDebtForProperty, totalPortfolioIncome }: BankingPanelProps) {
  const propertiesWithDebt = gameState.ownedProperties.map(p => ({
    ...p,
    mortgageRemaining: getDebtForProperty(p.id),
  }));
  return (
    <div id="section-bank" className="flex flex-wrap gap-2 [&_button]:h-8 [&_button]:text-xs [&_button]:px-2.5 [&_button_svg]:h-3.5 [&_button_svg]:w-3.5">

      <MortgageSettlement
        ownedProperties={gameState.ownedProperties}
        mortgages={gameState.mortgages}
        cash={gameState.cash}
        onSettleMortgage={gameState.settleMortgage}
      />
      <MortgageManagement
        ownedProperties={propertiesWithDebt}
        mortgages={gameState.mortgages}
        mortgageProviders={gameState.mortgageProviders}
        onRefinance={gameState.handleRefinance}
        cash={gameState.cash}
        setCash={gameState.setCash}
        creditScore={gameState.creditScore}
        totalRentalIncome={totalPortfolioIncome}
        existingMonthlyMortgagePayments={gameState.totalMonthlyExpenses}
      />
      <CreditOverdraft
        creditScore={gameState.creditScore}
        overdraftLimit={gameState.overdraftLimit}
        overdraftUsed={gameState.overdraftUsed}
        cash={gameState.cash}
        setCash={gameState.setCash}
        setOverdraftUsed={gameState.setOverdraftUsed}
        onApplyOverdraft={gameState.handleApplyOverdraft}
        monthlyIncome={gameState.totalMonthlyIncome}
        totalMortgagePayments={gameState.totalMonthlyExpenses}
        netWorth={gameState.netWorth}
      />
      <PortfolioMortgage
        ownedProperties={propertiesWithDebt}
        mortgages={gameState.mortgages}
        mortgageProviders={gameState.mortgageProviders}
        cash={gameState.cash}
        setCash={gameState.setCash}
        creditScore={gameState.creditScore}
        monthsPlayed={gameState.monthsPlayed}
        onPortfolioMortgage={gameState.handlePortfolioMortgage}
      />
    </div>
  );
}

/** Inline trigger button + dialog wrapper for Operations / Loans / Tax. */
function InlineDialogButton({
  id,
  label,
  summary,
  title,
  attention = false,
  flash = false,
  autoOpenEvent,
  dataTutorial,
  children,
}: {
  id?: string;
  label: string;
  summary: string;
  title: string;
  attention?: boolean;
  flash?: boolean;
  /** When set, listens for this window event and auto-opens the dialog. */
  autoOpenEvent?: string;
  /** Optional data-tutorial attribute for the spotlight tutorial engine. */
  dataTutorial?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!autoOpenEvent || typeof window === 'undefined') return;
    const handler = () => setOpen(true);
    window.addEventListener(autoOpenEvent, handler);
    return () => window.removeEventListener(autoOpenEvent, handler);
  }, [autoOpenEvent]);
  return (
    <>
      <Button
        id={id}
        data-tutorial={dataTutorial}
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={`h-8 text-xs px-2.5 gap-2 bg-white/[0.04] border-white/10 ${attention ? 'ops-attention' : ''} ${flash && !attention ? 'ops-flash' : ''}`}
      >
        <span>{label}</span>
        <span className={attention ? 'text-destructive-foreground text-[10px] font-semibold' : 'text-muted-foreground text-[10px]'}>
          {summary}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <Suspense fallback={<PanelSkeleton />}>{children}</Suspense>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OperationsInlineButton({ gameState }: { gameState: GameState }) {
  // Item 11: only count concerns whose property is still owned — orphan
  // concerns from sold/forced-sold properties were keeping the button flashing.
  const ownedIds = new Set(gameState.ownedProperties.map((p: any) => p.id));
  const concernCount = (gameState.tenantConcerns || []).filter(
    (c: any) => c && !c.resolvedMonth && ownedIds.has(c.propertyId),
  ).length;
  const opsActive =
    (gameState.conveyancing?.length || 0) +
    (gameState.renovations?.length || 0) +
    ((gameState as any).planningApplications?.filter((a: any) => a.status === 'pending').length || 0) +
    concernCount;
  const attention = concernCount > 0;
  const summary = opsActive === 0
    ? "All quiet"
    : attention
      ? `⚠ ${concernCount} concern${concernCount > 1 ? 's' : ''}`
      : `${opsActive} active`;
  // Item 3: visual flash whenever opsFlashAt bumps (conveyancing complete,
  // planning decision, renovation complete, missed rent, damage, chain collapse).
  const opsFlashAt = (gameState as any).opsFlashAt || 0;
  const seenRef = useRef<number>(opsFlashAt);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (opsFlashAt > seenRef.current) {
      seenRef.current = opsFlashAt;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 4200);
      return () => clearTimeout(t);
    }
  }, [opsFlashAt]);
  return (
    <InlineDialogButton
      id="section-ops"
      label="🔨 Operations"
      summary={summary}
      attention={attention}
      flash={flash}
      title="Operations"
      autoOpenEvent="pm:open-operations"
      dataTutorial="ops-conveyancing"
    >
      <OperationsCenter
        monthsPlayed={gameState.monthsPlayed}
        conveyancing={gameState.conveyancing || []}
        renovations={gameState.renovations || []}
        planningApplications={(gameState as any).planningApplications || []}
        tenantConcerns={(gameState.tenantConcerns || []) as any}
        ownedProperties={gameState.ownedProperties.map((p) => ({ id: p.id, name: p.name }))}
        ownedPropertiesFull={gameState.ownedProperties}
        playerCash={gameState.cash * 100}
        onResolveConcern={gameState.resolveTenantConcern}
        onSnoozeConcern={gameState.dismissTenantConcern}
        onWithdrawConveyancing={gameState.withdrawFromConveyancing}
        tenantHistory={(gameState as any).tenantHistory || []}
        tenantEvents={gameState.tenantEvents}
        economicEvents={gameState.economicEvents}
        taxRecords={gameState.taxRecords || []}
        pendingEvictions={gameState.pendingEvictions || []}
        propertyListings={((gameState as any).propertyListings || []).map((l: any) => ({ ...l, askingPrice: l.askingPrice }))}
        exTenantDebts={(gameState as any).exTenantDebts || []}
        onCancelEviction={gameState.cancelEviction}
        evictionCandidates={(gameState.tenants || [])
          .filter((t: any) => !(gameState.pendingEvictions || []).some((ev: any) =>
            ev.propertyId === t.propertyId && (ev.slotIndex ?? 0) === (t.slotIndex ?? 0)))
          .map((t: any) => {
            const prop = gameState.ownedProperties.find((p: any) => p.id === t.propertyId);
            const unitLabel = (t.slotIndex ?? 0) > 0 || t.slotIndex === 0
              ? ` · unit ${(t.slotIndex ?? 0) + 1}`
              : '';
            return {
              propertyId: t.propertyId,
              propertyName: `${prop?.name ?? t.propertyId}${(prop as any)?.subtypeUnits > 1 ? unitLabel : ''}`,
              slotIndex: t.slotIndex,
              tenantName: t.name,
              tenantProfile: t.profile,
              rentArrearsCount: t.arrearsMonths ?? 0,
              hasLongstandingASB: (gameState.tenantConcerns || []).some((c: any) =>
                c.propertyId === t.propertyId && !c.resolvedMonth &&
                (c.category === 'noise' || c.category === 'safety') &&
                (gameState.monthsPlayed - c.raisedMonth) >= 1),
              propertyType: prop?.type,
            };
          })}
        onEvictTenant={gameState.evictTenant}
        onCancelListing={gameState.cancelPropertyListing}
        onFileExTenantCCJ={(gameState as any).fileExTenantCCJ}
        onNegotiateExTenantSettlement={(gameState as any).negotiateExTenantSettlement}
        onWriteOffExTenantDebt={(gameState as any).writeOffExTenantDebt}
        onRefileExTenantCCJ={(gameState as any).refileExTenantCCJ}
        commercialSearchUpdates={(gameState as any).commercialSearchUpdates || []}
        commercialAgentChase={(gameState as any).commercialAgentChase || {}}
        vacantCommercialProperties={
          gameState.ownedProperties
            .filter((p: any) => {
              if (p.type !== 'commercial') return false;
              if (gameState.tenants.some((t: any) => t.propertyId === p.id)) return false;
              if (!p.commercialLease) return true;
              // Improvements #7 item 4a — pre-marketing window (≤6mo to expiry / mutual break).
              const l = p.commercialLease;
              const toExpiry = l.expiryMonth - gameState.monthsPlayed;
              const toBreak = l.breakClause?.type === 'mutual' && l.breakClause.atMonth != null
                ? l.breakClause.atMonth - gameState.monthsPlayed : Infinity;
              return (toExpiry > 0 && toExpiry <= 6) || (toBreak > 0 && toBreak <= 6);
            })
            .map((p: any) => ({
              id: p.id,
              name: p.name,
              preMarketing: !!p.commercialLease,
              monthlyIncome: p.monthlyIncome,
            }))
        }
        pendingCommercialApplicants={(gameState as any).pendingCommercialApplicants || []}
        onChaseCommercialAgent={(gameState as any).chaseCommercialAgent}
      />
    </InlineDialogButton>
  );
}

export function LoansInlineButton({ gameState }: { gameState: GameState }) {
  const count = (gameState as any).loans?.length || 0;
  return (
    <InlineDialogButton
      id="section-loans"
      label="💷 Loans"
      summary={count === 0 ? "No active loans" : `${count} active`}
      title="Loans"
    >
      <LoansPanel />
    </InlineDialogButton>
  );
}

/** Improvements #7 item 6 — bank investments live beside Loans in the Bank row. */
export function InvestmentsInlineButton({ gameState }: { gameState: GameState }) {
  const holdings = (gameState as any).investments || [];
  const pending = (gameState as any).investmentWithdrawals || [];
  const invested = holdings.reduce((s: number, h: any) => s + (h.balancePennies || 0), 0);
  return (
    <InlineDialogButton
      id="section-investments"
      label="📈 Investments"
      summary={invested === 0 ? "No investments" : `£${Math.round(invested / 100).toLocaleString()} invested`}
      title="Investments"
      autoOpenEvent="pm:open-investments"
    >
      <Suspense fallback={<div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>}>
        <InvestmentsPanel
          cashPennies={Math.round(gameState.cash * 100)}
          boeRate={gameState.currentMarketRate ?? 0.045}
          monthsPlayed={gameState.monthsPlayed}
          investments={holdings}
          withdrawals={pending}
          onInvest={(gameState as any).investCash}
          onWithdraw={(gameState as any).requestInvestmentWithdrawal}
        />
      </Suspense>
    </InlineDialogButton>
  );
}

export function TaxInlineButton({ gameState }: { gameState: GameState }) {
  return (
    <InlineDialogButton
      id="section-tax"
      label="🧾 Tax"
      summary={`Paid £${fromPennies(((gameState as any).totalTaxPaidPennies || 0)).toLocaleString()}`}
      title="Tax — current year"
    >
      <TaxBreakdown
        entityType={gameState.entityType}
        yearlyGrossRent={(gameState as any).yearlyGrossRentPennies || 0}
        yearlyMortgageInterest={(gameState as any).yearlyMortgageInterestPennies || 0}
        yearlyDeductibleExpenses={(gameState as any).yearlyDeductibleExpensesPennies || 0}
        taxRecords={gameState.taxRecords || []}
        totalTaxPaidPennies={(gameState as any).totalTaxPaidPennies || 0}
        monthsPlayed={gameState.monthsPlayed}
        lastCorporationTaxMonth={(gameState as any).lastCorporationTaxMonth || 0}
        unusedLossesPennies={(gameState as any).unusedLosses || 0}
        lossesAppliedThisYearPennies={(gameState as any).lossesAppliedThisYear || 0}
        lossesGeneratedThisYearPennies={(gameState as any).lossesGeneratedThisYear || 0}
      />
    </InlineDialogButton>
  );
}

export function PerformanceInlineButton() {
  return (
    <InlineDialogButton
      id="section-performance"
      label="📈 Performance"
      summary="Portfolio chart"
      title="Portfolio Performance"
    >
      <PerformanceChart />
    </InlineDialogButton>
  );
}

/** Bank tab body is now empty — all controls moved into the tab header row. */
export function BankingPanel(_: BankingPanelProps) {
  return null;
}
