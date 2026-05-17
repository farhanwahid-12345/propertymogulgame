import { Button } from "@/components/ui/button";
import { EstateAgentWindow } from "@/components/ui/estate-agent-window";
import { AuctionHouse } from "@/components/ui/auction-house";
import { RotateCcw, HelpCircle } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import type { useGameState } from "@/hooks/useGameState";

type GameState = ReturnType<typeof useGameState>;

interface PropertyMarketProps {
  gameState: GameState;
  totalPortfolioIncome: number;
}

/** Action buttons only — placed inline with the Market/Bank tab toggle. */
export function PropertyMarketActions({ gameState, totalPortfolioIncome }: PropertyMarketProps) {
  return (
    <div className="flex gap-2 flex-wrap">
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
        size="sm"
        onClick={() => useGameStore.setState({ onboardingCompleted: false } as any)}
        className="glass glass-hover text-muted-foreground hover:text-foreground"
        title="Replay the welcome tour"
      >
        <HelpCircle className="h-4 w-4 mr-2" />
        Tour
      </Button>
      <Button
        variant="ghost"
        onClick={gameState.resetGame}
        className="glass glass-hover text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        Reset
      </Button>
    </div>
  );
}

/** Backwards-compatible wrapper (other consumers may import PropertyMarket directly). */
export function PropertyMarket(props: PropertyMarketProps) {
  return <PropertyMarketActions {...props} />;
}
