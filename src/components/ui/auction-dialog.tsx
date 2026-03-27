import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
export interface Property {
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
import { Gavel, PoundSterling } from "lucide-react";

interface AuctionDialogProps {
  property: Property;
  onAuction: (property: Property, reservePrice: number, guidePrice: number) => void;
}

export function AuctionDialog({ property, onAuction }: AuctionDialogProps) {
  const [open, setOpen] = useState(false);
  const [reservePrice, setReservePrice] = useState(Math.floor(property.value * 0.75));
  const [guidePrice, setGuidePrice] = useState(Math.floor(property.value * 0.85));

  const handleAuction = () => {
    onAuction(property, reservePrice, guidePrice);
    setOpen(false);
  };

  const suggestedReserve = Math.floor(property.value * 0.75);
  const suggestedGuide = Math.floor(property.value * 0.85);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-1">
          <Gavel className="h-4 w-4" />
          Auction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            List for Auction
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{property.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Current Value:</span>
                  <div className="font-semibold">£{property.value.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Monthly Income:</span>
                  <div className="font-semibold">£{property.monthlyIncome.toLocaleString()}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Location:</span>
                  <div className="font-semibold">{property.neighborhood}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div>
              <Label htmlFor="reserve-price" className="text-sm font-medium">
                Reserve Price (Minimum you'll accept)
              </Label>
              <div className="relative mt-1">
                <PoundSterling className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reserve-price"
                  type="number"
                  value={reservePrice}
                  onChange={(e) => setReservePrice(Number(e.target.value))}
                  className="pl-10"
                  min={0}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Suggested: £{suggestedReserve.toLocaleString()} (75% of value)
              </p>
            </div>

            <div>
              <Label htmlFor="guide-price" className="text-sm font-medium">
                Guide Price (Marketing price)
              </Label>
              <div className="relative mt-1">
                <PoundSterling className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="guide-price"
                  type="number"
                  value={guidePrice}
                  onChange={(e) => setGuidePrice(Number(e.target.value))}
                  className="pl-10"
                  min={0}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Suggested: £{suggestedGuide.toLocaleString()} (85% of value)
              </p>
            </div>
          </div>

          <Separator />

          <div className="bg-[hsl(var(--muted))] p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">Auction Terms</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Sale completes in 1 day</li>
              <li>• 15% auction house fees (£{Math.floor(guidePrice * 0.15).toLocaleString()})</li>
              <li>• £{(1500).toLocaleString()} solicitor fees</li>
              <li>• Reserve price is confidential to bidders</li>
              <li>• Guide price is for marketing only</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleAuction} 
              className="flex-1"
              disabled={reservePrice <= 0 || guidePrice <= 0}
            >
              List for Auction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}