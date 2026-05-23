import { Badge } from "@/components/ui/badge";
import { PropertyCard } from "@/components/game/property-card";
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
    <div className="glass p-3 animate-fade-in">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          Your Empire 🏰
          <Badge variant="secondary" className="text-xs">
            {gameState.ownedProperties.length}
            {conveyancingBuyProperties.length > 0 && ` (+${conveyancingBuyProperties.length} pending)`}
          </Badge>
        </h2>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground">Value</span>
          <span className="font-semibold text-foreground">£{totalPortfolioValue.toLocaleString()}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground">Income</span>
          <span className="font-semibold text-success">£{totalPortfolioIncome.toLocaleString()}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground">Yield</span>
          <span className="font-semibold text-[hsl(var(--stat-credit))]">{avgYield}%</span>
          {portfolioLTV > 0 && (
            <Badge
              variant="outline"
              className={
                portfolioLTV > 80
                  ? "text-danger border-danger/30 ml-1"
                  : portfolioLTV > 60
                  ? "text-yellow-400 border-yellow-400/30 ml-1"
                  : "text-success border-success/30 ml-1"
              }
            >
              LTV {portfolioLTV.toFixed(1)}%
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">

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
          const tenantRecs = gameState.tenants.filter((t) => t.propertyId === property.id);
          const slot0 = tenantRecs.find((t) => (t.slotIndex ?? 0) === 0);
          // Item #5: dedupe by id (defends against duplicate records lingering
          // from migrations) and only count concerns that are still open.
          const concernCount = (() => {
            const map = new Map<string, any>();
            for (const c of gameState.tenantConcerns || []) {
              if (!c?.id || c.propertyId !== property.id) continue;
              const existing = map.get(c.id);
              if (existing?.resolvedMonth) continue;
              map.set(c.id, c);
            }
            return Array.from(map.values()).filter((c) => !c.resolvedMonth).length;
          })();

          const pendingEvSlot0 = (gameState.pendingEvictions || []).find(
            (e: any) => e.propertyId === property.id && (e.slotIndex ?? 0) === 0
          );
          // Item 2: prefer authoritative per-tenant arrearsMonths (clears on
          // payment) over the append-only tenantEvents counter.
          const liveArrearsMonths = Math.max(0, ...tenantRecs.map((t: any) => t.arrearsMonths ?? 0));
          const arrearsCount = liveArrearsMonths > 0
            ? liveArrearsMonths
            : (gameState.tenantEvents || []).filter(
                (e: any) => e.propertyId === property.id && e.type === "default"
              ).length;
          const arrearsPenniesTotal = tenantRecs.reduce(
            (s: number, t: any) => s + (t.arrearsPennies ?? 0), 0
          );
          const propertyApps = ((gameState as any).planningApplications || []).filter(
            (a: any) => a.propertyId === property.id
          );
          // Property-wide cooldown only fires when an *unscoped* legacy lock is present.
          // Scoped locks are handled per-renovation inside RenovationDialog.
          const inPlanningCooldown = (gameState.propertyLocks || []).some(
            (l: any) =>
              l.propertyId === property.id &&
              l.reason === "planning_cooldown" &&
              l.untilMonth > gameState.monthsPlayed &&
              !l.renovationTypeId
          );

          // Multi-unit slot data for HMOs / converted flats
          const isMultiUnit =
            (property.subtype === "hmo" || property.subtype === "flats") &&
            (property.subtypeUnits ?? 1) > 1;
          const multiUnitSlots = isMultiUnit
            ? Array.from({ length: property.subtypeUnits ?? 1 }, (_, slotIndex) => {
                const rec = tenantRecs.find((t) => (t.slotIndex ?? 0) === slotIndex);
                const ev = (gameState.pendingEvictions || []).find(
                  (e: any) => e.propertyId === property.id && (e.slotIndex ?? 0) === slotIndex
                );
                return {
                  slotIndex,
                  tenant: rec?.tenant,
                  satisfaction: rec?.satisfaction,
                  satisfactionReasons: rec?.satisfactionReasons,
                  rentPounds: rec?.rentPennies != null ? Math.round(rec.rentPennies / 100) : undefined,
                  pendingEviction: ev
                    ? {
                        ground: ev.ground,
                        effectiveMonth: ev.effectiveMonth,
                        servedMonth: ev.servedMonth,
                      }
                    : undefined,
                };
              })
            : undefined;

          return (
            <PropertyCard
              key={property.id}
              property={property}
              onSell={gameState.sellProperty}
              onSelectTenant={gameState.selectTenant}
              onRenovate={gameState.startRenovation}
              activeRenovationIds={activeRenoIds}
              playerCash={gameState.cash}
              currentTenant={slot0?.tenant}
              tenantSatisfaction={slot0?.satisfaction}
              tenantSatisfactionReasons={slot0?.satisfactionReasons}
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
                pendingEvSlot0
                  ? {
                      ground: pendingEvSlot0.ground,
                      effectiveMonth: pendingEvSlot0.effectiveMonth,
                      servedMonth: pendingEvSlot0.servedMonth,
                    }
                  : undefined
              }
              rentArrearsCount={arrearsCount}
              arrearsPenniesTotal={arrearsPenniesTotal}
              applyRentIncrease={gameState.applyRentIncrease}
              planningApplications={propertyApps}
              planningHistory={(gameState as any).planningApplications || []}
              inPlanningCooldown={inPlanningCooldown}
              propertyLocks={(gameState.propertyLocks || []).filter((l: any) => l.propertyId === property.id)}
              multiUnitSlots={multiUnitSlots}
              hasAnyTenant={tenantRecs.length > 0}
              hasActiveDebtRecovery={((gameState as any).debtRecoveryCases || []).some((c: any) => c.propertyId === property.id && c.status === 'in_court')}
              onSendToCourt={(gameState as any).sendArrearsToCourt}
            />
          );
        })}
      </div>
    </div>
  );
}
