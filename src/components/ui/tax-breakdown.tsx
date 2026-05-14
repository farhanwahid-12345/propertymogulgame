import { Badge } from "@/components/ui/badge";
import { Building2, User, Receipt, CalendarClock } from "lucide-react";
import { calculateIncomeTax, calculateCorporationTax } from "@/lib/engine/taxation";
import type { EntityType, TaxRecord } from "@/types/game";
import { fromPennies } from "@/lib/formatCurrency";

interface Props {
  entityType: EntityType;
  /** Pennies — current tax-year accumulators from the store. */
  yearlyGrossRent: number;
  yearlyMortgageInterest: number;
  yearlyDeductibleExpenses: number;
  taxRecords: TaxRecord[];
  totalTaxPaidPennies: number;
  /** Total months elapsed in-game. Used to extrapolate a full-year projection. */
  monthsPlayed?: number;
  /** Month index of last finalised tax bill (0 if none). */
  lastCorporationTaxMonth?: number;
}

const fmt = (pennies: number) =>
  `£${Math.round(fromPennies(pennies)).toLocaleString()}`;

export function TaxBreakdown({
  entityType,
  yearlyGrossRent,
  yearlyMortgageInterest,
  yearlyDeductibleExpenses,
  taxRecords,
  totalTaxPaidPennies,
  monthsPlayed = 0,
  lastCorporationTaxMonth = 0,
}: Props) {
  const isLtd = entityType === 'ltd';

  // Year-to-date tax (what the engine would actually charge if April hit now)
  const incomeBreakdown = calculateIncomeTax(
    yearlyGrossRent,
    yearlyMortgageInterest,
    yearlyDeductibleExpenses,
  );
  const corpTax = calculateCorporationTax(
    yearlyGrossRent,
    yearlyMortgageInterest,
    yearlyDeductibleExpenses,
  );

  // Months elapsed within the current tax year (1..12). The store resets
  // accumulators in April and stores the reset month in lastCorporationTaxMonth.
  const monthsElapsed = Math.max(
    1,
    Math.min(12, monthsPlayed - lastCorporationTaxMonth),
  );
  const scale = 12 / monthsElapsed;
  const projGrossRent = Math.round(yearlyGrossRent * scale);
  const projMortgageInterest = Math.round(yearlyMortgageInterest * scale);
  const projExpenses = Math.round(yearlyDeductibleExpenses * scale);
  const projectedIncomeTax = calculateIncomeTax(
    projGrossRent,
    projMortgageInterest,
    projExpenses,
  ).effectiveTax;
  const projectedCorpTax = calculateCorporationTax(
    projGrossRent,
    projMortgageInterest,
    projExpenses,
  );

  const ytdCgt = taxRecords
    .filter(r => r.type === 'cgt')
    .reduce((s, r) => s + r.amount, 0);

  const lastBill = [...taxRecords]
    .filter(r => r.type !== 'cgt')
    .sort((a, b) => b.month - a.month)[0];

  return (
    <div className="glass rounded-2xl p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4 text-amber-300" />
          Tax — current year
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {isLtd ? <><Building2 className="h-3 w-3 mr-1" />Limited Company</> : <><User className="h-3 w-3 mr-1" />Sole Trader</>}
        </Badge>
      </div>

      {/* Income summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="glass p-2 rounded-lg">
          <div className="text-muted-foreground">Gross rent</div>
          <div className="font-semibold">{fmt(yearlyGrossRent)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {monthsElapsed} mo so far
          </div>
        </div>
        <div className="glass p-2 rounded-lg">
          <div className="text-muted-foreground">Mortgage interest</div>
          <div className="font-semibold">{fmt(yearlyMortgageInterest)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {isLtd ? "Fully deductible" : "20% credit only"}
          </div>
        </div>
        <div className="glass p-2 rounded-lg">
          <div className="text-muted-foreground">Allowable expenses</div>
          <div className="font-semibold">{fmt(yearlyDeductibleExpenses)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Incl. repair-style renos
          </div>
        </div>
        <div className="glass p-2 rounded-lg">
          <div className="text-muted-foreground">{isLtd ? "Taxable profit" : "Taxable income"}</div>
          <div className="font-semibold">
            {fmt(isLtd
              ? Math.max(0, yearlyGrossRent - yearlyMortgageInterest - yearlyDeductibleExpenses)
              : incomeBreakdown.taxableIncome)}
          </div>
        </div>
      </div>

      {/* Bands */}
      {!isLtd ? (
        <div className="space-y-1.5 text-xs">
          <div className="text-muted-foreground font-medium">Income tax bands</div>
          <BandRow label="Personal allowance (0%)" value={`up to ${fmt(incomeBreakdown.personalAllowance)}`} />
          <BandRow label="Basic rate (20%)" value={fmt(incomeBreakdown.basicBandTax)} />
          <BandRow label="Higher rate (40%)" value={fmt(incomeBreakdown.higherBandTax)} />
          <BandRow label="Additional rate (45%)" value={fmt(incomeBreakdown.additionalBandTax)} />
          <BandRow label="Section 24 credit (mortgage interest)" value={`− ${fmt(incomeBreakdown.section24Credit)}`} positive />
          <div className="border-t border-white/10 pt-1.5 mt-1.5 flex items-center justify-between font-semibold">
            <span>Year-to-date tax</span>
            <span className="text-amber-300">{fmt(incomeBreakdown.effectiveTax)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Projected at year-end (extrapolated)</span>
            <span className="text-amber-200">{fmt(projectedIncomeTax)}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 text-xs">
          <div className="text-muted-foreground font-medium">Corporation tax</div>
          <BandRow label="Small profits rate (≤ £50k profit)" value="19%" />
          <BandRow label="Marginal relief (£50k–£250k)" value="effective 19–25%" />
          <BandRow label="Main rate (≥ £250k profit)" value="25%" />
          <div className="border-t border-white/10 pt-1.5 mt-1.5 flex items-center justify-between font-semibold">
            <span>Year-to-date tax</span>
            <span className="text-amber-300">{fmt(corpTax)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Projected at year-end (extrapolated)</span>
            <span className="text-amber-200">{fmt(projectedCorpTax)}</span>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground italic">
        YTD updates each month as rent is collected — the projected figure smooths this out.
      </p>

      {/* CGT (sole trader only) */}
      {!isLtd && (
        <div className="text-xs flex items-center justify-between">
          <span className="text-muted-foreground">CGT paid year-to-date (residential @ 24%)</span>
          <span className="font-semibold">{fmt(ytdCgt)}</span>
        </div>
      )}

      {/* Schedule */}
      <div className="text-[11px] text-muted-foreground flex items-start gap-2 border-t border-white/10 pt-3">
        <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          {isLtd
            ? "Corporation tax is due 9 months and 1 day after the company year-end."
            : "Self-Assessment is due 31 January, with payments-on-account due 31 January and 31 July."}
          {' '}Lifetime tax paid: <strong className="text-foreground">{fmt(totalTaxPaidPennies)}</strong>.
        </span>
      </div>

      {/* Last bill */}
      {lastBill && (
        <div className="text-[11px] flex items-start gap-2 border-t border-white/10 pt-3">
          <Receipt className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-300" />
          <span className="text-muted-foreground">
            Last bill (month {lastBill.month}):{' '}
            <strong className="text-foreground">{fmt(lastBill.amount)}</strong>
            {lastBill.description ? <> — {lastBill.description}</> : null}
          </span>
        </div>
      )}
    </div>
  );
}

function BandRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={positive ? "text-emerald-300" : "text-foreground"}>{value}</span>
    </div>
  );
}
