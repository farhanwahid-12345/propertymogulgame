import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameStats } from "@/components/ui/game-stats";
import { ListedProperties } from "@/components/ui/listed-properties";
import { OperationsCenter } from "@/components/ui/operations-center";
import { EvictionTimelineFeed } from "@/components/ui/eviction-timeline-feed";
import { DepositDisputesFeed } from "@/components/ui/deposit-disputes-feed";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";
import { OnboardingFlow } from "@/components/ui/onboarding-flow";
import { PlanningApprovedDialog } from "@/components/ui/planning-approved-dialog";
import { useGameStore } from "@/stores/gameStore";
import { HeroHeader } from "@/components/sections/HeroHeader";
import { PropertyMarketActions } from "@/components/sections/PropertyMarket";
import { BankingPanel, BankingPanelActions } from "@/components/sections/BankingPanel";
import { PortfolioGrid } from "@/components/sections/PortfolioGrid";
import { useGameState } from "@/hooks/useGameState";
import { useGameEngine } from "@/hooks/useGameEngine";
import { usePropertyDebt } from "@/hooks/usePropertyDebt";
import { usePortfolioMetrics } from "@/hooks/usePortfolioMetrics";
import { useConveyancingDisplay } from "@/hooks/useConveyancingDisplay";
import type { EntityType } from "@/types/game";

