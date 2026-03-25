import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TrendingUp, TrendingDown, AlertTriangle, Info, ChevronDown } from "lucide-react";
import { CreditImprovementGuide } from "@/components/ui/credit-improvement-guide";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface GameStatsProps {
  cash: number;
  netWorth: number;
  level: number;
  experience: number;
  experienceToNext: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  expenseBreakdown: {
    mortgages: number;
    councilTax: number;
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
}

export function GameStats({
  cash,
  netWorth,
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
  monthsPlayed
}: GameStatsProps) {
  const netMonthlyIncome = totalMonthlyIncome - totalMonthlyExpenses;
  const experienceProgress = (experience / experienceToNext) * 100;
  const [showDetails, setShowDetails] = useState(false);

  const getCreditScoreColor = (score: number) => {
    if (score >= 750) return "text-success";
    if (score >= 650) return "text-[hsl(var(--stat-credit))]";
    return "text-danger";
  };

  const recentTenantEvents = tenantEvents
    .filter(event => event.month >= monthsPlayed - 3)
    .slice(-5);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Main Stats Bar */}
      <div className="glass p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Net Worth */}
          <div className="border-l-4 border-[hsl(var(--stat-money))] pl-3">
            <div className="text-xs text-muted-foreground">💰 Net Worth</div>
            <div className="text-xl font-bold text-foreground">£{netWorth.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Cash: £{cash.toLocaleString()}</div>
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
                      <div className="border-t pt-1.5 flex justify-between font-medium">
                        <span>Total:</span>
                        <span>£{totalMonthlyExpenses.toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      💡 Council tax (£150/mo) only on empty properties.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className={cn("text-xl font-bold",
              netMonthlyIncome >= 0 ? "text-success" : "text-danger"
            )}>
              £{netMonthlyIncome.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              In: £{totalMonthlyIncome.toLocaleString()} | Out: £{totalMonthlyExpenses.toLocaleString()}
            </div>
          </div>

          {/* Portfolio & Credit */}
          <div className="border-l-4 border-[hsl(var(--stat-credit))] pl-3">
            <div className="text-xs text-muted-foreground">🏠 Portfolio</div>
            <div className="text-xl font-bold text-foreground">
              {ownedPropertiesCount} <span className="text-sm font-normal text-muted-foreground">properties</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                Credit: <span className={getCreditScoreColor(creditScore)}>{creditScore}</span>
              </span>
              <CreditImprovementGuide
                creditScore={creditScore}
                mortgageCount={ownedPropertiesCount}
                monthsPlayed={monthsPlayed}
                totalDebt={totalDebt}
                cash={cash}
              />
            </div>
          </div>

          {/* Level */}
          <div className="border-l-4 border-[hsl(var(--stat-level))] pl-3">
            <div className="text-xs text-muted-foreground">⭐ Level</div>
            <div className="text-xl font-bold text-foreground">Level {level}</div>
            <Progress value={experienceProgress} className="mt-1 h-1.5" />
          </div>
        </div>
      </div>

      {/* Collapsible Market & Events */}
      <Collapsible open={showDetails} onOpenChange={setShowDetails}>
        <CollapsibleTrigger asChild>
          <button className="glass glass-hover w-full p-3 flex items-center justify-between text-sm cursor-pointer">
            <span className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Market: {(currentMarketRate * 100).toFixed(2)}% | Debt: £{totalDebt.toLocaleString()} | Month {monthsPlayed}
              {recentTenantEvents.length > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  {recentTenantEvents.length} events
                </Badge>
              )}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showDetails && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="glass mt-2 p-4 space-y-3">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Market Rate:</span>
                <div className="font-semibold">{(currentMarketRate * 100).toFixed(2)}%</div>
              </div>
              <div>
                <span className="text-muted-foreground">Total Debt:</span>
                <div className="font-semibold">£{totalDebt.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Months Played:</span>
                <div className="font-semibold">{monthsPlayed}</div>
              </div>
            </div>

            {recentTenantEvents.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--stat-credit))]" />
                  Recent Tenant Events
                </div>
                {recentTenantEvents.map((event, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-xl text-sm">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={event.type === 'damage' || event.type === 'default' ? 'destructive' : 'secondary'}
                      >
                        {event.type === 'damage' ? 'Property Damage' :
                         event.type === 'default' ? 'Rent Default' : 'Early Exit'}
                      </Badge>
                      <span>Property {event.propertyId}</span>
                    </div>
                    <span className="font-semibold text-danger">-£{event.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
