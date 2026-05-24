import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Building2, AlertCircle } from "lucide-react";
import { fromPennies } from "@/lib/formatCurrency";
import { computeErcRate, ERC_PERCENT, ERC_WINDOW_MONTHS } from "@/lib/engine/constants";
import type { Mortgage } from "@/types/game";

interface PortfolioMortgageDetailsProps {
  /** Active mortgages (raw, in pennies). */
  mortgages: Mortgage[];
  ownedProperties: Array<{ id: string; name: string; value: number }>;
  mortgageProviders: Array<{ id: string; name: string }>;
  monthsPlayed: number;
}

/**
 * Phase 4 #17 — surfaces every active portfolio facility with the same
 * granularity the per-property mortgage card shows (rate, term, balance,
 * monthly payment, ERC, included properties).
 */
export function PortfolioMortgageDetails({
  mortgages,
  ownedProperties,
  mortgageProviders,
  monthsPlayed,
}: PortfolioMortgageDetailsProps) {
  const portfolioMortgages = mortgages.filter(
    m => m.collateralPropertyIds && m.collateralPropertyIds.length > 1,
  );

  if (portfolioMortgages.length === 0) return null;

  const propsById = new Map(ownedProperties.map(p => [p.id, p]));
  const providerById = new Map(mortgageProviders.map(p => [p.id, p]));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-purple-400" />
        Active Portfolio Facilities ({portfolioMortgages.length})
      </h3>
      {portfolioMortgages.map(m => {
        const provider = providerById.get(m.providerId);
        const monthsIntoTerm = m.startMonth !== undefined ? monthsPlayed - m.startMonth : 0;
        const ercRate = m.fixedTermYears
          ? computeErcRate(m.fixedTermYears, monthsIntoTerm)
          : (monthsIntoTerm < ERC_WINDOW_MONTHS ? ERC_PERCENT : 0);
        const ercAmount = Math.round(m.remainingBalance * ercRate);
        const collateral = (m.collateralPropertyIds || [])
          .map(id => propsById.get(id))
          .filter((p): p is { id: string; name: string; value: number } => !!p);
        const totalCollateralValue = collateral.reduce((s, p) => s + p.value, 0);
        const ltv = totalCollateralValue > 0
          ? (m.remainingBalance / totalCollateralValue) * 100
          : 0;
        const ltvBand = ltv >= 80 ? 'text-red-400' : ltv >= 70 ? 'text-amber-400' : 'text-emerald-400';

        return (
          <Card key={m.id} className="bg-purple-500/5 border-purple-500/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-purple-300">
                    🏦 {provider?.name || 'Portfolio Lender'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.mortgageType === 'interest-only' ? 'Interest-only' : 'Repayment'} ·
                    {' '}{m.termYears}y term
                    {m.fixedTermYears ? ` · ${m.fixedTermYears}y fix` : ' · SVR / tracker'}
                    {m.revertedToSVR ? ' (reverted)' : ''}
                  </p>
                </div>
                <Badge variant="outline" className="bg-purple-500/10 border-purple-500/40 text-purple-300">
                  {collateral.length} properties
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Balance</span>
                  <p className="font-bold">£{fromPennies(m.remainingBalance).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Monthly payment</span>
                  <p className="font-bold text-purple-400">£{fromPennies(m.monthlyPayment).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Rate</span>
                  <p className="font-medium">
                    {(m.interestRate * 100).toFixed(2)}%
                    {m.fixedRate && !m.revertedToSVR ? ` (fixed)` : ''}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Portfolio LTV</span>
                  <p className={`font-medium ${ltvBand}`}>{ltv.toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Collateral value</span>
                  <p className="font-medium">£{fromPennies(totalCollateralValue).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">ERC (if settled today)</span>
                  <p className={`font-medium ${ercAmount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {ercAmount > 0
                      ? `£${fromPennies(ercAmount).toLocaleString()} (${(ercRate * 100).toFixed(1)}%)`
                      : 'None'}
                  </p>
                </div>
              </div>

              <div className="border-t border-white/10 pt-2 space-y-1">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Included properties
                </p>
                <ul className="text-[11px] space-y-0.5">
                  {collateral.map(p => (
                    <li key={p.id} className="flex justify-between">
                      <span className="truncate">{p.name}</span>
                      <span className="text-muted-foreground">£{fromPennies(p.value).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                {collateral.length === 0 && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    No matching properties — collateral redeemed or sold.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
