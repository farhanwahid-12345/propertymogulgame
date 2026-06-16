
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info } from "lucide-react";
import { CreditImprovementGuide } from "@/components/game/credit-improvement-guide";
import { InfoTip, TIP_TEXTS } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";


interface EconomicEvent {
  id: string;
  name: string;
  description: string;
  month: number;
  type: 'rate_cut' | 'tech_boom' | 'recession' | 'grant' | 'mild_correction' | 'rate_hike' | 'rate_cut_small';
}

interface GameStatsProps {
  cash: number;
  netWorth: number;
  netWorthBreakdown?: {
    cash: number;
    propertyValue: number;
    furnitureValue: number;
    renovationWIP: number;
    conveyancingHeld: number;
    mortgageDebt: number;
    loanDebt: number;
    overdraftUsed: number;
  };
  level: number;
  experience: number;
  experienceToNext: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  expenseBreakdown: {
    mortgages: number;
    councilTax: number;
    insurance: number;
    emptyPropertiesCount: number;
  };
  totalDebt: number;
  creditScore: number;
  ownedPropertiesCount: number;
  timeUntilNextMonth: number;
  currentMarketRate: number;
  tenantEvents: Array<{
    propertyId: string;
    type: 'default' | 'damage' | 'early_exit';
    amount: number;
    month: number;
  }>;
  monthsPlayed: number;
  economicEvents?: EconomicEvent[];
  portfolioLTV?: number;
}

