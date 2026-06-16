import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies } from "@/lib/formatCurrency";

/**
 * Phase 7 #16 — Offered when the player is heading into financial distress
 * without an overdraft facility but is still credit-eligible. Fires once per
 * distress episode.
 */
export function OverdraftPromptDialog() {
  const prompt = useGameStore((s: any) => s.pendingOverdraftPrompt) as { eligibleLimit: number; month: number } | null;
  const accept = useGameStore((s: any) => s.acceptOverdraftPrompt);
  const dismiss = useGameStore((s: any) => s.dismissOverdraftPrompt);
  const creditScore = useGameStore((s: any) => s.creditScore) as number;

  if (!prompt) return null;

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <Wallet className="h-5 w-5" />
            Cash running low
          </DialogTitle>
          <DialogDescription>
            Your bank has noticed your account is approaching zero. You're eligible
            for an overdraft facility based on your credit score.
          </DialogDescription>
        </DialogHeader>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Credit score</span>
              <span className="font-semibold">{creditScore}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Eligible limit</span>
              <span className="font-semibold text-emerald-300">£{fromPennies(prompt.eligibleLimit).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Interest</span>
              <span>~2.4% APR on used balance</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={dismiss}>No thanks</Button>
          <Button onClick={accept}>Accept overdraft</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
