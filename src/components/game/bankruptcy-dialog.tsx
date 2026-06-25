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
 *
 * Updated: when bankruptcy is player-triggered via the rescue panel, the
 * summary carries a per-property breakdown (`propertiesSoldFor`) and the
 * `remainingCash` field doubles as the final net worth.
 */
export function BankruptcyDialog() {
  const isBankrupt = useGameStore((s: any) => s.isBankrupt) as boolean;
  const summary = useGameStore((s: any) => s.bankruptcySummary) as
    | {
        month: number;
        totalDebt: number;
        propertiesLostCount: number;
        remainingCash: number;
        propertiesSoldFor?: Array<{ name: string; soldFor: number; mortgagePaid: number; net: number }>;
      }
    | null;
  const resetGame = useGameStore((s: any) => s.resetGame);

  if (!isBankrupt) return null;

  const finalNetWorth = summary?.remainingCash ?? 0;
  const ended = finalNetWorth >= 0;

  return (
    <Dialog open={true} onOpenChange={() => { /* unclosable until reset */ }}>
      <DialogContent
        className="max-w-xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
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
            <>
              <Card className={`border-2 ${ended ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
                <CardContent className="p-4 space-y-1 text-center">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Final net worth</div>
                  <div className={`text-3xl font-bold tabular-nums ${ended ? 'text-emerald-300' : 'text-red-300'}`}>
                    £{fromPennies(finalNetWorth).toLocaleString()}
                  </div>
                  <div className={`text-xs ${ended ? 'text-emerald-300/80' : 'text-red-300/80'}`}>
                    {ended ? 'You ended with equity' : 'Total loss — debts exceeded liquidation proceeds'}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/40 bg-card/40">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Bankruptcy declared</span>
                    <span className="font-semibold">Month {summary.month}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total debt at filing</span>
                    <span className="font-semibold text-red-300">£{fromPennies(summary.totalDebt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Properties liquidated</span>
                    <span className="font-semibold">{summary.propertiesLostCount}</span>
                  </div>
                  {!ended && (
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <span className="text-muted-foreground">Debt unpaid (shortfall)</span>
                      <span className="font-semibold text-red-300">£{fromPennies(Math.abs(finalNetWorth)).toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {summary.propertiesSoldFor && summary.propertiesSoldFor.length > 0 && (
                <Card className="border-border/40 bg-card/40">
                  <CardContent className="p-0">
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      Liquidation breakdown
                    </div>
                    <div className="max-h-[28vh] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">Property</th>
                            <th className="text-right px-3 py-1.5 font-medium">Sold for</th>
                            <th className="text-right px-3 py-1.5 font-medium">Mortgage</th>
                            <th className="text-right px-3 py-1.5 font-medium">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.propertiesSoldFor.map((row, i) => (
                            <tr key={i} className="border-t border-border/30">
                              <td className="px-3 py-1.5 truncate max-w-[180px]">{row.name}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">£{fromPennies(row.soldFor).toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-red-300">−£{fromPennies(row.mortgagePaid).toLocaleString()}</td>
                              <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${row.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                £{fromPennies(row.net).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <div className="flex justify-center pt-2">
            <Button size="lg" onClick={() => resetGame()}>Start New Game</Button>
          </div>
        </DialogErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
