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

interface LiveAuction {
  property: Property;
  reservePrice: number;
  currentBid: number;
  bidderCount: number;
  timeRemaining: number;
  isActive: boolean;
  bidHistory: { bidder: string; amount: number; timestamp: number; isUser?: boolean }[];
  lastBidTime: number;
  endTime: number;
  aiBidders: { name: string; valuation: number; aggression: number; overbidChance: number }[];
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
  onAuctionPropertySold: (propertyId: string) => void;
}

export function AuctionHouse({ ownedProperties, onAuctionSale, monthsPlayed, auctionProperties, onBuyProperty, cash, mortgageProviders, level, onAuctionPropertySold }: AuctionHouseProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [listings, setListings] = useState<AuctionListing[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [reservePrice, setReservePrice] = useState("");
  const [guidePrice, setGuidePrice] = useState("");
  const [activeTab, setActiveTab] = useState("buy");
  
  // Live auction state
  const [liveAuction, setLiveAuction] = useState<LiveAuction | null>(null);
  const [userBidAmount, setUserBidAmount] = useState<number[]>([0]);
  const [auctioneerMessage, setAuctioneerMessage] = useState("");
  const [userMaxAutoBid, setUserMaxAutoBid] = useState<number | null>(null);

  // Get properties that aren't already listed
  const unlistedProperties = ownedProperties.filter(
    prop => !listings.some(listing => listing.property.id === prop.id)
  );

  // Live auction timer with precise 30-second timing
  useEffect(() => {
    if (!liveAuction || !liveAuction.isActive) return;

    const interval = setInterval(() => {
      setLiveAuction(prev => {
        if (!prev || !prev.isActive) return prev;

        const remainingMs = Math.max(0, prev.endTime - Date.now());
        const newSeconds = Math.ceil(remainingMs / 1000);

        // Auction ended
        if (remainingMs <= 0) {
          const lastBid = prev.bidHistory[prev.bidHistory.length - 1];
          const isUserWinner = !!lastBid?.isUser && prev.currentBid >= prev.reservePrice;

          if (prev.currentBid >= prev.reservePrice) {
            if (isUserWinner) {
              onBuyProperty(prev.property, prev.currentBid, 0);
              toast({
                title: "Auction Won!",
                description: `Congratulations! You won ${prev.property.name} for £${prev.currentBid.toLocaleString()}!`,
              });
            } else {
              toast({
                title: "Auction Lost",
                description: `${prev.property.name} sold to another bidder for £${prev.currentBid.toLocaleString()}`,
                variant: "destructive"
              });
              onAuctionPropertySold(prev.property.id);
            }
          } else {
            toast({
              title: "Auction Ended",
              description: `${prev.property.name} did not meet reserve (£${prev.reservePrice.toLocaleString()}). Removed from market.`,
              variant: "destructive"
            });
            onAuctionPropertySold(prev.property.id);
          }

          setAuctioneerMessage("Auction ended!");
          setUserMaxAutoBid(null);
          return { ...prev, isActive: false, timeRemaining: 0 };
        }

        // Realistic AI bidding with individual bidder behavior
        const timeSinceLastBid = Date.now() - prev.lastBidTime;
        const endgameBoost = newSeconds <= 5 ? 0.3 : newSeconds <= 10 ? 0.15 : 0;

        let newState = { ...prev };
        
        // AI bidding logic - more frequent but realistic
        if (timeSinceLastBid > 800 && Math.random() < 0.85) {
          const minInc = Math.max(1000, Math.floor(prev.property.price * 0.005));
          const maxInc = Math.max(minInc, Math.floor(prev.property.price * 0.025));

          // Select random AI bidder with their own behavior
          const ai = prev.aiBidders[Math.floor(Math.random() * prev.aiBidders.length)];
          const bidProb = 0.12 + (ai.aggression * 0.25) + endgameBoost;

          if (Math.random() < bidProb) {
            // Calculate bid increment with some randomness
            const baseInc = minInc + Math.floor(Math.random() * (maxInc - minInc + 1));
            const varianceMultiplier = 0.8 + Math.random() * 0.4; // 80% to 120%
            const inc = Math.floor(baseInc * varianceMultiplier);
            const candidateBid = prev.currentBid + inc;
            
            // Each AI has their own max valuation and overbid tendency
            const maxWilling = ai.valuation * (Math.random() < ai.overbidChance ? 1.05 + Math.random() * 0.1 : 1);

            if (candidateBid <= maxWilling && candidateBid > prev.currentBid) {
              const bidderName = ai.name;
              const aiHistory = [...prev.bidHistory, { 
                bidder: bidderName, 
                amount: candidateBid, 
                timestamp: Date.now(), 
                isUser: false 
              }];
              
              newState = { 
                ...newState, 
                currentBid: candidateBid, 
                bidHistory: aiHistory, 
                lastBidTime: Date.now() 
              };
              
              setAuctioneerMessage(`${bidderName} bids £${candidateBid.toLocaleString()}`);

              // Auto-bid logic for user
              setTimeout(() => {
                const minAutoInc = Math.max(1000, Math.floor(prev.property.price * 0.005));
                const autoBid = candidateBid + minAutoInc;
                
                if (userMaxAutoBid && autoBid <= userMaxAutoBid && cash >= autoBid) {
                  setLiveAuction(current => {
                    if (!current || !current.isActive || current.currentBid !== candidateBid) return current;
                    
                    const userHistory = [...current.bidHistory, { 
                      bidder: "You (auto)", 
                      amount: autoBid, 
                      timestamp: Date.now(), 
                      isUser: true 
                    }];
                    
                    setAuctioneerMessage(`Auto-bid: You bid £${autoBid.toLocaleString()}`);
                    return { 
                      ...current, 
                      currentBid: autoBid, 
                      bidHistory: userHistory, 
                      lastBidTime: Date.now() 
                    };
                  });
                }
              }, 500); // Half second delay for auto-bid
            }
          }
        }

        if (newSeconds !== prev.timeRemaining) {
          newState.timeRemaining = newSeconds;
        }
        
        return newState;
      });
    }, 100); // Update every 100ms for smooth countdown

    return () => clearInterval(interval);
  }, [liveAuction, cash, userMaxAutoBid, onBuyProperty, onAuctionPropertySold]);

  // Monthly auction cycle for property listings
  useEffect(() => {
    setListings(prev => prev.map(listing => {
      const timeToAuction = listing.auctionDate - Date.now();
      
      if (timeToAuction <= 0) {
        const finalPrice = Math.max(listing.highestBid, listing.reservePrice);
        
        setTimeout(() => {
          onAuctionSale(listing.property.id, finalPrice);
          toast({
            title: "Auction Complete!",
            description: `${listing.property.name} sold for £${finalPrice.toLocaleString()}`,
          });
        }, 1000);
        
        return null;
      }
      
      if (Math.random() > 0.7) {
        const bidIncrease = listing.guidePrice * (0.01 + Math.random() * 0.05);
        return {
          ...listing,
          highestBid: Math.max(listing.highestBid + bidIncrease, listing.reservePrice),
          bidderCount: listing.bidderCount + 1
        };
      }
      
      return listing;
    }).filter(Boolean) as AuctionListing[]);

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

  const startLiveAuction = (property: Property) => {
    const reservePrice = Math.floor(property.price * 0.85);
    const startingBid = Math.floor(reservePrice * 0.9);
    const endTime = Date.now() + 30_000; // Exactly 30 seconds

    // Generate realistic AI bidders with individual characteristics
    const bidderNames = [
      "Michael J.", "Sarah T.", "Property Investor Ltd", "James W.", 
      "Emma R.", "David L.", "Trinity Homes", "North East Holdings",
      "Liverpool Capital", "Manchester Properties", "Yorkshire Estates"
    ];
    
    const bidderCount = Math.floor(Math.random() * 5) + 3; // 3-7 bidders
    const aiBidders = Array.from({ length: bidderCount }, (_, i) => {
      const name = bidderNames[i % bidderNames.length];
      // Each bidder has different valuation and behavior
      const valuation = property.price * (0.85 + Math.random() * 0.3); // 85% - 115% of guide
      const aggression = Math.random(); // How likely to bid
      const overbidChance = Math.random() * 0.25; // Chance to go over their valuation
      return { name, valuation, aggression, overbidChance };
    });
    
    setLiveAuction({
      property,
      reservePrice,
      currentBid: startingBid,
      bidderCount,
      timeRemaining: 30,
      isActive: true,
      bidHistory: [{ 
        bidder: "Auctioneer", 
        amount: startingBid, 
        timestamp: Date.now(), 
        isUser: false 
      }],
      lastBidTime: Date.now(),
      endTime,
      aiBidders
    });
    
    setUserBidAmount([startingBid + Math.floor(property.price * 0.02)]);
    setUserMaxAutoBid(null);
    setAuctioneerMessage(`Lot ${property.id}: ${property.name}. Starting at £${startingBid.toLocaleString()}`);
  };

  const placeBid = () => {
    if (!liveAuction || !liveAuction.isActive || userBidAmount[0] <= liveAuction.currentBid) return;
    
    if (cash < userBidAmount[0]) {
      toast({
        title: "Insufficient Funds",
        description: "You don't have enough cash for this bid.",
        variant: "destructive"
      });
      return;
    }

    const newHistory = [...liveAuction.bidHistory, {
      bidder: "You",
      amount: userBidAmount[0],
      timestamp: Date.now(),
      isUser: true
    }];

    setLiveAuction(prev => prev ? {
      ...prev,
      currentBid: userBidAmount[0],
      bidHistory: newHistory,
      lastBidTime: Date.now()
    } : null);

    setAuctioneerMessage(`You bid £${userBidAmount[0].toLocaleString()}`);
    setUserBidAmount([userBidAmount[0] + Math.floor(liveAuction.property.price * 0.02)]);
  };

  const getDaysUntilAuction = (auctionDate: number) => {
    const timeDiff = auctionDate - Date.now();
    return Math.max(0, Math.ceil(timeDiff / (24 * 60 * 60 * 1000)));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
            {/* Live Auction Interface */}
            {liveAuction && (
              <Card className="border-red-500 border-2 bg-red-50">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-xl text-red-700">
                      🔴 LIVE AUCTION - Lot {liveAuction.property.id}
                    </CardTitle>
                    <div className="text-2xl font-bold text-red-600">
                      {formatTime(liveAuction.timeRemaining)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-bold text-lg">{liveAuction.property.name}</h3>
                      <p className="text-sm text-muted-foreground">{liveAuction.property.neighborhood}</p>
                      <p className="text-sm">Guide: £{liveAuction.property.price.toLocaleString()}</p>
                      <p className="text-sm">Reserve: £{liveAuction.reservePrice.toLocaleString()}</p>
                      <Badge variant={liveAuction.currentBid >= liveAuction.reservePrice ? "default" : "destructive"}>
                        {liveAuction.currentBid >= liveAuction.reservePrice ? "Reserve Met" : "Below Reserve"}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Current Bid</p>
                        <p className="text-3xl font-bold text-green-600">
                          £{liveAuction.currentBid.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {liveAuction.bidderCount} bidders registered
                        </p>
                      </div>
                      
                      {liveAuction.isActive && (
                        <div className="space-y-3">
                          <Label>Your Next Bid: £{userBidAmount[0].toLocaleString()}</Label>
                          <Slider
                            value={userBidAmount}
                            onValueChange={setUserBidAmount}
                            min={liveAuction.currentBid + Math.max(1000, Math.floor(liveAuction.property.price * 0.005))}
                            max={Math.min(cash, liveAuction.property.price * 2)}
                            step={Math.max(1000, Math.floor(liveAuction.property.price * 0.005))}
                            className="w-full"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Button 
                              onClick={placeBid}
                              disabled={userBidAmount[0] <= liveAuction.currentBid || cash < userBidAmount[0]}
                              className="w-full bg-red-600 hover:bg-red-700"
                            >
                              Place Bid: £{userBidAmount[0].toLocaleString()}
                            </Button>
                            <div className="flex flex-col">
                              <Label className="text-xs mb-1">Max Auto-Bid (£)</Label>
                              <Input
                                type="number"
                                placeholder="Optional"
                                value={userMaxAutoBid ?? ''}
                                onChange={(e) => setUserMaxAutoBid(e.target.value ? Math.max(0, parseInt(e.target.value)) : null)}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">Auto-bid will outbid others up to your max when you're outbid.</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 rounded border">
                    <p className="font-medium text-center">{auctioneerMessage}</p>
                  </div>
                  
                  {/* Bid History */}
                  <div className="bg-white rounded border max-h-32 overflow-y-auto">
                    <div className="p-2 border-b font-medium text-sm">Bid History</div>
                    <div className="space-y-1 p-2">
                      {liveAuction.bidHistory.slice(-5).reverse().map((bid, index) => (
                        <div key={index} className={`flex justify-between text-sm ${bid.isUser ? 'font-bold text-blue-600' : ''}`}>
                          <span>{bid.bidder}</span>
                          <span>£{bid.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setLiveAuction(null);
                      setUserMaxAutoBid(null);
                    }}
                    className="w-full"
                  >
                    Leave Auction
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Available Properties List */}
            {!liveAuction && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Gavel className="h-5 w-5" />
                  Available Auction Properties
                </h3>
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {auctionProperties.map((property) => (
                    <Card 
                      key={property.id} 
                      className="cursor-pointer transition-colors border-orange-200 hover:border-orange-400"
                      onClick={() => startLiveAuction(property)}
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
                            <span className="ml-1 font-medium text-green-600">
                              £{property.monthlyIncome.toLocaleString()}/mo
                            </span>
                          </div>
                        </div>
                        
                        <div className="mt-3 text-center">
                          <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                            Join Live Auction (30s)
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {auctionProperties.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Gavel className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No properties available for auction at the moment.</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sell" className="space-y-4">
            <h3 className="text-lg font-semibold">List Your Properties for Auction</h3>
            
            {unlistedProperties.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No properties available to list for auction.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label>Select Property to List:</Label>
                  <div className="grid gap-2 max-h-40 overflow-y-auto">
                    {unlistedProperties.map(property => (
                      <div 
                        key={property.id}
                        className={`p-3 border rounded cursor-pointer transition-colors ${
                          selectedProperty?.id === property.id ? 'border-primary bg-primary/10' : 'border-border'
                        }`}
                        onClick={() => {
                          setSelectedProperty(property);
                          setReservePrice(Math.floor(property.value * 0.8).toString());
                          setGuidePrice(property.value.toString());
                        }}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">{property.name}</p>
                            <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">£{property.value.toLocaleString()}</p>
                            <Badge variant="outline">{property.type}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedProperty && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Reserve Price (£)</Label>
                        <Input
                          type="number"
                          value={reservePrice}
                          onChange={(e) => setReservePrice(e.target.value)}
                          placeholder="Minimum acceptable price"
                        />
                      </div>
                      <div>
                        <Label>Guide Price (£)</Label>
                        <Input
                          type="number"
                          value={guidePrice}
                          onChange={(e) => setGuidePrice(e.target.value)}
                          placeholder="Expected sale price"
                        />
                      </div>
                    </div>
                    
                    <Button onClick={handleListForAuction} className="w-full">
                      List for Auction
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Current Listings */}
            {listings.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-semibold">Your Auction Listings</h4>
                <div className="space-y-3">
                  {listings.map((listing, index) => (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h5 className="font-medium">{listing.property.name}</h5>
                            <p className="text-sm text-muted-foreground">{listing.property.neighborhood}</p>
                            <div className="flex gap-4 text-sm mt-2">
                              <span>Reserve: £{listing.reservePrice.toLocaleString()}</span>
                              <span>Guide: £{listing.guidePrice.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-600">
                              £{listing.highestBid.toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">Current bid</p>
                            <Badge variant="outline" className="mt-1">
                              <Clock className="h-3 w-3 mr-1" />
                              {getDaysUntilAuction(listing.auctionDate)} days
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}