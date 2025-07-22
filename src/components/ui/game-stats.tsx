import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DollarSign, Home, TrendingUp, TrendingDown, Trophy, Target, AlertTriangle, Wallet } from "lucide-react";

interface GameStatsProps {
  cash: number;
  netWorth: number;
  totalProperties: number;
  monthlyIncome: number;
  totalMonthlyExpenses: number;
  totalDebt: number;
  level: number;
  experience: number;
  experienceToNext: number;
  monthsPlayed: number;
  isBankrupt: boolean;
  onReset: () => void;
}

const LEVEL_TITLES = [
  "Rookie Investor",
  "Property Enthusiast", 
  "Real Estate Agent",
  "Portfolio Manager",
  "Property Developer",
  "Investment Guru",
  "Real Estate Mogul",
  "Property Tycoon",
  "Empire Builder",
  "Legendary Mogul"
];

export function GameStats({ 
  cash, 
  netWorth, 
  totalProperties, 
  monthlyIncome, 
  totalMonthlyExpenses,
  totalDebt,
  level, 
  experience, 
  experienceToNext,
  monthsPlayed,
  isBankrupt,
  onReset
}: GameStatsProps) {
  const progressPercent = (experience / experienceToNext) * 100;
  const currentTitle = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] || "Property Tycoon";
  const netMonthlyIncome = monthlyIncome - totalMonthlyExpenses;

  return (
    <div className="space-y-6">
      {isBankrupt && (
        <Card className="bg-destructive/10 border-destructive/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">BANKRUPT</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Your expenses exceed your income. You cannot purchase new properties.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className={`${isBankrupt ? 'bg-destructive/10' : 'bg-gradient-wealth'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={`text-sm font-medium ${isBankrupt ? 'text-destructive' : 'text-secondary-foreground'}`}>Cash</CardTitle>
            <Wallet className={`h-4 w-4 ${isBankrupt ? 'text-destructive' : 'text-secondary-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isBankrupt ? 'text-destructive' : 'text-secondary-foreground'}`}>
              £{cash.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              £{netWorth.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Total portfolio value
            </p>
          </CardContent>
        </Card>

        <Card className={`${netMonthlyIncome >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Income</CardTitle>
            <DollarSign className={`h-4 w-4 ${netMonthlyIncome >= 0 ? 'text-green-600' : 'text-red-600'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netMonthlyIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              £{netMonthlyIncome.toLocaleString()}/mo
            </div>
            <p className="text-xs text-muted-foreground">
              After all expenses
            </p>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debt</CardTitle>
            <TrendingDown className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              £{totalDebt.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Mortgage balances
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary-foreground">Level</CardTitle>
            <Trophy className="h-4 w-4 text-primary-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-primary-foreground">
                {level}
              </div>
              <Badge variant="secondary" className="text-xs">
                {currentTitle}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-primary-foreground/80">
                <span>XP: {experience}</span>
                <span>Next: {experienceToNext}</span>
              </div>
              <Progress 
                value={progressPercent} 
                className="h-2 bg-primary-foreground/20"
              />
            </div>
            <div className="text-xs text-primary-foreground/80">
              {monthsPlayed} months played
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Monthly Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rental Income:</span>
                <span className="text-green-600 font-semibold">+£{monthlyIncome.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Expenses:</span>
                <span className="text-red-600 font-semibold">-£{totalMonthlyExpenses.toLocaleString()}</span>
              </div>
              <hr />
              <div className="flex justify-between font-bold">
                <span>Net Monthly Income:</span>
                <span className={netMonthlyIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {netMonthlyIncome >= 0 ? '+' : ''}£{netMonthlyIncome.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Portfolio Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Properties Owned:</span>
                <span className="font-semibold">{totalProperties}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Average Yield:</span>
                <span className="font-semibold">
                  {totalProperties > 0 ? ((monthlyIncome * 12 / (netWorth + totalDebt)) * 100).toFixed(2) : '0'}%
                </span>
              </div>
            </div>
            <Button 
              onClick={onReset}
              variant="outline" 
              size="sm" 
              className="w-full mt-4"
            >
              Reset Game
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}