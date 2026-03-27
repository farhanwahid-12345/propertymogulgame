import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Property } from "@/components/ui/property-card";
import { Building2, Calculator, TrendingDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface MortgageManagementProps {
  ownedProperties: Property[];
  mortgageProviders: any[];
  onRefinance: (propertyId: string, newLoanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => void;
  cash: number;
  setCash: (cash: number) => void;
}

export function MortgageManagement({ 
  ownedProperties, 
  mortgageProviders, 
  onRefinance, 
  cash, 
  setCash 
}: MortgageManagementProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Single property refinance state
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [singleLoanAmount, setSingleLoanAmount] = useState<number[]>([0]);
  const [singleProvider, setSingleProvider] = useState<string>("");
  const [singleTermYears, setSingleTermYears] = useState<number>(25);
  const [singleMortgageType, setSingleMortgageType] = useState<'repayment' | 'interest-only'>('repayment');

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
    if (!selectedProperty || !singleProvider || singleLoanAmount[0] <= 0) return;

    const currentMortgage = selectedProperty.mortgageRemaining || 0;
    const cashFromRefinance = singleLoanAmount[0] - currentMortgage;
    
    onRefinance(selectedProperty.id, singleLoanAmount[0], singleProvider, singleTermYears, singleMortgageType);
    
    if (cashFromRefinance > 0) {
      setCash(cash + cashFromRefinance);
    }

    setSelectedProperty(null);
    setSingleLoanAmount([0]);
    setSingleProvider("");
    setSingleTermYears(25);
    setSingleMortgageType('repayment');
    setIsOpen(false);
    
    toast({
      title: "Mortgage Refinanced!",
      description: `${selectedProperty.name} refinanced for £${singleLoanAmount[0].toLocaleString()}`,
    });
  };


  const singleProviderData = mortgageProviders.find(p => p.id === singleProvider);
  const singleMonthlyPayment = singleProviderData ? calculateMonthlyPayment(
    singleLoanAmount[0], 
    singleProviderData.baseRate, 
    singleTermYears, 
    singleMortgageType
  ) : 0;

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
                      setSingleLoanAmount([Math.floor(property.value * 0.75)]);
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
                            Debt: £{(property.mortgageRemaining || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-green-600">
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
                        <span className="text-muted-foreground">Available Equity:</span>
                        <span className="ml-1 font-medium text-green-600">
                          £{(selectedProperty.value - (selectedProperty.mortgageRemaining || 0)).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cash Out:</span>
                        <span className="ml-1 font-medium text-blue-600">
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
                    max={Math.min(selectedProperty.value * 0.85, cash + (selectedProperty.mortgageRemaining || 0))}
                    step={1000}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Current: £{(selectedProperty.mortgageRemaining || 0).toLocaleString()}</span>
                    <span>Max: £{Math.min(Math.floor(selectedProperty.value * 0.85), cash + (selectedProperty.mortgageRemaining || 0)).toLocaleString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Mortgage Provider</Label>
                    <Select value={singleProvider} onValueChange={setSingleProvider}>
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
                            £{singleMonthlyPayment.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Interest Rate:</span>
                          <span className="ml-1 font-medium">
                            {(singleProviderData!.baseRate * 100).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button 
                  className="w-full" 
                  onClick={handleRefinance}
                  disabled={!singleProvider || singleLoanAmount[0] <= 0}
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
