import { lazy, Suspense } from "react";
import { PanelSkeleton } from "@/components/ui/property-card-skeleton";
import { useGameState } from "@/hooks/useGameState";

const TaxBreakdown = lazy(() =>
  import("@/components/game/tax-breakdown").then((m) => ({ default: m.TaxBreakdown })),
);
const PerformanceChart = lazy(() =>
  import("@/components/game/performance-chart").then((m) => ({ default: m.PerformanceChart })),
);
const AnnualAccountsStatement = lazy(() =>
  import("@/components/game/annual-accounts-statement").then((m) => ({ default: m.AnnualAccountsStatement })),
);


type GameState = ReturnType<typeof useGameState>;

export function AccountsPanel({ gameState, activeSubTab }: { gameState: GameState; activeSubTab: 'tax' | 'performance' | 'statements' }) {
  return (
    <div className="w-full mt-2">
      {activeSubTab === 'tax' && (
        <Suspense fallback={<PanelSkeleton />}>
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
        </Suspense>
      )}
      {activeSubTab === 'performance' && (
        <Suspense fallback={<PanelSkeleton />}>
          <PerformanceChart />
        </Suspense>
      )}
      {activeSubTab === 'statements' && (
        <Suspense fallback={<PanelSkeleton />}>
          <AnnualAccountsStatement />
        </Suspense>
      )}
    </div>
  );
}
