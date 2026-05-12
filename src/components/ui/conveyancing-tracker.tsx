import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
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
import { Hourglass, AlertTriangle, ShoppingCart, Tag, Ban } from "lucide-react";
import type { Conveyancing } from "@/types/game";
import { fromPennies } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";

interface ConveyancingTrackerProps {
  conveyancing: Conveyancing[];
  monthsPlayed: number;
  /** When true, render only the body (no outer glass card / heading). */
  bare?: boolean;
  /** Optional withdraw handler — only shown for selling rows. */
  onWithdraw?: (conveyancingId: string) => void;
}

export function ConveyancingTracker({ conveyancing, monthsPlayed, bare = false, onWithdraw }: ConveyancingTrackerProps) {
  if (!conveyancing || conveyancing.length === 0) {
    if (bare) {
      return (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No active conveyancing — buy or sell a property to get started.
        </p>
      );
    }
    return null;
  }

  const body = (
    <div className="space-y-3">
        {conveyancing.map((c) => {
          const totalMonths = Math.max(1, c.completionMonth - c.startMonth);
          const elapsed = Math.max(0, Math.min(totalMonths, monthsPlayed - c.startMonth));
          const progress = (elapsed / totalMonths) * 100;
          const monthsRemaining = Math.max(0, c.completionMonth - monthsPlayed);
          const isBuying = c.status === "buying";
          const escrowPounds = fromPennies(c.cashHeld || 0);

          return (
            <div key={c.id} className="glass p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isBuying ? (
                    <ShoppingCart className="h-4 w-4 text-green-400 shrink-0" />
                  ) : (
                    <Tag className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <span className="font-semibold text-sm truncate">{c.propertyName}</span>
                  <Badge
                    className={cn(
                      "text-[10px]",
                      isBuying
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                    )}
                  >
                    {isBuying ? "🟢 Buying" : "🔴 Selling"}
                  </Badge>
                  {c.isAuction && (
                    <Badge variant="outline" className="text-[10px]">Auction</Badge>
                  )}
                </div>
                <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  10%/mo chain risk
                </Badge>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {monthsRemaining === 0
                      ? "Completes this month"
                      : `Completes in ${monthsRemaining} ${monthsRemaining === 1 ? "month" : "months"}`}
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <div className="flex justify-between items-center text-xs gap-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {isBuying && c.purchasePrice !== undefined && (
                    <span className="text-muted-foreground">
                      Price: <span className="text-foreground font-medium">£{fromPennies(c.purchasePrice).toLocaleString()}</span>
                    </span>
                  )}
                  {!isBuying && c.salePrice !== undefined && (
                    <span className="text-muted-foreground">
                      Sale: <span className="text-foreground font-medium">£{fromPennies(c.salePrice).toLocaleString()}</span>
                    </span>
                  )}
                  {isBuying && escrowPounds > 0 && (
                    <span className="text-muted-foreground">
                      Escrow: <span className="text-yellow-400 font-medium">£{escrowPounds.toLocaleString()}</span>
                    </span>
                  )}
                </div>
                {!isBuying && onWithdraw && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10 -my-1"
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Pull out
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Pull {c.propertyName} out of sale?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This collapses the chain and triggers a <strong>£1,500</strong> solicitor + estate agent fee.
                          The property stays in your portfolio.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep selling</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onWithdraw(c.id)}>
                          Withdraw (£1,500)
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          );
      })}
    </div>
  );

  if (bare) return body;

  return (
    <div className="glass p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Hourglass className="h-5 w-5 text-yellow-400" />
        <h2 className="text-xl font-bold text-foreground">Conveyancing in Progress</h2>
        <Badge variant="secondary" className="text-xs">{conveyancing.length}</Badge>
      </div>
      {body}
    </div>
  );
}
