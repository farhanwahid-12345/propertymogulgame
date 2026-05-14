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
import { useGameStore } from "@/stores/gameStore";
import { HeroHeader } from "@/components/sections/HeroHeader";
import { PropertyMarket } from "@/components/sections/PropertyMarket";
import { BankingPanel } from "@/components/sections/BankingPanel";
import { PortfolioGrid } from "@/components/sections/PortfolioGrid";
import { useGameState } from "@/hooks/useGameState";
import { useGameEngine } from "@/hooks/useGameEngine";
import { usePropertyDebt } from "@/hooks/usePropertyDebt";
import { usePortfolioMetrics } from "@/hooks/usePortfolioMetrics";
import { useConveyancingDisplay } from "@/hooks/useConveyancingDisplay";

const Index = () => {
  useGameEngine();
  const gameState = useGameState();
  const [activeTab, setActiveTab] = useState("market");

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
          <TabsList className="grid w-full grid-cols-2 glass border-0 bg-white/[0.06]">
            <TabsTrigger value="market" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-xl">
              🏪 Market
            </TabsTrigger>
            <TabsTrigger value="bank" className="data-[state=active]:bg-[hsl(var(--stat-credit))]/20 data-[state=active]:text-[hsl(var(--stat-credit))] rounded-xl">
              🏦 Bank
            </TabsTrigger>
          </TabsList>

          <TabsContent value="market">
            <PropertyMarket gameState={gameState} totalPortfolioIncome={totalPortfolioIncome} />
          </TabsContent>

          <TabsContent value="bank">
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
            (gameState.pendingEvictions?.length || 0) + (gameState.depositDisputes?.length || 0) > 0 ? (
              <Badge variant="destructive" className="text-[10px]">
                {(gameState.pendingEvictions?.length || 0) + (gameState.depositDisputes?.length || 0)}
              </Badge>
            ) : null
          }
          defaultOpenMobile={true}
        >
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

        <CollapsibleSection id="section-ops" title="🔨 Operations" defaultOpenMobile={false}>
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

      <OnboardingFlow
        open={!(gameState as any).entityChosen || !(gameState as any).onboardingCompleted}
        onComplete={(entity) => {
          gameState.setEntityType(entity);
          useGameStore.setState({ onboardingCompleted: true } as any);
        }}
      />
    </div>
  );
};

export default Index;
