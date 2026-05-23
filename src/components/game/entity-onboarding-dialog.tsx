import { useState } from "react";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, User, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EntityType } from "@/types/game";

interface Props {
  open: boolean;
  onChoose: (type: EntityType) => void;
}

export function EntityOnboardingDialog({ open, onChoose }: Props) {
  const [picked, setPicked] = useState<EntityType | null>(null);

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            How will you trade?
          </DialogTitle>
          <DialogDescription>
            Choose your business structure. This affects how your rental income and gains are taxed in the UK. You can switch to Limited later for £1,000.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Sole Trader */}
          <button
            type="button"
            onClick={() => setPicked('sole_trader')}
            className={cn(
              "text-left glass rounded-2xl p-4 border transition-all",
              picked === 'sole_trader'
                ? "border-primary/60 ring-2 ring-primary/40"
                : "border-white/10 hover:border-white/20"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-semibold">
                <User className="h-4 w-4 text-emerald-400" />
                Sole Trader
              </div>
              <Badge variant="outline" className="text-[10px]">No setup fee</Badge>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>Income tax: 20 / 40 / 45% bands + £12,570 personal allowance</li>
              <li>Mortgage interest: <span className="text-amber-300">20% tax credit only</span> (Section 24)</li>
              <li>Capital Gains Tax on sales: 24%</li>
              <li>Self-Assessment payments-on-account (Jan & Jul)</li>
            </ul>
          </button>

          {/* LTD */}
          <button
            type="button"
            onClick={() => setPicked('ltd')}
            className={cn(
              "text-left glass rounded-2xl p-4 border transition-all",
              picked === 'ltd'
                ? "border-primary/60 ring-2 ring-primary/40"
                : "border-white/10 hover:border-white/20"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 font-semibold">
                <Building2 className="h-4 w-4 text-sky-400" />
                Limited Company
              </div>
              <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-300">£1,000 setup</Badge>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li>Corporation tax: 19% (≤£50k) → 25% (≥£250k) with marginal relief</li>
              <li>Mortgage interest: <span className="text-emerald-300">fully deductible</span></li>
              <li>No CGT — gains taxed as corporate profit</li>
              <li>Lower max LTV on commercial mortgages</li>
            </ul>
          </button>
        </div>

        <DialogFooter>
          <Button
            disabled={!picked}
            onClick={() => picked && onChoose(picked)}
            className="w-full sm:w-auto"
          >
            <Check className="h-4 w-4 mr-2" />
            Confirm {picked === 'ltd' ? 'Limited Company' : picked === 'sole_trader' ? 'Sole Trader' : 'choice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
