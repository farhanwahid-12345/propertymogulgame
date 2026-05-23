import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scale, AlertTriangle } from "lucide-react";
import type { EvictionGround } from "@/types/game";

interface Props {
  propertyId: string;
  propertyName: string;
  tenantName: string;
  ground: EvictionGround;
  onAppeal: (propertyId: string) => void;
  trigger?: React.ReactNode;
}

const GROUND_LABELS: Record<EvictionGround, string> = {
  rent_arrears: "Rent Arrears",
  landlord_sale: "Landlord Sale",
  landlord_move_in: "Landlord Move-In",
  antisocial_behaviour: "Antisocial Behaviour",
};

export function EvictionAppealDialog({
  propertyId,
  propertyName,
  tenantName,
  ground,
  onAppeal,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    onAppeal(propertyId);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="text-xs border-amber-400/40 text-amber-300 hover:bg-amber-400/10">
            <Scale className="h-3 w-3 mr-1" />
            Appeal Notice
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-400" />
            Take Eviction to Tribunal
          </DialogTitle>
          <DialogDescription>
            The tenant <span className="font-semibold text-foreground">{tenantName}</span> can challenge your notice on{" "}
            <span className="font-semibold text-foreground">{propertyName}</span> at the First-tier Tribunal (Property Chamber).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Ground served</span>
              <Badge variant="outline">{GROUND_LABELS[ground]}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tribunal fee</span>
              <span className="font-semibold">£400</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Notice upheld</span>
              <span className="font-semibold text-success">60%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Notice overturned</span>
              <span className="font-semibold text-danger">40%</span>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
            <p>
              If overturned, the notice is removed and tenant satisfaction is restored.
              For <em>landlord sale</em> or <em>move-in</em> grounds, you cannot serve the same ground
              again on this property for <strong>6 months</strong>.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleConfirm}>
            Pay £400 &amp; Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
