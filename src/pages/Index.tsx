import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyCard } from "@/components/ui/property-card";
import { GameStats } from "@/components/ui/game-stats";
import { useGameState } from "@/hooks/useGameState";
import { RotateCcw, Building, Home, Crown } from "lucide-react";
import cityHero from "@/assets/city-hero.jpg";

const Index = () => {
  const gameState = useGameState();
  const [activeTab, setActiveTab] = useState("market");

  const filteredProperties = (type?: string) => {
    if (!type) return gameState.availableProperties;
    return gameState.availableProperties.filter(p => p.type === type);
  };

  return (
    <div className="min-h-screen bg-gradient-city">
      {/* Hero Section */}
      <div 
        className="relative h-[300px] bg-cover bg-center flex items-center justify-center"
        style={{ backgroundImage: `url(${cityHero})` }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative text-center text-white space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            Property Tycoon
          </h1>
          <p className="text-xl max-w-2xl mx-auto">
            Build your real estate empire in the virtual city of Prosperopolis. 
            Start with $1M and become the ultimate property mogul!
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Game Stats */}
        <GameStats
          cash={gameState.cash}
          netWorth={gameState.netWorth}
          totalProperties={gameState.ownedProperties.length}
          monthlyIncome={gameState.totalMonthlyIncome}
          level={gameState.level}
          experience={gameState.experience}
          experienceToNext={gameState.experienceToNext}
        />

        {/* Game Controls */}
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-white">Game Dashboard</h2>
          <Button 
            variant="outline" 
            onClick={gameState.resetGame}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Game
          </Button>
        </div>

        {/* Property Market */}
        <Card className="bg-white/95 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Property Market</CardTitle>
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
                  {gameState.availableProperties.map((property) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      onBuy={gameState.buyProperty}
                      playerCash={gameState.cash}
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
                {gameState.ownedProperties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    onSell={gameState.sellProperty}
                    playerCash={gameState.cash}
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
