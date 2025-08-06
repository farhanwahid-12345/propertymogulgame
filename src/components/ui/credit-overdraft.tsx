import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { CreditCard, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CreditOverdraftProps {
  creditScore: number;
  overdraftLimit: number;
  overdraftUsed: number;
  cash: number;
  setCash: (cash: number) => void;
  setOverdraftUsed: (used: number) => void;
  onApplyOverdraft: (requestedLimit: number) => void;
  monthlyIncome: number;
  totalMortgagePayments: number;
}

export function CreditOverdraft({ 
  creditScore, 
  overdraftLimit, 
  overdraftUsed, 
  cash, 
  setCash, 
  setOverdraftUsed, 
  onApplyOverdraft,
  monthlyIncome,
  totalMortgagePayments
}: CreditOverdraftProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [requestedLimit, setRequestedLimit] = useState<number[]>([0]);
  const [withdrawAmount, setWithdrawAmount] = useState<number[]>([0]);
  const [repayAmount, setRepayAmount] = useState<number[]>([0]);

  const availableOverdraft = overdraftLimit - overdraftUsed;
  const monthlyInterest = overdraftUsed * 0.002; // 2.4% annual rate
  
  const getCreditRating = (score: number) => {
    if (score >= 850) return { rating: 'Excellent', color: 'green', description: 'Exceptional credit standing' };
    if (score >= 700) return { rating: 'Good', color: 'blue', description: 'Above average credit' };
    if (score >= 580) return { rating: 'Fair', color: 'yellow', description: 'Some credit concerns' };
    if (score >= 500) return { rating: 'Poor', color: 'orange', description: 'Significant credit issues' };
    return { rating: 'Very Poor', color: 'red', description: 'Severe credit problems' };
  };

  const getMaxOverdraftEligible = () => {
    if (creditScore >= 700) return monthlyIncome * 2;
    if (creditScore >= 580) return monthlyIncome * 1.5;
    if (creditScore >= 500) return monthlyIncome;
    return monthlyIncome * 0.5;
  };

  const handleApplyOverdraft = () => {
    const newLimit = requestedLimit[0];
    const maxEligible = getMaxOverdraftEligible();
    
    if (newLimit > maxEligible) {
      toast({
        title: "Application Declined",
        description: `Based on your credit score, maximum eligible limit is £${maxEligible.toLocaleString()}`,
        variant: "destructive"
      });
      return;
    }

    onApplyOverdraft(newLimit);
    setRequestedLimit([0]);
    
    toast({
      title: "Overdraft Approved!",
      description: `New overdraft limit: £${newLimit.toLocaleString()}`,
    });
  };

  const handleWithdraw = () => {
    const amount = withdrawAmount[0];
    if (amount > availableOverdraft) return;
    
    setCash(cash + amount);
    setOverdraftUsed(overdraftUsed + amount);
    setWithdrawAmount([0]);
    
    toast({
      title: "Overdraft Used",
      description: `£${amount.toLocaleString()} withdrawn`,
    });
  };

  const handleRepay = () => {
    const amount = Math.min(repayAmount[0], cash, overdraftUsed);
    
    setCash(cash - amount);
    setOverdraftUsed(overdraftUsed - amount);
    setRepayAmount([0]);
    
    toast({
      title: "Overdraft Repaid",
      description: `£${amount.toLocaleString()} repaid`,
    });
  };

  const creditRating = getCreditRating(creditScore);
  const debtToIncomeRatio = (totalMortgagePayments / monthlyIncome) * 100;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100">
          <CreditCard className="h-4 w-4 mr-2" />
          Credit & Banking
          {overdraftUsed > 0 && (
            <Badge variant="destructive" className="ml-2">
              -£{overdraftUsed.toLocaleString()}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            Credit Score & Banking Facilities
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Credit Score Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Credit Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Credit Score</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{creditScore}</span>
                  <Badge variant={creditRating.color === 'green' ? 'default' : 'secondary'}>
                    {creditRating.rating}
                  </Badge>
                </div>
              </div>
              
              <Progress value={(creditScore / 850) * 100} className="h-2" />
              
              <p className="text-xs text-muted-foreground">{creditRating.description}</p>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Monthly Income:</span>
                  <span className="ml-1 font-medium">£{monthlyIncome.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Debt-to-Income:</span>
                  <span className={`ml-1 font-medium ${debtToIncomeRatio > 40 ? 'text-red-600' : 'text-green-600'}`}>
                    {debtToIncomeRatio.toFixed(1)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Overdraft */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Overdraft Facility
                {overdraftUsed > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Limit:</span>
                  <span className="ml-1 font-medium">£{overdraftLimit.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Used:</span>
                  <span className="ml-1 font-medium text-red-600">£{overdraftUsed.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Available:</span>
                  <span className="ml-1 font-medium text-green-600">£{availableOverdraft.toLocaleString()}</span>
                </div>
              </div>
              
              {overdraftLimit > 0 && (
                <Progress value={(overdraftUsed / overdraftLimit) * 100} className="h-2" />
              )}
              
              {overdraftUsed > 0 && (
                <div className="text-sm text-amber-600">
                  Monthly interest charge: £{monthlyInterest.toFixed(2)} (2.4% APR)
                </div>
              )}
              
              {/* Overdraft Actions */}
              {overdraftLimit > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Withdraw */}
                  {availableOverdraft > 0 && (
                    <div className="space-y-2">
                      <Label>Withdraw: £{withdrawAmount[0].toLocaleString()}</Label>
                      <Slider
                        value={withdrawAmount}
                        onValueChange={setWithdrawAmount}
                        min={0}
                        max={availableOverdraft}
                        step={100}
                        className="w-full"
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleWithdraw}
                        disabled={withdrawAmount[0] === 0}
                        className="w-full"
                      >
                        <TrendingDown className="h-3 w-3 mr-1" />
                        Withdraw
                      </Button>
                    </div>
                  )}
                  
                  {/* Repay */}
                  {overdraftUsed > 0 && (
                    <div className="space-y-2">
                      <Label>Repay: £{repayAmount[0].toLocaleString()}</Label>
                      <Slider
                        value={repayAmount}
                        onValueChange={setRepayAmount}
                        min={0}
                        max={Math.min(cash, overdraftUsed)}
                        step={100}
                        className="w-full"
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleRepay}
                        disabled={repayAmount[0] === 0}
                        className="w-full"
                      >
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Repay
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Apply for Overdraft */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Apply for Overdraft Facility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>Based on your credit score and income, you may be eligible for an overdraft facility.</p>
                <p className="mt-1">Maximum eligible: £{getMaxOverdraftEligible().toLocaleString()}</p>
              </div>
              
              <div className="space-y-3">
                <Label>Requested Limit: £{requestedLimit[0].toLocaleString()}</Label>
                <Slider
                  value={requestedLimit}
                  onValueChange={setRequestedLimit}
                  min={0}
                  max={Math.max(getMaxOverdraftEligible(), overdraftLimit)}
                  step={500}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>£0</span>
                  <span>£{getMaxOverdraftEligible().toLocaleString()} max eligible</span>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Interest rate: 2.4% APR (calculated monthly)</p>
                <p>• No arrangement fees</p>
                <p>• Subject to credit approval</p>
              </div>
              
              <Button 
                onClick={handleApplyOverdraft}
                disabled={requestedLimit[0] === 0 || requestedLimit[0] === overdraftLimit}
                className="w-full"
              >
                {requestedLimit[0] > overdraftLimit ? 'Increase' : requestedLimit[0] < overdraftLimit ? 'Reduce' : 'Apply for'} Overdraft Facility
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}