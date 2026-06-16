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
import { Badge } from "@/components/ui/badge";
import { Scale } from "lucide-react";
import { fromPennies } from "@/lib/formatCurrency";
import type { DebtRecoveryCase } from "@/types/game";

interface Props {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  caseRecord: DebtRecoveryCase;
  currentMonth: number;
  /** Optional onDismiss for auto-popup resolution variant. */
  onDismiss?: () => void;
}

const STATUS_LABEL: Record<DebtRecoveryCase['status'], string> = {
  in_court: 'In court',
  recovered: 'Fully recovered',
  partial: 'Partial recovery',
  unrecoverable: 'Unrecoverable',
};

const STATUS_TONE: Record<DebtRecoveryCase['status'], string> = {
  in_court: 'border-amber-400/40 text-amber-300 bg-amber-500/10',
  recovered: 'border-emerald-400/40 text-emerald-300 bg-emerald-500/10',
  partial: 'border-amber-400/40 text-amber-300 bg-amber-500/10',
  unrecoverable: 'border-red-500/40 text-red-300 bg-red-500/10',
};

export function CourtProgressDialog({
  trigger,
  open,
  onOpenChange,
  caseRecord,
  currentMonth,
  onDismiss,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
    if (!v && onDismiss) onDismiss();
  };

  const monthsRemaining = Math.max(0, caseRecord.resolveMonth - currentMonth);
  const grossRecovered = (caseRecord.netRecoveredPennies ?? 0) / (1 - caseRecord.recoveryFeePct || 1);
  const agencyFee = Math.max(0, grossRecovered - (caseRecord.netRecoveredPennies ?? 0));

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-400" />
            Debt Recovery Case
          </DialogTitle>
          <DialogDescription>
            {caseRecord.propertyName} — {caseRecord.tenantName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant="outline" className={STATUS_TONE[caseRecord.status]}>
              {STATUS_LABEL[caseRecord.status]}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Amount owed at filing</span>
            <span className="font-semibold">£{fromPennies(caseRecord.originalArrearsPennies).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Filed month</span>
            <span>Mo {caseRecord.filedMonth}</span>
          </div>
          {caseRecord.status === 'in_court' ? (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estimated resolution</span>
              <span>Mo {caseRecord.resolveMonth} ({monthsRemaining}mo)</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount recovered (net)</span>
                <span className="font-semibold text-emerald-300">
                  £{fromPennies(caseRecord.netRecoveredPennies ?? 0).toLocaleString()}
                </span>
              </div>
              {agencyFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Agency fee (25%)</span>
                  <span className="text-red-300">−£{fromPennies(Math.round(agencyFee)).toLocaleString()}</span>
                </div>
              )}
            </>
          )}
          {caseRecord.escalatedToHighCourtMonth && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">High Court Enforcement</span>
              <span>{caseRecord.hceResolved ? 'Resolved' : `Mo ${caseRecord.hceResolveMonth}`}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
