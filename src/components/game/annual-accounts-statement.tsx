import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, User, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { calculateIncomeTax, calculateCorporationTax } from "@/lib/engine/taxation";
import { fromPennies } from "@/lib/formatCurrency";
import type { AnnualAccountRecord, EntityType } from "@/types/game";
import { DialogErrorBoundary } from "@/components/dialog-error-boundary";

const fmt = (pennies: number) =>
  `£${Math.round(fromPennies(pennies)).toLocaleString()}`;

interface StatementData {
  /** Display label, e.g. "Year 3 (current)" or "Year 2". */
  label: string;
  isCurrent: boolean;
  year: number;
  entityType: EntityType;
  grossRent: number;
  mortgageInterest: number;
  allowableExpenses: number;
  netProfitBeforeTax: number;
  taxPaid: number;
  cgtPaid: number;
  cashAtYearEnd: number;
  propertyValueAtYearEnd: number;
  mortgageDebtAtYearEnd: number;
  loanDebtAtYearEnd: number;
  netWorthAtYearEnd: number;
}

export function AnnualAccountsStatement() {
  const entityType = useGameStore((s) => s.entityType);
  const yearlyGrossRent = useGameStore((s) => s.yearlyGrossRent || 0);
  const yearlyMortgageInterest = useGameStore((s) => s.yearlyMortgageInterest || 0);
  const yearlyDeductibleExpenses = useGameStore((s) => s.yearlyDeductibleExpenses || 0);
  const lastCorporationTaxMonth = useGameStore((s) => s.lastCorporationTaxMonth || 0);
  const monthsPlayed = useGameStore((s) => s.monthsPlayed);
  const cash = useGameStore((s) => s.cash);
  const ownedProperties = useGameStore((s) => s.ownedProperties);
  const mortgages = useGameStore((s) => s.mortgages);
  const loans = useGameStore((s) => s.loans || []);
  const annualAccounts = useGameStore(
    (s) => (s as any).annualAccounts as AnnualAccountRecord[] | undefined,
  );

  const statements = useMemo<StatementData[]>(() => {
    const list: StatementData[] = [];

    // ── Live current-year YTD ────────────────────────────────
    const currentYear = Math.floor(monthsPlayed / 12) + 1;
    const propertyValue = ownedProperties.reduce((sum, p) => sum + (p.value || 0), 0);
    const mortgageDebt = mortgages.reduce((sum, m) => sum + (m.remainingBalance || 0), 0);
    const loanDebt = loans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0);
    const netWorth = cash + propertyValue - mortgageDebt - loanDebt;
    const ytdTax =
      entityType === 'ltd'
        ? calculateCorporationTax(yearlyGrossRent, yearlyMortgageInterest, yearlyDeductibleExpenses)
        : calculateIncomeTax(yearlyGrossRent, yearlyMortgageInterest, yearlyDeductibleExpenses).effectiveTax;

    list.push({
      label: `Year ${currentYear} (current)`,
      isCurrent: true,
      year: currentYear,
      entityType,
      grossRent: yearlyGrossRent,
      mortgageInterest: yearlyMortgageInterest,
      allowableExpenses: yearlyDeductibleExpenses,
      netProfitBeforeTax: yearlyGrossRent - yearlyMortgageInterest - yearlyDeductibleExpenses,
      taxPaid: ytdTax,
      cgtPaid: 0,
      cashAtYearEnd: cash,
      propertyValueAtYearEnd: propertyValue,
      mortgageDebtAtYearEnd: mortgageDebt,
      loanDebtAtYearEnd: loanDebt,
      netWorthAtYearEnd: netWorth,
    });

    // ── Closed years, newest first ──────────────────────────
    const closed = [...(annualAccounts || [])].sort((a, b) => b.year - a.year);
    for (const r of closed) {
      list.push({
        label: `Year ${r.year}`,
        isCurrent: false,
        year: r.year,
        entityType: r.entityType,
        grossRent: r.grossRent,
        mortgageInterest: r.mortgageInterest,
        allowableExpenses: r.allowableExpenses,
        netProfitBeforeTax: r.netProfitBeforeTax,
        taxPaid: r.taxPaid,
        cgtPaid: r.cgtPaid,
        cashAtYearEnd: r.cashAtYearEnd,
        propertyValueAtYearEnd: r.propertyValueAtYearEnd,
        mortgageDebtAtYearEnd: r.mortgageDebtAtYearEnd,
        loanDebtAtYearEnd: r.loanDebtAtYearEnd,
        netWorthAtYearEnd: r.netWorthAtYearEnd,
      });
    }

    return list;
  }, [
    entityType,
    yearlyGrossRent,
    yearlyMortgageInterest,
    yearlyDeductibleExpenses,
    monthsPlayed,
    cash,
    ownedProperties,
    mortgages,
    loans,
    annualAccounts,
  ]);

  // Default: live current year (index 0).
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, statements.length - 1);
  const stmt = statements[safeIndex];

  const monthsElapsed = stmt.isCurrent
    ? Math.max(1, Math.min(12, monthsPlayed - lastCorporationTaxMonth))
    : 12;

  const isLtd = stmt.entityType === 'ltd';

  return (
    <DialogErrorBoundary>
    <div className="glass rounded-2xl p-4 space-y-4 animate-fade-in">
      {/* Header + year selector */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-amber-300" />
          Annual Accounts
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {isLtd ? (
              <><Building2 className="h-3 w-3 mr-1" />Limited Company</>
            ) : (
              <><User className="h-3 w-3 mr-1" />Sole Trader</>
            )}
          </Badge>
          <div className="flex items-center gap-1 glass rounded-lg px-1 py-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex <= 0}
              aria-label="Newer year"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs font-medium px-1 min-w-[110px] text-center">
              {stmt.label}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setIndex(Math.min(statements.length - 1, safeIndex + 1))}
              disabled={safeIndex >= statements.length - 1}
              aria-label="Older year"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {stmt.isCurrent && (
        <p className="text-[10px] text-muted-foreground italic">
          Year-to-date figures based on {monthsElapsed} month{monthsElapsed === 1 ? '' : 's'} of trading — updates as rent is collected.
        </p>
      )}

      {isLtd ? <LtdStatements stmt={stmt} /> : <SoleTraderStatements stmt={stmt} />}
    </div>
    </DialogErrorBoundary>
  );
}

