import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Property } from "@/components/ui/property-card";
import { Clock, Check, X, Building2 } from "lucide-react";
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
}

export function EstateAgentWindow({ ownedProperties, onAcceptOffer, cash }: EstateAgentWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [listings, setListings] = useState<PropertyListing[]>([]);
  const [offers, setOffers] = useState<PropertyOffer[]>([]);
  const [newListingPrice, setNewListingPrice] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [editingListing, setEditingListing] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

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

  const setPriceQuickly = (value: number) => {
    setNewListingPrice(value.toString());
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
      </DialogContent>
    </Dialog>
  );
}