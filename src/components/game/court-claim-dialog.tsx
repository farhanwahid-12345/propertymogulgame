import { ReactNode, useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Scale, Clock, Receipt, Percent } from "lucide-react";

interface Props {
  trigger: ReactNode;
  tenantName: string;
  arrearsPounds: number;
  onConfirm: () => void;
}

/**
 * Phase 5 #13 — in-game replacement for window.confirm county-court filing.
 */
export function CourtClaimDialog({ trigger, tenantName, arrearsPounds, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-400" />
            File a County-Court Claim
          </DialogTitle>
          <DialogDescription>
            Filing against <span className="font-semibold text-foreground">{tenantName}</span> for
            £{arrearsPounds.toLocaleString()} of unpaid rent. Arrears will be cleared off the books
            while the case is in progress.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2">
          <Card className="border-amber-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <Receipt className="h-4 w-4 text-amber-400" />
              <div className="text-sm">Filing fee: <span className="font-semibold">£325</span></div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <Clock className="h-4 w-4 text-amber-400" />
              <div className="text-sm">Resolution: <span className="font-semibold">6–12 months</span></div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30">
            <CardContent className="p-3 flex items-center gap-3">
              <Percent className="h-4 w-4 text-amber-400" />
              <div className="text-sm">Agency fee: <span className="font-semibold">25% of recovered amount</span></div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onConfirm(); setOpen(false); }}>File Claim (£325)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
