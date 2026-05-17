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
  startDate: number;
  /** Present for portfolio mortgages — the bundle of properties used as collateral. */
  collateralPropertyIds?: string[];
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

  // Build picker from mortgages directly so portfolio mortgages (whose synthetic
  // propertyId doesn't match an owned property) are included too.
  const isPortfolio = (m: Mortgage) =>
    (m.collateralPropertyIds?.length ?? 0) > 1 || (m as any).id?.startsWith?.("portfolio_");

  const propertyName = (id: string) => ownedProperties.find(p => p.id === id)?.name;

  const mortgageOptions = mortgages.map((m) => {
    if (isPortfolio(m)) {
      const count = m.collateralPropertyIds?.length ?? 0;
      return { id: m.propertyId, label: `Portfolio mortgage · ${count} properties`, mortgage: m };
    }
    return { id: m.propertyId, label: propertyName(m.propertyId) ?? "Property", mortgage: m };
  });

  const hasMortgages = mortgageOptions.length > 0;

  const selectedMortgageDetails = mortgages.find(m => m.propertyId === selectedMortgage);
  const selectedOption = mortgageOptions.find(o => o.id === selectedMortgage);
  const selectedIsPortfolio = !!selectedMortgageDetails && isPortfolio(selectedMortgageDetails);

  const paymentAmount = partialAmount ? parseFloat(partialAmount) : 0;
  // ERC: 2% within first 5 years (60 months @ 180s/month)
  const ERC_WINDOW_MS = 60 * 180 * 1000;
  const ercApplies = !!selectedMortgageDetails && (Date.now() - selectedMortgageDetails.startDate) < ERC_WINDOW_MS;
  const ercAmount = ercApplies ? Math.round(paymentAmount * 0.02) : 0;
  const totalDue = paymentAmount + ercAmount;
  const canMakePayment = !!selectedMortgageDetails && paymentAmount > 0 && totalDue <= cash && paymentAmount <= selectedMortgageDetails.remainingBalance;

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
        <Button variant="outline" disabled={!hasMortgages}>
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
          
          {!hasMortgages ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No mortgages to settle</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Select mortgage to pay down:
                  </label>
                  <Select value={selectedMortgage} onValueChange={(value) => {
                    setSelectedMortgage(value);
                    setPartialAmount("");
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose mortgage..." />
                    </SelectTrigger>
                    <SelectContent>
                      {mortgageOptions.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          <div className="flex justify-between items-center w-full gap-2">
                            <span>{opt.label}</span>
                            <Badge variant="destructive" className="ml-2">
                              £{opt.mortgage.remainingBalance.toLocaleString()} debt
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
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

                    {ercApplies && paymentAmount > 0 && (
                      <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                        <strong>Early Repayment Charge:</strong> £{ercAmount.toLocaleString()} (2%) applies — mortgage less than 5 years old. Total cash needed: £{totalDue.toLocaleString()}.
                      </div>
                    )}

                    {canMakePayment ? (
                      <div className="pt-2 border-t">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cash after payment:</span>
                          <span className="font-semibold text-success">
                            £{(cash - totalDue).toLocaleString()}
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