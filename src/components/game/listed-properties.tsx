import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PropertyOffers } from "@/components/game/property-offers";
import { useState } from "react";
import { Clock, Target, X, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  askingPrice?: number;
  offers?: PropertyOffer[];
  lastOfferCheck?: number;
  autoAcceptThreshold?: number;
}

interface ListedPropertiesProps {
  propertyListings: PropertyListing[];
  ownedProperties: Property[];
  onAcceptOffer: (property: Property, offer: any) => void;
  onSetAutoAcceptThreshold: (propertyId: string, threshold: number | undefined) => void;
  onWithdrawListing?: (propertyId: string) => void;
}

export function ListedProperties({ propertyListings, ownedProperties, onAcceptOffer, onSetAutoAcceptThreshold, onWithdrawListing }: ListedPropertiesProps) {
  const [selectedProperty, setSelectedProperty] = useState<{ property: Property; listing: PropertyListing } | null>(null);
  const [editingThreshold, setEditingThreshold] = useState<string | null>(null);
  const [thresholdValue, setThresholdValue] = useState<string>("");

  if (propertyListings.length === 0) return null;

  const handleSetThreshold = (propertyId: string) => {
    const value = parseFloat(thresholdValue);
    onSetAutoAcceptThreshold(propertyId, !isNaN(value) && value > 0 ? value : undefined);
    setEditingThreshold(null);
    setThresholdValue("");
  };

  return (
    <>
      <div className="space-y-2">
        {propertyListings.map((listing) => {
          const property = ownedProperties.find(p => p.id === listing.propertyId);
          if (!property) return null;

          const daysOnMarket = Math.floor((Date.now() - listing.listingDate) / (1000 * 60 * 60 * 24));
          const offerCount = (listing.offers || []).filter((o: any) => o.status !== 'walkaway' && o.status !== 'rejected').length;
          const isEditingThis = editingThreshold === listing.propertyId;
          const asking = listing.askingPrice || property.value;
          const market = property.value;
          const deltaPct = market > 0 ? ((asking - market) / market) * 100 : 0;
          const deltaTone =
            deltaPct > 10 ? "text-danger border-danger/30"
            : deltaPct > 3 ? "text-yellow-400 border-yellow-400/30"
            : deltaPct < -3 ? "text-success border-success/30"
            : "text-muted-foreground border-white/15";
          const deltaLabel =
            Math.abs(deltaPct) < 0.5 ? "At market"
            : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}% ${deltaPct > 0 ? "above" : "below"} market`;

          return (
            <div key={listing.propertyId} className="glass p-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h4 className="font-semibold text-foreground truncate">{property.name}</h4>
                  <span className="text-xs text-muted-foreground truncate">{property.neighborhood}</span>
                </div>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] h-5 border-white/15 text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" />
                    {listing.isAuction ? `${listing.daysUntilSale}d to auction` : `${daysOnMarket}d listed`}
                  </Badge>
                  {offerCount > 0 && (
                    <Badge className="text-[10px] h-5 bg-primary/20 text-primary border-0">
                      {offerCount} offer{offerCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn("text-[10px] h-5", deltaTone)}>
                    {deltaLabel}
                  </Badge>
                  {listing.autoAcceptThreshold ? (
                    <Badge variant="outline" className="text-[10px] h-5 text-success border-success/30">
                      <Target className="h-3 w-3 mr-1" />
                      Auto £{listing.autoAcceptThreshold.toLocaleString()}
                      <button
                        onClick={() => onSetAutoAcceptThreshold(listing.propertyId, undefined)}
                        className="ml-1 hover:text-foreground"
                        aria-label="Remove auto-accept"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : !isEditingThis ? (
                    <button
                      onClick={() => {
                        setEditingThreshold(listing.propertyId);
                        setThresholdValue(asking.toString());
                      }}
                      className="text-[10px] h-5 px-1.5 rounded border border-white/15 text-muted-foreground hover:text-foreground hover:border-white/30 inline-flex items-center"
                    >
                      <Target className="h-3 w-3 mr-1" />
                      Set auto-accept
                    </button>
                  ) : null}
                </div>
                {isEditingThis && (
                  <div className="flex items-center gap-2 mt-2">
                    <Label className="text-xs text-muted-foreground">Auto-accept at £</Label>
                    <Input
                      type="number"
                      value={thresholdValue}
                      onChange={(e) => setThresholdValue(e.target.value)}
                      className="h-7 w-28 text-xs"
                      aria-label="Auto-accept offer threshold in pounds"
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleSetThreshold(listing.propertyId)}>Set</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditingThreshold(null); setThresholdValue(""); }}>Cancel</Button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Listed</div>
                  <div className="text-lg font-bold text-foreground leading-tight">£{asking.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">Market £{market.toLocaleString()}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {offerCount > 0 && (
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedProperty({ property, listing })}
                    >
                      View {offerCount}
                    </Button>
                  )}
                  {onWithdrawListing && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                          <Ban className="h-3 w-3 mr-1" />
                          Withdraw
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Withdraw {property.name} from sale?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cancels the listing and drops all pending offers. Solicitor + estate-agent fees of <strong>£750</strong> apply
                            (or <strong>£1,500</strong> if a buyer is already in conveyancing — counts as a chain collapse).
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep listed</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onWithdrawListing(listing.propertyId)}>
                            Withdraw
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedProperty && (
        <PropertyOffers
          property={selectedProperty.property}
          isOpen={!!selectedProperty}
          onClose={() => setSelectedProperty(null)}
          onAcceptOffer={onAcceptOffer}
          daysOnMarket={Math.floor((Date.now() - selectedProperty.listing.listingDate) / (1000 * 60 * 60 * 24))}
          existingOffers={selectedProperty.listing.offers}
          askingPrice={selectedProperty.listing.askingPrice}
        />
      )}
    </>
  );
}
