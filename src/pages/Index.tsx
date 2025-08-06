import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyCard } from "@/components/ui/property-card";
import { GameClock } from "@/components/ui/game-clock";
import { GameStats } from "@/components/ui/game-stats";
import { MortgageSettlement } from "@/components/ui/mortgage-settlement";
import { MortgageRefinance } from "@/components/ui/mortgage-refinance";
import { PortfolioMortgage } from "@/components/ui/portfolio-mortgage";
import { CreditOverdraft } from "@/components/ui/credit-overdraft";
import { EstateAgentWindow } from "@/components/ui/estate-agent-window";
import { AuctionHouse } from "@/components/ui/auction-house";
import { useGameState } from "@/hooks/useGameState";
import { RotateCcw } from "lucide-react";
import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";

const Index = () => {
  const gameState = useGameState();
  const [activeTab, setActiveTab] = useState("market");

  const sortedOwnedProperties = gameState.ownedProperties.sort((a, b) => {
    const yieldA = (a.monthlyIncome / a.value) * 12 * 100;
    const yieldB = (b.monthlyIncome / b.value) * 12 * 100;
    return yieldB - yieldA;
  });

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
          totalDebt={gameState.totalDebt}
          creditScore={gameState.creditScore}
          ownedPropertiesCount={gameState.ownedProperties.length}
          timeUntilNextMonth={gameState.timeUntilNextMonth}
          currentMarketRate={gameState.currentMarketRate}
          tenantEvents={gameState.tenantEvents}
          monthsPlayed={gameState.monthsPlayed}
        />

        {/* Game Controls */}
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-white">Property Market</h2>
          <div className="flex gap-2">
            <EstateAgentWindow
              ownedProperties={gameState.ownedProperties}
              onAcceptOffer={gameState.handleEstateAgentSale}
              cash={gameState.cash}
              availableProperties={gameState.availableProperties}
              onBuyProperty={(property, offerAmount, mortgagePercentage, providerId, termYears, mortgageType) => 
                gameState.buyProperty(property, mortgagePercentage, providerId, termYears, mortgageType)
              }
              getMaxPropertiesForLevel={gameState.getMaxPropertiesForLevel}
              getAvailablePropertyTypes={gameState.getAvailablePropertyTypes}
              getMaxPropertyValue={gameState.getMaxPropertyValue}
              level={gameState.level}
              mortgageProviders={gameState.mortgageProviders}
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
            />
            <MortgageSettlement 
              ownedProperties={gameState.ownedProperties}
              mortgages={gameState.mortgages}
              cash={gameState.cash}
              onSettleMortgage={gameState.settleMortgage}
            />
            <MortgageRefinance
              ownedProperties={gameState.ownedProperties.map(p => ({ ...p, mortgageRemaining: gameState.mortgages.find(m => m.propertyId === p.id)?.remainingBalance || 0 }))}
              mortgageProviders={gameState.mortgageProviders}
              onRefinance={gameState.handleRefinance}
              cash={gameState.cash}
              setCash={gameState.setCash}
            />
            <PortfolioMortgage
              ownedProperties={gameState.ownedProperties.map(p => ({ ...p, mortgageRemaining: gameState.mortgages.find(m => m.propertyId === p.id)?.remainingBalance || 0 }))}
              mortgageProviders={gameState.mortgageProviders}
              onPortfolioMortgage={gameState.handlePortfolioMortgage}
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
                   />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Index;