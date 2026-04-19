import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyCard } from "@/components/ui/property-card";
import { GameClock } from "@/components/ui/game-clock";
import { GameStats } from "@/components/ui/game-stats";
import { MortgageSettlement } from "@/components/ui/mortgage-settlement";
import { MortgageManagement } from "@/components/ui/mortgage-management";
import { CreditOverdraft } from "@/components/ui/credit-overdraft";
import { EstateAgentWindow } from "@/components/ui/estate-agent-window";
import { AuctionHouse } from "@/components/ui/auction-house";
import { PropertyDamageDialog } from "@/components/ui/property-damage-dialog";
import { ListedProperties } from "@/components/ui/listed-properties";
import { ConveyancingTracker } from "@/components/ui/conveyancing-tracker";
import { RenovationTracker } from "@/components/ui/renovation-tracker";
import { useGameState } from "@/hooks/useGameState";
import { useGameEngine } from "@/hooks/useGameEngine";
import { RotateCcw } from "lucide-react";
import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";

const Index = () => {
  useGameEngine();
  const gameState = useGameState();
  const [activeTab, setActiveTab] = useState("market");

  // Controlled damage dialog state to prevent stuck overlays
  const [damageDialogOpen, setDamageDialogOpen] = useState(false);
  const currentDamageRef = useRef(gameState.pendingDamages?.[0]);

  // Only open damage dialog when a new damage appears; don't force-close on re-render
  useEffect(() => {
    const currentDamage = gameState.pendingDamages?.[0];
    if (currentDamage && currentDamage.id !== currentDamageRef.current?.id) {
      currentDamageRef.current = currentDamage;
      setDamageDialogOpen(true);
    } else if (!currentDamage) {
      currentDamageRef.current = undefined;
      setDamageDialogOpen(false);
    }
  }, [gameState.pendingDamages]);

  const getDebtForProperty = (propertyId: string) => {
    return gameState.mortgages.reduce((sum, m) => {
      if (m.propertyId === propertyId) return sum + m.remainingBalance;
      if (m.collateralPropertyIds?.includes(propertyId)) {
        const share = m.remainingBalance / (m.collateralPropertyIds.length || 1);
        return sum + share;
      }
      return sum;
    }, 0);
  };

  const sortedOwnedProperties = [...gameState.ownedProperties].sort((a, b) => {
    const yieldA = a.value > 0 ? (a.monthlyIncome / a.value) * 12 * 100 : 0;
    const yieldB = b.value > 0 ? (b.monthlyIncome / b.value) * 12 * 100 : 0;
    return yieldB - yieldA;
  });

  const currentDamage = gameState.pendingDamages?.[0];

  const handlePayDamage = (cost: number) => {
    if (currentDamage) {
      if (gameState.cash >= cost) {
        gameState.payDamageWithCash(currentDamage.id, cost);
      } else {
        gameState.payDamageWithLoan(currentDamage.id, cost);
      }
    }
    setDamageDialogOpen(false);
  };

  const handleTakeLoan = (cost: number) => {
    if (currentDamage) {
      gameState.payDamageWithLoan(currentDamage.id, cost);
    }
    setDamageDialogOpen(false);
  };

  const handleDismissDamage = () => {
    if (currentDamage) {
      gameState.dismissDamage(currentDamage.id);
    }
    setDamageDialogOpen(false);
  };

  // Portfolio summary calculations
  const totalPortfolioValue = gameState.ownedProperties.reduce((sum, p) => sum + (p.marketValue || p.value), 0);
  const totalPortfolioIncome = gameState.ownedProperties.reduce((sum, p) => sum + p.monthlyIncome, 0);
  const avgYield = totalPortfolioValue > 0 
    ? ((totalPortfolioIncome * 12 / totalPortfolioValue) * 100).toFixed(1) 
    : "0.0";

  // Portfolio LTV calculation
  const portfolioLTV = totalPortfolioValue > 0
    ? (gameState.totalDebt / totalPortfolioValue) * 100
    : 0;

  // Build conveyancing-buying properties for display in portfolio
  const conveyancingBuyProperties = (gameState.conveyancing || [])
    .filter(c => c.status === 'buying')
    .map(c => ({
      id: c.propertyId,
      name: c.propertyName,
      type: 'residential' as const,
      price: (c.purchasePrice || 0) / 100, // Convert pennies to pounds for display
      value: (c.purchasePrice || 0) / 100,
      neighborhood: '',
      monthlyIncome: 0,
      image: '',
      owned: true,
      marketTrend: 'stable' as const,
      condition: 'standard' as const,
      monthsSinceLastRenovation: 0,
    }));

  return (
    <div className="min-h-screen bg-gradient-city">
      {/* Compact Hero */}
      <div 
        className="relative h-[160px] bg-cover bg-center flex items-end"
        style={{ backgroundImage: `url(${transporterBridgeHero})` }}
      >
        <div className="absolute inset-0" style={{ background: 'var(--gradient-hero)' }} />
        <div className="relative w-full px-4 pb-3 pt-8">
          <div className="container mx-auto">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight gradient-text">
                  Property Tycoon 🏘️
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Build your empire, one house at a time!
                </p>
              </div>
              <div className="flex-1 max-w-sm">
                <GameClock 
                  monthsPlayed={gameState.monthsPlayed}
                  timeUntilNextMonth={gameState.timeUntilNextMonth}
                  inline
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-5">
        {/* Game Stats */}
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

        {/* Tabs + Action Tiles */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 glass border-0 bg-white/[0.06]">
            <TabsTrigger value="market" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary rounded-xl">
              🏪 Market
            </TabsTrigger>
            <TabsTrigger value="bank" className="data-[state=active]:bg-[hsl(var(--stat-credit))]/20 data-[state=active]:text-[hsl(var(--stat-credit))] rounded-xl">
              🏦 Bank
            </TabsTrigger>
          </TabsList>

          <TabsContent value="market">
            <div className="flex items-center justify-between mt-4 mb-3">
              <h2 className="text-xl font-bold text-foreground">Property Market</h2>
              <div className="flex gap-2">
                <EstateAgentWindow
                  ownedProperties={gameState.ownedProperties}
                  propertyListings={gameState.propertyListings}
                  onListProperty={gameState.listPropertyForSale}
                  onCancelListing={gameState.cancelPropertyListing}
                  onUpdateListingPrice={gameState.updatePropertyListingPrice}
                  onSetAutoAccept={gameState.setAutoAcceptThreshold}
                  onAcceptOffer={gameState.handleEstateAgentSale}
                  onRejectOffer={gameState.rejectPropertyOffer}
                  onAddOffer={gameState.addOfferToListing}
                  onCounterOffer={gameState.counterOffer}
                  onReducePrice={gameState.reducePriceOnListing}
                  onAcceptBuyerCounter={gameState.acceptBuyerCounter}
                  onRejectBuyerCounter={gameState.rejectBuyerCounter}
                  cash={gameState.cash}
                  availableProperties={gameState.availableProperties}
                  onBuyProperty={(property, offerAmount, mortgagePercentage, providerId, termYears, mortgageType) => {
                    if (offerAmount !== property.value) {
                      gameState.buyPropertyAtPrice(property, offerAmount, mortgagePercentage, providerId, termYears, mortgageType);
                    } else {
                      gameState.buyProperty(property, mortgagePercentage, providerId, termYears, mortgageType);
                    }
                  }}
                  getMaxPropertiesForLevel={gameState.getMaxPropertiesForLevel}
                  getAvailablePropertyTypes={gameState.getAvailablePropertyTypes}
                  getMaxPropertyValue={gameState.getMaxPropertyValue}
                  level={gameState.level}
                  mortgageProviders={gameState.mortgageProviders}
                  creditScore={gameState.creditScore}
                  totalRentalIncome={totalPortfolioIncome}
                  existingMonthlyMortgagePayments={gameState.totalMonthlyExpenses}
                  ownedPropertyCount={gameState.ownedProperties.length}
                />
                <AuctionHouse
                  ownedProperties={gameState.ownedProperties}
                  onAuctionSale={gameState.handleAuctionSale}
                  monthsPlayed={gameState.monthsPlayed}
                  auctionProperties={gameState.auctionProperties}
                  onBuyProperty={(property, offerAmount, mortgagePercentage, providerId, termYears, mortgageType) => 
                    gameState.buyPropertyAtPrice(property, offerAmount, mortgagePercentage, providerId, termYears, mortgageType)
                  }
                  cash={gameState.cash}
                  mortgageProviders={gameState.mortgageProviders}
                  level={gameState.level}
                  onAuctionPropertySold={gameState.removeAuctionProperty}
                  creditScore={gameState.creditScore}
                />
                <Button 
                  variant="ghost" 
                  onClick={gameState.resetGame}
                  className="glass glass-hover text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bank">
            <div className="flex flex-wrap gap-2 mt-4">
              <MortgageSettlement 
                ownedProperties={gameState.ownedProperties}
                mortgages={gameState.mortgages}
                cash={gameState.cash}
                onSettleMortgage={gameState.settleMortgage}
              />
              <MortgageManagement
                ownedProperties={gameState.ownedProperties.map(p => ({ ...p, mortgageRemaining: getDebtForProperty(p.id) }))}
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
          </TabsContent>
        </Tabs>

        {/* Conveyancing tracker */}
        <ConveyancingTracker
          conveyancing={gameState.conveyancing || []}
          monthsPlayed={gameState.monthsPlayed}
        />

        {/* Renovation tracker */}
        <RenovationTracker
          renovations={gameState.renovations || []}
          ownedProperties={gameState.ownedProperties}
        />

        {/* Listed Properties */}
        <ListedProperties 
          propertyListings={gameState.propertyListings}
          ownedProperties={gameState.ownedProperties}
          onAcceptOffer={(property, offer) => gameState.handleEstateAgentSale(property.id, offer)}
          onSetAutoAcceptThreshold={gameState.setAutoAcceptThreshold}
        />

        {/* Player Portfolio */}
        {(gameState.ownedProperties.length > 0 || conveyancingBuyProperties.length > 0) && (
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
                <Badge variant="outline" className={
                  portfolioLTV > 80 ? "text-danger border-danger/30" :
                  portfolioLTV > 60 ? "text-yellow-400 border-yellow-400/30" :
                  "text-success border-success/30"
                }>
                  Portfolio LTV: {portfolioLTV.toFixed(1)}%
                </Badge>
              )}
            </div>

            {/* Portfolio Summary */}
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Conveyancing-buying properties (pending) */}
              {conveyancingBuyProperties.map((property) => {
                const conv = (gameState.conveyancing || []).find(c => c.propertyId === property.id);
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

              {/* Owned properties */}
              {sortedOwnedProperties.map((property) => {
                const conv = (gameState.conveyancing || []).find(c => c.propertyId === property.id);
                const propertyDebt = getDebtForProperty(property.id);
                const propertyLTV = property.value > 0 ? (propertyDebt / property.value) * 100 : 0;
                const activeRenoIds = (gameState.renovations || [])
                  .filter(r => r.propertyId === property.id)
                  .map(r => r.type.id);
                return (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    onSell={gameState.sellProperty}
                    onSelectTenant={gameState.selectTenant}
                    onRenovate={gameState.startRenovation}
                    onUpgradeCondition={gameState.upgradeCondition}
                    activeRenovationIds={activeRenoIds}
                    playerCash={gameState.cash}
                    currentTenant={gameState.tenants.find(t => t.propertyId === property.id)?.tenant}
                    mortgages={gameState.mortgages}
                    monthsPlayed={gameState.monthsPlayed}
                    isInConveyancing={!!conv}
                    conveyancingStatus={conv?.status}
                    conveyancingCompletion={conv?.completionMonth}
                    propertyLTV={propertyLTV}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Property Damage Dialog — controlled open state */}
      {currentDamage && (
        <PropertyDamageDialog
          open={damageDialogOpen}
          propertyName={currentDamage.propertyName}
          repairCost={currentDamage.repairCost}
          playerCash={gameState.cash}
          onPayCash={handlePayDamage}
          onTakeLoan={handleTakeLoan}
          onCancel={handleDismissDamage}
        />
      )}
    </div>
  );
};

export default Index;
