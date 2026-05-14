import { Badge } from "@/components/ui/badge";
import { PropertyCard } from "@/components/ui/property-card";
import type { useGameState } from "@/hooks/useGameState";

type GameState = ReturnType<typeof useGameState>;

interface PortfolioGridProps {
  gameState: GameState;
  sortedOwnedProperties: GameState["ownedProperties"];
  conveyancingBuyProperties: any[];
  totalPortfolioValue: number;
  totalPortfolioIncome: number;
  avgYield: string;
  portfolioLTV: number;
  getDebtForProperty: (id: string) => number;
}

export function PortfolioGrid({
  gameState,
  sortedOwnedProperties,
  conveyancingBuyProperties,
  totalPortfolioValue,
  totalPortfolioIncome,
  avgYield,
  portfolioLTV,
  getDebtForProperty,
}: PortfolioGridProps) {
  if (gameState.ownedProperties.length === 0 && conveyancingBuyProperties.length === 0) {
    return null;
  }

  return (
    <div className="glass p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          Your Empire 🏰
          <Badge variant="secondary" className="text-xs">
            {gameState.ownedProperties.length}
            {conveyancingBuyProperties.length > 0 && ` (+${conveyancingBuyProperties.length} pending)`}
          </Badge>
        </h2>
        {portfolioLTV > 0 && (
          <Badge
            variant="outline"
            className={
              portfolioLTV > 80
                ? "text-danger border-danger/30"
                : portfolioLTV > 60
                ? "text-yellow-400 border-yellow-400/30"
                : "text-success border-success/30"
            }
          >
            Portfolio LTV: {portfolioLTV.toFixed(1)}%
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="glass p-3 text-center">
          <div className="text-xs text-muted-foreground">Total Value</div>
          <div className="text-lg font-bold text-foreground">£{totalPortfolioValue.toLocaleString()}</div>
        </div>
        <div className="glass p-3 text-center">
          <div className="text-xs text-muted-foreground">Monthly Income</div>
          <div className="text-lg font-bold text-success">£{totalPortfolioIncome.toLocaleString()}</div>
        </div>
        <div className="glass p-3 text-center">
          <div className="text-xs text-muted-foreground">Avg Yield</div>
          <div className="text-lg font-bold text-[hsl(var(--stat-credit))]">{avgYield}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
        {conveyancingBuyProperties.map((property) => {
          const conv = (gameState.conveyancing || []).find((c) => c.propertyId === property.id);
          return (
            <PropertyCard
              key={`conv-${property.id}`}
              property={property}
              playerCash={gameState.cash}
              monthsPlayed={gameState.monthsPlayed}
              isInConveyancing={true}
              conveyancingStatus="buying"
              conveyancingCompletion={conv?.completionMonth}
            />
          );
        })}

        {sortedOwnedProperties.map((property) => {
          const conv = (gameState.conveyancing || []).find((c) => c.propertyId === property.id);
          const propertyDebt = getDebtForProperty(property.id);
          const propertyLTV = property.value > 0 ? (propertyDebt / property.value) * 100 : 0;
          const activeRenoIds = (gameState.renovations || [])
            .filter((r) => r.propertyId === property.id && r?.type?.id)
            .map((r) => r.type.id);
          const tenantRec = gameState.tenants.find((t) => t.propertyId === property.id);
          const concernCount = (gameState.tenantConcerns || []).filter(
            (c: any) => c.propertyId === property.id && !c.resolvedMonth
          ).length;
          const pendingEv = (gameState.pendingEvictions || []).find(
            (e: any) => e.propertyId === property.id
          );
          const arrearsCount = (gameState.tenantEvents || []).filter(
            (e: any) => e.propertyId === property.id && e.type === "default"
          ).length;
          const propertyApps = ((gameState as any).planningApplications || []).filter(
            (a: any) => a.propertyId === property.id
          );
          const inPlanningCooldown = (gameState.propertyLocks || []).some(
            (l: any) =>
              l.propertyId === property.id &&
              l.reason === "planning_cooldown" &&
              l.untilMonth > gameState.monthsPlayed
          );
          return (
            <PropertyCard
              key={property.id}
              property={property}
              onSell={gameState.sellProperty}
              onSelectTenant={gameState.selectTenant}
              onRenovate={gameState.startRenovation}
              activeRenovationIds={activeRenoIds}
              playerCash={gameState.cash}
              currentTenant={tenantRec?.tenant}
              tenantSatisfaction={tenantRec?.satisfaction}
              tenantSatisfactionReasons={tenantRec?.satisfactionReasons}
              mortgages={gameState.mortgages}
              monthsPlayed={gameState.monthsPlayed}
              isInConveyancing={!!conv}
              conveyancingStatus={conv?.status}
              conveyancingCompletion={conv?.completionMonth}
              propertyLTV={propertyLTV}
              activeConcernCount={concernCount}
              evictTenant={gameState.evictTenant}
              cancelEviction={gameState.cancelEviction}
              pendingEviction={
                pendingEv
                  ? {
                      ground: pendingEv.ground,
                      effectiveMonth: pendingEv.effectiveMonth,
                      servedMonth: pendingEv.servedMonth,
                    }
                  : undefined
              }
              rentArrearsCount={arrearsCount}
              applyRentIncrease={gameState.applyRentIncrease}
              planningApplications={propertyApps}
              planningHistory={(gameState as any).planningApplications || []}
              inPlanningCooldown={inPlanningCooldown}
            />
          );
        })}
      </div>
    </div>
  );
}
