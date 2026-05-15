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

type LoanKind = 'personal' | 'business' | 'investor';

const KIND_META: Record<LoanKind, { label: string; blurb: string }> = {
  personal: { label: 'Personal Loan',  blurb: 'Up to £25,000 over 12–60 months. Min credit 600.' },
  business: { label: 'Business Loan',  blurb: 'Up to £150,000 over 12–84 months. Ltd company with 2+ properties.' },
  investor: { label: 'Investor Loan',  blurb: 'Friends & family money. 12–18% APR, 12–36 months. No credit check — capped by your landlord reputation.' },
};

export function LoansPanel() {
  const store = useGameStore();
  const loans = ((store as any).loans || []) as Array<any>;

  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<LoanKind>('personal');
  const [amountStr, setAmountStr] = useState("5000");
  const [termMonths, setTermMonths] = useState(36);

  const amountPounds = Math.max(0, Number(amountStr) || 0);
  const product = LOAN_PRODUCTS[kind];

  // Dynamic APR: market rate + current spread + credit penalty (investor uses fixed product spread).
  const creditPenalty = kind === 'investor'
    ? 0
    : store.creditScore >= 800 ? -0.005 : store.creditScore >= 650 ? 0 : store.creditScore >= 500 ? 0.01 : 0.02;
  const spread = kind === 'investor'
    ? product.baseSpread
    : ((store.currentLoanRates as any)?.[kind] ?? product.baseSpread);
  const rate = Math.max(0.02, store.currentMarketRate + spread + creditPenalty);

  // Dynamic cap based on rent roll, debt service & credit (investor capped by reputation instead).
  const dynamicMax = useMemo(() => {
    const rentRoll = store.ownedProperties.reduce((s, p) => s + p.monthlyIncome, 0);
    const mortgages = store.mortgages.reduce((s, m) => s + m.monthlyPayment, 0);
    const existingLoanPmts = ((store as any).loans || []).reduce((s: number, l: any) => s + (l.monthlyPayment || 0), 0);
    const netMonthly = Math.max(0, rentRoll - mortgages - existingLoanPmts);
    const creditFactor = Math.max(0.5, Math.min(1.4, store.creditScore / 700));
    const reputationFactor = Math.max(0.4, Math.min(1.5, (((store as any).landlordReputation ?? 50)) / 60));
    const creditTierMult =
      store.creditScore < 500 ? 0.4 :
      store.creditScore < 650 ? 0.7 :
      store.creditScore < 750 ? 1.0 : 1.25;
    const cap = kind === 'personal'
      ? Math.min(product.hardCapPennies * creditTierMult, netMonthly * 6) * creditFactor
      : kind === 'business'
        ? Math.min(product.hardCapPennies * creditTierMult, netMonthly * 12 * 4) * creditFactor
        : product.hardCapPennies * reputationFactor;
    return Math.max(0, Math.floor(cap));
  }, [store.ownedProperties, store.mortgages, (store as any).loans, store.creditScore, kind, product.hardCapPennies, (store as any).landlordReputation]);

  // Combined-DTI gate (skipped for investor)
  const combinedDTIInfo = useMemo(() => {
    if (kind === 'investor') return null;
    const rentRoll = store.ownedProperties.reduce((s, p) => s + p.monthlyIncome, 0);
    if (rentRoll <= 0) return null;
    const mortgages = store.mortgages.reduce((s, m) => s + m.monthlyPayment, 0);
    const existingLoanPmts = ((store as any).loans || []).reduce((s: number, l: any) => s + (l.monthlyPayment || 0), 0);
    return { rentRoll, mortgages, existingLoanPmts };
  }, [kind, store.ownedProperties, store.mortgages, (store as any).loans]);

  const monthlyRate = rate / 12;
  const estimatedMonthlyPennies = termMonths > 0 ? Math.round((toPennies(amountPounds) * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))) : 0;

  const eligibilityIssue: string | null = (() => {
    if (kind !== 'investor' && store.creditScore < product.minCreditScore) return `Credit score ${store.creditScore} below minimum ${product.minCreditScore}.`;
    if (kind === 'business') {
      if (store.entityType !== 'ltd') return 'Business loans require a Ltd company.';
      if (store.ownedProperties.length < 2) return 'Need at least 2 owned properties.';
    }
    if (kind === 'investor') {
      const minRep = (product as any).minReputation ?? 40;
      const rep = ((store as any).landlordReputation ?? 50);
      if (rep < minRep) return `Need landlord reputation ≥ ${minRep}. Yours: ${rep}.`;
    }
    if (toPennies(amountPounds) > dynamicMax) {
      return `Max £${fromPennies(dynamicMax).toLocaleString()} for your profile.`;
    }
    if (termMonths < product.minTermMonths || termMonths > product.maxTermMonths) {
      return `Term must be ${product.minTermMonths}–${product.maxTermMonths} months.`;
    }
    if (amountPounds < 500) return 'Minimum loan £500.';
    if (combinedDTIInfo && estimatedMonthlyPennies > 0) {
      const combinedDTI = (combinedDTIInfo.mortgages + combinedDTIInfo.existingLoanPmts + estimatedMonthlyPennies) / combinedDTIInfo.rentRoll;
      const dtiCap = kind === 'business' ? 0.85 : 0.75;
      if (combinedDTI > dtiCap) {
        return `Combined debt-to-income ${(combinedDTI * 100).toFixed(0)}% exceeds ${(dtiCap * 100).toFixed(0)}% cap.`;
      }
    }
    return null;
  })();

  const handleApply = () => {
    if (eligibilityIssue) return;
    (store as any).applyForLoan(kind, toPennies(amountPounds), termMonths);
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
                    <SelectItem value="investor">{KIND_META.investor.label}</SelectItem>
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
                <p className="text-xs text-muted-foreground mt-1">
                  Max for you: £{fromPennies(dynamicMax).toLocaleString()}
                </p>
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

              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><strong>{(rate * 100).toFixed(2)}% APR</strong></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly payment</span>
                  <strong>£{fromPennies(Math.max(0, estimatedMonthlyPennies)).toLocaleString()}</strong>
                </div>
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
                  {formatPounds(l.monthlyPayment)}/mo · {l.termMonths}mo term
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
