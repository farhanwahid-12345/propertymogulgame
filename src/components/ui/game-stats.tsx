import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, DollarSign, Home, AlertTriangle, Calendar, CreditCard } from "lucide-react";
import { CreditImprovementGuide } from "@/components/ui/credit-improvement-guide";
import { cn } from "@/lib/utils";

interface GameStatsProps {
  cash: number;
  netWorth: number;
  level: number;
  experience: number;
  experienceToNext: number;
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
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
  totalDebt,
  creditScore,
  ownedPropertiesCount,
  timeUntilNextMonth,
  currentMarketRate,
  tenantEvents,
  monthsPlayed
}: GameStatsProps) {
  const netMonthlyIncome = totalMonthlyIncome - totalMonthlyExpenses;
  const experienceProgress = (experience / experienceToNext) * 100;

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getCreditScoreColor = (score: number) => {
    if (score >= 750) return "text-success";
    if (score >= 650) return "text-warning";
    return "text-danger";
  };

  const recentTenantEvents = tenantEvents
    .filter(event => event.month >= monthsPlayed - 3)
    .slice(-5);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">£{netWorth.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">
            Cash: £{cash.toLocaleString()}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Cash Flow</CardTitle>
          {netMonthlyIncome >= 0 ? (
            <TrendingUp className="h-4 w-4 text-success" />
          ) : (
            <TrendingDown className="h-4 w-4 text-danger" />
          )}
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold", 
            netMonthlyIncome >= 0 ? "text-success" : "text-danger"
          )}>
            £{netMonthlyIncome.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            Income: £{totalMonthlyIncome.toLocaleString()} | 
            Expenses: £{totalMonthlyExpenses.toLocaleString()}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Portfolio & Credit</CardTitle>
          <Home className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{ownedPropertiesCount}</div>
          <div className="flex items-center gap-1">
            <p className="text-xs text-muted-foreground">
              Credit Score: <span className={getCreditScoreColor(creditScore)}>{creditScore}</span>
            </p>
            <CreditImprovementGuide
              creditScore={creditScore}
              mortgageCount={ownedPropertiesCount}
              monthsPlayed={monthsPlayed}
              totalDebt={totalDebt}
              cash={cash}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Level & Progress</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">Level {level}</div>
          <Progress value={experienceProgress} className="mt-2 h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            Next month: {formatTime(timeUntilNextMonth)}
          </p>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Market Conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Current Market Rate:</span>
              <Badge variant="outline">
                {(currentMarketRate * 100).toFixed(2)}%
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total Debt:</span>
              <span className="font-semibold">£{totalDebt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Months Played:</span>
              <span className="font-semibold">{monthsPlayed}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {recentTenantEvents.length > 0 && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Recent Tenant Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentTenantEvents.map((event, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={event.type === 'damage' ? 'destructive' : 
                              event.type === 'default' ? 'destructive' : 'secondary'}
                    >
                      {event.type === 'damage' ? 'Property Damage' :
                       event.type === 'default' ? 'Rent Default' : 'Early Exit'}
                    </Badge>
                    <span className="text-sm">Property {event.propertyId}</span>
                  </div>
                  <span className="font-semibold text-danger">
                    -£{event.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}