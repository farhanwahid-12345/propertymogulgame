import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CreditCard, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
  onSettleMortgage: (mortgagePropertyId: string, useCash?: boolean, settlementPropertyId?: string) => void;
}

export function MortgageSettlement({ 
  ownedProperties, 
  mortgages,
  cash,
  onSettleMortgage 
}: MortgageSettlementProps) {
  const [selectedMortgage, setSelectedMortgage] = useState<string>("");
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [settlementMethod, setSettlementMethod] = useState<"cash" | "property">("cash");
  const [isOpen, setIsOpen] = useState(false);

  // Only show properties with mortgages
  const propertiesWithMortgages = ownedProperties.filter(property => 
    mortgages.some(mortgage => mortgage.propertyId === property.id)
  );

  // Available properties for settlement (excluding the one being settled)
  const availableProperties = ownedProperties.filter(property => 
    property.id !== selectedMortgage && 
    !mortgages.some(mortgage => mortgage.propertyId === property.id) // Only debt-free properties
  );

  const selectedMortgageDetails = mortgages.find(m => m.propertyId === selectedMortgage);
  const selectedPropertyDetails = ownedProperties.find(p => p.id === selectedProperty);
  const selectedMortgageProperty = ownedProperties.find(p => p.id === selectedMortgage);

  const canSettleWithCash = selectedMortgageDetails && cash >= selectedMortgageDetails.remainingBalance;
  const canSettleWithProperty = selectedMortgageDetails && selectedPropertyDetails && 
    selectedPropertyDetails.value >= selectedMortgageDetails.remainingBalance;
  
  const canSettle = settlementMethod === "cash" ? canSettleWithCash : canSettleWithProperty;

  const handleSettle = () => {
    if (selectedMortgage && canSettle) {
      if (settlementMethod === "cash") {
        onSettleMortgage(selectedMortgage, true);
      } else if (selectedProperty) {
        onSettleMortgage(selectedMortgage, false, selectedProperty);
      }
      setIsOpen(false);
      setSelectedMortgage("");
      setSelectedProperty("");
      setSettlementMethod("cash");
    }
  };

  const clearSelection = () => {
    setSelectedMortgage("");
    setSelectedProperty("");
    setSettlementMethod("cash");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={propertiesWithMortgages.length === 0}>
          <Building2 className="h-4 w-4 mr-2" />
          Settle Mortgage
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settle Mortgage</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Pay off a mortgage using cash or by selling another property.
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
                    setSelectedProperty(""); // Reset property selection
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
                  <>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Settlement method:
                      </label>
                      <Select value={settlementMethod} onValueChange={(value: "cash" | "property") => {
                        setSettlementMethod(value);
                        setSelectedProperty(""); // Reset property selection
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">
                            <div className="flex justify-between items-center w-full">
                              <span>Pay with Cash</span>
                              <Badge variant="outline" className="ml-2">
                                £{cash.toLocaleString()} available
                              </Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="property">
                            <div className="flex justify-between items-center w-full">
                              <span>Sell Property</span>
                              <Badge variant="outline" className="ml-2">
                                {availableProperties.length} properties
                              </Badge>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {settlementMethod === "property" && (
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Select debt-free property to sell:
                        </label>
                        {availableProperties.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            No debt-free properties available for settlement
                          </div>
                        ) : (
                          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose property to sell..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableProperties.map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                  <div className="flex justify-between items-center w-full">
                                    <span>{property.name}</span>
                                    <Badge variant="outline" className="ml-2">
                                      £{property.value.toLocaleString()} value
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {selectedMortgage && (settlementMethod === "cash" || selectedProperty) && (
                <Card className={cn(
                  "border-2",
                  canSettle ? "border-success bg-success/5" : "border-danger bg-danger/5"
                )}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {canSettle ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-danger" />
                      )}
                      Settlement Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Property to settle:</span>
                        <br />
                        <span className="font-medium">{selectedMortgageProperty?.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Mortgage balance:</span>
                        <br />
                        <span className="font-semibold text-danger">
                          £{selectedMortgageDetails?.remainingBalance.toLocaleString()}
                        </span>
                      </div>
                      {settlementMethod === "cash" ? (
                        <>
                          <div>
                            <span className="text-muted-foreground">Available cash:</span>
                            <br />
                            <span className="font-medium">£{cash.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Remaining cash:</span>
                            <br />
                            <span className={`font-semibold ${canSettleWithCash ? 'text-success' : 'text-danger'}`}>
                              £{(cash - (selectedMortgageDetails?.remainingBalance || 0)).toLocaleString()}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="text-muted-foreground">Property to sell:</span>
                            <br />
                            <span className="font-medium">{selectedPropertyDetails?.name}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Property value:</span>
                            <br />
                            <span className="font-semibold text-success">
                              £{selectedPropertyDetails?.value.toLocaleString()}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                    
                    {canSettle ? (
                      <div className="pt-2 border-t">
                        {settlementMethod === "cash" ? (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cash after settlement:</span>
                            <span className="font-semibold text-success">
                              £{(cash - (selectedMortgageDetails?.remainingBalance || 0)).toLocaleString()}
                            </span>
                          </div>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cash from sale (after fees):</span>
                            <span className="font-semibold text-success">
                              £{Math.max(0, ((selectedPropertyDetails?.value || 0) - (selectedMortgageDetails?.remainingBalance || 0) - 1500 - ((selectedPropertyDetails?.value || 0) * 0.015))).toLocaleString()}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monthly payment saved:</span>
                          <span className="font-semibold text-success">
                            £{selectedMortgageDetails?.monthlyPayment.toLocaleString()}/mo
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t">
                        <p className="text-danger text-sm">
                          {settlementMethod === "cash" 
                            ? `Insufficient cash. You need £${((selectedMortgageDetails?.remainingBalance || 0) - cash).toLocaleString()} more.`
                            : `Property value is insufficient to cover the mortgage balance. You need an additional £${((selectedMortgageDetails?.remainingBalance || 0) - (selectedPropertyDetails?.value || 0)).toLocaleString()}.`
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
            onClick={handleSettle}
            disabled={!canSettle}
            variant={canSettle ? "default" : "destructive"}
          >
            {canSettle ? "Settle Mortgage" : "Cannot Settle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}