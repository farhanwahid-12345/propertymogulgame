import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PartyPopper, Banknote, Home } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies } from "@/lib/formatCurrency";
import type { PayoffEvent } from "@/types/game";

/**
 * v3 #4 — pop-up acknowledgement when a mortgage or loan reaches zero balance.
 * Replaces the easy-to-miss toast so the player can't miss the milestone.
 */
export function PayoffEventsModal() {
  const events = (useGameStore((s: any) => s.payoffEvents) || []) as PayoffEvent[];
  const dismissOne = useGameStore((s: any) => s.dismissPayoffEvent);
  const dismissAll = useGameStore((s: any) => s.dismissAllPayoffEvents);

  if (!events || events.length === 0) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) dismissAll(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <PartyPopper className="h-5 w-5" />
            Debt Paid Off
          </DialogTitle>
          <DialogDescription>
            {events.length === 1
              ? "Congratulations — a balance has reached zero."
              : `${events.length} debts have been fully repaid.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          {events.map((e) => {
            const Icon = e.kind === "mortgage" ? Home : Banknote;
            return (
              <Card key={e.id} className="border-emerald-500/40">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Icon className="h-5 w-5 text-emerald-400 mt-0.5" />
                    <div>
                      <p className="font-semibold capitalize">
                        {e.kind === "mortgage" ? "Mortgage paid off" : `${e.label} loan paid off`}
                      </p>
                      {e.kind === "mortgage" && (
                        <p className="text-xs text-muted-foreground mt-0.5">{e.label}</p>
                      )}
                      {typeof e.amountPennies === "number" && e.amountPennies > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Final payment: £{fromPennies(e.amountPennies).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => dismissOne(e.id)}>
                    OK
                  </Button>
                </CardContent>
              </Card>
            );
          })}
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
