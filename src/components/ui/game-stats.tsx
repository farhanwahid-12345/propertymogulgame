import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, AlertTriangle, Info, ChevronDown } from "lucide-react";
import { CreditImprovementGuide } from "@/components/ui/credit-improvement-guide";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";

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
  economicEvents?: EconomicEvent[];
  portfolioLTV?: number;
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
  monthsPlayed,
  economicEvents = [],
  portfolioLTV = 0,
}: GameStatsProps) {
  const netMonthlyIncome = totalMonthlyIncome - totalMonthlyExpenses;
  const experienceProgress = (experience / experienceToNext) * 100;
  const [showDetails, setShowDetails] = useState(false);

  // DTI calculation
  const dtiRatio = totalMonthlyIncome > 0 
    ? (totalMonthlyExpenses / totalMonthlyIncome) * 100 
    : (totalMonthlyExpenses > 0 ? 100 : 0);
  const dtiColor = dtiRatio <= 50 ? "text-success" : dtiRatio <= 79 ? "text-yellow-400" : "text-danger";
  const dtiBarColor = dtiRatio <= 50 ? "bg-success" : dtiRatio <= 79 ? "bg-yellow-400" : "bg-red-500";

  const getCreditScoreColor = (score: number) => {
    if (score >= 750) return "text-success";
    if (score >= 650) return "text-[hsl(var(--stat-credit))]";
    return "text-danger";
  };

  const recentTenantEvents = tenantEvents
    .filter(event => event.month >= monthsPlayed - 3)
    .slice(-5);

  const latestEconomicEvent = economicEvents.length > 0 ? economicEvents[economicEvents.length - 1] : null;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Latest Economic Event Banner */}
      {latestEconomicEvent && latestEconomicEvent.month >= monthsPlayed - 2 && (
        <div className={cn(
          "glass p-3 border-l-4 animate-fade-in",
          latestEconomicEvent.type === 'recession' ? "border-red-500 bg-red-500/10" :
          latestEconomicEvent.type === 'rate_cut' ? "border-green-500 bg-green-500/10" :
          latestEconomicEvent.type === 'tech_boom' ? "border-blue-500 bg-blue-500/10" :
          "border-yellow-500 bg-yellow-500/10"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm text-foreground">{latestEconomicEvent.name}</div>
              <div className="text-xs text-muted-foreground">{latestEconomicEvent.description}</div>
            </div>
            <Badge variant="outline" className="text-xs">Month {latestEconomicEvent.month}</Badge>
          </div>
        </div>
      )}

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
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Credit: <span className={getCreditScoreColor(creditScore)}>{creditScore}</span>
              </span>
              {portfolioLTV > 0 && (
                <span className={cn(
                  "text-xs font-semibold",
                  portfolioLTV > 80 ? "text-danger" :
                  portfolioLTV > 60 ? "text-yellow-400" :
                  "text-success"
                )}>
                  LTV: {portfolioLTV.toFixed(0)}%
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

          {/* Level */}
          <div className="border-l-4 border-[hsl(var(--stat-level))] pl-3">
            <div className="text-xs text-muted-foreground">⭐ Level</div>
            <div className="text-xl font-bold text-foreground">Level {level}</div>
            <Progress value={experienceProgress} className="mt-1 h-1.5" />
          </div>
        </div>
      </div>

      {/* DTI Ratio Bar */}
      {totalMonthlyExpenses > 0 && (
        <div className="glass p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">📊 Debt-to-Income (DTI)</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[250px]">
                    <p className="text-xs">DTI measures how much of your rental income goes to debt payments. Above 80% puts you at high risk if interest rates rise — one rate hike could make you cash-flow negative.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <span className={cn("text-sm font-bold", dtiColor)}>
              {Math.round(dtiRatio)}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={cn("h-full rounded-full transition-all duration-500", dtiBarColor)}
              style={{ width: `${Math.min(100, dtiRatio)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>0%</span>
            <span className="text-success">Safe</span>
            <span className="text-yellow-400">50%</span>
            <span className="text-yellow-400">Caution</span>
            <span className="text-danger">80%+</span>
          </div>
        </div>
      )}

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

            {/* Economic Events History */}
            {economicEvents.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-sm font-medium text-muted-foreground">📰 Economic Events</div>
                {economicEvents.slice(-3).reverse().map((event) => (
                  <div key={event.id} className={cn(
                    "p-2 rounded-xl text-sm",
                    event.type === 'recession' ? "bg-red-500/10" :
                    event.type === 'rate_cut' ? "bg-green-500/10" :
                    event.type === 'tech_boom' ? "bg-blue-500/10" :
                    "bg-yellow-500/10"
                  )}>
                    <div className="font-medium text-foreground">{event.name}</div>
                    <div className="text-xs text-muted-foreground">Month {event.month}</div>
                  </div>
                ))}
              </div>
            )}

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
