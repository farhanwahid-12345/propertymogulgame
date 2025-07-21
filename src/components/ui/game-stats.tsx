import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DollarSign, Home, TrendingUp, Trophy, Target } from "lucide-react";

interface GameStatsProps {
  cash: number;
  netWorth: number;
  totalProperties: number;
  monthlyIncome: number;
  level: number;
  experience: number;
  experienceToNext: number;
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
  level, 
  experience, 
  experienceToNext 
}: GameStatsProps) {
  const progressPercent = (experience / experienceToNext) * 100;
  const currentTitle = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] || "Property Tycoon";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <Card className="bg-gradient-wealth">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-secondary-foreground">Cash</CardTitle>
          <DollarSign className="h-4 w-4 text-secondary-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-secondary-foreground">
            ${cash.toLocaleString()}
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
            ${netWorth.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            Total portfolio value
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Properties</CardTitle>
          <Home className="h-4 w-4 text-property-residential" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalProperties}
          </div>
          <p className="text-xs text-muted-foreground">
            ${monthlyIncome.toLocaleString()}/mo income
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
        </CardContent>
      </Card>
    </div>
  );
}