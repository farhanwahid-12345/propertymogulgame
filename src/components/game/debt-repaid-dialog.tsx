import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/stores/gameStore";
import { formatPounds } from "@/lib/formatCurrency";

export function DebtRepaidDialog() {
  const notices = useGameStore((s: any) => s.debtRepaymentNotices) as
    | Array<{ id: string; tenantName: string; propertyName: string; amountPennies: number; month: number; message?: string }>
    | undefined;

  const open = (notices?.length ?? 0) > 0;

  const dismiss = () => {
    useGameStore.setState({ debtRepaymentNotices: [] } as any);
  };

  const total = (notices ?? []).reduce((sum, n) => sum + (n.amountPennies || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">💰 Debt Repaid</DialogTitle>
          <DialogDescription>
            {notices && notices.length > 1
              ? `${notices.length} tenants have cleared their arrears this month.`
              : `A tenant has cleared their arrears.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto py-2">
          {(notices ?? []).map((n) => (
            <div key={n.id} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <strong>{n.tenantName}</strong> at <strong>{n.propertyName}</strong> has cleared their arrears —{" "}
              <span className="font-semibold text-emerald-400">{formatPounds(n.amountPennies)}</span> credited to your account.
            </div>
          ))}
        </div>

        {notices && notices.length > 1 && (
          <div className="text-sm text-foreground/80 border-t border-white/10 pt-2">
            Total credited: <span className="font-semibold text-emerald-400">{formatPounds(total)}</span>
          </div>
        )}

        <DialogFooter>
          <Button onClick={dismiss} className="w-full sm:w-auto">Nice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