export function GameStats({
  cash,
  netWorth,
  netWorthBreakdown,
  level,
  experience,
  experienceToNext,
  totalMonthlyIncome,
  totalMonthlyExpenses,
  expenseBreakdown,
  totalDebt,
  creditScore,
  ownedPropertiesCount,
  currentMarketRate,
  tenantEvents,
  monthsPlayed,
  economicEvents = [],
  portfolioLTV = 0,
}: GameStatsProps) {
  const netMonthlyIncome = totalMonthlyIncome - totalMonthlyExpenses;
  const experienceProgress = (experience / experienceToNext) * 100;

  // DTI calculation
  const dtiRatio = totalMonthlyIncome > 0 
    ? (totalMonthlyExpenses / totalMonthlyIncome) * 100 
    : (totalMonthlyExpenses > 0 ? 100 : 0);
  const dtiColor = dtiRatio <= 50 ? "text-success" : dtiRatio <= 79 ? "text-yellow-400" : "text-danger";
  

  const getCreditScoreColor = (score: number) => {
    if (score >= 750) return "text-success";
    if (score >= 650) return "text-[hsl(var(--stat-credit))]";
    return "text-danger";
  };

  // Macro events are surfaced via MacroEventModal popup (item 8) — no inline banner.
  void tenantEvents;
  void currentMarketRate;
  void economicEvents;
  void monthsPlayed;

  return (
    <div className="space-y-3 animate-fade-in">

      {/* Main Stats Bar */}
      <div className="glass p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Net Worth */}
          <div className="border-l-4 border-[hsl(var(--stat-money))] pl-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">💰 Net Worth</span>
              {netWorthBreakdown && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                      <Info className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Net Worth Breakdown</h4>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Cash</span><span className="font-semibold">£{Math.round(netWorthBreakdown.cash).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Property value</span><span className="font-semibold">£{Math.round(netWorthBreakdown.propertyValue).toLocaleString()}</span></div>
                        {netWorthBreakdown.furnitureValue > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Furniture (residual)</span><span className="font-semibold">£{Math.round(netWorthBreakdown.furnitureValue).toLocaleString()}</span></div>
                        )}
                        {netWorthBreakdown.renovationWIP > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Renovation in progress</span><span className="font-semibold">£{Math.round(netWorthBreakdown.renovationWIP).toLocaleString()}</span></div>
                        )}
                        {netWorthBreakdown.conveyancingHeld > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Deposit held (in conveyancing)</span><span className="font-semibold">£{Math.round(netWorthBreakdown.conveyancingHeld).toLocaleString()}</span></div>
                        )}
                        {(netWorthBreakdown as any).conveyancingPropertyEquity > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Property (in conveyancing)</span><span className="font-semibold">£{Math.round((netWorthBreakdown as any).conveyancingPropertyEquity).toLocaleString()}</span></div>
                        )}
                        {netWorthBreakdown.mortgageDebt > 0 && (
                          <div className="flex justify-between text-danger"><span>− Mortgage debt</span><span className="font-semibold">£{Math.round(netWorthBreakdown.mortgageDebt).toLocaleString()}</span></div>
                        )}
                        {netWorthBreakdown.loanDebt > 0 && (
                          <div className="flex justify-between text-danger"><span>− Loans</span><span className="font-semibold">£{Math.round(netWorthBreakdown.loanDebt).toLocaleString()}</span></div>
                        )}
                        {netWorthBreakdown.overdraftUsed > 0 && (
                          <div className="flex justify-between text-danger"><span>− Overdraft drawn</span><span className="font-semibold">£{Math.round(netWorthBreakdown.overdraftUsed).toLocaleString()}</span></div>
                        )}
                        <div className="border-t pt-1.5 flex justify-between font-medium">
                          <span>Net Worth</span>
                          <span>£{Math.round(netWorth).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="flex items-baseline gap-4">
              <div className="text-xl lg:text-2xl font-semibold text-foreground">£{netWorth.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Cash: £{cash.toLocaleString()}</div>
            </div>
          </div>


          {/* Cash Flow */}
          <div className={cn(
            "border-l-4 pl-3",
            netMonthlyIncome >= 0 ? "border-[hsl(var(--stat-flow))]" : "border-danger"
          )}>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {netMonthlyIncome >= 0 ? "📈" : "📉"} Cash Flow
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                    <Info className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Monthly Cost Breakdown</h4>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mortgage Payments:</span>
                        <span className="font-semibold">£{expenseBreakdown.mortgages.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Council Tax ({expenseBreakdown.emptyPropertiesCount} empty):</span>
                        <span className="font-semibold">£{expenseBreakdown.councilTax.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Landlord Insurance:</span>
                        <span className="font-semibold">£{Math.round(expenseBreakdown.insurance).toLocaleString()}</span>
                      </div>
                      {(expenseBreakdown as any).loans > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Loan Payments:</span>
                          <span className="font-semibold">£{Math.round((expenseBreakdown as any).loans).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="border-t pt-1.5 flex justify-between font-medium">
                        <span>Total:</span>
                        <span>£{totalMonthlyExpenses.toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      💡 Council tax (£150/mo) only on empty properties. Insurance ~0.4%/yr of value.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-baseline gap-4">
              <div className={cn("text-3xl lg:text-4xl font-bold",
                netMonthlyIncome >= 0 ? "text-success" : "text-danger"
              )}>
                £{netMonthlyIncome.toLocaleString()}
              </div>
              <div className="text-base text-muted-foreground">
                In: £{totalMonthlyIncome.toLocaleString()} | Out: £{totalMonthlyExpenses.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Portfolio & Credit */}
          <div className="border-l-4 border-[hsl(var(--stat-credit))] pl-3">
            <div className="text-xs text-muted-foreground">🏠 Portfolio</div>
            <div className="flex items-baseline gap-4">
              <div className="text-3xl lg:text-4xl font-bold text-foreground shrink-0">
                {ownedPropertiesCount} <span className="text-sm font-normal text-muted-foreground">properties</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  Credit: <span className={getCreditScoreColor(creditScore)}>{creditScore}</span>
                  <InfoTip text={TIP_TEXTS.CREDIT_SCORE} label="About credit score" />
                </span>
                {portfolioLTV > 0 && (
                  <span className={cn(
                    "text-xs font-semibold inline-flex items-center gap-1",
                    portfolioLTV > 80 ? "text-danger" :
                    portfolioLTV > 60 ? "text-yellow-400" :
                    "text-success"
                  )}>
                    LTV: {portfolioLTV.toFixed(0)}%
                    <InfoTip text={TIP_TEXTS.LTV} label="About LTV" />
                  </span>
                )}
                {totalMonthlyExpenses > 0 && (
                  <span className={cn(
                    "text-xs font-semibold inline-flex items-center gap-1",
                    dtiColor
                  )}>
                    DTI: {Math.round(dtiRatio)}%
                    <InfoTip text={TIP_TEXTS.DTI} label="About DTI" />
                  </span>
                )}
                <CreditImprovementGuide
                  creditScore={creditScore}
                  mortgageCount={ownedPropertiesCount}
                  monthsPlayed={monthsPlayed}
                  totalDebt={totalDebt}
                  cash={cash}
                />
              </div>
            </div>
          </div>

        </div>
      </div>


    </div>
  );
}
