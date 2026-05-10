import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, AlertCircle } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies, formatPounds, toPennies } from "@/lib/formatCurrency";
import { LOAN_PRODUCTS } from "@/lib/engine/constants";

type LoanKind = 'personal' | 'business' | 'bridging';

const KIND_META: Record<LoanKind, { label: string; blurb: string }> = {
  personal: { label: 'Personal Loan',  blurb: 'Up to £25,000 over 12–60 months. Min credit 600.' },
  business: { label: 'Business Loan',  blurb: 'Up to £150,000 over 12–84 months. Ltd company with 2+ properties.' },
  bridging: { label: 'Bridging Loan',  blurb: 'Interest-only, secured against a property. Up to 70% LTV, 1–12 months.' },
};

export function LoansPanel() {
  const store = useGameStore();
  const loans = ((store as any).loans || []) as Array<any>;

  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<LoanKind>('personal');
  const [amountStr, setAmountStr] = useState("5000");
  const [termMonths, setTermMonths] = useState(36);
  const [collateralId, setCollateralId] = useState<string>("");

  const amountPounds = Math.max(0, Number(amountStr) || 0);
  const product = LOAN_PRODUCTS[kind];
  const rate = Math.max(0.02, store.currentMarketRate + product.rateSpread);

  const collateralProp = useMemo(
    () => store.ownedProperties.find(p => p.id === collateralId),
    [store.ownedProperties, collateralId]
  );

  const eligibilityIssue: string | null = (() => {
    if (store.creditScore < product.minCreditScore) return `Credit score ${store.creditScore} below minimum ${product.minCreditScore}.`;
    if (kind === 'business') {
      if (store.entityType !== 'ltd') return 'Business loans require a Ltd company.';
      if (store.ownedProperties.length < 2) return 'Need at least 2 owned properties.';
    }
    if (kind !== 'bridging') {
      const max = fromPennies((product as any).maxAmountPennies);
      if (amountPounds > max) return `Max £${max.toLocaleString()} for ${kind} loans.`;
    }
    if (termMonths < product.minTermMonths || termMonths > product.maxTermMonths) {
      return `Term must be ${product.minTermMonths}–${product.maxTermMonths} months.`;
    }
    if (kind === 'bridging') {
      if (!collateralProp) return 'Select a collateral property.';
      const existingDebt = store.mortgages
        .filter(m => m.propertyId === collateralProp.id)
        .reduce((s, m) => s + m.remainingBalance, 0);
      const maxBorrow = Math.floor(collateralProp.value * (product as any).maxLTV) - existingDebt;
      if (toPennies(amountPounds) > maxBorrow) {
        return `Max £${fromPennies(Math.max(0, maxBorrow)).toLocaleString()} on this property (70% LTV).`;
      }
    }
    if (amountPounds < 500) return 'Minimum loan £500.';
    return null;
  })();

  const monthlyRate = rate / 12;
  const estimatedMonthly = kind === 'bridging'
    ? Math.round(amountPounds * monthlyRate)
    : Math.round((amountPounds * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths)));

  const handleApply = () => {
    if (eligibilityIssue) return;
    (store as any).applyForLoan(kind, toPennies(amountPounds), termMonths, kind === 'bridging' ? collateralId : undefined);
    setIsOpen(false);
  };

  return (
    <Card className="bg-card/60 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-4 w-4" /> Loans
        </CardTitle>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">Apply for loan</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Apply for a loan</DialogTitle>
              <DialogDescription>{KIND_META[kind].blurb}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Loan type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as LoanKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">{KIND_META.personal.label}</SelectItem>
                    <SelectItem value="business">{KIND_META.business.label}</SelectItem>
                    <SelectItem value="bridging">{KIND_META.bridging.label}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Amount (£)</Label>
                <Input
                  type="number"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  min={500}
                  step={500}
                />
              </div>

              <div>
                <Label>Term: {termMonths} months</Label>
                <Input
                  type="number"
                  value={termMonths}
                  onChange={(e) => setTermMonths(Math.max(product.minTermMonths, Math.min(product.maxTermMonths, Number(e.target.value) || product.minTermMonths)))}
                  min={product.minTermMonths}
                  max={product.maxTermMonths}
                  step={1}
                />
              </div>

              {kind === 'bridging' && (
                <div>
                  <Label>Collateral property</Label>
                  <Select value={collateralId} onValueChange={setCollateralId}>
                    <SelectTrigger><SelectValue placeholder="Choose property…" /></SelectTrigger>
                    <SelectContent>
                      {store.ownedProperties.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — value {formatPounds(p.value)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><strong>{(rate * 100).toFixed(2)}% APR</strong></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{kind === 'bridging' ? 'Monthly interest' : 'Monthly payment'}</span>
                  <strong>£{Math.max(0, estimatedMonthly).toLocaleString()}</strong>
                </div>
                {kind === 'bridging' && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Bullet repayment at term</span><strong>£{amountPounds.toLocaleString()}</strong></div>
                )}
              </div>

              {eligibilityIssue && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{eligibilityIssue}</span>
                </div>
              )}

              <Button className="w-full" onClick={handleApply} disabled={!!eligibilityIssue}>
                {eligibilityIssue ? 'Loan would be rejected' : `Borrow £${amountPounds.toLocaleString()}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="space-y-2">
        {loans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active loans.</p>
        ) : (
          loans.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between rounded-md border border-border/50 p-2 text-sm">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">{l.kind}</Badge>
                  <span className="font-medium">{formatPounds(l.remainingBalance)}</span>
                  <span className="text-xs text-muted-foreground">@ {(l.interestRate * 100).toFixed(2)}%</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {l.kind === 'bridging' ? 'Interest-only' : `${formatPounds(l.monthlyPayment)}/mo`} · {l.termMonths}mo term
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => (store as any).settleLoan(l.id)}>
                Settle
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
