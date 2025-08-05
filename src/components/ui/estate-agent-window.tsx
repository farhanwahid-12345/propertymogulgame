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
import { Clock, Check, X, Building2, ShoppingCart } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PropertyOffer {
  id: string;
  propertyId: string;
  amount: number;
  buyerName: string;
  offerDate: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'rejected';
}

interface PropertyListing {
  property: Property;
  askingPrice: number;
  listDate: number;
}

interface EstateAgentWindowProps {
  ownedProperties: Property[];
  onAcceptOffer: (propertyId: string, offer: PropertyOffer) => void;
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
  onAcceptOffer, 
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
  const [listings, setListings] = useState<PropertyListing[]>([]);
  const [offers, setOffers] = useState<PropertyOffer[]>([]);
  const [newListingPrice, setNewListingPrice] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [editingListing, setEditingListing] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  
  // Property buying state
  const [selectedBuyProperty, setSelectedBuyProperty] = useState<Property | null>(null);
  const [offerAmount, setOfferAmount] = useState<number[]>([0]);
  const [mortgagePercentage, setMortgagePercentage] = useState<number[]>([0]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [termYears, setTermYears] = useState<number>(25);
  const [mortgageType, setMortgageType] = useState<'repayment' | 'interest-only'>('repayment');

  // Generate realistic offers for listed properties
  useEffect(() => {
    const interval = setInterval(() => {
      setOffers(prev => {
        const currentTime = Date.now();
        
        // Remove expired offers
        const activeOffers = prev.filter(offer => currentTime < offer.expiresAt);
        
        // Generate new offers for listed properties
        const newOffers: PropertyOffer[] = [];
        listings.forEach(listing => {
          if (Math.random() < 0.3) { // 30% chance per check
            const baseOffer = listing.askingPrice;
            const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
            const offerAmount = Math.floor(baseOffer * (1 + variation));
            
            const buyerNames = [
              "John Smith", "Sarah Johnson", "Mike Wilson", "Emma Davis",
              "James Brown", "Lisa Taylor", "David Anderson", "Rachel White",
              "Tom Clark", "Anna Lewis", "Chris Martin", "Sophie Evans"
            ];
            
            const buyerName = buyerNames[Math.floor(Math.random() * buyerNames.length)];
            
            newOffers.push({
              id: `offer_${Date.now()}_${Math.random()}`,
              propertyId: listing.property.id,
              amount: offerAmount,
              buyerName,
              offerDate: currentTime,
              expiresAt: currentTime + (24 * 60 * 60 * 1000), // Expires in 24 hours
              status: 'pending'
            });
          }
        });
        
        return [...activeOffers, ...newOffers];
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [listings]);

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

    const newListing: PropertyListing = {
      property: selectedProperty,
      askingPrice: price,
      listDate: Date.now()
    };

    setListings(prev => [...prev, newListing]);
    setSelectedProperty(null);
    setNewListingPrice("");

    toast({
      title: "Property Listed",
      description: `${selectedProperty.name} listed for £${price.toLocaleString()}`,
    });
  };

  const handleAcceptOffer = (offer: PropertyOffer) => {
    setOffers(prev => prev.map(o => 
      o.id === offer.id ? { ...o, status: 'accepted' } : o
    ));
    
    setListings(prev => prev.filter(l => l.property.id !== offer.propertyId));
    
    onAcceptOffer(offer.propertyId, offer);
    
    toast({
      title: "Offer Accepted!",
      description: `Sold to ${offer.buyerName} for £${offer.amount.toLocaleString()}`,
    });
  };

  const handleRejectOffer = (offerId: string) => {
    setOffers(prev => prev.map(o => 
      o.id === offerId ? { ...o, status: 'rejected' } : o
    ));
    
    toast({
      title: "Offer Rejected",
      description: "The offer has been declined.",
    });
  };

  const handleCancelListing = (propertyId: string) => {
    setListings(prev => prev.filter(l => l.property.id !== propertyId));
    
    // Remove any pending offers for this property
    setOffers(prev => prev.filter(o => o.propertyId !== propertyId));
    
    toast({
      title: "Listing Cancelled",
      description: "Property removed from sale.",
    });
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

    setListings(prev => prev.map(l => 
      l.property.id === propertyId ? { ...l, askingPrice: price } : l
    ));
    
    setEditingListing(null);
    setEditPrice("");
    
    toast({
      title: "Price Updated",
      description: `New asking price: £${price.toLocaleString()}`,
    });
  };

  const setPriceFromEstimate = (percentage: number) => {
    if (selectedProperty) {
      const price = Math.floor(selectedProperty.value * percentage);
      setNewListingPrice(price.toString());
    }
  };

  const unlistedProperties = ownedProperties.filter(prop => 
    !listings.some(listing => listing.property.id === prop.id)
  );

  const formatTimeLeft = (expiresAt: number) => {
    const timeLeft = expiresAt - Date.now();
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <Building2 className="h-4 w-4 mr-2" />
          Estate Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Estate Agent Office</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="buy" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy">Buy Properties</TabsTrigger>
            <TabsTrigger value="sell">Sell Properties</TabsTrigger>
          </TabsList>
          
          <TabsContent value="buy" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Available Properties */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Available Properties</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {availableProperties
                    .filter(property => {
                      const allowedTypes = getAvailablePropertyTypes(level);
                      const maxValue = getMaxPropertyValue(level);
                      return (allowedTypes.includes('all') || allowedTypes.includes(property.type)) && 
                             property.price <= maxValue;
                    })
                    .map(property => (
                      <Card 
                        key={property.id} 
                        className={`cursor-pointer transition-colors ${
                          selectedBuyProperty?.id === property.id ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => {
                          setSelectedBuyProperty(property);
                          setOfferAmount([property.price]);
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{property.name}</p>
                              <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                              <p className="text-sm">£{property.monthlyIncome}/mo income</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">£{property.price.toLocaleString()}</p>
                              <Badge variant="outline">{property.type}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
                {ownedProperties.length >= getMaxPropertiesForLevel(level) && (
                  <p className="text-sm text-amber-600">
                    Property limit reached! ({ownedProperties.length}/{getMaxPropertiesForLevel(level)})
                  </p>
                )}
              </div>
              
              {/* Purchase Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Make Offer</h3>
                
                {selectedBuyProperty ? (
                  <div className="space-y-4">
                    <Card>
                      <CardContent className="p-3">
                        <p className="font-medium">{selectedBuyProperty.name}</p>
                        <p className="text-sm text-muted-foreground">Asking: £{selectedBuyProperty.price.toLocaleString()}</p>
                      </CardContent>
                    </Card>
                    
                    <div className="space-y-3">
                      <Label>Offer Amount: £{offerAmount[0].toLocaleString()}</Label>
                      <Slider
                        value={offerAmount}
                        onValueChange={setOfferAmount}
                        min={selectedBuyProperty.price * 0.8}
                        max={selectedBuyProperty.price * 1.1}
                        step={1000}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>80% (£{Math.floor(selectedBuyProperty.price * 0.8).toLocaleString()})</span>
                        <span>110% (£{Math.floor(selectedBuyProperty.price * 1.1).toLocaleString()})</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <Label>Mortgage: {mortgagePercentage[0]}%</Label>
                      <Slider
                        value={mortgagePercentage}
                        onValueChange={setMortgagePercentage}
                        min={0}
                        max={95}
                        step={5}
                        className="w-full"
                      />
                      <div className="text-sm text-muted-foreground">
                        Cash required: £{(offerAmount[0] * (1 - mortgagePercentage[0] / 100) + 3500).toLocaleString()}
                      </div>
                    </div>
                    
                    {mortgagePercentage[0] > 0 && (
                      <div className="space-y-3">
                        <Label>Mortgage Provider</Label>
                        <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose provider..." />
                          </SelectTrigger>
                          <SelectContent>
                            {mortgageProviders.map(provider => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.name} ({(provider.baseRate * 100).toFixed(1)}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label>Term (years)</Label>
                            <Select value={termYears.toString()} onValueChange={(value) => setTermYears(Number(value))}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5">5 years</SelectItem>
                                <SelectItem value="10">10 years</SelectItem>
                                <SelectItem value="15">15 years</SelectItem>
                                <SelectItem value="20">20 years</SelectItem>
                                <SelectItem value="25">25 years</SelectItem>
                                <SelectItem value="30">30 years</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Type</Label>
                            <Select value={mortgageType} onValueChange={(value: 'repayment' | 'interest-only') => setMortgageType(value)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="repayment">Repayment</SelectItem>
                                <SelectItem value="interest-only">Interest Only</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <Button 
                      className="w-full" 
                      onClick={() => {
                        onBuyProperty(
                          selectedBuyProperty, 
                          offerAmount[0], 
                          mortgagePercentage[0], 
                          selectedProvider || undefined, 
                          termYears, 
                          mortgageType
                        );
                        setSelectedBuyProperty(null);
                      }}
                      disabled={ownedProperties.length >= getMaxPropertiesForLevel(level) || 
                               (mortgagePercentage[0] > 0 && !selectedProvider)}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Make Offer
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Select a property to make an offer</p>
                )}
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="sell" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Property Listings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">List Property for Sale</h3>
                
                {unlistedProperties.length > 0 ? (
                  <div className="space-y-3">
                    <div className="grid gap-2">
                      <Label>Select Property</Label>
                      <select 
                        className="w-full p-2 border rounded-md"
                        value={selectedProperty?.id || ""}
                        onChange={(e) => {
                          const prop = unlistedProperties.find(p => p.id === e.target.value);
                          setSelectedProperty(prop || null);
                          setNewListingPrice(prop ? prop.value.toString() : "");
                        }}
                      >
                        <option value="">Choose a property...</option>
                        {unlistedProperties.map(prop => (
                          <option key={prop.id} value={prop.id}>
                            {prop.name} (Est. £{prop.value.toLocaleString()})
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    {selectedProperty && (
                      <div className="grid gap-3">
                        <Label>Asking Price (£)</Label>
                        
                        {/* Quick price buttons */}
                        <div className="grid grid-cols-3 gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setPriceFromEstimate(0.95)}
                          >
                            95% Est.
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setPriceFromEstimate(1.0)}
                          >
                            100% Est.
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setPriceFromEstimate(1.05)}
                          >
                            105% Est.
                          </Button>
                        </div>
                        
                        <Input
                          type="number"
                          value={newListingPrice}
                          onChange={(e) => setNewListingPrice(e.target.value)}
                          placeholder="Enter asking price"
                        />
                        
                        <Button onClick={handleListProperty} className="w-full">
                          List Property
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No properties available to list</p>
                )}

                {/* Current Listings */}
                {listings.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Current Listings</h4>
                    {listings.map(listing => (
                      <Card key={listing.property.id}>
                        <CardContent className="p-3">
                          {editingListing === listing.property.id ? (
                            <div className="space-y-3">
                              <div>
                                <p className="font-medium">{listing.property.name}</p>
                                <Label>New Price (£)</Label>
                                <Input
                                  type="number"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  placeholder="Enter new price"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  onClick={() => handleUpdatePrice(listing.property.id)}
                                >
                                  Update
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    setEditingListing(null);
                                    setEditPrice("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium">{listing.property.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  Listed for £{listing.askingPrice.toLocaleString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">For Sale</Badge>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingListing(listing.property.id);
                                    setEditPrice(listing.askingPrice.toString());
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => handleCancelListing(listing.property.id)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Incoming Offers */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Incoming Offers</h3>
                
                {offers.filter(o => o.status === 'pending').length > 0 ? (
                  <div className="space-y-3">
                    {offers
                      .filter(offer => offer.status === 'pending')
                      .map(offer => {
                        const property = listings.find(l => l.property.id === offer.propertyId)?.property;
                        if (!property) return null;
                        
                        return (
                          <Card key={offer.id}>
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                <div>
                                  <p className="font-medium">{property.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Offer from {offer.buyerName}
                                  </p>
                                </div>
                                
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="text-lg font-bold text-primary">
                                      £{offer.amount.toLocaleString()}
                                    </p>
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {formatTimeLeft(offer.expiresAt)} left
                                    </div>
                                  </div>
                                  
                                  <div className="flex gap-2">
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => handleRejectOffer(offer.id)}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                    <Button 
                                      size="sm"
                                      onClick={() => handleAcceptOffer(offer)}
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No pending offers</p>
                )}

                {/* Recent Activity */}
                {offers.filter(o => o.status !== 'pending').length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Recent Activity</h4>
                    {offers
                      .filter(offer => offer.status !== 'pending')
                      .slice(-3)
                      .map(offer => {
                        const property = ownedProperties.find(p => p.id === offer.propertyId);
                        return (
                          <div key={offer.id} className="flex justify-between items-center p-2 bg-muted rounded">
                            <span className="text-sm">{property?.name}</span>
                            <Badge variant={offer.status === 'accepted' ? 'default' : 'secondary'}>
                              {offer.status === 'accepted' ? 'Sold' : 'Declined'}
                            </Badge>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}