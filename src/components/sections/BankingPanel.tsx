import { MortgageSettlement } from "@/components/ui/mortgage-settlement";
import { MortgageManagement } from "@/components/ui/mortgage-management";
import { CreditOverdraft } from "@/components/ui/credit-overdraft";
import { PortfolioMortgage } from "@/components/ui/portfolio-mortgage";
import { LoansPanel } from "@/components/ui/loans-panel";
import { TaxBreakdown } from "@/components/ui/tax-breakdown";

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

export function BankingPanel({ gameState, getDebtForProperty, totalPortfolioIncome }: BankingPanelProps) {
  const propertiesWithDebt = gameState.ownedProperties.map(p => ({
    ...p,
    mortgageRemaining: getDebtForProperty(p.id),
  }));

  return (
    <>
      <div className="mt-4">
        <UpcomingEvents
          monthsPlayed={gameState.monthsPlayed}
          entityType={gameState.entityType}
          pendingEvictions={gameState.pendingEvictions || []}
          planningApplications={(gameState as any).planningApplications || []}
          lastCorporationTaxMonth={(gameState as any).lastCorporationTaxMonth || 0}
        />
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
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
      </div>
      <div className="mt-4">
        <PortfolioMortgage
          ownedProperties={propertiesWithDebt}
          mortgageProviders={gameState.mortgageProviders}
          cash={gameState.cash}
          setCash={gameState.setCash}
          creditScore={gameState.creditScore}
          onPortfolioMortgage={gameState.handlePortfolioMortgage}
        />
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
