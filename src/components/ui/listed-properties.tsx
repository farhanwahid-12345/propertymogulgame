import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PropertyOffers } from "@/components/ui/property-offers";
import { useState } from "react";
import { Clock, TrendingUp } from "lucide-react";

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

interface PropertyOffer {
  id: string;
  buyerName: string;
  amount: number;
  daysOnMarket: number;
  isChainFree: boolean;
  mortgageApproved: boolean;
  timestamp: number;
}

interface PropertyListing {
  propertyId: string;
  listingDate: number;
  isAuction: boolean;
  daysUntilSale: number;
  offers?: PropertyOffer[];
  lastOfferCheck?: number;
}

interface ListedPropertiesProps {
  propertyListings: PropertyListing[];
  ownedProperties: Property[];
  onAcceptOffer: (property: Property, offer: any) => void;
}

export function ListedProperties({ propertyListings, ownedProperties, onAcceptOffer }: ListedPropertiesProps) {
  const [selectedProperty, setSelectedProperty] = useState<{ property: Property; listing: PropertyListing } | null>(null);

  if (propertyListings.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="bg-white/95 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Properties Listed for Sale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {propertyListings.map((listing) => {
              const property = ownedProperties.find(p => p.id === listing.propertyId);
              if (!property) return null;

              const daysOnMarket = Math.floor((Date.now() - listing.listingDate) / (1000 * 60 * 60 * 24));
              const offerCount = listing.offers?.length || 0;

              return (
                <Card key={listing.propertyId} className="border-2">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg">{property.name}</h4>
                        <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 mr-1" />
                            {listing.isAuction ? `${listing.daysUntilSale} days to auction` : `${daysOnMarket} days on market`}
                          </Badge>
                          {offerCount > 0 && (
                            <Badge variant="default">
                              {offerCount} offer{offerCount > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right space-y-2">
                        <div>
                          <div className="text-sm text-muted-foreground">Listed Price</div>
                          <div className="text-xl font-bold">£{property.value.toLocaleString()}</div>
                        </div>
                        {offerCount > 0 && (
                          <Button 
                            size="sm"
                            onClick={() => setSelectedProperty({ property, listing })}
                            className="w-full"
                          >
                            View {offerCount} Offer{offerCount > 1 ? 's' : ''}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedProperty && (
        <PropertyOffers
          property={selectedProperty.property}
          isOpen={!!selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onAcceptOffer={onAcceptOffer}
          daysOnMarket={Math.floor((Date.now() - selectedProperty.listing.listingDate) / (1000 * 60 * 60 * 24))}
          existingOffers={selectedProperty.listing.offers}
        />
      )}
    </>
  );
}
