import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertTriangle } from "lucide-react";

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
  playerDTI?: number; // Current debt-to-income ratio
  totalRentalIncome?: number;
}

// DTI limits per provider
const PROVIDER_DTI_LIMITS: Record<string, number> = {
  hsbc: 0.50,
  nationwide: 0.50,
  halifax: 0.65,
  quickcash: 0.80,
  easyloan: 0.80,
};

export function MortgageProviderSelector({
  providers,
  playerCash,
  propertyValue,
  mortgageAmount,
  playerCreditScore,
  onSelectProvider,
  selectedProviderId,
  playerDTI = 0,
  totalRentalIncome = 0
}: MortgageProviderSelectorProps) {
  const requiredLTV = mortgageAmount / propertyValue;

  const getProviderEligibility = (provider: MortgageProvider) => {
    const ltvOk = requiredLTV <= provider.maxLTV;
    const creditOk = playerCreditScore >= provider.minCreditScore;
    const dtiLimit = PROVIDER_DTI_LIMITS[provider.id] || 0.80;
    const dtiOk = playerDTI <= dtiLimit;
    return { ltvOk, creditOk, dtiOk, eligible: ltvOk && creditOk && dtiOk };
  };

  const getApplicationRisk = (provider: MortgageProvider) => {
    const creditMargin = playerCreditScore - provider.minCreditScore;
    const dtiLimit = PROVIDER_DTI_LIMITS[provider.id] || 0.80;
    const dtiMargin = dtiLimit - playerDTI;
    
    if (creditMargin < 20 || dtiMargin < 0.05) return 'high';
    if (creditMargin < 50 || dtiMargin < 0.15) return 'medium';
    return 'low';
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
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <span>Credit Score: {playerCreditScore}</span>
        <span>|</span>
        <span>Required LTV: {(requiredLTV * 100).toFixed(1)}%</span>
        <span>|</span>
        <span>DTI: {(playerDTI * 100).toFixed(0)}%</span>
      </div>
      
      <div className="grid gap-3 max-h-64 overflow-y-auto">
        {providers.map((provider) => {
          const { ltvOk, creditOk, dtiOk, eligible } = getProviderEligibility(provider);
          const monthlyPayment = calculateMonthlyPayment(provider);
          const risk = getApplicationRisk(provider);
          
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
                  <div className="flex items-center gap-1">
                    <Badge variant={ltvOk ? "default" : "destructive"} className="text-xs">
                      {ltvOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      LTV {(provider.maxLTV * 100).toFixed(0)}%
                    </Badge>
                    <Badge variant={creditOk ? "default" : "destructive"} className="text-xs">
                      {creditOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      Credit {provider.minCreditScore}+
                    </Badge>
                    <Badge variant={dtiOk ? "default" : "destructive"} className="text-xs">
                      {dtiOk ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      DTI {((PROVIDER_DTI_LIMITS[provider.id] || 0.80) * 100).toFixed(0)}%
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
                  <div className="flex items-center gap-2">
                    {eligible && (
                      <Badge variant="outline" className={`text-xs ${
                        risk === 'high' ? 'border-red-300 text-red-600' :
                        risk === 'medium' ? 'border-yellow-300 text-yellow-600' :
                        'border-green-300 text-green-600'
                      }`}>
                        {risk === 'high' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {risk === 'high' ? 'High Risk' : risk === 'medium' ? 'Medium Risk' : 'Low Risk'}
                      </Badge>
                    )}
                    {selectedProviderId === provider.id && (
                      <Check className="w-5 h-5 text-primary" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
