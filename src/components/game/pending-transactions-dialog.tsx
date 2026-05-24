import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies } from "@/lib/formatCurrency";
import type { PendingTransaction, PendingTransactionType } from "@/types/game";
import { useShallow } from "zustand/react/shallow";

const ICONS: Record<PendingTransactionType, string> = {
  insurance: "🛡️",
  council_tax: "🏛️",
  income_tax: "🧾",
  corporation_tax: "🏢",
  other: "💷",
};

const LABELS: Record<PendingTransactionType, string> = {
  insurance: "Landlord Insurance",
  council_tax: "Council Tax",
  income_tax: "Income Tax",
  corporation_tax: "Corporation Tax",
  other: "Other Debit",
};

export function PendingTransactionsDialog() {
  const { pendingTransactions, cash, overdraftLimit, overdraftUsed } = useGameStore(
    useShallow((s: any) => ({
      pendingTransactions: (s.pendingTransactions || []) as PendingTransaction[],
      cash: s.cash as number,
      overdraftLimit: s.overdraftLimit as number,
      overdraftUsed: s.overdraftUsed as number,
    })),
  );
  const approveOne = useGameStore((s: any) => s.approvePendingTransaction);
  const approveAll = useGameStore((s: any) => s.approveAllPendingTransactions);

  const open = pendingTransactions.length > 0;
  const total = pendingTransactions.reduce((s, t) => s + t.amount, 0);
  const available = cash + Math.max(0, overdraftLimit - overdraftUsed);
  const canApproveAll = total <= available;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-lg" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⏸️ Approve Pending Debits
            <Badge variant="secondary" className="text-[10px]">{pendingTransactions.length}</Badge>
          </DialogTitle>
          <DialogDescription>
            The game is paused until you approve these bills. Mortgage payments and rent still settle automatically — only tax,
            insurance and council tax now require sign-off.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {pendingTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 px-3 py-2">
              <span className="text-2xl">{ICONS[tx.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{LABELS[tx.type]}</div>
                <div className="text-xs text-muted-foreground truncate">{tx.description}</div>
              </div>
              <div className="text-sm font-bold tabular-nums">£{fromPennies(tx.amount).toLocaleString()}</div>
              <Button size="sm" variant="outline" onClick={() => approveOne(tx.id)}>
                Approve
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2">
          <span>Total: <strong className="text-foreground">£{fromPennies(total).toLocaleString()}</strong></span>
          <span>Available: £{fromPennies(available).toLocaleString()}</span>
        </div>

        <DialogFooter>
          <Button onClick={approveAll} disabled={!canApproveAll} className="w-full">
            {canApproveAll
              ? `Approve all (£${fromPennies(total).toLocaleString()})`
              : "Insufficient funds — approve individually"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
