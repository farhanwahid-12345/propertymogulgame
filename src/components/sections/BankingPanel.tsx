import { MortgageSettlement } from "@/components/ui/mortgage-settlement";
import { MortgageManagement } from "@/components/ui/mortgage-management";
import { CreditOverdraft } from "@/components/ui/credit-overdraft";
import { PortfolioMortgage } from "@/components/ui/portfolio-mortgage";
import { LoansPanel } from "@/components/ui/loans-panel";
import { TaxBreakdown } from "@/components/ui/tax-breakdown";
import { OperationsCenter } from "@/components/ui/operations-center";

import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Badge } from "@/components/ui/badge";
import { fromPennies } from "@/lib/formatCurrency";
import type { useGameState } from "@/hooks/useGameState";

type GameState = ReturnType<typeof useGameState>;

interface BankingPanelProps {
  gameState: GameState;
  getDebtForProperty: (id: string) => number;
  totalPortfolioIncome: number;
}

/** Action buttons only — placed inline with the Market/Bank tab toggle. */
export function BankingPanelActions({ gameState, getDebtForProperty, totalPortfolioIncome }: BankingPanelProps) {
  const propertiesWithDebt = gameState.ownedProperties.map(p => ({
    ...p,
    mortgageRemaining: getDebtForProperty(p.id),
  }));
  return (
    <div className="flex gap-2 [&_button]:h-8 [&_button]:text-xs [&_button]:px-2.5 [&_button_svg]:h-3.5 [&_button_svg]:w-3.5">
      <MortgageSettlement
        ownedProperties={gameState.ownedProperties}
        mortgages={gameState.mortgages}
        cash={gameState.cash}
        onSettleMortgage={gameState.settleMortgage}
      />
      <MortgageManagement
        ownedProperties={propertiesWithDebt}
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
        mortgageProviders={gameState.mortgageProviders}
        cash={gameState.cash}
        setCash={gameState.setCash}
        creditScore={gameState.creditScore}
        onPortfolioMortgage={gameState.handlePortfolioMortgage}
      />
    </div>
  );
}

/** Collapsible content below the toolbar (Loans + Tax). */
export function BankingPanel({ gameState }: BankingPanelProps) {
  const opsActive =
    (gameState.conveyancing?.length || 0) +
    (gameState.renovations?.length || 0) +
    ((gameState as any).planningApplications?.filter((a: any) => a.status === 'pending').length || 0) +
    (gameState.tenantConcerns?.filter((c: any) => c && !c.resolvedMonth).length || 0);
  return (
    <>
      <div className="mt-4">
        <CollapsibleSection
          id="section-ops"
          title="🔨 Operations"
          alwaysOpenDesktop={false}
          defaultOpenDesktop={opsActive > 0}
          defaultOpenMobile={false}
          summary={opsActive === 0 ? "All quiet" : `${opsActive} active`}
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
          />
        </CollapsibleSection>
      </div>
      <div className="mt-4">
        <CollapsibleSection
          id="section-loans"
          title="💷 Loans"
          alwaysOpenDesktop={false}
          defaultOpenDesktop={((gameState as any).loans?.length || 0) > 0}
          badge={
            ((gameState as any).loans?.length || 0) > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {(gameState as any).loans.length}
              </Badge>
            ) : null
          }
          summary={
            ((gameState as any).loans?.length || 0) === 0
              ? "No active loans"
              : `${(gameState as any).loans.length} active`
          }
        >
          <LoansPanel />
        </CollapsibleSection>
      </div>
      <div className="mt-4">
        <CollapsibleSection
          id="section-tax"
          title="🧾 Tax — current year"
          alwaysOpenDesktop={false}
          defaultOpenDesktop={false}
          summary={`Paid £${fromPennies(((gameState as any).totalTaxPaidPennies || 0)).toLocaleString()} to date`}
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
          />
        </CollapsibleSection>
      </div>
    </>
  );
}
