import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export function AccountsPanel({ gameState }: { gameState: GameState }) {
  return (
    <Tabs defaultValue="tax" className="w-full mt-2">
      <TabsList className="glass border-0 bg-white/[0.06] h-9 w-auto">
        <TabsTrigger
          value="tax"
          className="data-[state=active]:bg-[hsl(var(--stat-level))]/20 data-[state=active]:text-[hsl(var(--stat-level))] rounded-lg h-7 px-3 text-xs flex-none"
        >
          🧾 Tax
        </TabsTrigger>
        <TabsTrigger
          value="performance"
          className="data-[state=active]:bg-[hsl(var(--stat-level))]/20 data-[state=active]:text-[hsl(var(--stat-level))] rounded-lg h-7 px-3 text-xs flex-none"
        >
          📈 Performance
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tax" className="mt-3">
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
      </TabsContent>

      <TabsContent value="performance" className="mt-3">
        <Suspense fallback={<PanelSkeleton />}>
          <PerformanceChart />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