function OnboardingGate({
  setEntityType,
  activeTab,
  setActiveTab,
}: {
  setEntityType: (e: EntityType) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const entityChosen = useGameStore((s: any) => s.entityChosen);
  const onboardingCompleted = useGameStore((s: any) => s.onboardingCompleted);
  const open = !entityChosen || !onboardingCompleted;
  return (
    <OnboardingFlow
      open={open}
      skipEntity={!!entityChosen}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onEntityPick={(entity) => setEntityType(entity)}
      onFinish={() => {
        try { window.localStorage.setItem('pm_onboarding_done', '1'); } catch { /* noop */ }
        useGameStore.setState({ onboardingCompleted: true } as any);
      }}
    />
  );
}

const Index = () => {
  useGameEngine();
  const gameState = useGameState();
  const [activeTab, setActiveTab] = useState("market");

  // Heal legacy saves: anyone who already chose an entity has effectively onboarded.
  useEffect(() => {
    const s = useGameStore.getState() as any;
    if (s.entityChosen && !s.onboardingCompleted) {
      useGameStore.setState({ onboardingCompleted: true } as any);
    }
  }, []);

  const getDebtForProperty = usePropertyDebt(gameState.mortgages);
  const {
    totalPortfolioValue,
    totalPortfolioIncome,
    avgYield,
    portfolioLTV,
    sortedOwnedProperties,
  } = usePortfolioMetrics(gameState.ownedProperties, gameState.totalDebt);
  const conveyancingBuyProperties = useConveyancingDisplay(
    gameState.conveyancing || [],
    [...(gameState.estateAgentProperties || []), ...(gameState.auctionProperties || []), ...(gameState.ownedProperties || [])],
  );

  return (
    <div className="min-h-screen bg-gradient-city">
      <HeroHeader
        monthsPlayed={gameState.monthsPlayed}
        timeUntilNextMonth={gameState.timeUntilNextMonth}
        tenantHistory={(gameState as any).tenantHistory}
        tenantEvents={gameState.tenantEvents}
        economicEvents={gameState.economicEvents}
        renovations={gameState.renovations || []}
        conveyancing={gameState.conveyancing || []}
        taxRecords={(gameState as any).taxRecords}
        ownedProperties={gameState.ownedProperties.map((p) => ({ id: p.id, name: p.name }))}
        pendingEvictions={gameState.pendingEvictions || []}
        planningApplications={(gameState as any).planningApplications || []}
        lastCorporationTaxMonth={(gameState as any).lastCorporationTaxMonth || 0}
        entityType={gameState.entityType}
        currentMarketRate={gameState.currentMarketRate}
        totalDebt={gameState.totalDebt}
      />

      <div className="container mx-auto px-4 py-6 space-y-5 pb-24 md:pb-6">

        <GameStats
          cash={gameState.cash}
          netWorth={gameState.netWorth}
          level={gameState.level}
          experience={gameState.experience}
          experienceToNext={gameState.experienceToNext}
          totalMonthlyIncome={gameState.totalMonthlyIncome}
          totalMonthlyExpenses={gameState.totalMonthlyExpenses}
          expenseBreakdown={gameState.expenseBreakdown}
          totalDebt={gameState.totalDebt}
          creditScore={gameState.creditScore}
          ownedPropertiesCount={gameState.ownedProperties.length}
          timeUntilNextMonth={gameState.timeUntilNextMonth}
          currentMarketRate={gameState.currentMarketRate}
          tenantEvents={gameState.tenantEvents}
          monthsPlayed={gameState.monthsPlayed}
          economicEvents={gameState.economicEvents}
          portfolioLTV={portfolioLTV}
        />

        <Tabs id="section-tabs" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="market" className="mt-0">
            <div className="flex items-center gap-2 mt-2 flex-wrap md:flex-nowrap min-w-0">
              <TabsList className="glass border-0 bg-white/[0.06] h-9 shrink-0">
                <TabsTrigger value="market" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg h-7 px-3 text-xs">
                  🏪 Market
                </TabsTrigger>
                <TabsTrigger value="bank" className="data-[state=active]:bg-[hsl(var(--stat-credit))]/20 data-[state=active]:text-[hsl(var(--stat-credit))] rounded-lg h-7 px-3 text-xs">
                  🏦 Bank
                </TabsTrigger>
              </TabsList>
              <div className="ml-auto shrink-0 flex items-center">
                <PropertyMarketActions gameState={gameState} totalPortfolioIncome={totalPortfolioIncome} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bank" className="mt-0">
            <div className="flex items-center gap-2 mt-2 flex-wrap md:flex-nowrap min-w-0">
              <TabsList className="glass border-0 bg-white/[0.06] h-9 shrink-0">
                <TabsTrigger value="market" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg h-7 px-3 text-xs">
                  🏪 Market
                </TabsTrigger>
                <TabsTrigger value="bank" className="data-[state=active]:bg-[hsl(var(--stat-credit))]/20 data-[state=active]:text-[hsl(var(--stat-credit))] rounded-lg h-7 px-3 text-xs">
                  🏦 Bank
                </TabsTrigger>
              </TabsList>
              <div className="ml-auto shrink-0 flex items-center">
                <BankingPanelActions
                  gameState={gameState}
                  getDebtForProperty={getDebtForProperty}
                  totalPortfolioIncome={totalPortfolioIncome}
                />
              </div>
            </div>
            <BankingPanel
              gameState={gameState}
              getDebtForProperty={getDebtForProperty}
              totalPortfolioIncome={totalPortfolioIncome}
            />
          </TabsContent>
        </Tabs>

        <CollapsibleSection
          id="section-alerts"
          title="⚠️ Action Required"
          badge={
            (gameState.pendingEvictions?.length || 0) + (gameState.depositDisputes?.length || 0) + ((gameState as any).arrears ? 1 : 0) > 0 ? (
              <Badge variant="destructive" className="text-[10px]">
                {(gameState.pendingEvictions?.length || 0) + (gameState.depositDisputes?.length || 0) + ((gameState as any).arrears ? 1 : 0)}
              </Badge>
            ) : null
          }
          defaultOpenMobile={true}
        >
          {(gameState as any).arrears && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 mb-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚖️</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-destructive">
                    {(gameState as any).arrears.forcedAuctionPropertyId
                      ? "Court Order — Forced Sale Scheduled"
                      : (gameState as any).arrears.monthsBehind >= 2
                        ? "Court Order Issued"
                        : "Cashflow Warning — Arrears"}
                  </h4>
                  <p className="text-sm text-foreground/80 mt-1">
                    {(gameState as any).arrears.forcedAuctionPropertyId ? (
                      <>
                        Bailiffs will auction{" "}
                        <strong>
                          {gameState.ownedProperties.find((p: any) => p.id === (gameState as any).arrears.forcedAuctionPropertyId)?.name || "a property"}
                        </strong>{" "}
                        at 90% of value next month. Settle arrears or refinance immediately to stop the sale.
                      </>
                    ) : (
                      <>
                        You've been cash-negative for {(gameState as any).arrears.monthsBehind} month(s). Raise rent, sell a property, or
                        take a loan — another missed month triggers a court order and forced sale.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
          <EvictionTimelineFeed
            pendingEvictions={gameState.pendingEvictions || []}
            ownedProperties={gameState.ownedProperties}
            tenants={gameState.tenants}
            monthsPlayed={gameState.monthsPlayed}
          />
          <DepositDisputesFeed
            disputes={gameState.depositDisputes || []}
            onDispute={gameState.disputeDeposit}
            onDismiss={gameState.dismissDispute}
          />
        </CollapsibleSection>

        <CollapsibleSection
          id="section-ops"
          title="🔨 Operations"
          alwaysOpenDesktop={false}
          defaultOpenDesktop={
            ((gameState.conveyancing?.length || 0) +
              (gameState.renovations?.length || 0) +
              ((gameState as any).planningApplications?.filter((a: any) => a.status === 'pending').length || 0) +
              (gameState.tenantConcerns?.filter((c: any) => c && !c.resolvedMonth).length || 0)) > 0
          }
          defaultOpenMobile={false}
          summary={(() => {
            const total =
              (gameState.conveyancing?.length || 0) +
              (gameState.renovations?.length || 0) +
              ((gameState as any).planningApplications?.filter((a: any) => a.status === 'pending').length || 0) +
              (gameState.tenantConcerns?.filter((c: any) => c && !c.resolvedMonth).length || 0);
            return total === 0 ? "All quiet" : `${total} active`;
          })()}
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

        <CollapsibleSection
          title="📃 Listed Properties"
          badge={
            gameState.propertyListings?.length ? (
              <Badge variant="secondary" className="text-[10px]">{gameState.propertyListings.length}</Badge>
            ) : null
          }
          defaultOpenMobile={false}
        >
          <ListedProperties
            propertyListings={gameState.propertyListings}
            ownedProperties={gameState.ownedProperties}
            onAcceptOffer={(property, offer) => gameState.handleEstateAgentSale(property.id, offer)}
            onSetAutoAcceptThreshold={gameState.setAutoAcceptThreshold}
            onWithdrawListing={gameState.cancelPropertyListing}
          />
        </CollapsibleSection>

        <PortfolioGrid
          gameState={gameState}
          sortedOwnedProperties={sortedOwnedProperties}
          conveyancingBuyProperties={conveyancingBuyProperties}
          totalPortfolioValue={totalPortfolioValue}
          totalPortfolioIncome={totalPortfolioIncome}
          avgYield={avgYield}
          portfolioLTV={portfolioLTV}
          getDebtForProperty={getDebtForProperty}
        />
      </div>

      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        alertCount={(gameState.pendingEvictions?.length || 0) + (gameState.depositDisputes?.length || 0)}
      />

      <OnboardingGate
        setEntityType={gameState.setEntityType}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />


      <PlanningApprovedDialog />
    </div>
  );
};

export default Index;
