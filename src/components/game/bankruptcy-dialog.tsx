import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skull } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies } from "@/lib/formatCurrency";
import { DialogErrorBoundary } from "@/components/dialog-error-boundary";

/**
 * Phase 7 #16 — End-game bankruptcy modal. Shown full-screen when isBankrupt
 * flips true. Offers a Start New Game button that resets the store.
 */
export function BankruptcyDialog() {
  const isBankrupt = useGameStore((s: any) => s.isBankrupt) as boolean;
  const summary = useGameStore((s: any) => s.bankruptcySummary) as
    | { month: number; totalDebt: number; propertiesLostCount: number; remainingCash: number }
    | null;
  const resetGame = useGameStore((s: any) => s.resetGame);

  if (!isBankrupt) return null;

  return (
    <Dialog open={true} onOpenChange={() => { /* unclosable until reset */ }}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogErrorBoundary>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400 text-2xl">
            <Skull className="h-7 w-7" />
            BANKRUPTCY
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          The court has declared you insolvent. Your portfolio has been liquidated
          to settle outstanding debts.
        </p>

        {summary && (
          <Card className="border-red-500/40 bg-red-500/5">
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bankruptcy declared</span>
                <span className="font-semibold">Month {summary.month}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total debt owed</span>
                <span className="font-semibold text-red-300">£{fromPennies(summary.totalDebt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Properties liquidated</span>
                <span className="font-semibold">{summary.propertiesLostCount}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <span className="text-muted-foreground">Remaining cash</span>
                <span className={summary.remainingCash >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  £{fromPennies(summary.remainingCash).toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-center pt-2">
          <Button size="lg" onClick={() => resetGame()}>Start New Game</Button>
        </div>
        </DialogErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
