import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Property } from "@/components/ui/property-card";
import { Gavel, Clock, TrendingUp } from "lucide-react";
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
}

export function AuctionHouse({ ownedProperties, onAuctionSale, monthsPlayed }: AuctionHouseProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [listings, setListings] = useState<AuctionListing[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [reservePrice, setReservePrice] = useState("");
  const [guidePrice, setGuidePrice] = useState("");

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
            description: `${listing.property.name} sold for £${finalPrice.toLocaleString()} (${listing.bidderCount} bidders)`,
          });
        }, 1000);
        
        return listing;
      }
      
      // Generate realistic bidding activity
      if (Math.random() < 0.4) { // 40% chance of new bid
        const bidIncrease = listing.guidePrice * (0.02 + Math.random() * 0.08); // 2-10% increases
        return {
          ...listing,
          highestBid: Math.max(listing.highestBid + bidIncrease, listing.reservePrice * 0.8),
          bidderCount: listing.bidderCount + (Math.random() < 0.3 ? 1 : 0)
        };
      }
      
      return listing;
    }));
  }, [monthsPlayed, onAuctionSale]);

  // Remove completed auctions
  useEffect(() => {
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

    const auctionDate = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days from now

    const newListing: AuctionListing = {
      property: selectedProperty,
      reservePrice: reserve,
      guidePrice: guide,
      listDate: Date.now(),
      auctionDate,
      highestBid: guide * 0.7, // Start at 70% of guide price
      bidderCount: Math.floor(Math.random() * 5) + 2 // 2-6 initial bidders
    };

    setListings(prev => [...prev, newListing]);
    setSelectedProperty(null);
    setReservePrice("");
    setGuidePrice("");

    toast({
      title: "Property Listed for Auction",
      description: `${selectedProperty.name} will be auctioned in 30 days`,
    });
  };

  const unlistedProperties = ownedProperties.filter(prop => 
    !listings.some(listing => listing.property.id === prop.id)
  );

  const formatTimeUntilAuction = (auctionDate: number) => {
    const timeLeft = auctionDate - Date.now();
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
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
                    <div className="grid gap-2">
                      <Label>Guide Price (£)</Label>
                      <Input
                        type="number"
                        value={guidePrice}
                        onChange={(e) => setGuidePrice(e.target.value)}
                        placeholder="Expected selling price"
                      />
                      <p className="text-xs text-muted-foreground">
                        This is the expected selling price shown to bidders
                      </p>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label>Reserve Price (£)</Label>
                      <Input
                        type="number"
                        value={reservePrice}
                        onChange={(e) => setReservePrice(e.target.value)}
                        placeholder="Minimum acceptable price"
                      />
                      <p className="text-xs text-muted-foreground">
                        Minimum price you'll accept (not shown to bidders)
                      </p>
                    </div>
                    
                    <Button onClick={handleListForAuction} className="w-full">
                      List for Auction
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No properties available for auction</p>
            )}
          </div>

          {/* Current Auction Listings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Your Auction Listings</h3>
            
            {listings.length > 0 ? (
              <div className="space-y-3">
                {listings.map(listing => (
                  <Card key={listing.property.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{listing.property.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium">Guide Price</p>
                          <p className="text-muted-foreground">£{listing.guidePrice.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="font-medium">Current Bid</p>
                          <p className="text-primary font-bold">£{listing.highestBid.toLocaleString()}</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{formatTimeUntilAuction(listing.auctionDate)}</span>
                        </div>
                        <Badge variant="outline">
                          {listing.bidderCount} bidders
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-success" />
                        <span className={listing.highestBid >= listing.reservePrice ? "text-success" : "text-warning"}>
                          {listing.highestBid >= listing.reservePrice ? "Reserve met" : "Below reserve"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No properties currently listed for auction</p>
            )}
          </div>
        </div>

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-2">How Auctions Work</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Auctions run monthly with properties listed 30 days in advance</li>
            <li>• Guide price is shown to bidders, reserve price is confidential</li>
            <li>• Bidding activity increases as auction date approaches</li>
            <li>• Properties sell for the highest bid above reserve price</li>
            <li>• No estate agent fees, but 2% auction house commission applies</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}