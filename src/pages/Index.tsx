import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameStats } from "@/components/game/game-stats";
import { ListedProperties } from "@/components/game/listed-properties";

import { EvictionTimelineFeed } from "@/components/game/eviction-timeline-feed";
import { DepositDisputesFeed } from "@/components/game/deposit-disputes-feed";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { OnboardingFlow } from "@/components/game/onboarding-flow";
import * as onboardingModule from "@/lib/onboarding";
import { PlanningApprovedDialog } from "@/components/game/planning-approved-dialog";
import { PlanningRefusedDialog } from "@/components/game/planning-refused-dialog";
import { MacroEventModal } from "@/components/game/macro-event-modal";
import { PendingTransactionsDialog } from "@/components/game/pending-transactions-dialog";
import { ChainCollapseModal } from "@/components/game/chain-collapse-modal";
import { PayoffEventsModal } from "@/components/game/payoff-events-modal";
import { EpcTutorialDialog } from "@/components/game/epc-tutorial-dialog";
import { PoliceLetterDialog } from "@/components/game/police-letter-dialog";
import { CourtResolutionModal } from "@/components/game/court-resolution-modal";
import { OverdraftPromptDialog } from "@/components/game/overdraft-prompt-dialog";
import { BankruptcyDialog } from "@/components/game/bankruptcy-dialog";
import { useGameStore } from "@/stores/gameStore";
import { HeroHeader } from "@/components/sections/HeroHeader";
import { PropertyMarketActions } from "@/components/sections/PropertyMarket";
import { BankingPanelActions, OperationsInlineButton, LoansInlineButton } from "@/components/sections/BankingPanel";
import { AccountsPanel } from "@/components/sections/AccountsPanel";
import { PortfolioGrid } from "@/components/sections/PortfolioGrid";
import { MobileBottomNav } from "@/components/sections/MobileBottomNav";
import { InstallPromptBanner } from "@/components/InstallPromptBanner";
import { useGameState } from "@/hooks/useGameState";
import { useGameEngine } from "@/hooks/useGameEngine";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
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
  useKeyboardShortcuts();
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
        netWorth={gameState.netWorth}
        level={gameState.level}
      />

      <div className="container mx-auto px-3 sm:px-4 py-4 space-y-3 pb-24 md:pb-6">

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
          <div id="section-market" className="flex flex-col gap-2 mt-2 min-w-0">
            {/* Single action row: tab toggle + all primary actions inline (Phase 2 #1). */}
            <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full overflow-hidden">
              <TabsList className="glass border-0 bg-white/[0.06] h-9 shrink-0 w-auto">
                <TabsTrigger value="market" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-lg h-7 px-3 text-xs flex-none">
                  🏪 Market
                </TabsTrigger>
                <TabsTrigger value="bank" className="data-[state=active]:bg-[hsl(var(--stat-credit))]/20 data-[state=active]:text-[hsl(var(--stat-credit))] rounded-lg h-7 px-3 text-xs flex-none">
                  🏦 Bank
                </TabsTrigger>
                <TabsTrigger value="accounts" className="data-[state=active]:bg-[hsl(var(--stat-level))]/20 data-[state=active]:text-[hsl(var(--stat-level))] rounded-lg h-7 px-3 text-xs flex-none">
                  📊 Accounts
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
                  </>
                )}
                <OperationsInlineButton gameState={gameState} />
              </div>
            </div>
          </div>


          <TabsContent value="market" className="mt-0" />
          <TabsContent value="bank" className="mt-0" />
          <TabsContent value="accounts" className="mt-0">
            <AccountsPanel gameState={gameState} />
          </TabsContent>
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


      <OnboardingGate
        setEntityType={gameState.setEntityType}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <MobileBottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      <InstallPromptBanner sessionCount={parseInt(localStorage.getItem("pm_session_count") || "1", 10)} />


      <PlanningApprovedDialog />
      <PlanningRefusedDialog />
      <MacroEventModal />
      <PendingTransactionsDialog />
      <ChainCollapseModal />
      <PayoffEventsModal />
      <EpcTutorialDialog />
      <PoliceLetterDialog />
      <CourtResolutionModal />
      <OverdraftPromptDialog />
      <BankruptcyDialog />
    </div>
  );
};

export default Index;
