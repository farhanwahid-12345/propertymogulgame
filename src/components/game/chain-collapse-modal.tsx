import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link2Off, AlertTriangle } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies } from "@/lib/formatCurrency";

/**
 * Phase 3 #5 — global pop-out for chain-collapse events. Replaces the
 * easy-to-miss toast. Game auto-pauses while any event is queued.
 */
export function ChainCollapseModal() {
  const events = useGameStore((s) => s.chainCollapseEvents) || [];
  const dismissOne = useGameStore((s) => s.dismissChainCollapseEvent);
  const dismissAll = useGameStore((s) => s.dismissAllChainCollapseEvents);

  if (events.length === 0) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) dismissAll(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Link2Off className="h-5 w-5" />
            Property Chain Collapsed
          </DialogTitle>
          <DialogDescription>
            {events.length === 1
              ? "Your transaction has fallen through. Review the details below."
              : `${events.length} transactions have fallen through. Review each below.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          {events.map((e) => (
            <Card key={e.id} className="border-destructive/40">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{e.propertyName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3" />
                      {e.side === 'buying' ? 'Seller pulled out — purchase cancelled.' : 'Buyer pulled out — sale cancelled.'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => dismissOne(e.id)}>
                    Dismiss
                  </Button>
                </div>
                {e.cashReturned > 0 && (
                  <p className="text-xs text-muted-foreground">
                    £{fromPennies(e.cashReturned).toLocaleString()} held in escrow returned to cash.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {events.length > 1 && (
          <div className="flex justify-end pt-2">
            <Button onClick={() => dismissAll()}>Dismiss All</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
