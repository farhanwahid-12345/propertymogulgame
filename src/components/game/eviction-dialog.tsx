import { useState, useMemo } from "react";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogTrigger as DialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Scale, Home, AlertTriangle, BadgePoundSterling } from "lucide-react";

export type EvictionGround = 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour' | 'lease_expiry' | 'tenant_default' | 'break_clause' | 'commercial_forfeiture' | 'commercial_arrears';

interface EvictionDialogProps {
  propertyId: string;
  propertyName: string;
  tenantName: string;
  tenantProfile?: 'premium' | 'standard' | 'budget' | 'risky';
  rentArrearsCount?: number;
  hasLongstandingASB?: boolean;
  /** Phase 3.2 #7 — commercial leases use forfeiture, not Renters' Rights grounds. */
  propertyType?: 'residential' | 'commercial' | 'luxury' | string;
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

const RESIDENTIAL_GROUNDS: GroundConfig[] = [
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

// Phase 3.2 #7 — Commercial leases fall outside the Renters' Rights Act.
// Landlords rely on the lease's forfeiture clause (peaceable re-entry after
// 21+ days of arrears) — no protected notice periods apply.
const COMMERCIAL_GROUNDS: GroundConfig[] = [
  {
    id: 'commercial_forfeiture',
    label: 'Forfeit lease (peaceable re-entry)',
    icon: BadgePoundSterling,
    noticeLabel: '0 weeks',
    description: 'Commercial tenant is 21+ days in arrears. Change the locks under the lease forfeiture clause — no Renters\' Rights Act protection.',
    warning: 'Fast but risky: roughly a 1-in-3 chance the tenant applies for relief from forfeiture and gets the lease back.',
  },
  {
    id: 'commercial_arrears',
    label: 'Court forfeiture — rent arrears',
    icon: Scale,
    noticeLabel: '1 month + court backlog',
    description: 'Two or more months of unpaid commercial rent. Serve a formal demand (1 month), then queue for a possession hearing — county court backlog is currently 2–5 months.',
    warning: 'Slower than re-entry, but a court-sanctioned possession is far harder for the tenant to overturn.',
  },
];

export function EvictionDialog({
  propertyId,
  propertyName,
  tenantName,
  tenantProfile,
  rentArrearsCount = 0,
  hasLongstandingASB = false,
  propertyType = 'residential',
  onEvict,
  trigger,
}: EvictionDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<EvictionGround | null>(null);

  const isCommercial = propertyType === 'commercial';
  const grounds = isCommercial ? COMMERCIAL_GROUNDS : RESIDENTIAL_GROUNDS;

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
      commercial_forfeiture: rentArrearsCount >= 1
        ? null
        : 'Requires the tenant to be at least 21 days (1 month) in arrears.',
      commercial_arrears: rentArrearsCount >= 2
        ? null
        : `Requires ≥2 months of unpaid commercial rent (${rentArrearsCount} so far).`,
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
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
            title={
              isCommercial
                ? 'Forfeit commercial lease — requires 21+ days arrears'
                : rentArrearsCount >= 2
                  ? '2+ months in arrears — Section 8 eviction available'
                  : 'Serve eviction notice — a valid ground is required'
            }
          >
            {isCommercial ? 'Forfeit lease' : 'Serve eviction notice'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCommercial ? 'Forfeit Commercial Lease' : 'Serve Eviction Notice'}</DialogTitle>
          <DialogDescription>
            {isCommercial ? (
              <>Commercial leases fall outside the Renters' Rights Act. Peaceable re-entry is available once the tenant is 21+ days in arrears — no protected notice period applies.</>
            ) : (
              <>Section 21 was abolished by the Renters' Rights Bill — you must select a valid ground and serve the appropriate notice period.</>
            )}
            <span className="block mt-1 text-xs">
              Tenant: <span className="font-semibold text-foreground">{tenantName}</span> at{" "}
              <span className="font-semibold text-foreground">{propertyName}</span>
              {isCommercial && (
                <Badge variant="outline" className="ml-2 text-[10px] border-amber-400/40 text-amber-300">Commercial</Badge>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {grounds.map((g) => {
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
                      <p className="text-[11px] text-amber-400 mt-1">⚠ {g.warning}</p>
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
