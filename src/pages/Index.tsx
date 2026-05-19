import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameStats } from "@/components/ui/game-stats";
import { ListedProperties } from "@/components/ui/listed-properties";

import { EvictionTimelineFeed } from "@/components/ui/eviction-timeline-feed";
import { DepositDisputesFeed } from "@/components/ui/deposit-disputes-feed";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";
import { OnboardingFlow } from "@/components/ui/onboarding-flow";
import * as onboardingModule from "@/lib/onboarding";
import { PlanningApprovedDialog } from "@/components/ui/planning-approved-dialog";
import { MacroEventModal } from "@/components/ui/macro-event-modal";
import { useGameStore } from "@/stores/gameStore";
import { HeroHeader } from "@/components/sections/HeroHeader";
import { PropertyMarketActions } from "@/components/sections/PropertyMarket";
import { BankingPanelActions, OperationsInlineButton, LoansInlineButton, TaxInlineButton } from "@/components/sections/BankingPanel";
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

  // Local "dismissed" flag = instant close for the tour. Entity picker is never
  // dismissible — players must pick a trading entity before the game runs.
  const [dismissed, setDismissed] = useState<boolean>(() => !!entityChosen && !!onboardingCompleted);
  const [replayNonce, setReplayNonce] = useState<number>(() => onboardingModule.getReplayNonce());

  // Mirror store → local dismissed, but only once an entity is chosen, so the
  // grandfathered onboardingCompleted=true on legacy saves can't suppress the
  // entity picker on a freshly-reset game.
  useEffect(() => {
    if (entityChosen && onboardingCompleted) setDismissed(true);
  }, [entityChosen, onboardingCompleted]);

  // Subscribe to explicit replay requests — reopen and reset dismissal.
  useEffect(() => {
    return onboardingModule.subscribeReplay((n) => {
      setReplayNonce(n);
      setDismissed(false);
    });
  }, []);

  // Entity picker is mandatory; tour is dismissible.
  const open = !entityChosen || (!onboardingCompleted && !dismissed);

  return (
    <OnboardingFlow
      // key forces a fresh mount (and stage reset) on replay and on first open
      key={`onboarding-${replayNonce}`}
      open={open}
      skipEntity={!!entityChosen}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onEntityPick={(entity) => setEntityType(entity)}
      onFinish={() => {
        setDismissed(true);
        onboardingModule.dismissTour();
      }}
    />
  );
}

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
        pendingEvictions={gameState.pendingEvictions || []}
        planningApplications={(gameState as any).planningApplications || []}
        lastCorporationTaxMonth={(gameState as any).lastCorporationTaxMonth || 0}
        entityType={gameState.entityType}
        currentMarketRate={gameState.currentMarketRate}
        totalDebt={gameState.totalDebt}
        netMonthlyCashflow={gameState.totalMonthlyIncome - gameState.totalMonthlyExpenses}
      />

      <div className="container mx-auto px-4 py-4 space-y-3 pb-24 md:pb-6">

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
          <div id="section-market" className="flex items-center gap-2 mt-2 flex-wrap min-w-0">
            <TabsList className="glass border-0 bg-white/[0.06] h-9 shrink-0 w-auto">
              <TabsTrigger value="market" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg h-7 px-3 text-xs flex-none">
                🏪 Market
              </TabsTrigger>
              <TabsTrigger value="bank" className="data-[state=active]:bg-[hsl(var(--stat-credit))]/20 data-[state=active]:text-[hsl(var(--stat-credit))] rounded-lg h-7 px-3 text-xs flex-none">
                🏦 Bank
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto flex items-center flex-wrap gap-2 justify-end">
              {activeTab === 'market' && (
                <PropertyMarketActions gameState={gameState} totalPortfolioIncome={totalPortfolioIncome} />
              )}
              {activeTab === 'bank' && (
                <>
                  <BankingPanelActions
                    gameState={gameState}
                    getDebtForProperty={getDebtForProperty}
                    totalPortfolioIncome={totalPortfolioIncome}
                  />
                  <LoansInlineButton gameState={gameState} />
                  <TaxInlineButton gameState={gameState} />
                </>
              )}
              {/* Operations is always visible — flashes when tenant concerns arrive. */}
              <OperationsInlineButton gameState={gameState} />
            </div>
          </div>

          <TabsContent value="market" className="mt-2">
            <div className="text-xs text-muted-foreground px-1">
              Use the <strong>Estate Agent</strong> or <strong>Auction House</strong> buttons above to browse properties for sale and place offers.
            </div>
          </TabsContent>

          <TabsContent value="bank" className="mt-0" />
        </Tabs>

        {/* min-h prevents reflow when badges/alerts appear/disappear (item 10) */}
        <div className="min-h-[68px]">
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
        </div>



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
      <MacroEventModal />
    </div>
  );
};

export default Index;
