import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Hourglass, AlertTriangle, ShoppingCart, Tag } from "lucide-react";
import type { Conveyancing } from "@/types/game";
import { fromPennies } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";

interface ConveyancingTrackerProps {
  conveyancing: Conveyancing[];
  monthsPlayed: number;
}

export function ConveyancingTracker({ conveyancing, monthsPlayed }: ConveyancingTrackerProps) {
  if (!conveyancing || conveyancing.length === 0) return null;

  return (
    <div className="glass p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Hourglass className="h-5 w-5 text-yellow-400" />
        <h2 className="text-xl font-bold text-foreground">Conveyancing in Progress</h2>
        <Badge variant="secondary" className="text-xs">{conveyancing.length}</Badge>
      </div>

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

              <div className="flex justify-between text-xs">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
