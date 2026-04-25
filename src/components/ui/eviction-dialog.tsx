import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Scale, Home, AlertTriangle, BadgePoundSterling } from "lucide-react";

export type EvictionGround = 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour';

interface EvictionDialogProps {
  propertyId: string;
  propertyName: string;
  tenantName: string;
  tenantProfile?: 'premium' | 'standard' | 'budget' | 'risky';
  rentArrearsCount?: number;
  hasLongstandingASB?: boolean;
  onEvict: (propertyId: string, ground: EvictionGround) => void;
  trigger?: React.ReactNode;
}

interface GroundConfig {
  id: EvictionGround;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  noticeLabel: string;
  description: string;
  warning?: string;
}

const GROUNDS: GroundConfig[] = [
  {
    id: 'rent_arrears',
    label: 'Rent arrears',
    icon: BadgePoundSterling,
    noticeLabel: '4 weeks',
    description: 'Tenant has missed at least 2 months of rent. Fastest mandatory ground.',
  },
  {
    id: 'antisocial_behaviour',
    label: 'Antisocial behaviour',
    icon: AlertTriangle,
    noticeLabel: '2 weeks',
    description: 'Risky tenant with an unresolved noise or safety concern over a month old.',
  },
  {
    id: 'landlord_sale',
    label: 'Landlord intends to sell',
    icon: Scale,
    noticeLabel: '4 months',
    description: 'You plan to sell this property. Always valid.',
    warning: 'Property cannot be re-let to another tenant for 12 months if you do not sell.',
  },
  {
    id: 'landlord_move_in',
    label: 'Landlord moving in',
    icon: Home,
    noticeLabel: '4 months',
    description: 'You or a close family member intends to move in. Always valid.',
    warning: 'Property is locked from being re-let for 12 months.',
  },
];

export function EvictionDialog({
  propertyId,
  propertyName,
  tenantName,
  tenantProfile,
  rentArrearsCount = 0,
  hasLongstandingASB = false,
  onEvict,
  trigger,
}: EvictionDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<EvictionGround | null>(null);

  const validity = useMemo(() => {
    return {
      rent_arrears: rentArrearsCount >= 2
        ? null
        : `Requires ≥2 missed rent payments (${rentArrearsCount} so far).`,
      antisocial_behaviour: tenantProfile === 'risky' && hasLongstandingASB
        ? null
        : 'Requires a risky tenant with an unresolved noise or safety concern over 1 month old.',
      landlord_sale: null,
      landlord_move_in: null,
    } as Record<EvictionGround, string | null>;
  }, [rentArrearsCount, hasLongstandingASB, tenantProfile]);

  const handleConfirm = () => {
    if (!selected) return;
    if (validity[selected] !== null) return;
    onEvict(propertyId, selected);
    setOpen(false);
    setSelected(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10">
            Serve eviction notice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Serve Eviction Notice</DialogTitle>
          <DialogDescription>
            Section 21 was abolished by the Renters' Rights Bill — you must select a valid ground and serve the appropriate notice period.
            <span className="block mt-1 text-xs">
              Tenant: <span className="font-semibold text-foreground">{tenantName}</span> at{" "}
              <span className="font-semibold text-foreground">{propertyName}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {GROUNDS.map((g) => {
            const invalid = validity[g.id];
            const isSelected = selected === g.id;
            const Icon = g.icon;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => !invalid && setSelected(g.id)}
                disabled={!!invalid}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted/30 hover:bg-muted/50",
                  invalid && "opacity-50 cursor-not-allowed hover:bg-muted/30",
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{g.label}</span>
                      <Badge variant="outline" className="text-[10px]">
                        Notice: {g.noticeLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                    {g.warning && !invalid && (
                      <p className="text-[11px] text-warning mt-1">⚠ {g.warning}</p>
                    )}
                    {invalid && (
                      <p className="text-[11px] text-destructive mt-1">✕ {invalid}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!selected || (selected !== null && validity[selected] !== null)}
          >
            Serve Notice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
