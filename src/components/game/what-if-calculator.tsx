import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { InfoTip, TIP_TEXTS } from "@/components/ui/info-tip";
import { useGameStore } from "@/stores/gameStore";
import { calcWhatIf } from "@/lib/engine/whatIf";
import { calculateStampDuty } from "@/lib/engine/financials";
import { fromPennies, toPennies } from "@/lib/formatCurrency";

const gbp = (p: number) => `${p < 0 ? "−" : ""}£${Math.abs(Math.round(fromPennies(p))).toLocaleString()}`;

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone === "good" ? "text-success font-semibold" : tone === "bad" ? "text-destructive font-semibold" : "font-semibold"}>{value}</span>
    </div>
  );
}

function SliderField({ label, value, min, max, step, suffix, onChange, tip }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void; tip?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">{label}{tip && <InfoTip text={tip} />}</span>
        <span className="font-semibold">{value}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

export function WhatIfCalculatorButton() {
  const marketRate = useGameStore((s: any) => s.currentMarketRate ?? 5);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(120000);
  const [rent, setRent] = useState(750);
  const [ltv, setLtv] = useState(75);
  const [rate, setRate] = useState(() => Math.round((Number(marketRate) + 1.5) * 10) / 10);
  const [term, setTerm] = useState(25);
  const [fixed, setFixed] = useState(2);
  const [interestOnly, setInterestOnly] = useState(true);

  const r = useMemo(() => {
    const pricePennies = toPennies(price || 0);
    return calcWhatIf({
      pricePennies,
      monthlyRentPennies: toPennies(rent || 0),
      ltvPct: ltv, annualRatePct: rate, termYears: term, fixedYears: fixed,
      revertRatePct: rate + 3, interestOnly,
      // ~10% of rent for agent/maintenance plus 0.4%/yr insurance.
      monthlyCostsPennies: Math.round(toPennies(rent || 0) * 0.1 + pricePennies * 0.004 / 12),
      upfrontCostsPennies: calculateStampDuty(pricePennies) + toPennies(600) + Math.round(pricePennies * ltv / 100 * 0.01),
    });
  }, [price, rent, ltv, rate, term, fixed, interestOnly]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Calculator className="h-3.5 w-3.5" /> What-if
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg glass border-border bg-background/95 max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>What-if calculator</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Try out a purchase or remortgage before you commit. Nothing here changes your game.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Price (£)</span>
            <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Monthly rent (£)</span>
            <Input type="number" value={rent} onChange={(e) => setRent(Number(e.target.value))} /></label>
        </div>
        <div className="space-y-4">
          <SliderField label="LTV" tip={TIP_TEXTS.LTV} value={ltv} min={0} max={95} step={5} suffix="%" onChange={setLtv} />
          <SliderField label="Interest rate" value={rate} min={0.5} max={15} step={0.1} suffix="%" onChange={setRate} />
          <SliderField label="Term" value={term} min={5} max={35} step={1} suffix=" yrs" onChange={setTerm} />
          <SliderField label="Fixed period" value={fixed} min={1} max={10} step={1} suffix=" yrs" onChange={(v) => setFixed(Math.min(v, term))} />
          <div className="flex items-center justify-between text-sm">
            <span>Interest-only</span>
            <Switch checked={interestOnly} onCheckedChange={setInterestOnly} />
          </div>
        </div>
        <div className="rounded-xl border border-border/60 p-3">
          <Row label="Deposit" value={gbp(r.depositPennies)} />
          <Row label="Loan" value={gbp(r.loanPennies)} />
          <Row label="Monthly payment (fixed)" value={gbp(r.monthlyPaymentPennies)} />
          <Row label={`Monthly payment after fix (${(rate + 3).toFixed(1)}%)`} value={gbp(r.revertPaymentPennies)} />
          <Row label="Monthly cash flow" value={gbp(r.monthlyCashflowPennies)} tone={r.monthlyCashflowPennies >= 0 ? "good" : "bad"} />
          <Row label="Cash flow after fix" value={gbp(r.revertCashflowPennies)} tone={r.revertCashflowPennies >= 0 ? "good" : "bad"} />
          <Row label="Total interest over term" value={gbp(r.totalInterestPennies)} />
          <Row label="Yearly return on cash put in" value={`${r.cashOnCashRoiPct.toFixed(1)}%`} tone={r.cashOnCashRoiPct >= 0 ? "good" : "bad"} />
        </div>
        <p className="text-[11px] text-muted-foreground">Running costs assume 10% of rent plus insurance. Upfront costs include stamp duty, £600 solicitor and a 1% mortgage fee.</p>
      </DialogContent>
    </Dialog>
  );
}
