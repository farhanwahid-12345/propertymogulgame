import { useState } from "react";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogTrigger as DialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sofa, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies } from "@/lib/formatCurrency";
import { getFurnishingRentMultiplier, getConditionRentMultiplierShared } from "@/lib/tenantRent";

interface Props {
  propertyId: string;
  propertyName: string;
  internalSqft?: number;
  currentTier?: 'unfurnished' | 'part_furnished' | 'fully_furnished';
  monthsRemaining?: number;
  hasTenant: boolean;
  /** Canonical pre-multiplier rent (pounds). Used to preview each tier's advertised rent. */
  baseRent?: number;
  /** Property condition — affects displayed advertised rent. */
  condition?: 'standard' | 'premium' | 'dilapidated';
}

interface Props {
  propertyId: string;
  propertyName: string;
  internalSqft?: number;
  currentTier?: 'unfurnished' | 'part_furnished' | 'fully_furnished';
  monthsRemaining?: number;
  hasTenant: boolean;
}

const TIERS = [
  { id: 'unfurnished',     label: 'Unfurnished',     emoji: '🪑', costPerSqft: 0,  rentBoost: '0%',  blurb: 'Broadest tenant pool. No furniture risk.' },
  { id: 'part_furnished',  label: 'Part Furnished',  emoji: '🛏️', costPerSqft: 8,  rentBoost: '+5%', blurb: 'White goods + soft furnishings. Mild premium.' },
  { id: 'fully_furnished', label: 'Fully Furnished', emoji: '🛋️', costPerSqft: 18, rentBoost: '+12%',blurb: 'Premium fit-out. Attracts higher-end tenants.' },
] as const;

export function FurnishingDialog({ propertyId, propertyName, internalSqft = 800, currentTier = 'unfurnished', monthsRemaining, hasTenant }: Props) {
  const [open, setOpen] = useState(false);
  const cashPounds = useGameStore(s => Math.floor(s.cash / 100));
  const furnishProperty = useGameStore(s => (s as any).furnishProperty);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Sofa className="h-3.5 w-3.5" />
          {currentTier === 'unfurnished' ? 'Furnish' : 'Refurbish'}
          {currentTier !== 'unfurnished' && (
            <Badge variant="outline" className="ml-1 text-[9px] py-0 capitalize">
              {currentTier.replace('_', ' ')}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Furnish {propertyName}</DialogTitle>
          <DialogDescription>
            {hasTenant
              ? "You can't refit while occupied. Wait for the tenancy to end."
              : `Pick a tier. Cost scales with floor area (${internalSqft.toLocaleString()} sqft). Furnishings depreciate after 60 months.`}
            {currentTier !== 'unfurnished' && typeof monthsRemaining === 'number' && (
              <span className="block mt-1 text-amber-300 text-xs">
                Current: {currentTier.replace('_', ' ')} — {monthsRemaining} months until depreciation.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TIERS.map(t => {
            const cost = Math.round(t.costPerSqft * internalSqft);
            const isCurrent = currentTier === t.id;
            const canAfford = cashPounds >= cost;
            return (
              <button
                key={t.id}
                type="button"
                disabled={hasTenant || isCurrent || !canAfford}
                onClick={() => { furnishProperty(propertyId, t.id); setOpen(false); }}
                className={cn(
                  "text-left glass rounded-2xl p-3 border transition-all",
                  isCurrent ? "border-emerald-400/60 ring-2 ring-emerald-400/30" : "border-white/10 hover:border-white/20",
                  (hasTenant || (!canAfford && !isCurrent)) && "opacity-50 cursor-not-allowed",
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-sm">
                    <span>{t.emoji}</span>{t.label}
                  </div>
                  {isCurrent && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </div>
                <div className="text-[11px] text-muted-foreground mb-2">{t.blurb}</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-300 font-medium">Rent {t.rentBoost}</span>
                  <span className={cn("font-semibold", canAfford ? "text-foreground" : "text-red-400")}>
                    {cost > 0 ? `£${cost.toLocaleString()}` : 'Free'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
