import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Property } from "@/components/ui/property-card";
import { Clock, Check, X, Building2, ShoppingCart, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  autoAcceptThreshold?: number;
}

interface EstateAgentWindowProps {
  ownedProperties: Property[];
  propertyListings: PropertyListing[];
  onListProperty: (propertyId: string, askingPrice: number) => void;
  onCancelListing: (propertyId: string) => void;
  onUpdateListingPrice: (propertyId: string, newPrice: number) => void;
  onSetAutoAccept: (propertyId: string, threshold: number | undefined) => void;
  onAcceptOffer: (propertyId: string, offer: PropertyOffer) => void;
  onRejectOffer: (propertyId: string, offerId: string) => void;
  onAddOffer: (propertyId: string, offer: PropertyOffer) => void;
  cash: number;
  availableProperties: Property[];
  onBuyProperty: (property: Property, offerAmount: number, mortgagePercentage: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => void;
  getMaxPropertiesForLevel: (level: number) => number;
  getAvailablePropertyTypes: (level: number) => string[];
  getMaxPropertyValue: (level: number) => number;
  level: number;
  mortgageProviders: any[];
}

export function EstateAgentWindow({ 
  ownedProperties,
  propertyListings,
  onListProperty,
  onCancelListing,
  onUpdateListingPrice,
  onSetAutoAccept,
  onAcceptOffer, 
  onRejectOffer,
  onAddOffer,
  cash, 
  availableProperties, 
  onBuyProperty, 
  getMaxPropertiesForLevel, 
  getAvailablePropertyTypes, 
  getMaxPropertyValue, 
  level, 
  mortgageProviders 
}: EstateAgentWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newListingPrice, setNewListingPrice] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [editingListing, setEditingListing] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editingThreshold, setEditingThreshold] = useState<string | null>(null);
  const [thresholdValue, setThresholdValue] = useState("");
  
  // Property buying state
  const [selectedBuyProperty, setSelectedBuyProperty] = useState<Property | null>(null);
  const [offerAmount, setOfferAmount] = useState<number[]>([0]);
  const [mortgagePercentage, setMortgagePercentage] = useState<number[]>([0]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [termYears, setTermYears] = useState<number>(25);
  const [mortgageType, setMortgageType] = useState<'repayment' | 'interest-only'>('repayment');

  // Generate offers for listed properties
  useEffect(() => {
    const interval = setInterval(() => {
      propertyListings.forEach(listing => {
        const property = ownedProperties.find(p => p.id === listing.propertyId);
        if (!property) return;

        const currentTime = Date.now();
        const timeSinceListing = (currentTime - listing.listingDate) / (1000 * 60 * 60 * 24); // days
        const lastCheck = listing.lastOfferCheck || listing.listingDate;
        const timeSinceLastCheck = (currentTime - lastCheck) / (1000 * 60 * 60); // hours

        // Only check every 2 hours minimum
        if (timeSinceLastCheck < 2) return;

        const marketValue = property.value;
        const askingPrice = property.price; // Using property.price as asking price
        const priceRatio = askingPrice / marketValue;
        
        // Calculate offer chance based on pricing
        let offerChance = 0.3;
        if (priceRatio <= 0.9) offerChance = 0.8;
        else if (priceRatio <= 1.0) offerChance = 0.6;
        else if (priceRatio <= 1.1) offerChance = 0.4;
        else offerChance = 0.15;
        
        if (Math.random() < offerChance) {
          let offerAmount: number;
          if (priceRatio > 1.1) {
            offerAmount = askingPrice * (0.85 + Math.random() * 0.1);
          } else if (priceRatio >= 1.0) {
            offerAmount = askingPrice * (0.95 + Math.random() * 0.05);
          } else {
            offerAmount = askingPrice * (1.0 + Math.random() * 0.05);
          }
          
          const buyerNames = [
            "John Smith", "Sarah Johnson", "Mike Wilson", "Emma Davis",
            "James Brown", "Lisa Taylor", "David Anderson", "Rachel White",
            "Tom Clark", "Anna Lewis", "Chris Martin", "Sophie Evans"
          ];
          
          const buyerName = buyerNames[Math.floor(Math.random() * buyerNames.length)];
          
          const newOffer: PropertyOffer = {
            id: `offer_${Date.now()}_${Math.random()}`,
            buyerName,
            amount: Math.floor(offerAmount),
            daysOnMarket: Math.floor(timeSinceListing),
            isChainFree: Math.random() > 0.6,
            mortgageApproved: Math.random() > 0.3,
            timestamp: currentTime
          };

          onAddOffer(listing.propertyId, newOffer);
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [propertyListings, ownedProperties, onAddOffer]);

  const handleListProperty = () => {
    if (!selectedProperty || !newListingPrice) return;

    const price = parseInt(newListingPrice);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid asking price.",
        variant: "destructive"
      });
      return;
    }

    onListProperty(selectedProperty.id, price);
    setSelectedProperty(null);
    setNewListingPrice("");
  };

  const handleUpdatePrice = (propertyId: string) => {
    const price = parseInt(editPrice);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price.",
        variant: "destructive"
      });
      return;
    }

    onUpdateListingPrice(propertyId, price);
    setEditingListing(null);
    setEditPrice("");
    
    toast({
      title: "Price Updated",
      description: `Asking price updated to £${price.toLocaleString()}`,
    });
  };

  const handleSetThreshold = (propertyId: string) => {
    const threshold = parseInt(thresholdValue);
    if (isNaN(threshold) || threshold <= 0) {
      toast({
        title: "Invalid Threshold",
        description: "Please enter a valid threshold amount.",
        variant: "destructive"
      });
      return;
    }

    onSetAutoAccept(propertyId, threshold);
    setEditingThreshold(null);
    setThresholdValue("");
    
    toast({
      title: "Auto-Accept Set",
      description: `Offers at or above £${threshold.toLocaleString()} will be automatically accepted.`,
    });
  };

  const handleRemoveThreshold = (propertyId: string) => {
    onSetAutoAccept(propertyId, undefined);
    toast({
      title: "Auto-Accept Removed",
      description: "All offers now require manual review.",
    });
  };

  const setPriceFromEstimate = (multiplier: number) => {
    if (selectedProperty) {
      setNewListingPrice(Math.floor(selectedProperty.value * multiplier).toString());
    }
  };

  const unlistedProperties = ownedProperties.filter(
    p => !propertyListings.some(l => l.propertyId === p.id)
  );

  const getPropertyById = (propertyId: string) => {
    return ownedProperties.find(p => p.id === propertyId);
  };

  const getBadgeVariant = (offer: PropertyOffer, property: Property) => {
    const ratio = offer.amount / property.value;
    if (ratio >= 1.0) return "default";
    if (ratio >= 0.95) return "secondary";
    return "destructive";
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <Building2 className="h-4 w-4 mr-2" />
          Estate Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Estate Agent</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="buy" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy">Buy Properties</TabsTrigger>
            <TabsTrigger value="sell">Sell Properties</TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableProperties.slice(0, 12).map((property) => (
                <Card 
                  key={property.id}
                  className={`cursor-pointer transition-all ${
                    selectedBuyProperty?.id === property.id 
                      ? 'ring-2 ring-primary' 
                      : 'hover:shadow-lg'
                  }`}
                  onClick={() => {
                    setSelectedBuyProperty(property);
                    setOfferAmount([property.value]);
                  }}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{property.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Price:</span>
                        <span className="font-bold">£{property.value.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Type:</span>
                        <span className="text-sm font-medium">{property.type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Rent:</span>
                        <span className="text-sm text-green-600">£{property.monthlyIncome}/mo</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {selectedBuyProperty && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Make an Offer - {selectedBuyProperty.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Offer Amount: £{offerAmount[0].toLocaleString()}</Label>
                    <Slider
                      value={offerAmount}
                      onValueChange={setOfferAmount}
                      min={Math.floor(selectedBuyProperty.value * 0.85)}
                      max={Math.floor(selectedBuyProperty.value * 1.05)}
                      step={1000}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Mortgage: {mortgagePercentage[0]}%</Label>
                    <Slider
                      value={mortgagePercentage}
                      onValueChange={setMortgagePercentage}
                      min={0}
                      max={75}
                      step={5}
                    />
                    <p className="text-sm text-muted-foreground">
                      Cash needed: £{(offerAmount[0] * (1 - mortgagePercentage[0] / 100)).toLocaleString()}
                    </p>
                  </div>

                  {mortgagePercentage[0] > 0 && (
                    <>
                      <div className="space-y-2">
                        <Label>Mortgage Provider</Label>
                        <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {mortgageProviders.map(provider => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.name} ({(provider.baseRate * 100).toFixed(1)}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Term: {termYears} years</Label>
                        <Slider
                          value={[termYears]}
                          onValueChange={(v) => setTermYears(v[0])}
                          min={5}
                          max={30}
                          step={5}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Mortgage Type</Label>
                        <Select value={mortgageType} onValueChange={(v: any) => setMortgageType(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="repayment">Repayment</SelectItem>
                            <SelectItem value="interest-only">Interest Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => {
                      onBuyProperty(
                        selectedBuyProperty,
                        offerAmount[0],
                        mortgagePercentage[0],
                        selectedProvider,
                        termYears,
                        mortgageType
                      );
                      setSelectedBuyProperty(null);
                      setIsOpen(false);
                    }}
                    disabled={mortgagePercentage[0] > 0 && !selectedProvider}
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Buy Property
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sell" className="space-y-6">
            {/* List New Property */}
            {unlistedProperties.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>List a Property for Sale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Property</Label>
                    <Select
                      value={selectedProperty?.id || ""}
                      onValueChange={(id) => {
                        const prop = unlistedProperties.find(p => p.id === id);
                        setSelectedProperty(prop || null);
                        if (prop) setNewListingPrice(prop.value.toString());
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a property" />
                      </SelectTrigger>
                      <SelectContent>
                        {unlistedProperties.map(property => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.name} (Value: £{property.value.toLocaleString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedProperty && (
                    <>
                      <div className="space-y-2">
                        <Label>Asking Price</Label>
                        <Input
                          type="number"
                          value={newListingPrice}
                          onChange={(e) => setNewListingPrice(e.target.value)}
                          placeholder="Enter asking price"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setPriceFromEstimate(0.95)}>
                            95% (£{Math.floor(selectedProperty.value * 0.95).toLocaleString()})
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPriceFromEstimate(1.0)}>
                            100% (£{selectedProperty.value.toLocaleString()})
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPriceFromEstimate(1.05)}>
                            105% (£{Math.floor(selectedProperty.value * 1.05).toLocaleString()})
                          </Button>
                        </div>
                      </div>

                      <Button onClick={handleListProperty} className="w-full">
                        List Property
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Current Listings */}
            {propertyListings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Current Listings ({propertyListings.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {propertyListings.map(listing => {
                    const property = getPropertyById(listing.propertyId);
                    if (!property) return null;

                    const offers = listing.offers || [];
                    const daysOnMarket = Math.floor((Date.now() - listing.listingDate) / (1000 * 60 * 60 * 24));

                    return (
                      <Card key={listing.propertyId} className="border-2">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg">{property.name}</CardTitle>
                              <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                            </div>
                            <Badge variant="secondary">{daysOnMarket} days on market</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Asking Price:</span>
                            {editingListing === listing.propertyId ? (
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  className="w-32"
                                />
                                <Button size="sm" onClick={() => handleUpdatePrice(listing.propertyId)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingListing(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-2 items-center">
                                <span className="font-bold">£{property.price.toLocaleString()}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingListing(listing.propertyId);
                                    setEditPrice(property.price.toString());
                                  }}
                                >
                                  Edit
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Auto-Accept Threshold */}
                          <div className="border-t pt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-green-600" />
                                <span className="text-sm font-medium">Auto-Accept Threshold:</span>
                              </div>
                              {listing.autoAcceptThreshold ? (
                                <div className="flex gap-2 items-center">
                                  <Badge variant="default">£{listing.autoAcceptThreshold.toLocaleString()}</Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveThreshold(listing.propertyId)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : editingThreshold === listing.propertyId ? (
                                <div className="flex gap-2">
                                  <Input
                                    type="number"
                                    value={thresholdValue}
                                    onChange={(e) => setThresholdValue(e.target.value)}
                                    placeholder="Amount"
                                    className="w-32"
                                  />
                                  <Button size="sm" onClick={() => handleSetThreshold(listing.propertyId)}>
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingThreshold(null)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingThreshold(listing.propertyId);
                                    setThresholdValue(property.value.toString());
                                  }}
                                >
                                  Set Threshold
                                </Button>
                              )}
                            </div>
                            {listing.autoAcceptThreshold && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Offers at or above this amount will be automatically accepted
                              </p>
                            )}
                          </div>

                          {/* Offers */}
                          {offers.length > 0 ? (
                            <div className="space-y-3 border-t pt-3">
                              <h4 className="font-semibold text-sm">
                                Offers ({offers.length})
                              </h4>
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {offers.map(offer => (
                                  <Card key={offer.id} className="bg-muted/50">
                                    <CardContent className="p-3">
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <p className="font-semibold">{offer.buyerName}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {offer.daysOnMarket} days on market
                                          </p>
                                        </div>
                                        <Badge variant={getBadgeVariant(offer, property)}>
                                          £{offer.amount.toLocaleString()}
                                        </Badge>
                                      </div>
                                      <div className="flex gap-1 mb-2">
                                        {offer.isChainFree && (
                                          <Badge variant="secondary" className="text-xs">Chain Free</Badge>
                                        )}
                                        {offer.mortgageApproved && (
                                          <Badge variant="secondary" className="text-xs">Mortgage Approved</Badge>
                                        )}
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          className="flex-1"
                                          onClick={() => {
                                            onAcceptOffer(listing.propertyId, offer);
                                            setIsOpen(false);
                                          }}
                                        >
                                          <Check className="h-4 w-4 mr-1" />
                                          Accept
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          onClick={() => onRejectOffer(listing.propertyId, offer.id)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              No offers yet
                            </p>
                          )}

                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                              onCancelListing(listing.propertyId);
                              toast({
                                title: "Listing Cancelled",
                                description: "Property removed from sale.",
                              });
                            }}
                          >
                            Cancel Listing
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {unlistedProperties.length === 0 && propertyListings.length === 0 && (
              <Card>
                <CardContent className="text-center py-8">
                  <p className="text-muted-foreground">
                    No properties available to sell. Purchase properties from the market first!
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
