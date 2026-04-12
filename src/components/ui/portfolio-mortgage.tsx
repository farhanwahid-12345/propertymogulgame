import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Property } from "@/components/ui/property-card";
import { Building, Briefcase, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getMaxLTVForCreditScore, getRatePenaltyForCreditScore, calculateMonthlyPayment } from "@/lib/mortgageEligibility";

interface PortfolioMortgageProps {
  ownedProperties: Property[];
  mortgageProviders: any[];
  onPortfolioMortgage: (selectedPropertyIds: string[], loanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => void;
  cash: number;
  setCash: (cash: number) => void;
  creditScore?: number;
}

export function PortfolioMortgage({ ownedProperties, mortgageProviders, onPortfolioMortgage, cash, setCash, creditScore = 580 }: PortfolioMortgageProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [loanAmount, setLoanAmount] = useState<number[]>([0]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [termYears, setTermYears] = useState<number>(25);
  const [mortgageType, setMortgageType] = useState<'repayment' | 'interest-only'>('repayment');

  const canUsePortfolioMortgage = ownedProperties.length >= 3;
  
  const creditMaxLTV = getMaxLTVForCreditScore(creditScore);
  const ratePenalty = getRatePenaltyForCreditScore(creditScore);

  const eligibleProperties = ownedProperties.filter(prop => {
    const equity = prop.value - (prop.mortgageRemaining || 0);
    return equity > 0;
  });

  const selectedProperties = eligibleProperties.filter(prop => selectedPropertyIds.includes(prop.id));
  const totalPortfolioValue = selectedProperties.reduce((sum, prop) => sum + prop.value, 0);
  const totalCurrentMortgages = selectedProperties.reduce((sum, prop) => sum + (prop.mortgageRemaining || 0), 0);
  const totalEquity = totalPortfolioValue - totalCurrentMortgages;
  const totalPortfolioRent = selectedProperties.reduce((sum, prop) => sum + prop.monthlyIncome, 0);
  const maxLoanAmount = totalPortfolioValue * creditMaxLTV; // Credit-score capped LTV

  const togglePropertySelection = (propertyId: string) => {
    setSelectedPropertyIds(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handlePortfolioMortgage = () => {
    if (selectedPropertyIds.length < 2 || !selectedProvider || loanAmount[0] <= 0) return;
    onPortfolioMortgage(selectedPropertyIds, loanAmount[0], selectedProvider, termYears, mortgageType);
    setSelectedPropertyIds([]);
    setLoanAmount([0]);
    setSelectedProvider("");
    setIsOpen(false);
  };

  const selectedProviderData = mortgageProviders.find((p: any) => p.id === selectedProvider);
  const portfolioRate = selectedProviderData ? Math.max(0.01, selectedProviderData.baseRate + 0.005 + ratePenalty) : 0;
  const monthlyPayment = selectedProviderData ? calculateMonthlyPayment(
    loanAmount[0], portfolioRate, termYears, mortgageType
  ) : 0;

  // ICR check
  const icrRatio = monthlyPayment > 0 && totalPortfolioRent > 0 
    ? totalPortfolioRent / monthlyPayment 
    : null;
  const icrPasses = icrRatio === null || icrRatio >= 1.25;

  if (!canUsePortfolioMortgage) {
    return (
      <Button variant="outline" disabled className="opacity-50">
        <Briefcase className="h-4 w-4 mr-2" />
        Portfolio Mortgage (Need 3+ properties)
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20">
          <Briefcase className="h-4 w-4 mr-2" />
          Portfolio Mortgage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Briefcase className="h-6 w-6" />
            Portfolio Mortgage
          </DialogTitle>
        </DialogHeader>

        {/* Credit info */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
          <span>Credit: <strong>{creditScore}</strong></span>
          <span>|</span>
          <span>Max LTV: <strong>{Math.round(creditMaxLTV * 100)}%</strong></span>
          <span>|</span>
          <span>Rate Adj: <strong>{ratePenalty > 0 ? `+${(ratePenalty * 100).toFixed(1)}%` : ratePenalty < 0 ? `${(ratePenalty * 100).toFixed(1)}%` : 'Standard'}</strong></span>
        </div>
        
        <div className="space-y-6">
          <Card className="bg-purple-500/10 border-purple-500/30">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Properties:</span>
                  <span className="ml-1 font-bold">{ownedProperties.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Portfolio Value:</span>
                  <span className="ml-1 font-bold">£{ownedProperties.reduce((sum, prop) => sum + prop.value, 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Equity:</span>
                  <span className="ml-1 font-bold text-green-400">
                    £{ownedProperties.reduce((sum, prop) => sum + prop.value - (prop.mortgageRemaining || 0), 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Select Properties for Portfolio Mortgage</h3>
            <p className="text-sm text-muted-foreground">Choose at least 2 properties to secure against portfolio mortgage</p>
            
            <div className="grid gap-3 max-h-60 overflow-y-auto">
              {eligibleProperties.map(property => (
                <Card 
                  key={property.id}
                  className={`cursor-pointer transition-colors ${
                    selectedPropertyIds.includes(property.id) ? 'ring-2 ring-purple-500' : ''
                  }`}
                  onClick={() => togglePropertySelection(property.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{property.name}</p>
                        <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                        <p className="text-xs">Value: £{property.value.toLocaleString()} | Rent: £{property.monthlyIncome}/mo</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">
                          Equity: £{(property.value - (property.mortgageRemaining || 0)).toLocaleString()}
                        </p>
                        <Badge variant={selectedPropertyIds.includes(property.id) ? "default" : "outline"}>
                          {property.type}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {selectedPropertyIds.length >= 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Portfolio Mortgage Terms</h3>
              
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Selected Properties:</span>
                      <span className="ml-1 font-medium">{selectedPropertyIds.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Combined Value:</span>
                      <span className="ml-1 font-medium">£{totalPortfolioValue.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Combined Rent:</span>
                      <span className="ml-1 font-medium text-green-400">£{totalPortfolioRent.toLocaleString()}/mo</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Available Equity:</span>
                      <span className="ml-1 font-medium text-green-400">£{totalEquity.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <Label>Portfolio Loan Amount: £{loanAmount[0].toLocaleString()}</Label>
                <Slider
                  value={loanAmount}
                  onValueChange={setLoanAmount}
                  min={totalCurrentMortgages}
                  max={Math.floor(maxLoanAmount)}
                  step={5000}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Current: £{totalCurrentMortgages.toLocaleString()}</span>
                  <span>Max {Math.round(creditMaxLTV * 100)}%: £{Math.floor(maxLoanAmount).toLocaleString()}</span>
                </div>
                <p className="text-sm text-green-400">
                  Cash out: £{Math.max(0, loanAmount[0] - totalCurrentMortgages).toLocaleString()}
                </p>
              </div>

              {/* ICR Warning */}
              {icrRatio !== null && !icrPasses && (
                <div className="p-3 rounded-lg border border-red-500/50 bg-red-500/10 text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <span className="text-red-400">
                    <strong>Stress Test Warning:</strong> Combined rental income (£{totalPortfolioRent}/mo) is only {((icrRatio || 0) * 100).toFixed(0)}% of the monthly payment. Banks require 125% coverage.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Specialist Lender</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose lender..." />
                    </SelectTrigger>
                    <SelectContent>
                      {mortgageProviders.map((provider: any) => {
                        const ltvReq = loanAmount[0] / totalPortfolioValue;
                        const eligible = creditScore >= provider.minCreditScore && ltvReq <= Math.min(provider.maxLTV, creditMaxLTV);
                        return (
                          <SelectItem key={provider.id} value={provider.id} disabled={!eligible}>
                            {provider.name} ({((provider.baseRate + 0.005) * 100).toFixed(1)}% portfolio rate)
                            {!eligible ? ' ❌' : ' ✓'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Term (years)</Label>
                  <Select value={termYears.toString()} onValueChange={(value) => setTermYears(Number(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 years</SelectItem>
                      <SelectItem value="10">10 years</SelectItem>
                      <SelectItem value="15">15 years</SelectItem>
                      <SelectItem value="20">20 years</SelectItem>
                      <SelectItem value="25">25 years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Mortgage Type</Label>
                <Select value={mortgageType} onValueChange={(value: 'repayment' | 'interest-only') => setMortgageType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repayment">Repayment</SelectItem>
                    <SelectItem value="interest-only">Interest Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedProvider && (
                <Card className="bg-purple-500/10 border-purple-500/30">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Monthly Payment:</span>
                        <span className="ml-1 font-bold text-purple-400">
                          £{Math.round(monthlyPayment).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Portfolio Rate:</span>
                        <span className="ml-1 font-medium">
                          {(portfolioRate * 100).toFixed(2)}%
                        </span>
                      </div>
                      {icrRatio !== null && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Stress Test (ICR):</span>
                          <span className={`ml-1 font-medium ${icrPasses ? 'text-green-400' : 'text-red-400'}`}>
                            {((icrRatio || 0) * 100).toFixed(0)}% {icrPasses ? '✓ Pass' : '✗ Fail (need 125%)'}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Portfolio mortgages have higher rates but offer greater flexibility
                    </p>
                  </CardContent>
                </Card>
              )}

              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700" 
                onClick={handlePortfolioMortgage}
                disabled={selectedPropertyIds.length < 2 || !selectedProvider || loanAmount[0] <= 0 || !icrPasses}
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Secure Portfolio Mortgage
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
