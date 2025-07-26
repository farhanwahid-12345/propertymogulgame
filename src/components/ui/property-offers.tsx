import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
interface Property {
  id: string;
  name: string;
  type: "residential" | "commercial" | "luxury";
  price: number;
  value: number;
  neighborhood: string;
  monthlyIncome: number;
  image: string;
  owned?: boolean;
  marketTrend: "up" | "down" | "stable";
}
import { Clock, TrendingUp, TrendingDown, Check, X } from "lucide-react";

interface PropertyOffer {
  id: string;
  buyerName: string;
  amount: number;
  daysOnMarket: number;
  isChainFree: boolean;
  mortgageApproved: boolean;
}

interface PropertyOffersProps {
  property: Property;
  isOpen: boolean;
  onClose: () => void;
  onAcceptOffer: (property: Property, offer: PropertyOffer) => void;
  daysOnMarket: number;
}

export function PropertyOffers({ property, isOpen, onClose, onAcceptOffer, daysOnMarket }: PropertyOffersProps) {
  // Generate realistic offers based on time on market
  const generateOffers = (daysOnMarket: number): PropertyOffer[] => {
    const offers: PropertyOffer[] = [];
    
    // More offers over time, but potentially lower prices
    const baseOfferCount = Math.min(5, Math.floor(daysOnMarket / 10) + 1);
    
    for (let i = 0; i < baseOfferCount; i++) {
      const priceMultiplier = 0.85 + (Math.random() * 0.2); // 85% to 105% of asking price
      const timeAdjustment = Math.max(0.9, 1 - (daysOnMarket * 0.002)); // Price drops over time
      
      offers.push({
        id: `offer-${i}`,
        buyerName: [
          "Mr & Mrs Johnson", "Sarah Matthews", "David Chen", "Emma Wilson", 
          "The Thompson Family", "Investment Properties Ltd", "Michael Brown",
          "Liverpool Capital Group", "First Time Buyer", "Retirement Home Buyer"
        ][i % 10],
        amount: Math.floor(property.value * priceMultiplier * timeAdjustment),
        daysOnMarket: Math.floor(Math.random() * daysOnMarket) + 1,
        isChainFree: Math.random() > 0.6,
        mortgageApproved: Math.random() > 0.3
      });
    }
    
    return offers.sort((a, b) => b.amount - a.amount);
  };

  const [offers] = useState(() => generateOffers(daysOnMarket));

  const handleAcceptOffer = (offer: PropertyOffer) => {
    onAcceptOffer(property, offer);
    onClose();
  };

  const getBadgeVariant = (offer: PropertyOffer) => {
    const percentage = (offer.amount / property.value) * 100;
    if (percentage >= 95) return "default";
    if (percentage >= 90) return "secondary";
    return "outline";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Property Offers - {property.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{property.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                </div>
                <div className="text-right">
                  <div className="font-semibold">£{property.value.toLocaleString()}</div>
                  <Badge variant="outline" className="mt-1">
                    <Clock className="h-3 w-3 mr-1" />
                    {daysOnMarket} days on market
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>

          {offers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <TrendingDown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No offers yet. Properties typically receive offers after 7-14 days on the market.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <h3 className="font-medium">Current Offers ({offers.length})</h3>
              {offers.map((offer) => (
                <Card key={offer.id} className="transition-colors hover:bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">{offer.buyerName}</span>
                          {offer.isChainFree && (
                            <Badge variant="secondary" className="text-xs">Chain Free</Badge>
                          )}
                          {offer.mortgageApproved && (
                            <Badge variant="default" className="text-xs">Mortgage Approved</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Offered {offer.daysOnMarket} days ago</span>
                          <span>
                            {((offer.amount / property.value) * 100).toFixed(1)}% of asking price
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold text-lg">
                            £{offer.amount.toLocaleString()}
                          </div>
                          <Badge variant={getBadgeVariant(offer)}>
                            {offer.amount >= property.value ? "Full Price" : 
                             offer.amount >= property.value * 0.95 ? "Strong Offer" : "Below Asking"}
                          </Badge>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAcceptOffer(offer)}
                            className="flex items-center gap-1"
                          >
                            <Check className="h-4 w-4" />
                            Accept
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}