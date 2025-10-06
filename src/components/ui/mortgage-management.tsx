import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Property } from "@/components/ui/property-card";
import { Building2, Calculator, Briefcase, TrendingDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface MortgageManagementProps {
  ownedProperties: Property[];
  mortgageProviders: any[];
  onRefinance: (propertyId: string, newLoanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => void;
  onPortfolioMortgage: (selectedPropertyIds: string[], loanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => void;
  cash: number;
  setCash: (cash: number) => void;
}

export function MortgageManagement({ 
  ownedProperties, 
  mortgageProviders, 
  onRefinance, 
  onPortfolioMortgage,
  cash, 
  setCash 
}: MortgageManagementProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "portfolio">("single");
  
  // Single property refinance state
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [singleLoanAmount, setSingleLoanAmount] = useState<number[]>([0]);
  const [singleProvider, setSingleProvider] = useState<string>("");
  const [singleTermYears, setSingleTermYears] = useState<number>(25);
  const [singleMortgageType, setSingleMortgageType] = useState<'repayment' | 'interest-only'>('repayment');

  // Portfolio mortgage state
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [portfolioLoanAmount, setPortfolioLoanAmount] = useState<number[]>([0]);
  const [portfolioProvider, setPortfolioProvider] = useState<string>("");
  const [portfolioTermYears, setPortfolioTermYears] = useState<number>(25);
  const [portfolioMortgageType, setPortfolioMortgageType] = useState<'repayment' | 'interest-only'>('repayment');

  const canUsePortfolioMortgage = ownedProperties.length >= 3;
  const refinanceableProperties = ownedProperties.filter(prop => prop.value > 0);
  const eligibleProperties = ownedProperties.filter(prop => {
    const equity = prop.value - (prop.mortgageRemaining || 0);
    return equity > 0;
  });

  const selectedProperties = eligibleProperties.filter(prop => selectedPropertyIds.includes(prop.id));
  const totalPortfolioValue = selectedProperties.reduce((sum, prop) => sum + prop.value, 0);
  const totalCurrentMortgages = selectedProperties.reduce((sum, prop) => sum + (prop.mortgageRemaining || 0), 0);
  const maxPortfolioLoan = totalPortfolioValue * 0.75;

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
    if (singleLoanAmount[0] > cash + (selectedProperty.mortgageRemaining || 0)) {
      toast({
        title: "Insufficient Funds",
        description: "You cannot borrow more than your available cash plus current mortgage balance.",
        variant: "destructive"
      });
      return;
    }

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

  const togglePropertySelection = (propertyId: string) => {
    setSelectedPropertyIds(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handlePortfolioMortgage = () => {
    if (selectedPropertyIds.length < 2 || !portfolioProvider || portfolioLoanAmount[0] <= 0) return;

    const cashFromMortgage = portfolioLoanAmount[0] - totalCurrentMortgages;
    
    onPortfolioMortgage(selectedPropertyIds, portfolioLoanAmount[0], portfolioProvider, portfolioTermYears, portfolioMortgageType);
    
    if (cashFromMortgage > 0) {
      setCash(cash + cashFromMortgage);
    }

    setSelectedPropertyIds([]);
    setPortfolioLoanAmount([0]);
    setPortfolioProvider("");
    setPortfolioTermYears(25);
    setPortfolioMortgageType('repayment');
    setIsOpen(false);
    
    toast({
      title: "Portfolio Mortgage Approved!",
      description: `Secured £${portfolioLoanAmount[0].toLocaleString()} against ${selectedPropertyIds.length} properties`,
    });
  };

  const singleProviderData = mortgageProviders.find(p => p.id === singleProvider);
  const singleMonthlyPayment = singleProviderData ? calculateMonthlyPayment(
    singleLoanAmount[0], 
    singleProviderData.baseRate, 
    singleTermYears, 
    singleMortgageType
  ) : 0;

  const portfolioProviderData = mortgageProviders.find(p => p.id === portfolioProvider);
  const portfolioRate = portfolioProviderData ? portfolioProviderData.baseRate + 0.005 : 0;
  const portfolioMonthlyPayment = portfolioProviderData ? calculateMonthlyPayment(
    portfolioLoanAmount[0], 
    portfolioRate, 
    portfolioTermYears, 
    portfolioMortgageType
  ) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100">
          <Calculator className="h-4 w-4 mr-2" />
          Manage Mortgages
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            Mortgage Management
          </DialogTitle>
          <DialogDescription>
            Refinance individual properties or secure a portfolio mortgage against multiple properties
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "single" | "portfolio")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">Single Property Refinance</TabsTrigger>
            <TabsTrigger value="portfolio" disabled={!canUsePortfolioMortgage}>
              Portfolio Mortgage {!canUsePortfolioMortgage && "(Need 3+ properties)"}
            </TabsTrigger>
          </TabsList>

          {/* Single Property Refinance */}
          <TabsContent value="single" className="space-y-6">
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
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Monthly Payment:</span>
                          <span className="ml-1 font-bold text-blue-700">
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
          </TabsContent>

          {/* Portfolio Mortgage */}
          <TabsContent value="portfolio" className="space-y-6">
            <Card className="bg-purple-50 border-purple-200">
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
                    <span className="ml-1 font-bold text-green-600">
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
                      selectedPropertyIds.includes(property.id) ? 'ring-2 ring-purple-500 bg-purple-50' : ''
                    }`}
                    onClick={() => togglePropertySelection(property.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{property.name}</p>
                          <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
                          <p className="text-xs">Value: £{property.value.toLocaleString()}</p>
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
                        <span className="text-muted-foreground">Current Mortgages:</span>
                        <span className="ml-1 font-medium">£{totalCurrentMortgages.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Available Equity:</span>
                        <span className="ml-1 font-medium text-green-600">£{(totalPortfolioValue - totalCurrentMortgages).toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <Label>Portfolio Loan Amount: £{portfolioLoanAmount[0].toLocaleString()}</Label>
                  <Slider
                    value={portfolioLoanAmount}
                    onValueChange={setPortfolioLoanAmount}
                    min={totalCurrentMortgages}
                    max={maxPortfolioLoan}
                    step={5000}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Current: £{totalCurrentMortgages.toLocaleString()}</span>
                    <span>Max 75%: £{Math.floor(maxPortfolioLoan).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-green-600">
                    Cash out: £{Math.max(0, portfolioLoanAmount[0] - totalCurrentMortgages).toLocaleString()}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Specialist Lender</Label>
                    <Select value={portfolioProvider} onValueChange={setPortfolioProvider}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose lender..." />
                      </SelectTrigger>
                      <SelectContent>
                        {mortgageProviders.map(provider => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name} ({((provider.baseRate + 0.005) * 100).toFixed(1)}% portfolio rate)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Term (years)</Label>
                    <Select value={portfolioTermYears.toString()} onValueChange={(value) => setPortfolioTermYears(Number(value))}>
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
                  <Select value={portfolioMortgageType} onValueChange={(value: 'repayment' | 'interest-only') => setPortfolioMortgageType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="repayment">Repayment</SelectItem>
                      <SelectItem value="interest-only">Interest Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {portfolioProvider && (
                  <Card className="bg-purple-50 border-purple-200">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Monthly Payment:</span>
                          <span className="ml-1 font-bold text-purple-700">
                            £{portfolioMonthlyPayment.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Portfolio Rate:</span>
                          <span className="ml-1 font-medium">
                            {(portfolioRate * 100).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Portfolio mortgages typically have higher rates but offer greater flexibility
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Button 
                  className="w-full bg-purple-600 hover:bg-purple-700" 
                  onClick={handlePortfolioMortgage}
                  disabled={selectedPropertyIds.length < 2 || !portfolioProvider || portfolioLoanAmount[0] <= 0}
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  Secure Portfolio Mortgage
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
