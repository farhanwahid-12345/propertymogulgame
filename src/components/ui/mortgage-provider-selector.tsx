import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface MortgageProvider {
  id: string;
  name: string;
  baseRate: number;
  maxLTV: number;
  minCreditScore: number;
  description: string;
}

interface MortgageProviderSelectorProps {
  providers: MortgageProvider[];
  playerCash: number;
  propertyValue: number;
  mortgageAmount: number;
  playerCreditScore: number;
  onSelectProvider: (providerId: string) => void;
  selectedProviderId?: string;
}

export function MortgageProviderSelector({
  providers,
  playerCash,
  propertyValue,
  mortgageAmount,
  playerCreditScore,
  onSelectProvider,
  selectedProviderId
}: MortgageProviderSelectorProps) {
  const requiredLTV = mortgageAmount / propertyValue;

  const getProviderEligibility = (provider: MortgageProvider) => {
    const ltvOk = requiredLTV <= provider.maxLTV;
    const creditOk = playerCreditScore >= provider.minCreditScore;
    return { ltvOk, creditOk, eligible: ltvOk && creditOk };
  };

  const calculateMonthlyPayment = (provider: MortgageProvider) => {
    const monthlyRate = provider.baseRate / 12;
    const termMonths = 300; // 25 years
    const monthlyPayment = (mortgageAmount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                          (Math.pow(1 + monthlyRate, termMonths) - 1);
    return monthlyPayment;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Choose Your Mortgage Provider</h3>
      <p className="text-sm text-muted-foreground">
        Credit Score: {playerCreditScore} | Required LTV: {(requiredLTV * 100).toFixed(1)}%
      </p>
      
      <div className="grid gap-3 max-h-64 overflow-y-auto">
        {providers.map((provider) => {
          const { ltvOk, creditOk, eligible } = getProviderEligibility(provider);
          const monthlyPayment = calculateMonthlyPayment(provider);
          
          return (
            <Card 
              key={provider.id} 
              className={`cursor-pointer transition-all ${
                selectedProviderId === provider.id ? 'ring-2 ring-primary' : ''
              } ${!eligible ? 'opacity-60' : ''}`}
              onClick={() => eligible && onSelectProvider(provider.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{provider.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={ltvOk ? "default" : "destructive"} className="text-xs">
                      {ltvOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      LTV {provider.maxLTV * 100}%
                    </Badge>
                    <Badge variant={creditOk ? "default" : "destructive"} className="text-xs">
                      {creditOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Credit {provider.minCreditScore}+
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground mb-2">{provider.description}</p>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{(provider.baseRate * 100).toFixed(1)}% APR</p>
                    <p className="text-xs text-muted-foreground">
                      £{monthlyPayment.toFixed(0)}/month
                    </p>
                  </div>
                  {selectedProviderId === provider.id && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}