import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameStats } from "@/components/game/game-stats";
import { ListedProperties } from "@/components/game/listed-properties";

import { EvictionTimelineFeed } from "@/components/game/eviction-timeline-feed";
import { DepositDisputesFeed } from "@/components/game/deposit-disputes-feed";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { MobileBottomNav } from "@/components/game/mobile-bottom-nav";
import { OnboardingFlow } from "@/components/game/onboarding-flow";
import * as onboardingModule from "@/lib/onboarding";
import { PlanningApprovedDialog } from "@/components/game/planning-approved-dialog";
import { PlanningRefusedDialog } from "@/components/game/planning-refused-dialog";
import { MacroEventModal } from "@/components/game/macro-event-modal";
import { PendingTransactionsDialog } from "@/components/game/pending-transactions-dialog";
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
  // The localStorage fallback can only suppress the tour AFTER an entity is chosen.
  const [dismissed, setDismissed] = useState<boolean>(
    () => !!entityChosen && (!!onboardingCompleted || onboardingModule.isTourDismissedInStorage()),
  );
  const [replayNonce, setReplayNonce] = useState<number>(() => onboardingModule.getReplayNonce());

  // Mirror store → local dismissed, but only once an entity is chosen.
  useEffect(() => {
    if (entityChosen && onboardingCompleted) setDismissed(true);
    // If entity is NOT chosen, force dismissed=false so the entity picker
    // always shows on a fresh/reset game even if a stale LS flag is around.
    if (!entityChosen) setDismissed(false);
  }, [entityChosen, onboardingCompleted]);

  // Defensive: if localStorage records a dismissal AND entity is chosen but the
  // store somehow lost onboardingCompleted (stale debounced save overwrite),
  // repair the store.
  useEffect(() => {
    if (entityChosen && !onboardingCompleted && onboardingModule.isTourDismissedInStorage()) {
      setDismissed(true);
      useGameStore.setState({ onboardingCompleted: true } as any);
    }
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
          netWorthBreakdown={(gameState as any).netWorthBreakdown}
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

          <TabsContent value="market" className="mt-0" />
          <TabsContent value="bank" className="mt-0" />
        </Tabs>

        {(() => {
          const hasAlerts =
            (gameState.pendingEvictions?.length || 0) > 0 ||
            (gameState.depositDisputes?.length || 0) > 0 ||
            !!(gameState as any).arrears;
          if (!hasAlerts) return null;
          return (
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
          );
        })()}

        {gameState.propertyListings?.length > 0 && (
          <CollapsibleSection
            title="📃 Listed Properties"
            badge={
              <Badge variant="secondary" className="text-[10px]">{gameState.propertyListings.length}</Badge>
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
        )}

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
      <PlanningRefusedDialog />
      <MacroEventModal />
      <PendingTransactionsDialog />
    </div>
  );
};

export default Index;
