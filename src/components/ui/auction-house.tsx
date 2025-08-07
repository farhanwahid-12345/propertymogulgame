import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Property } from "@/components/ui/property-card";
import { Gavel, Clock, TrendingUp, ShoppingCart, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AuctionListing {
  property: Property;
  reservePrice: number;
  guidePrice: number;
  listDate: number;
  auctionDate: number;
  highestBid: number;
  bidderCount: number;
}

interface AuctionHouseProps {
  ownedProperties: Property[];
  onAuctionSale: (propertyId: string, salePrice: number) => void;
  monthsPlayed: number;
  auctionProperties: Property[];
  onBuyProperty: (property: Property, offerAmount: number, mortgagePercentage: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => void;
  cash: number;
  mortgageProviders: any[];
  level: number;
}

export function AuctionHouse({ ownedProperties, onAuctionSale, monthsPlayed, auctionProperties, onBuyProperty, cash, mortgageProviders, level }: AuctionHouseProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [listings, setListings] = useState<AuctionListing[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [reservePrice, setReservePrice] = useState("");
  const [guidePrice, setGuidePrice] = useState("");
  const [activeTab, setActiveTab] = useState("buy");
  
  // Bidding state
  const [selectedBidProperty, setSelectedBidProperty] = useState<Property | null>(null);
  const [bidAmount, setBidAmount] = useState<number[]>([0]);

  // Get properties that aren't already listed
  const unlistedProperties = ownedProperties.filter(
    prop => !listings.some(listing => listing.property.id === prop.id)
  );

  // Monthly auction cycle
  useEffect(() => {
    // Check if it's auction month (every month)
    const auctionTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // Auction in 7 days
    
    // Update existing listings with bids
    setListings(prev => prev.map(listing => {
      const timeToAuction = listing.auctionDate - Date.now();
      
      if (timeToAuction <= 0) {
        // Auction has ended, process sale
        const finalPrice = Math.max(listing.highestBid, listing.reservePrice);
        
        setTimeout(() => {
          onAuctionSale(listing.property.id, finalPrice);
          toast({
            title: "Auction Complete!",
            description: `${listing.property.name} sold for £${finalPrice.toLocaleString()}`,
          });
        }, 1000);
        
        return null; // Mark for removal
      }
      
      // Simulate bidding activity
      if (Math.random() > 0.7) {
        const bidIncrease = listing.guidePrice * (0.01 + Math.random() * 0.05); // 1-6% increase
        return {
          ...listing,
          highestBid: Math.max(listing.highestBid + bidIncrease, listing.reservePrice),
          bidderCount: listing.bidderCount + 1
        };
      }
      
      return listing;
    }).filter(Boolean) as AuctionListing[]);

    // Clean up completed auctions
    setListings(prev => prev.filter(listing => listing.auctionDate > Date.now()));
  }, [monthsPlayed]);

  const handleListForAuction = () => {
    if (!selectedProperty || !reservePrice || !guidePrice) return;

    const reserve = parseInt(reservePrice);
    const guide = parseInt(guidePrice);
    
    if (isNaN(reserve) || isNaN(guide) || reserve <= 0 || guide <= 0) {
      toast({
        title: "Invalid Prices",
        description: "Please enter valid reserve and guide prices.",
        variant: "destructive"
      });
      return;
    }

    if (reserve > guide) {
      toast({
        title: "Invalid Prices",
        description: "Reserve price cannot be higher than guide price.",
        variant: "destructive"
      });
      return;
    }

    const newListing: AuctionListing = {
      property: selectedProperty,
      reservePrice: reserve,
      guidePrice: guide,
      listDate: Date.now(),
      auctionDate: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days from now
      highestBid: reserve * 0.8, // Start below reserve
      bidderCount: Math.floor(Math.random() * 3) + 1
    };

    setListings(prev => [...prev, newListing]);
    setSelectedProperty(null);
    setReservePrice("");
    setGuidePrice("");

    toast({
      title: "Property Listed!",
      description: `${selectedProperty.name} has been listed for auction.`,
    });
  };

  const handleBuyAtAuction = () => {
    if (!selectedBidProperty) return;
    
    const finalBidAmount = bidAmount[0];
    const reservePrice = Math.floor(selectedBidProperty.price * 0.85);
    
    // Simulate auction competition
    const competitionBid = reservePrice + (Math.random() * (selectedBidProperty.price * 0.3));
    
    if (finalBidAmount >= Math.max(reservePrice, competitionBid)) {
      onBuyProperty(selectedBidProperty, finalBidAmount, 0); // Cash purchase for simplicity at auction
      
      setSelectedBidProperty(null);
      setBidAmount([0]);
      
      toast({
        title: "Auction Won!",
        description: `You've won ${selectedBidProperty.name} for £${finalBidAmount.toLocaleString()}!`,
      });
    } else {
      toast({
        title: "Outbid!",
        description: `Your bid of £${finalBidAmount.toLocaleString()} was outbid. Final price: £${Math.floor(competitionBid).toLocaleString()}`,
        variant: "destructive"
      });
    }
  };

  const getDaysUntilAuction = (auctionDate: number) => {
    const timeDiff = auctionDate - Date.now();
    return Math.max(0, Math.ceil(timeDiff / (24 * 60 * 60 * 1000)));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100">
          <Gavel className="h-4 w-4 mr-2" />
          Auction House
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Gavel className="h-6 w-6" />
            Property Auction House
          </DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Buy Properties
            </TabsTrigger>
            <TabsTrigger value="sell" className="flex items-center gap-2">
              <Gavel className="h-4 w-4" />
              List for Auction
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Available Properties */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Gavel className="h-5 w-5" />
                  Available Auction Properties
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {auctionProperties.map((property) => (
                    <Card 
                      key={property.id} 
                      className={`cursor-pointer transition-colors border-orange-200 ${
                        selectedBidProperty?.id === property.id ? 'ring-2 ring-orange-500' : ''
                      }`}
                      onClick={() => {
                        setSelectedBidProperty(property);
                        setBidAmount([property.price]);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-semibold">{property.name}</h4>
                            <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                            <Badge variant="outline" className="mt-1">
                              {property.type}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-orange-600">
                              £{property.price.toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Guide Price
                            </p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Reserve:</span>
                            <span className="ml-1 font-medium">
                              £{Math.floor(property.price * 0.85).toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Monthly Income:</span>
                            <span className="ml-1 font-medium">
                              £{property.monthlyIncome.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {auctionProperties.length === 0 && (
                    <Card className="border-dashed">
                      <CardContent className="p-8 text-center text-muted-foreground">
                        <Gavel className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No properties available for auction at the moment.</p>
                        <p className="text-sm">Check back next month!</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
              
              {/* Bidding Panel */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Place Your Bid</h3>
                
                {selectedBidProperty ? (
                  <div className="space-y-4">
                    <Card className="border-orange-200">
                      <CardContent className="p-4">
                        <h4 className="font-semibold">{selectedBidProperty.name}</h4>
                        <p className="text-sm text-muted-foreground">{selectedBidProperty.neighborhood}</p>
                        <p className="text-sm">Guide: £{selectedBidProperty.price.toLocaleString()}</p>
                        <p className="text-sm">Reserve: £{Math.floor(selectedBidProperty.price * 0.85).toLocaleString()}</p>
                      </CardContent>
                    </Card>
                    
                    <div className="space-y-3">
                      <Label>Your Bid: £{bidAmount[0].toLocaleString()}</Label>
                      <Slider
                        value={bidAmount}
                        onValueChange={setBidAmount}
                        min={Math.floor(selectedBidProperty.price * 0.7)}
                        max={Math.floor(selectedBidProperty.price * 1.5)}
                        step={1000}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>70% (£{Math.floor(selectedBidProperty.price * 0.7).toLocaleString()})</span>
                        <span>150% (£{Math.floor(selectedBidProperty.price * 1.5).toLocaleString()})</span>
                      </div>
                    </div>
                    
                    <div className="text-sm p-3 bg-orange-50 rounded-md border border-orange-200">
                      <p className="font-medium text-orange-800">Auction Terms:</p>
                      <ul className="text-orange-700 mt-1 space-y-1">
                        <li>• Cash purchase only</li>
                        <li>• Bid must meet reserve price</li>
                        <li>• Sale completes immediately</li>
                      </ul>
                    </div>
                    
                    <Button 
                      className="w-full bg-orange-600 hover:bg-orange-700"
                      onClick={handleBuyAtAuction}
                      disabled={cash < bidAmount[0] || bidAmount[0] < Math.floor(selectedBidProperty.price * 0.85)}
                    >
                      {cash < bidAmount[0] ? "Insufficient Funds" : 
                       bidAmount[0] < Math.floor(selectedBidProperty.price * 0.85) ? "Below Reserve Price" :
                       `Place Bid: £${bidAmount[0].toLocaleString()}`}
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Select a property to place your bid</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="sell" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* List Property for Auction */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">List Property for Auction</h3>
                
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
                          if (prop) {
                            setGuidePrice(prop.value.toString());
                            setReservePrice((prop.value * 0.85).toString());
                          }
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
                      <div className="space-y-3">
                        <div className="space-y-3">
                          <Label>Guide Price: £{parseInt(guidePrice || "0").toLocaleString()}</Label>
                          <Slider
                            value={[parseInt(guidePrice || "0")]}
                            onValueChange={(value) => setGuidePrice(value[0].toString())}
                            min={selectedProperty ? selectedProperty.value * 0.8 : 0}
                            max={selectedProperty ? selectedProperty.value * 1.3 : 1000000}
                            step={1000}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>80%</span>
                            <span>130%</span>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <Label>Reserve Price: £{parseInt(reservePrice || "0").toLocaleString()}</Label>
                          <Slider
                            value={[parseInt(reservePrice || "0")]}
                            onValueChange={(value) => setReservePrice(value[0].toString())}
                            min={selectedProperty ? selectedProperty.value * 0.6 : 0}
                            max={parseInt(guidePrice || "0") || (selectedProperty ? selectedProperty.value : 1000000)}
                            step={1000}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>60%</span>
                            <span>Guide Price</span>
                          </div>
                        </div>
                        
                        <Button 
                          onClick={handleListForAuction}
                          className="w-full bg-orange-600 hover:bg-orange-700"
                        >
                          List for Auction
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No properties available to list.</p>
                    <p className="text-sm">Buy some properties first or your current properties may already be listed.</p>
                  </div>
                )}
              </div>

              {/* Current Auction Listings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Your Auction Listings</h3>
                
                {listings.length > 0 ? (
                  <div className="space-y-3">
                    {listings.map((listing) => {
                      const daysUntilAuction = getDaysUntilAuction(listing.auctionDate);
                      const isActive = daysUntilAuction > 0;
                      
                      return (
                        <Card key={listing.property.id} className={`${isActive ? 'border-orange-200' : 'border-green-200'}`}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="font-medium">{listing.property.name}</h4>
                                <p className="text-sm text-muted-foreground">{listing.property.neighborhood}</p>
                              </div>
                              <Badge variant={isActive ? "secondary" : "default"}>
                                {isActive ? (
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {daysUntilAuction} days
                                  </div>
                                ) : (
                                  "Sold"
                                )}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground">Guide:</span>
                                <span className="ml-1">£{listing.guidePrice.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Reserve:</span>
                                <span className="ml-1">£{listing.reservePrice.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Current Bid:</span>
                                <span className="ml-1 font-medium text-green-600">
                                  £{listing.highestBid.toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Bidders:</span>
                                <span className="ml-1">{listing.bidderCount}</span>
                              </div>
                            </div>
                            
                            {listing.highestBid >= listing.reservePrice && (
                              <div className="mt-2 flex items-center text-green-600 text-sm">
                                <TrendingUp className="h-4 w-4 mr-1" />
                                Reserve met!
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Gavel className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No active auction listings.</p>
                    <p className="text-sm">List a property to get started.</p>
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