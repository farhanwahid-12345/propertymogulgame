import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CreditCard, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Property {
  id: string;
  name: string;
  value: number;
  type: string;
}

interface Mortgage {
  propertyId: string;
  remainingBalance: number;
  monthlyPayment: number;
  interestRate: number;
  providerId: string;
}

interface MortgageSettlementProps {
  ownedProperties: Property[];
  mortgages: Mortgage[];
  cash: number;
  onSettleMortgage: (mortgagePropertyId: string, useCash?: boolean, settlementPropertyId?: string, partialAmount?: number) => void;
}

export function MortgageSettlement({ 
  ownedProperties, 
  mortgages,
  cash,
  onSettleMortgage 
}: MortgageSettlementProps) {
  const [selectedMortgage, setSelectedMortgage] = useState<string>("");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  // Only show properties with mortgages
  const propertiesWithMortgages = ownedProperties.filter(property => 
    mortgages.some(mortgage => mortgage.propertyId === property.id)
  );

  const selectedMortgageDetails = mortgages.find(m => m.propertyId === selectedMortgage);
  const selectedMortgageProperty = ownedProperties.find(p => p.id === selectedMortgage);

  const paymentAmount = partialAmount ? parseFloat(partialAmount) : 0;
  const canMakePayment = selectedMortgageDetails && paymentAmount > 0 && paymentAmount <= cash && paymentAmount <= selectedMortgageDetails.remainingBalance;

  const handlePayment = () => {
    if (selectedMortgage && canMakePayment) {
      onSettleMortgage(selectedMortgage, true, undefined, paymentAmount);
      
      const remainingAfterPayment = (selectedMortgageDetails?.remainingBalance || 0) - paymentAmount;
      
      toast({
        title: remainingAfterPayment > 0 ? "Payment Applied" : "Mortgage Paid Off!",
        description: remainingAfterPayment > 0 
          ? `£${paymentAmount.toLocaleString()} paid. Remaining balance: £${remainingAfterPayment.toLocaleString()}`
          : `Mortgage fully paid off!`,
      });
      
      setIsOpen(false);
      setSelectedMortgage("");
      setPartialAmount("");
    }
  };

  const clearSelection = () => {
    setSelectedMortgage("");
    setPartialAmount("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={propertiesWithMortgages.length === 0}>
          <Building2 className="h-4 w-4 mr-2" />
          Pay Mortgage
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Make Mortgage Payment</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Make a partial or full payment on your mortgage.
          </div>
          
          {propertiesWithMortgages.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No properties with mortgages to settle</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Select property with mortgage to settle:
                  </label>
                  <Select value={selectedMortgage} onValueChange={(value) => {
                    setSelectedMortgage(value);
                    setPartialAmount("");
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose property with mortgage..." />
                    </SelectTrigger>
                    <SelectContent>
                      {propertiesWithMortgages.map((property) => {
                        const mortgage = mortgages.find(m => m.propertyId === property.id);
                        return (
                          <SelectItem key={property.id} value={property.id}>
                            <div className="flex justify-between items-center w-full">
                              <span>{property.name}</span>
                              <Badge variant="destructive" className="ml-2">
                                £{mortgage?.remainingBalance.toLocaleString()} debt
                              </Badge>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {selectedMortgage && (
                  <div className="space-y-3">
                    <Label htmlFor="payment-amount">Payment Amount (£)</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      placeholder="Enter amount to pay"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      min="0"
                      max={Math.min(cash, selectedMortgageDetails?.remainingBalance || 0)}
                      step="100"
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Available: £{cash.toLocaleString()}</span>
                      <span>Balance: £{selectedMortgageDetails?.remainingBalance.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              {selectedMortgage && paymentAmount > 0 && (
                <Card className={cn(
                  "border-2",
                  canMakePayment ? "border-success bg-success/5" : "border-danger bg-danger/5"
                )}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {canMakePayment ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-danger" />
                      )}
                      Payment Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Property:</span>
                        <br />
                        <span className="font-medium">{selectedMortgageProperty?.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Current Balance:</span>
                        <br />
                        <span className="font-semibold text-danger">
                          £{selectedMortgageDetails?.remainingBalance.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Payment Amount:</span>
                        <br />
                        <span className="font-medium">£{paymentAmount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">New Balance:</span>
                        <br />
                        <span className={`font-semibold ${(selectedMortgageDetails?.remainingBalance || 0) - paymentAmount > 0 ? 'text-warning' : 'text-success'}`}>
                          £{Math.max(0, (selectedMortgageDetails?.remainingBalance || 0) - paymentAmount).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    
                    {canMakePayment ? (
                      <div className="pt-2 border-t">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cash after payment:</span>
                          <span className="font-semibold text-success">
                            £{(cash - paymentAmount).toLocaleString()}
                          </span>
                        </div>
                        {(selectedMortgageDetails?.remainingBalance || 0) - paymentAmount <= 0 && (
                          <div className="flex justify-between text-success">
                            <span className="font-medium">Monthly payment saved:</span>
                            <span className="font-semibold">
                              £{selectedMortgageDetails?.monthlyPayment.toLocaleString()}/mo
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="pt-2 border-t">
                        <p className="text-danger text-sm">
                          {paymentAmount > cash 
                            ? `Insufficient cash. You have £${cash.toLocaleString()} available.`
                            : `Payment amount exceeds balance.`
                          }
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          {selectedMortgage && (
            <Button variant="outline" onClick={clearSelection}>
              Clear Selection
            </Button>
          )}
          <Button 
            onClick={handlePayment}
            disabled={!canMakePayment}
            variant={canMakePayment ? "default" : "destructive"}
          >
            {canMakePayment ? "Make Payment" : "Cannot Pay"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}