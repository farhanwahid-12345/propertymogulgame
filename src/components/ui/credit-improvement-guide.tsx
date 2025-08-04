import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendingUp, CreditCard, Home, Calendar, DollarSign, Info } from "lucide-react";

interface CreditImprovementGuideProps {
  creditScore: number;
  mortgageCount: number;
  monthsPlayed: number;
  totalDebt: number;
  cash: number;
}

export function CreditImprovementGuide({ 
  creditScore, 
  mortgageCount, 
  monthsPlayed, 
  totalDebt, 
  cash 
}: CreditImprovementGuideProps) {
  const getCreditRating = (score: number) => {
    if (score >= 800) return { rating: "Excellent", color: "text-success", description: "Access to best rates" };
    if (score >= 750) return { rating: "Very Good", color: "text-success", description: "Great mortgage deals" };
    if (score >= 700) return { rating: "Good", color: "text-primary", description: "Good lending options" };
    if (score >= 650) return { rating: "Fair", color: "text-warning", description: "Limited options" };
    if (score >= 600) return { rating: "Poor", color: "text-danger", description: "High interest rates" };
    return { rating: "Very Poor", color: "text-danger", description: "Very limited lending" };
  };

  const creditInfo = getCreditRating(creditScore);
  const scoreProgress = (creditScore / 850) * 100;

  const improvements = [
    {
      action: "Make Monthly Payments",
      impact: "+1 point per month",
      description: "Consistent mortgage payments improve your credit",
      icon: Calendar,
      active: mortgageCount > 0
    },
    {
      action: "Pay Off Mortgages",
      impact: "+15 points per payoff",
      description: "Clearing debt significantly boosts your score",
      icon: Home,
      active: totalDebt > 0
    },
    {
      action: "Reduce Debt-to-Income",
      impact: "Better lending terms",
      description: "Lower debt relative to rental income",
      icon: DollarSign,
      active: totalDebt > cash * 0.5
    },
    {
      action: "Build Property Portfolio",
      impact: "Increased creditworthiness",
      description: "More assets improve your financial profile",
      icon: TrendingUp,
      active: true
    }
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-1">
          <Info className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Credit Score Guide
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Current Score */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Credit Score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold">{creditScore}</div>
                  <Badge className={creditInfo.color}>{creditInfo.rating}</Badge>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Max: 850</div>
                  <div className="text-sm">{creditInfo.description}</div>
                </div>
              </div>
              <Progress value={scoreProgress} className="h-3" />
            </CardContent>
          </Card>

          {/* How to Improve */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How to Improve Your Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {improvements.map((improvement, index) => {
                  const Icon = improvement.icon;
                  return (
                    <div 
                      key={index}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        improvement.active ? 'bg-primary/5 border-primary/20' : 'bg-muted/50'
                      }`}
                    >
                      <Icon className={`h-5 w-5 mt-0.5 ${
                        improvement.active ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{improvement.action}</h4>
                          <Badge variant="outline" className="text-xs">
                            {improvement.impact}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {improvement.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Credit Score Ranges */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Credit Score Ranges</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { range: "800-850", rating: "Excellent", benefits: "Best rates, premium lenders" },
                  { range: "750-799", rating: "Very Good", benefits: "Great rates, wide choice" },
                  { range: "700-749", rating: "Good", benefits: "Good rates, most lenders" },
                  { range: "650-699", rating: "Fair", benefits: "Standard rates, some lenders" },
                  { range: "600-649", rating: "Poor", benefits: "High rates, limited choice" },
                  { range: "Below 600", rating: "Very Poor", benefits: "Very high rates, specialist lenders only" },
                ].map((tier, index) => (
                  <div 
                    key={index}
                    className={`flex items-center justify-between p-2 rounded ${
                      creditScore >= parseInt(tier.range.split('-')[0]) ? 'bg-primary/10' : 'bg-muted/30'
                    }`}
                  >
                    <div>
                      <span className="font-medium">{tier.range}</span>
                      <span className="ml-2 text-sm text-muted-foreground">({tier.rating})</span>
                    </div>
                    <span className="text-xs">{tier.benefits}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2">Pro Tips</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Credit scores improve gradually - be patient with monthly payments</li>
              <li>• Paying off mortgages gives the biggest score boost</li>
              <li>• Higher scores unlock better mortgage rates and higher LTV ratios</li>
              <li>• Your score affects which lenders will approve your applications</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}