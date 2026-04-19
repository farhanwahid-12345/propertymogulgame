import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Property } from "@/components/ui/property-card";
import { Building2, Calculator, TrendingDown, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getMaxLTVForCreditScore, getRatePenaltyForCreditScore, calculateMonthlyPayment, calculateMortgageEligibility } from "@/lib/mortgageEligibility";
import { cn } from "@/lib/utils";

interface MortgageManagementProps {
  ownedProperties: Property[];
  mortgageProviders: any[];
  onRefinance: (propertyId: string, newLoanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => void;
  cash: number;
  setCash: (cash: number) => void;
  creditScore?: number;
  totalRentalIncome?: number; // pounds
  existingMonthlyMortgagePayments?: number; // pounds
}

export function MortgageManagement({ 
  ownedProperties, 
  mortgageProviders, 
  onRefinance, 
  cash, 
  setCash,
  creditScore = 580,
  totalRentalIncome = 0,
  existingMonthlyMortgagePayments = 0,
}: MortgageManagementProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [singleLoanAmount, setSingleLoanAmount] = useState<number[]>([0]);
  const [singleProvider, setSingleProvider] = useState<string>("");
  const [singleTermYears, setSingleTermYears] = useState<number>(25);
  const [singleMortgageType, setSingleMortgageType] = useState<'repayment' | 'interest-only'>('repayment');

  const refinanceableProperties = ownedProperties.filter(prop => prop.value > 0);
  
  // Credit-score-based LTV cap
  const creditMaxLTV = getMaxLTVForCreditScore(creditScore);
  const ratePenalty = getRatePenaltyForCreditScore(creditScore);

  // Filter providers by credit score AND LTV
  const getEligibleProviders = (ltvRequired: number) => {
    return mortgageProviders.filter((p: any) => 
      creditScore >= p.minCreditScore && 
      ltvRequired <= Math.min(p.maxLTV, creditMaxLTV)
    );
  };

  const handleRefinance = () => {
    if (!selectedProperty || !singleProvider || singleLoanAmount[0] <= 0) return;
    onRefinance(selectedProperty.id, singleLoanAmount[0], singleProvider, singleTermYears, singleMortgageType);
    setSelectedProperty(null);
    setSingleLoanAmount([0]);
    setSingleProvider("");
    setSingleTermYears(25);
    setSingleMortgageType('repayment');
    setIsOpen(false);
  };

  const singleProviderData = mortgageProviders.find((p: any) => p.id === singleProvider);
  const adjustedRate = singleProviderData ? Math.max(0.01, singleProviderData.baseRate + ratePenalty) : 0;
  const singleMonthlyPayment = singleProviderData ? calculateMonthlyPayment(
    singleLoanAmount[0], adjustedRate, singleTermYears, singleMortgageType
  ) : 0;

  // Centralized portfolio-aware eligibility (125% ICR if 3+ owned, 100% otherwise)
  const eligibility = (selectedProperty && singleProviderData && singleLoanAmount[0] > 0) ? calculateMortgageEligibility({
    creditScore,
    loanAmount: singleLoanAmount[0],
    propertyValue: selectedProperty.value,
    propertyMonthlyRent: selectedProperty.monthlyIncome,
    providerBaseRate: singleProviderData.baseRate,
    providerMinCreditScore: singleProviderData.minCreditScore,
    providerMaxLTV: singleProviderData.maxLTV,
    providerId: singleProviderData.id,
    termYears: singleTermYears,
    mortgageType: singleMortgageType,
    existingMonthlyMortgagePayments,
    totalRentalIncome,
    ownedPropertyCount: ownedProperties.length,
  }) : null;
  const portfolioMode = ownedProperties.length >= 3;
  const stressLabel = portfolioMode ? 'Portfolio Stress Test (125%)' : 'Property Stress Test (100%)';
  const stressThreshold = portfolioMode ? 1.25 : 1.0;
  const icrPasses = !eligibility || (eligibility.icrRatio !== undefined && eligibility.icrRatio >= stressThreshold);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20">
          <Calculator className="h-4 w-4 mr-2" />
          Manage Mortgages
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            Refinance Property
          </DialogTitle>
          <DialogDescription>
            Refinance an individual property to access equity or improve mortgage terms
          </DialogDescription>
        </DialogHeader>

        {/* Credit info banner */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
          <span>Credit Score: <strong>{creditScore}</strong></span>
          <span>|</span>
          <span>Max LTV: <strong>{Math.round(creditMaxLTV * 100)}%</strong></span>
          <span>|</span>
          <span>Rate Adjustment: <strong>{ratePenalty > 0 ? `+${(ratePenalty * 100).toFixed(1)}%` : ratePenalty < 0 ? `${(ratePenalty * 100).toFixed(1)}%` : 'Standard'}</strong></span>
        </div>
        
        <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Select Property to Refinance</h3>
              <div className="grid gap-3 max-h-60 overflow-y-auto">
                {refinanceableProperties.map(property => (
                  <Card 
                    key={property.id}
                    className={`cursor-pointer transition-colors ${
                      selectedProperty?.id === property.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedProperty(property);
                      const maxLoan = Math.floor(property.value * creditMaxLTV);
                      setSingleLoanAmount([Math.min(maxLoan, Math.floor(property.value * 0.75))]);
                      setSingleProvider("");
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{property.name}</p>
                          <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                          <p className="text-xs">Current Value: £{property.value.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Rent: £{property.monthlyIncome.toLocaleString()}/mo</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            Debt: £{(property.mortgageRemaining || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-green-400">
                            Equity: £{(property.value - (property.mortgageRemaining || 0)).toLocaleString()}
                          </p>
                          <Badge variant="outline">{property.type}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {refinanceableProperties.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No properties available for refinancing.</p>
                </div>
              )}
            </div>

            {selectedProperty && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Refinancing Options</h3>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Property Value:</span>
                        <span className="ml-1 font-medium">£{selectedProperty.value.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Current Mortgage:</span>
                        <span className="ml-1 font-medium">£{(selectedProperty.mortgageRemaining || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Max Loan ({Math.round(creditMaxLTV * 100)}% LTV):</span>
                        <span className="ml-1 font-medium">
                          £{Math.floor(selectedProperty.value * creditMaxLTV).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cash Out:</span>
                        <span className="ml-1 font-medium text-blue-400">
                          £{Math.max(0, singleLoanAmount[0] - (selectedProperty.mortgageRemaining || 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <Label>New Loan Amount: £{singleLoanAmount[0].toLocaleString()}</Label>
                  <Slider
                    value={singleLoanAmount}
                    onValueChange={setSingleLoanAmount}
                    min={selectedProperty.mortgageRemaining || 0}
                    max={Math.floor(selectedProperty.value * creditMaxLTV)}
                    step={1000}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Current: £{(selectedProperty.mortgageRemaining || 0).toLocaleString()}</span>
                    <span>Max ({Math.round(creditMaxLTV * 100)}% LTV): £{Math.floor(selectedProperty.value * creditMaxLTV).toLocaleString()}</span>
                  </div>
                </div>

                {/* Stress test warning (portfolio-aware) */}
                {eligibility && !icrPasses && eligibility.icrRatio !== undefined && (
                  <div className="p-3 rounded-lg border border-red-500/50 bg-red-500/10 text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <span className="text-red-400">
                      <strong>{stressLabel} — Failing:</strong> Coverage is only {(eligibility.icrRatio * 100).toFixed(0)}%. Banks require {Math.round(stressThreshold * 100)}% coverage. Reduce the loan amount{portfolioMode ? " or grow your rental portfolio" : ""}.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Mortgage Provider</Label>
                    <Select value={singleProvider} onValueChange={setSingleProvider}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose provider..." />
                      </SelectTrigger>
                      <SelectContent>
                        {mortgageProviders.map((provider: any) => {
                          const ltvReq = singleLoanAmount[0] / selectedProperty.value;
                          const eligible = creditScore >= provider.minCreditScore && ltvReq <= Math.min(provider.maxLTV, creditMaxLTV);
                          return (
                            <SelectItem key={provider.id} value={provider.id} disabled={!eligible}>
                              {provider.name} ({(provider.baseRate * 100).toFixed(1)}%)
                              {!eligible ? (creditScore < provider.minCreditScore ? ' ❌ Credit' : ' ❌ LTV') : ' ✓'}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Term (years)</Label>
                    <Select value={singleTermYears.toString()} onValueChange={(value) => setSingleTermYears(Number(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 years</SelectItem>
                        <SelectItem value="10">10 years</SelectItem>
                        <SelectItem value="15">15 years</SelectItem>
                        <SelectItem value="20">20 years</SelectItem>
                        <SelectItem value="25">25 years</SelectItem>
                        <SelectItem value="30">30 years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Mortgage Type</Label>
                  <Select value={singleMortgageType} onValueChange={(value: 'repayment' | 'interest-only') => setSingleMortgageType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="repayment">Repayment</SelectItem>
                      <SelectItem value="interest-only">Interest Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {singleProvider && (
                  <Card className="bg-blue-500/10 border-blue-500/30">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Monthly Payment:</span>
                          <span className="ml-1 font-bold text-blue-400">
                            £{Math.round(singleMonthlyPayment).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Interest Rate:</span>
                          <span className="ml-1 font-medium">
                            {(adjustedRate * 100).toFixed(2)}%
                            {ratePenalty !== 0 && (
                              <span className={ratePenalty > 0 ? 'text-red-400' : 'text-green-400'}>
                                {' '}({ratePenalty > 0 ? '+' : ''}{(ratePenalty * 100).toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        </div>
                        {eligibility?.icrRatio !== undefined && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">{stressLabel}:</span>
                            <span className={`ml-1 font-medium ${icrPasses ? 'text-green-400' : 'text-red-400'}`}>
                              {(eligibility.icrRatio * 100).toFixed(0)}% {icrPasses ? '✓ Pass' : `✗ Fail (need ${Math.round(stressThreshold * 100)}%)`}
                            </span>
                          </div>
                        )}
                        {eligibility && !eligibility.eligible && eligibility.reason && (
                          <div className="col-span-2 p-2 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-400">
                            {eligibility.reason}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button 
                  className="w-full" 
                  onClick={handleRefinance}
                  disabled={!singleProvider || singleLoanAmount[0] <= 0 || !icrPasses || (eligibility ? !eligibility.eligible : false)}
                >
                  <TrendingDown className="h-4 w-4 mr-2" />
                  Refinance Property
                </Button>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
