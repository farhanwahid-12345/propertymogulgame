import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Property } from "@/components/ui/property-card";
import { Building2, Calculator, TrendingDown, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { calculateMortgageEligibility } from "@/lib/mortgageEligibility";
import { cn } from "@/lib/utils";

interface MortgageRefinanceProps {
  ownedProperties: Property[];
  mortgageProviders: any[];
  onRefinance: (propertyId: string, newLoanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => void;
  cash: number;
  setCash: (cash: number) => void;
  creditScore?: number;
  totalRentalIncome?: number; // pounds
  existingMonthlyMortgagePayments?: number; // pounds
}

export function MortgageRefinance({ ownedProperties, mortgageProviders, onRefinance, cash, setCash, creditScore = 700, totalRentalIncome = 0, existingMonthlyMortgagePayments = 0 }: MortgageRefinanceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [loanAmount, setLoanAmount] = useState<number[]>([0]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [termYears, setTermYears] = useState<number>(25);
  const [mortgageType, setMortgageType] = useState<'repayment' | 'interest-only'>('repayment');

  // Filter properties that can be refinanced (have value)
  const refinanceableProperties = ownedProperties.filter(prop => prop.value > 0);

  const calculateMonthlyPayment = (principal: number, rate: number, years: number, type: 'repayment' | 'interest-only') => {
    if (type === 'interest-only') {
      return (principal * rate) / 12;
    }
    const monthlyRate = rate / 12;
    const numPayments = years * 12;
    return (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
  };

  const handleRefinance = () => {
    if (!selectedProperty || !selectedProvider || loanAmount[0] <= 0) return;

    const currentMortgage = selectedProperty.mortgageRemaining || 0;
    const cashFromRefinance = loanAmount[0] - currentMortgage;
    
    // Update property immediately in state
    onRefinance(selectedProperty.id, loanAmount[0], selectedProvider, termYears, mortgageType);
    
    // Update cash if extracting equity
    if (cashFromRefinance > 0) {
      setCash(cash + cashFromRefinance);
    }

    // Reset form
    setSelectedProperty(null);
    setLoanAmount([0]);
    setSelectedProvider("");
    setTermYears(25);
    setMortgageType('repayment');
    
    toast({
      title: "Mortgage Refinanced!",
      description: `${selectedProperty.name} refinanced for £${loanAmount[0].toLocaleString()}`,
    });
  };

  const selectedProviderData = mortgageProviders.find(p => p.id === selectedProvider);

  // Centralized eligibility check (portfolio-aware: 125% ICR if 3+ owned)
  const eligibility = (selectedProperty && selectedProviderData) ? calculateMortgageEligibility({
    creditScore,
    loanAmount: loanAmount[0],
    propertyValue: selectedProperty.value,
    propertyMonthlyRent: selectedProperty.monthlyIncome,
    providerBaseRate: selectedProviderData.baseRate,
    providerMinCreditScore: selectedProviderData.minCreditScore,
    providerMaxLTV: selectedProviderData.maxLTV,
    providerId: selectedProviderData.id,
    termYears,
    mortgageType,
    existingMonthlyMortgagePayments,
    totalRentalIncome,
    ownedPropertyCount: ownedProperties.length,
  }) : null;

  const monthlyPayment = eligibility?.monthlyPayment ?? 0;
  const stressLabel = ownedProperties.length >= 3 ? 'Portfolio Stress Test (125%)' : 'Property Stress Test (100%)';

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100">
          <Calculator className="h-4 w-4 mr-2" />
          Refinance Properties
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            Mortgage Refinancing
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Property Selection */}
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
                    setLoanAmount([Math.floor(property.value * 0.75)]);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{property.name}</p>
                        <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                        <p className="text-xs">Current Value: £{property.value.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          Outstanding: £{(property.mortgageRemaining || 0).toLocaleString()}
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

          {/* Refinancing Details */}
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
                      <span className="text-muted-foreground">Available Equity:</span>
                      <span className="ml-1 font-medium text-green-600">
                        £{(selectedProperty.value - (selectedProperty.mortgageRemaining || 0)).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cash Out:</span>
                      <span className="ml-1 font-medium text-blue-600">
                        £{Math.max(0, loanAmount[0] - (selectedProperty.mortgageRemaining || 0)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <Label>New Loan Amount: £{loanAmount[0].toLocaleString()}</Label>
                <Slider
                  value={loanAmount}
                  onValueChange={setLoanAmount}
                  min={selectedProperty.mortgageRemaining || 0}
                  max={selectedProperty.value * 0.85}
                  step={1000}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Current: £{(selectedProperty.mortgageRemaining || 0).toLocaleString()}</span>
                  <span>Max 85%: £{Math.floor(selectedProperty.value * 0.85).toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Mortgage Provider</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      {mortgageProviders.map(provider => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name} ({(provider.baseRate * 100).toFixed(1)}%)
                        </SelectItem>
                      ))}
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
                      <SelectItem value="30">30 years</SelectItem>
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
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Monthly Payment:</span>
                        <span className="ml-1 font-bold text-blue-700">
                          £{monthlyPayment.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Interest Rate:</span>
                        <span className="ml-1 font-medium">
                          {(selectedProviderData.baseRate * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button 
                className="w-full" 
                onClick={handleRefinance}
                disabled={!selectedProvider || loanAmount[0] <= 0}
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