import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyCard } from "@/components/ui/property-card";
import { GameClock } from "@/components/ui/game-clock";
import { GameStats } from "@/components/ui/game-stats";
import { MortgageSettlement } from "@/components/ui/mortgage-settlement";
import { EstateAgentWindow } from "@/components/ui/estate-agent-window";
import { AuctionHouse } from "@/components/ui/auction-house";
import { useGameState } from "@/hooks/useGameState";
import { RotateCcw, Building, Home, Crown } from "lucide-react";
import transporterBridgeHero from "@/assets/transporter-bridge-hero.jpg";

const Index = () => {
  const gameState = useGameState();
  const [activeTab, setActiveTab] = useState("market");

  const filteredProperties = (type?: string) => {
    let properties = type ? gameState.availableProperties.filter(p => p.type === type) : gameState.availableProperties;
    // Sort by yield (monthly income / price * 12 * 100 for percentage)
    return properties.sort((a, b) => {
      const yieldA = (a.monthlyIncome / a.price) * 12 * 100;
      const yieldB = (b.monthlyIncome / b.price) * 12 * 100;
      return yieldB - yieldA;
    });
  };

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
            />
            <AuctionHouse
              ownedProperties={gameState.ownedProperties}
              onAuctionSale={gameState.handleAuctionSale}
              monthsPlayed={gameState.monthsPlayed}
            />
            <MortgageSettlement 
              ownedProperties={gameState.ownedProperties}
              mortgages={gameState.mortgages}
              cash={gameState.cash}
              onSettleMortgage={gameState.settleMortgage}
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

        {/* Property Market */}
        <Card className="bg-white/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Available Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="market">
                  <Building className="h-4 w-4 mr-2" />
                  All Properties
                </TabsTrigger>
                <TabsTrigger value="residential">
                  <Home className="h-4 w-4 mr-2" />
                  Residential
                </TabsTrigger>
                <TabsTrigger value="commercial">
                  <Building className="h-4 w-4 mr-2" />
                  Commercial
                </TabsTrigger>
                <TabsTrigger value="luxury">
                  <Crown className="h-4 w-4 mr-2" />
                  Luxury
                </TabsTrigger>
              </TabsList>

              <TabsContent value="market" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProperties().map((property) => (
                     <PropertyCard
                       key={property.id}
                       property={property}
                       onBuy={gameState.buyProperty}
                       playerCash={gameState.cash}
                       creditScore={gameState.creditScore}
                       mortgageProviders={gameState.mortgageProviders}
                     />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="residential" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProperties("residential").map((property) => (
                     <PropertyCard
                       key={property.id}
                       property={property}
                       onBuy={gameState.buyProperty}
                       playerCash={gameState.cash}
                       creditScore={gameState.creditScore}
                       mortgageProviders={gameState.mortgageProviders}
                     />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="commercial" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProperties("commercial").map((property) => (
                     <PropertyCard
                       key={property.id}
                       property={property}
                       onBuy={gameState.buyProperty}
                       playerCash={gameState.cash}
                       creditScore={gameState.creditScore}
                       mortgageProviders={gameState.mortgageProviders}
                     />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="luxury" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProperties("luxury").map((property) => (
                     <PropertyCard
                       key={property.id}
                       property={property}
                       onBuy={gameState.buyProperty}
                       playerCash={gameState.cash}
                       creditScore={gameState.creditScore}
                       mortgageProviders={gameState.mortgageProviders}
                     />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

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
                     onRenovate={gameState.startRenovation}
                     playerCash={gameState.cash}
                     currentTenant={gameState.tenants.find(t => t.propertyId === property.id)?.tenant}
                     activeRenovations={gameState.renovations.filter(r => r.propertyId === property.id && r.completionDate > Date.now()).map(r => r.type.id)}
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