import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useGameState } from "@/hooks/useGameState";
import { RotateCcw } from "lucide-react";
import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";

const Index = () => {
  const gameState = useGameState();
  const [activeTab, setActiveTab] = useState("market");

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

  const sortedOwnedProperties = gameState.ownedProperties.sort((a, b) => {
    const yieldA = (a.monthlyIncome / a.value) * 12 * 100;
    const yieldB = (b.monthlyIncome / b.value) * 12 * 100;
    return yieldB - yieldA;
  });

  // Get the first pending damage to show in dialog
  const currentDamage = gameState.pendingDamages?.[0];

  const handlePayDamage = (cost: number) => {
    if (currentDamage) {
      if (gameState.cash >= cost) {
        gameState.payDamageWithCash(currentDamage.id, cost);
      } else {
        gameState.payDamageWithLoan(currentDamage.id, cost);
      }
    }
  };

  const handleTakeLoan = (cost: number) => {
    if (currentDamage) {
      gameState.payDamageWithLoan(currentDamage.id, cost);
    }
  };

  const handleDismissDamage = () => {
    if (currentDamage) {
      gameState.dismissDamage(currentDamage.id);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-city">
      {/* Hero Section */}
      <div 
        className="relative h-[300px] bg-cover bg-center flex items-center justify-center"
        style={{ backgroundImage: `url(${transporterBridgeHero})` }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative text-center text-white space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            Property Tycoon
          </h1>
          <p className="text-xl max-w-2xl mx-auto">
            Build your real estate empire in Middlesbrough, England. 
            Start with £1M and become the ultimate property mogul!
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Game Clock */}
        <GameClock 
          monthsPlayed={gameState.monthsPlayed}
          timeUntilNextMonth={gameState.timeUntilNextMonth}
        />

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
        />

        {/* Game Controls */}
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="market">Market</TabsTrigger>
              <TabsTrigger value="bank">Bank</TabsTrigger>
            </TabsList>

            <TabsContent value="market">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-white">Property Market</h2>
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
                    cash={gameState.cash}
                    availableProperties={gameState.availableProperties}
                    onBuyProperty={(property, offerAmount, mortgagePercentage, providerId, termYears, mortgageType) => {
                      // Use buyPropertyAtPrice if offer differs from property value
                      if (offerAmount !== property.value) {
                        gameState.buyPropertyAtPrice(property, offerAmount, mortgagePercentage, providerId, termYears, mortgageType);
                      } else {
                        gameState.buyProperty(property, mortgagePercentage, providerId, termYears, mortgageType);
                      }
                    }
                    }
                    getMaxPropertiesForLevel={gameState.getMaxPropertiesForLevel}
                    getAvailablePropertyTypes={gameState.getAvailablePropertyTypes}
                    getMaxPropertyValue={gameState.getMaxPropertyValue}
                    level={gameState.level}
                    mortgageProviders={gameState.mortgageProviders}
                    creditScore={gameState.creditScore}
                  />
                  <AuctionHouse
                    ownedProperties={gameState.ownedProperties}
                    onAuctionSale={gameState.handleAuctionSale}
                    monthsPlayed={gameState.monthsPlayed}
                    auctionProperties={gameState.auctionProperties}
                    onBuyProperty={(property, offerAmount, mortgagePercentage, providerId, termYears, mortgageType) => 
                      gameState.buyProperty(property, mortgagePercentage, providerId, termYears, mortgageType)
                    }
                    cash={gameState.cash}
                    mortgageProviders={gameState.mortgageProviders}
                    level={gameState.level}
                    onAuctionPropertySold={gameState.removeAuctionProperty}
                  />
                  <Button 
                    variant="outline" 
                    onClick={gameState.resetGame}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Game
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="bank">
              <div className="flex flex-wrap gap-2">
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
        </div>

        {/* Listed Properties Section */}
        <ListedProperties 
          propertyListings={gameState.propertyListings}
          ownedProperties={gameState.ownedProperties}
          onAcceptOffer={(property, offer) => gameState.handleEstateAgentSale(property.id, offer)}
          onSetAutoAcceptThreshold={gameState.setAutoAcceptThreshold}
        />

        {/* Player Portfolio */}
        {gameState.ownedProperties.length > 0 && (
          <Card className="bg-white/95 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Your Portfolio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedOwnedProperties.map((property) => (
                   <PropertyCard
                     key={property.id}
                     property={property}
                     onSell={gameState.sellProperty}
                     onSelectTenant={gameState.selectTenant}
                     playerCash={gameState.cash}
                     currentTenant={gameState.tenants.find(t => t.propertyId === property.id)?.tenant}
                     mortgages={gameState.mortgages}
                     monthsPlayed={gameState.monthsPlayed}
                   />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Property Damage Dialog */}
      {currentDamage && (
        <PropertyDamageDialog
          open={!!currentDamage}
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