// ─────────────────────────────────────────────────────────────
// LTD: P&L + Balance Sheet
// ─────────────────────────────────────────────────────────────
function LtdStatements({ stmt }: { stmt: StatementData }) {
  const profitBeforeTax = stmt.netProfitBeforeTax;
  const profitAfterTax = profitBeforeTax - stmt.taxPaid;

  const totalAssets = stmt.propertyValueAtYearEnd + stmt.cashAtYearEnd;
  const totalCreditors = stmt.mortgageDebtAtYearEnd + stmt.loanDebtAtYearEnd;
  const netAssets = totalAssets - totalCreditors;

  return (
    <div className="space-y-4">
      <Section title="Profit & Loss">
        <Line label="Turnover (gross rent)" value={fmt(stmt.grossRent)} />
        <Line label="Less: Mortgage interest" value={`− ${fmt(stmt.mortgageInterest)}`} />
        <Line label="Less: Allowable expenses" value={`− ${fmt(stmt.allowableExpenses)}`} />
        <Total label="Profit before tax" value={fmt(profitBeforeTax)} positive={profitBeforeTax >= 0} />
        <Line label="Less: Corporation tax" value={`− ${fmt(stmt.taxPaid)}`} />
        <Total label="Profit after tax" value={fmt(profitAfterTax)} positive={profitAfterTax >= 0} highlight />
      </Section>

      <Section title="Balance Sheet">
        <SubHeading>Fixed Assets</SubHeading>
        <Line label="Investment properties (at value)" value={fmt(stmt.propertyValueAtYearEnd)} />
        <SubHeading>Current Assets</SubHeading>
        <Line label="Cash at bank" value={fmt(stmt.cashAtYearEnd)} />
        <Total label="Total Assets" value={fmt(totalAssets)} />

        <SubHeading className="pt-2">Creditors</SubHeading>
        <Line label="Mortgages" value={`(${fmt(stmt.mortgageDebtAtYearEnd)})`} />
        <Line label="Other loans" value={`(${fmt(stmt.loanDebtAtYearEnd)})`} />
        <Total label="Total Creditors" value={`(${fmt(totalCreditors)})`} />

        <Total
          label="Net Assets / Capital & Reserves"
          value={fmt(netAssets)}
          positive={netAssets >= 0}
          highlight
        />
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sole trader: Income & Expenditure + Personal Net Worth
// ─────────────────────────────────────────────────────────────
function SoleTraderStatements({ stmt }: { stmt: StatementData }) {
  // For sole traders, taxable income excludes mortgage interest (Section 24
  // turns it into a 20% tax credit rather than a deduction). We still show
  // accounting net profit so the player can see real economic profit.
  const netProfit = stmt.netProfitBeforeTax;

  const grossAssets = stmt.propertyValueAtYearEnd + stmt.cashAtYearEnd;
  const totalDebt = stmt.mortgageDebtAtYearEnd + stmt.loanDebtAtYearEnd;
  const netWorth = grossAssets - totalDebt;

  return (
    <div className="space-y-4">
      <Section title="Income & Expenditure">
        <Line label="Rental income" value={fmt(stmt.grossRent)} />
        <Line label="Less: Allowable expenses" value={`− ${fmt(stmt.allowableExpenses)}`} />
        <Line
          label="Less: Mortgage interest *"
          value={`− ${fmt(stmt.mortgageInterest)}`}
        />
        <Total label="Net profit" value={fmt(netProfit)} positive={netProfit >= 0} />
        <Line label="Income tax due" value={fmt(stmt.taxPaid)} />
        {stmt.cgtPaid > 0 && (
          <Line label="Capital Gains Tax" value={fmt(stmt.cgtPaid)} />
        )}
        <p className="text-[10px] text-muted-foreground italic pt-1">
          * Mortgage interest is not deductible against rental income for
          individual landlords — instead a 20% tax credit is applied within
          the income tax calculation (Section 24, Finance Act 2015).
        </p>
      </Section>

      <Section title="Personal Net Worth">
        <Line label="Property assets" value={fmt(stmt.propertyValueAtYearEnd)} />
        <Line label="Cash" value={fmt(stmt.cashAtYearEnd)} />
        <Line label="Less: Mortgages" value={`− ${fmt(stmt.mortgageDebtAtYearEnd)}`} />
        <Line label="Less: Other loans" value={`− ${fmt(stmt.loanDebtAtYearEnd)}`} />
        <Total label="Net worth" value={fmt(netWorth)} positive={netWorth >= 0} highlight />
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Layout primitives — match TaxBreakdown's card-section feel.
// ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-xs">
      <div className="text-muted-foreground font-medium border-b border-white/10 pb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function SubHeading({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-[11px] text-muted-foreground/80 font-medium uppercase tracking-wide ${className}`}>
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function Total({
  label,
  value,
  positive,
  highlight,
}: {
  label: string;
  value: string;
  positive?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-t border-white/10 pt-1.5 mt-1.5 font-semibold ${
        highlight ? 'text-amber-300' : ''
      }`}
    >
      <span>{label}</span>
      <span
        className={`tabular-nums ${
          highlight
            ? 'text-amber-300'
            : positive === false
              ? 'text-red-300'
              : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
