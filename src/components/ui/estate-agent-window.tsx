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
import { Check, X, Building2, ShoppingCart, TrendingUp, AlertCircle, Loader2, MessageSquare, Ban } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PropertyOffer {
  id: string;
  buyerName: string;
  amount: number;
  daysOnMarket: number;
  isChainFree: boolean;
  mortgageApproved: boolean;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'buyer-countered' | 'walkaway';
  counterAmount?: number;
  buyerCounterAmount?: number;
  negotiationRound: number;
  counterResponseDate?: number;
}

interface PropertyListing {
  propertyId: string;
  listingDate: number;
  isAuction: boolean;
  daysUntilSale: number;
  askingPrice: number;
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
  onCounterOffer: (propertyId: string, offerId: string, counterAmount: number) => void;
  onReducePrice: (propertyId: string, reductionPercent?: number) => void;
  onAcceptBuyerCounter: (propertyId: string, offerId: string) => void;
  onRejectBuyerCounter: (propertyId: string, offerId: string, newCounterAmount: number) => void;
  cash: number;
  availableProperties: Property[];
  onBuyProperty: (property: Property, offerAmount: number, mortgagePercentage: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => void;
  getMaxPropertiesForLevel: (level: number) => number;
  getAvailablePropertyTypes: (level: number) => string[];
  getMaxPropertyValue: (level: number) => number;
  level: number;
  mortgageProviders: any[];
  creditScore: number;
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
  onCounterOffer,
  onReducePrice,
  onAcceptBuyerCounter,
  onRejectBuyerCounter,
  cash, 
  availableProperties, 
  onBuyProperty, 
  getMaxPropertiesForLevel, 
  getAvailablePropertyTypes, 
  getMaxPropertyValue, 
  level, 
  mortgageProviders,
  creditScore = 650
}: EstateAgentWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newListingPrice, setNewListingPrice] = useState<number>(0);
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
  
  // Buying negotiation state
  const [vendorResponse, setVendorResponse] = useState<'pending' | 'accepted' | 'countered' | 'rejected' | null>(null);
  const [vendorCounterAmount, setVendorCounterAmount] = useState<number | null>(null);
  const [buyNegotiationRound, setBuyNegotiationRound] = useState(0);
  const [isVendorThinking, setIsVendorThinking] = useState(false);
  const [negotiationHistory, setNegotiationHistory] = useState<Array<{ type: 'player' | 'vendor'; amount: number; action: string }>>([]);
  
  // Counter-offer state (selling)
  const [counteringOfferId, setCounteringOfferId] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState<string>("");

  // Get level value range for filtering
  const getLevelRange = (playerLevel: number) => {
    switch (playerLevel) {
      case 1: return { min: 0, max: 100000 };
      case 2: return { min: 100000, max: 250000 };
      case 3: return { min: 250000, max: 500000 };
      case 4: return { min: 500000, max: 750000 };
      case 5: return { min: 750000, max: 1000000 };
      case 6: return { min: 1000000, max: 2500000 };
      case 7: return { min: 2500000, max: 5000000 };
      case 8: return { min: 5000000, max: 10000000 };
      case 9: return { min: 10000000, max: 20000000 };
      case 10: return { min: 20000000, max: 30000000 };
      default: return { min: 0, max: 100000 };
    }
  };

  const { min: levelMin, max: levelMax } = getLevelRange(level);

  // Calculate affordability for each property
  const calculateAffordability = (property: Property) => {
    // Find the best LTV the player qualifies for
    const eligibleProviders = mortgageProviders.filter(p => creditScore >= p.minCreditScore);
    const maxLTV = eligibleProviders.length > 0 
      ? Math.max(...eligibleProviders.map(p => p.maxLTV))
      : 0;
    
    const maxMortgage = property.value * maxLTV;
    const stampDuty = property.value <= 250000 ? property.value * 0.03 :
      (250000 * 0.03) + ((property.value - 250000) * 0.08);
    const fees = 600 + (property.value * 0.01) + stampDuty; // Solicitor + mortgage fee + stamp duty
    const cashNeeded = (property.value - maxMortgage) + fees;
    
    return cash >= cashNeeded;
  };

  // Check if property is within player's level range
  const isWithinLevelRange = (property: Property) => {
    return property.value >= levelMin && property.value <= levelMax;
  };

  // Filter properties by BOTH level range AND affordability
  const levelFilteredProperties = availableProperties.filter(isWithinLevelRange);
  const affordableProperties = levelFilteredProperties.filter(calculateAffordability);
  const levelRestrictedCount = availableProperties.length - levelFilteredProperties.length;
  const unaffordableCount = levelFilteredProperties.length - affordableProperties.length;

  // Reset negotiation when selecting a new property
  const resetNegotiation = () => {
    setVendorResponse(null);
    setVendorCounterAmount(null);
    setBuyNegotiationRound(0);
    setIsVendorThinking(false);
    setNegotiationHistory([]);
  };

  // Vendor negotiation logic
  const submitOffer = (playerOffer: number, property: Property) => {
    const marketValue = property.value;
    const ratio = playerOffer / marketValue;
    
    setIsVendorThinking(true);
    setNegotiationHistory(prev => [...prev, { type: 'player', amount: playerOffer, action: 'Offered' }]);

    setTimeout(() => {
      setIsVendorThinking(false);
      const roll = Math.random();

      if (ratio >= 1.0) {
        // At or above market: instant accept
        setVendorResponse('accepted');
        setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: playerOffer, action: 'Accepted' }]);
      } else if (ratio >= 0.95) {
        if (roll < 0.80) {
          setVendorResponse('accepted');
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: playerOffer, action: 'Accepted' }]);
        } else {
          const counter = marketValue;
          setVendorResponse('countered');
          setVendorCounterAmount(counter);
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: counter, action: 'Countered' }]);
        }
      } else if (ratio >= 0.90) {
        if (roll < 0.30) {
          setVendorResponse('accepted');
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: playerOffer, action: 'Accepted' }]);
        } else if (roll < 0.80) {
          const counter = Math.max(Math.floor(marketValue * 0.92), Math.floor(playerOffer + (marketValue - playerOffer) * 0.5));
          setVendorResponse('countered');
          setVendorCounterAmount(counter);
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: counter, action: 'Countered' }]);
        } else {
          setVendorResponse('rejected');
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: 0, action: 'Rejected' }]);
        }
      } else if (ratio >= 0.85) {
        if (roll < 0.10) {
          setVendorResponse('accepted');
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: playerOffer, action: 'Accepted' }]);
        } else if (roll < 0.50) {
          const counter = Math.max(Math.floor(marketValue * 0.92), Math.floor(playerOffer + (marketValue - playerOffer) * 0.6));
          setVendorResponse('countered');
          setVendorCounterAmount(counter);
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: counter, action: 'Countered' }]);
        } else {
          setVendorResponse('rejected');
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: 0, action: 'Rejected' }]);
        }
      } else {
        // Below 85%
        if (roll < 0.05) {
          setVendorResponse('accepted');
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: playerOffer, action: 'Accepted' }]);
        } else if (roll < 0.30) {
          const counter = Math.max(Math.floor(marketValue * 0.92), Math.floor(playerOffer + (marketValue - playerOffer) * 0.7));
          setVendorResponse('countered');
          setVendorCounterAmount(counter);
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: counter, action: 'Countered' }]);
        } else {
          setVendorResponse('rejected');
          setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: 0, action: 'Rejected' }]);
        }
      }
      setBuyNegotiationRound(prev => prev + 1);
    }, 1500);
  };

  const handleCounterVendor = () => {
    if (!selectedBuyProperty || !vendorCounterAmount) return;
    // Player submits a new counter - vendor reconsiders
    // Each round vendor moves 30% toward player but never below 92% of market
    const marketValue = selectedBuyProperty.value;
    const playerOffer = offerAmount[0];
    
    setIsVendorThinking(true);
    setNegotiationHistory(prev => [...prev, { type: 'player', amount: playerOffer, action: 'Countered' }]);

    setTimeout(() => {
      setIsVendorThinking(false);
      const ratio = playerOffer / marketValue;
      const roll = Math.random();
      const round = buyNegotiationRound;
      
      // Acceptance chance increases each round
      const acceptBonus = round * 0.15;
      
      if (ratio >= 0.95 || roll < (0.3 + acceptBonus)) {
        setVendorResponse('accepted');
        setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: playerOffer, action: 'Accepted' }]);
      } else if (round >= 2) {
        // Final round - take it or leave it
        const finalOffer = Math.max(Math.floor(marketValue * 0.92), Math.floor(vendorCounterAmount - (vendorCounterAmount - playerOffer) * 0.3));
        setVendorResponse('countered');
        setVendorCounterAmount(finalOffer);
        setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: finalOffer, action: 'Final offer' }]);
      } else {
        const newCounter = Math.max(
          Math.floor(marketValue * 0.92),
          Math.floor(vendorCounterAmount - (vendorCounterAmount - playerOffer) * 0.3)
        );
        setVendorResponse('countered');
        setVendorCounterAmount(newCounter);
        setNegotiationHistory(prev => [...prev, { type: 'vendor', amount: newCounter, action: 'Countered' }]);
      }
      setBuyNegotiationRound(prev => prev + 1);
    }, 1500);
  };

  // Generate offers for listed properties
  useEffect(() => {
    const interval = setInterval(() => {
      propertyListings.forEach(listing => {
        const property = ownedProperties.find(p => p.id === listing.propertyId);
        if (!property) return;

        const currentTime = Date.now();
        const timeSinceListing = (currentTime - listing.listingDate) / (1000 * 60 * 60 * 24);
        const lastCheck = listing.lastOfferCheck || listing.listingDate;
        const timeSinceLastCheckSeconds = (currentTime - lastCheck) / 1000;

        const marketValue = property.value;
        const askingPrice = listing.askingPrice || property.value;
        const priceRatio = askingPrice / marketValue;
        
        // Dynamic timing based on pricing - expanded tiers
        let minCheckInterval: number;
        if (priceRatio <= 0.9) minCheckInterval = 3;
        else if (priceRatio <= 1.0) minCheckInterval = 5;
        else if (priceRatio <= 1.1) minCheckInterval = 10;
        else if (priceRatio <= 1.3) minCheckInterval = 20;
        else if (priceRatio <= 1.5) minCheckInterval = 40;
        else minCheckInterval = 60;
        
        if (timeSinceLastCheckSeconds < minCheckInterval) return;
        
        // Offer chance - drops significantly for overpriced
        let offerChance: number;
        if (priceRatio <= 0.9) offerChance = 0.85;
        else if (priceRatio <= 1.0) offerChance = 0.75;
        else if (priceRatio <= 1.1) offerChance = 0.55;
        else if (priceRatio <= 1.3) offerChance = 0.30;
        else if (priceRatio <= 1.5) offerChance = 0.20;
        else offerChance = 0.12;
        
        if (Math.random() < offerChance) {
          let offerAmount: number;
          const roll = Math.random();
          
          if (priceRatio > 1.3) {
            // Very overpriced: most offers well below market
            if (roll < 0.70) offerAmount = marketValue * (0.82 + Math.random() * 0.13); // 82-95%
            else if (roll < 0.85) offerAmount = marketValue * (0.70 + Math.random() * 0.12); // 70-82%
            else offerAmount = marketValue * (0.95 + Math.random() * 0.08); // 95-103%
          } else if (priceRatio > 1.1) {
            // Overpriced: offers around market value
            if (roll < 0.70) offerAmount = marketValue * (0.88 + Math.random() * 0.12); // 88-100%
            else if (roll < 0.85) offerAmount = marketValue * (0.78 + Math.random() * 0.10); // 78-88%
            else offerAmount = marketValue * (1.00 + Math.random() * 0.05); // 100-105%
          } else if (priceRatio >= 0.95) {
            // Fairly priced: offers close to market
            if (roll < 0.70) offerAmount = marketValue * (0.93 + Math.random() * 0.10); // 93-103%
            else if (roll < 0.85) offerAmount = marketValue * (0.88 + Math.random() * 0.05); // 88-93%
            else offerAmount = marketValue * (1.03 + Math.random() * 0.05); // 103-108%
          } else {
            // Underpriced: bidding war above asking
            offerAmount = askingPrice * (1.0 + Math.random() * 0.08);
          }
          
          // Never exceed asking price for overpriced listings
          if (priceRatio > 1.0) {
            offerAmount = Math.min(offerAmount, askingPrice);
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
            timestamp: currentTime,
            status: 'pending',
            negotiationRound: 0
          };

          onAddOffer(listing.propertyId, newOffer);
        }
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [propertyListings, ownedProperties, onAddOffer]);

  const handleListProperty = () => {
    if (!selectedProperty || newListingPrice <= 0) return;

    onListProperty(selectedProperty.id, newListingPrice);
    setSelectedProperty(null);
    setNewListingPrice(0);
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
      setNewListingPrice(Math.floor(selectedProperty.value * multiplier));
    }
  };

  const getPricingGuidance = (ratio: number) => {
    if (ratio < 0.95) return { message: "Below market — expect a bidding war with fast offers", color: "text-green-600", bg: "bg-green-50" };
    if (ratio <= 1.0) return { message: "At market value — offers will come quickly", color: "text-green-600", bg: "bg-green-50" };
    if (ratio <= 1.1) return { message: "Slightly above market — offers will be slower", color: "text-yellow-600", bg: "bg-yellow-50" };
    if (ratio <= 1.3) return { message: "Overpriced — expect low offers well below asking", color: "text-orange-600", bg: "bg-orange-50" };
    return { message: "Significantly overpriced — very rare, very low offers", color: "text-red-600", bg: "bg-red-50" };
  };

  const getExpectedOfferRange = (marketValue: number, ratio: number) => {
    if (ratio < 0.9) return { low: Math.floor(marketValue * ratio), high: Math.floor(marketValue * ratio * 1.08), speed: "Every few seconds" };
    if (ratio <= 1.0) return { low: Math.floor(marketValue * 0.95), high: Math.floor(marketValue * 1.03), speed: "Every 5-10s" };
    if (ratio <= 1.1) return { low: Math.floor(marketValue * 0.88), high: Math.floor(marketValue * 0.98), speed: "Every 10-15s" };
    if (ratio <= 1.3) return { low: Math.floor(marketValue * 0.80), high: Math.floor(marketValue * 0.92), speed: "Every 20-30s" };
    return { low: Math.floor(marketValue * 0.70), high: Math.floor(marketValue * 0.85), speed: "Every 40-60s" };
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
            {(levelRestrictedCount > 0 || unaffordableCount > 0) && (
              <div className="flex flex-col gap-1 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                {levelRestrictedCount > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>{levelRestrictedCount} properties hidden (outside Level {level} range: £{levelMin.toLocaleString()}-£{levelMax.toLocaleString()})</span>
                  </div>
                )}
                {unaffordableCount > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>{unaffordableCount} properties hidden (cannot afford with current cash + max mortgage)</span>
                  </div>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {affordableProperties.slice(0, 12).map((property) => (
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
                    resetNegotiation();
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
                        <span className="text-sm">Avg Yield:</span>
                        <Badge variant="secondary" className="text-sm">
                          {property.yield ? `${property.yield.toFixed(1)}%` : 'N/A'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Base Rent:</span>
                        <span className="text-sm text-green-600 font-semibold">£{property.monthlyIncome}/mo</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        *Actual rent varies by tenant
                      </p>
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
                  {/* Negotiation history */}
                  {negotiationHistory.length > 0 && (
                    <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                      <h4 className="text-sm font-semibold flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        Negotiation
                      </h4>
                      {negotiationHistory.map((entry, i) => (
                        <div key={i} className={`text-sm flex items-center gap-2 ${entry.type === 'vendor' ? 'justify-start' : 'justify-end'}`}>
                          <Badge variant={entry.type === 'vendor' ? 'secondary' : 'default'} className="text-xs">
                            {entry.type === 'vendor' ? 'Vendor' : 'You'}
                          </Badge>
                          <span>
                            {entry.action}{entry.amount > 0 ? `: £${entry.amount.toLocaleString()}` : ''}
                          </span>
                        </div>
                      ))}
                      {isVendorThinking && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Vendor considering your offer...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Vendor accepted */}
                  {vendorResponse === 'accepted' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg border-2 border-green-500 bg-green-500/10 text-center">
                        <Check className="h-6 w-6 mx-auto mb-1 text-green-600" />
                        <p className="font-semibold">Offer Accepted!</p>
                        <p className="text-sm text-muted-foreground">
                          The vendor accepted £{offerAmount[0].toLocaleString()}
                        </p>
                      </div>
                      
                      {/* Mortgage options before completing */}
                      <div className="space-y-2">
                        {(() => {
                          // Calculate max LTV player qualifies for
                          const eligibleProviders = mortgageProviders.filter((p: any) => creditScore >= p.minCreditScore);
                          const maxQualifiedLTV = eligibleProviders.length > 0 
                            ? Math.max(...eligibleProviders.map((p: any) => p.maxLTV))
                            : 0;
                          const maxLTVPercent = Math.floor(maxQualifiedLTV * 100);
                          
                          return (
                            <>
                              {maxLTVPercent === 0 ? (
                                <div className="p-2 rounded border border-destructive/50 bg-destructive/10 text-sm text-destructive">
                                  <AlertCircle className="h-4 w-4 inline mr-1" />
                                  Credit score too low for any mortgage ({creditScore}). Cash purchase only.
                                </div>
                              ) : (
                                <>
                                  <Label>Mortgage: {mortgagePercentage[0]}% (max {maxLTVPercent}% with your credit)</Label>
                                  <Slider
                                    value={mortgagePercentage}
                                    onValueChange={setMortgagePercentage}
                                    min={0}
                                    max={maxLTVPercent}
                                    step={5}
                                  />
                                </>
                              )}
                              <p className="text-sm text-muted-foreground">
                                Cash needed: £{(offerAmount[0] * (1 - mortgagePercentage[0] / 100)).toLocaleString()}
                              </p>
                            </>
                          );
                        })()}
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
                                {mortgageProviders
                                  .filter((provider: any) => creditScore >= provider.minCreditScore && (mortgagePercentage[0] / 100) <= provider.maxLTV)
                                  .map((provider: any) => (
                                  <SelectItem key={provider.id} value={provider.id}>
                                    {provider.name} ({(provider.baseRate * 100).toFixed(1)}%)
                                  </SelectItem>
                                ))}
                                {mortgageProviders.filter((p: any) => creditScore >= p.minCreditScore && (mortgagePercentage[0] / 100) <= p.maxLTV).length === 0 && (
                                  <SelectItem value="none" disabled>No providers available for this LTV</SelectItem>
                                )}
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
                          resetNegotiation();
                          setIsOpen(false);
                        }}
                        disabled={mortgagePercentage[0] > 0 && !selectedProvider}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Complete Purchase - £{offerAmount[0].toLocaleString()}
                      </Button>
                    </div>
                  )}

                  {/* Vendor countered */}
                  {vendorResponse === 'countered' && vendorCounterAmount && !isVendorThinking && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg border-2 border-amber-500 bg-amber-500/10 text-center">
                        <p className="font-semibold">Counter-Offer Received</p>
                        <p className="text-lg font-bold">£{vendorCounterAmount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {buyNegotiationRound >= 3 ? 'Final offer - take it or leave it' : `Round ${buyNegotiationRound} of 3`}
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Your Counter: £{offerAmount[0].toLocaleString()}</Label>
                        <Slider
                          value={offerAmount}
                          onValueChange={setOfferAmount}
                          min={Math.floor(selectedBuyProperty.value * 0.85)}
                          max={vendorCounterAmount}
                          step={1000}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          variant="default"
                          onClick={() => {
                            setOfferAmount([vendorCounterAmount]);
                            setVendorResponse('accepted');
                            setNegotiationHistory(prev => [...prev, { type: 'player', amount: vendorCounterAmount, action: 'Accepted' }]);
                          }}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Accept £{vendorCounterAmount.toLocaleString()}
                        </Button>
                        {buyNegotiationRound < 3 && (
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={handleCounterVendor}
                            disabled={isVendorThinking}
                          >
                            Counter at £{offerAmount[0].toLocaleString()}
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          onClick={() => {
                            setSelectedBuyProperty(null);
                            resetNegotiation();
                          }}
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Walk Away
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Vendor rejected */}
                  {vendorResponse === 'rejected' && !isVendorThinking && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg border-2 border-destructive bg-destructive/10 text-center">
                        <X className="h-6 w-6 mx-auto mb-1 text-destructive" />
                        <p className="font-semibold">Offer Rejected</p>
                        <p className="text-sm text-muted-foreground">The vendor rejected your offer.</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            resetNegotiation();
                            setOfferAmount([selectedBuyProperty.value]);
                          }}
                        >
                          Try New Offer
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => {
                            setSelectedBuyProperty(null);
                            resetNegotiation();
                          }}
                        >
                          Walk Away
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Initial offer form - show when no negotiation is active */}
                  {!vendorResponse && !isVendorThinking && (
                    <>
                      <div className="space-y-2">
                        <Label>Offer Amount: £{offerAmount[0].toLocaleString()}</Label>
                        <Slider
                          value={offerAmount}
                          onValueChange={setOfferAmount}
                          min={Math.floor(selectedBuyProperty.value * 0.85)}
                          max={Math.floor(selectedBuyProperty.value * 1.05)}
                          step={1000}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{Math.round((offerAmount[0] / selectedBuyProperty.value) * 100)}% of market value</span>
                          <span>Market: £{selectedBuyProperty.value.toLocaleString()}</span>
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        onClick={() => submitOffer(offerAmount[0], selectedBuyProperty)}
                        disabled={isVendorThinking}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Submit Offer
                      </Button>
                    </>
                  )}
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
                        if (prop) setNewListingPrice(prop.value);
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

                  {selectedProperty && (() => {
                    const priceRatio = newListingPrice / selectedProperty.value;
                    const guidance = getPricingGuidance(priceRatio);
                    const offerRange = getExpectedOfferRange(selectedProperty.value, priceRatio);
                    return (
                      <>
                        {/* Property details */}
                        <div className="grid grid-cols-2 gap-2 text-sm bg-muted/50 rounded-lg p-3">
                          <div><span className="text-muted-foreground">Type:</span> <span className="font-medium capitalize">{selectedProperty.type}</span></div>
                          <div><span className="text-muted-foreground">Area:</span> <span className="font-medium">{selectedProperty.neighborhood}</span></div>
                          <div><span className="text-muted-foreground">Market Value:</span> <span className="font-medium">£{selectedProperty.value.toLocaleString()}</span></div>
                          <div><span className="text-muted-foreground">Rent:</span> <span className="font-medium text-green-600">£{selectedProperty.monthlyIncome}/mo</span></div>
                        </div>

                        {/* Slider-based asking price */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-baseline">
                            <Label className="text-base font-semibold">Asking Price</Label>
                            <div className="text-right">
                              <span className="text-xl font-bold">£{newListingPrice.toLocaleString()}</span>
                              <span className="text-sm text-muted-foreground ml-2">({Math.round(priceRatio * 100)}%)</span>
                            </div>
                          </div>
                          <Slider
                            value={[newListingPrice]}
                            onValueChange={(vals) => setNewListingPrice(vals[0])}
                            min={Math.floor(selectedProperty.value * 0.85)}
                            max={Math.floor(selectedProperty.value * 1.5)}
                            step={1000}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>85% (£{Math.floor(selectedProperty.value * 0.85).toLocaleString()})</span>
                            <span>150% (£{Math.floor(selectedProperty.value * 1.5).toLocaleString()})</span>
                          </div>

                          {/* Quick preset buttons */}
                          <div className="flex gap-1.5 flex-wrap">
                            {[0.90, 0.95, 1.0, 1.1, 1.2].map(mult => (
                              <Button
                                key={mult}
                                size="sm"
                                variant={Math.abs(priceRatio - mult) < 0.01 ? "default" : "outline"}
                                onClick={() => setPriceFromEstimate(mult)}
                                className="text-xs"
                              >
                                {Math.round(mult * 100)}%
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* Pricing guidance */}
                        <div className={`rounded-lg p-3 ${guidance.bg} border`}>
                          <p className={`text-sm font-medium ${guidance.color}`}>
                            {guidance.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Expected offers: £{offerRange.low.toLocaleString()} – £{offerRange.high.toLocaleString()} • {offerRange.speed}
                          </p>
                        </div>

                        <Button onClick={handleListProperty} className="w-full">
                          List Property for £{newListingPrice.toLocaleString()}
                        </Button>
                      </>
                    );
                  })()}
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
                    const askingPrice = listing.askingPrice || property.value;
                    const priceRatio = askingPrice / property.value;
                    const guidance = getPricingGuidance(priceRatio);
                    const expectedOffers = getExpectedOfferRange(property.value, priceRatio);

                    return (
                      <Card key={listing.propertyId} className="border-2">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg">{property.name}</CardTitle>
                              <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                            </div>
                            <div className="flex gap-1.5">
                              <Badge variant="secondary">{daysOnMarket}d on market</Badge>
                              <Badge variant={priceRatio > 1.1 ? 'destructive' : priceRatio < 0.95 ? 'default' : 'secondary'}>
                                {Math.round(priceRatio * 100)}% of market
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Price comparison */}
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-muted/50 rounded p-2">
                              <span className="text-muted-foreground text-xs">Market Value</span>
                              <p className="font-medium">£{property.value.toLocaleString()}</p>
                            </div>
                            <div className="bg-muted/50 rounded p-2">
                              <span className="text-muted-foreground text-xs">Asking Price</span>
                              <p className="font-bold">£{askingPrice.toLocaleString()}</p>
                            </div>
                          </div>

                          {/* Pricing guidance for this listing */}
                          <div className={`rounded p-2 text-xs ${guidance.bg} border`}>
                            <p className={`font-medium ${guidance.color}`}>{guidance.message}</p>
                            <p className="text-muted-foreground mt-0.5">
                              Expected offers: £{expectedOffers.low.toLocaleString()} – £{expectedOffers.high.toLocaleString()} • {expectedOffers.speed}
                            </p>
                          </div>
                          
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
                                <span className="font-bold">£{askingPrice.toLocaleString()}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingListing(listing.propertyId);
                                    setEditPrice(askingPrice.toString());
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
                                Offers ({offers.filter(o => o.status !== 'walkaway').length})
                              </h4>
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {offers.filter(o => o.status !== 'walkaway').map(offer => (
                                  <Card key={offer.id} className={`bg-muted/50 ${offer.status === 'accepted' ? 'border-green-500 border-2' : ''}`}>
                                    <CardContent className="p-3">
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <p className="font-semibold">{offer.buyerName}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {offer.daysOnMarket} days on market • Round {offer.negotiationRound + 1}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <Badge variant={getBadgeVariant(offer, property)}>
                                            £{offer.amount.toLocaleString()}
                                          </Badge>
                                          {offer.status === 'countered' && (
                                            <Badge variant="outline" className="ml-1 text-xs">Awaiting Response</Badge>
                                          )}
                                          {offer.status === 'buyer-countered' && (
                                            <Badge variant="secondary" className="ml-1 text-xs">Buyer Counter: £{offer.buyerCounterAmount?.toLocaleString()}</Badge>
                                          )}
                                          {offer.status === 'accepted' && (
                                            <Badge variant="default" className="ml-1 text-xs bg-green-600">Accepted!</Badge>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex gap-1 mb-2">
                                        {offer.isChainFree && (
                                          <Badge variant="secondary" className="text-xs">Chain Free</Badge>
                                        )}
                                        {offer.mortgageApproved && (
                                          <Badge variant="secondary" className="text-xs">Mortgage Approved</Badge>
                                        )}
                                        {offer.counterAmount && offer.status === 'countered' && (
                                          <Badge variant="outline" className="text-xs">Your counter: £{offer.counterAmount.toLocaleString()}</Badge>
                                        )}
                                      </div>
                                      
                                      {/* Action buttons based on offer status */}
                                      {offer.status === 'pending' && (
                                        <>
                                          {counteringOfferId === offer.id ? (
                                            <div className="space-y-2">
                                              <div className="flex gap-2">
                                                <Input
                                                  type="number"
                                                  value={counterAmount}
                                                  onChange={(e) => setCounterAmount(e.target.value)}
                                                  placeholder="Your counter offer"
                                                  className="flex-1"
                                                />
                                                <Button
                                                  size="sm"
                                                  onClick={() => {
                                                    const amount = parseInt(counterAmount);
                                                    if (!isNaN(amount) && amount > offer.amount) {
                                                      onCounterOffer(listing.propertyId, offer.id, amount);
                                                      setCounteringOfferId(null);
                                                      setCounterAmount("");
                                                    }
                                                  }}
                                                  disabled={!counterAmount || parseInt(counterAmount) <= offer.amount}
                                                >
                                                  <Check className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => {
                                                    setCounteringOfferId(null);
                                                    setCounterAmount("");
                                                  }}
                                                >
                                                  <X className="h-4 w-4" />
                                                </Button>
                                              </div>
                                              <p className="text-xs text-muted-foreground">
                                                Counter must be higher than £{offer.amount.toLocaleString()}
                                              </p>
                                            </div>
                                          ) : (
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
                                                variant="outline"
                                                onClick={() => {
                                                  setCounteringOfferId(offer.id);
                                                  setCounterAmount(Math.floor(offer.amount * 1.1).toString());
                                                }}
                                              >
                                                Counter
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => onRejectOffer(listing.propertyId, offer.id)}
                                              >
                                                <X className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          )}
                                        </>
                                      )}
                                      
                                      {offer.status === 'countered' && (
                                        <p className="text-sm text-muted-foreground text-center">
                                          ⏳ Waiting for {offer.buyerName}'s response...
                                        </p>
                                      )}
                                      
                                      {offer.status === 'buyer-countered' && offer.buyerCounterAmount && (
                                        <>
                                          {counteringOfferId === offer.id ? (
                                            <div className="space-y-2">
                                              <div className="flex gap-2">
                                                <Input
                                                  type="number"
                                                  value={counterAmount}
                                                  onChange={(e) => setCounterAmount(e.target.value)}
                                                  placeholder="Your counter offer"
                                                  className="flex-1"
                                                />
                                                <Button
                                                  size="sm"
                                                  onClick={() => {
                                                    const amount = parseInt(counterAmount);
                                                    if (!isNaN(amount) && amount > offer.buyerCounterAmount!) {
                                                      onRejectBuyerCounter(listing.propertyId, offer.id, amount);
                                                      setCounteringOfferId(null);
                                                      setCounterAmount("");
                                                    }
                                                  }}
                                                  disabled={!counterAmount || parseInt(counterAmount) <= offer.buyerCounterAmount!}
                                                >
                                                  <Check className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => {
                                                    setCounteringOfferId(null);
                                                    setCounterAmount("");
                                                  }}
                                                >
                                                  <X className="h-4 w-4" />
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex gap-2">
                                              <Button
                                                size="sm"
                                                className="flex-1"
                                                onClick={() => {
                                                  onAcceptBuyerCounter(listing.propertyId, offer.id);
                                                  onAcceptOffer(listing.propertyId, { ...offer, amount: offer.buyerCounterAmount! });
                                                  setIsOpen(false);
                                                }}
                                              >
                                                <Check className="h-4 w-4 mr-1" />
                                                Accept £{offer.buyerCounterAmount.toLocaleString()}
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                  setCounteringOfferId(offer.id);
                                                  setCounterAmount(Math.floor(((offer.buyerCounterAmount || 0) + (offer.counterAmount || 0)) / 2).toString());
                                                }}
                                                disabled={offer.negotiationRound >= 2}
                                              >
                                                {offer.negotiationRound >= 2 ? 'Max Rounds' : 'Counter'}
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => onRejectOffer(listing.propertyId, offer.id)}
                                              >
                                                <X className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          )}
                                        </>
                                      )}
                                      
                                      {offer.status === 'accepted' && (
                                        <Button
                                          size="sm"
                                          className="w-full bg-green-600 hover:bg-green-700"
                                          onClick={() => {
                                            onAcceptOffer(listing.propertyId, offer);
                                            setIsOpen(false);
                                          }}
                                        >
                                          <Check className="h-4 w-4 mr-1" />
                                          Complete Sale for £{offer.amount.toLocaleString()}
                                        </Button>
                                      )}
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

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => onReducePrice(listing.propertyId, 0.07)}
                            >
                              Reduce Price 7%
                            </Button>
                            <Button
                              variant="destructive"
                              className="flex-1"
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
                          </div>
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
