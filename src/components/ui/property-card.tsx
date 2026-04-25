import { useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TenantSelector, Tenant } from "@/components/ui/tenant-selector";
import { RenovationDialog, RenovationType } from "@/components/ui/renovation-dialog";
import { EvictionDialog } from "@/components/ui/eviction-dialog";
import { Building2, Home, Crown, TrendingUp, TrendingDown, Calculator, AlertTriangle, Heart } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { calculateMortgageEligibility } from "@/lib/mortgageEligibility";

export interface Property {
  id: string;
  name: string;
  type: "residential" | "commercial" | "luxury";
  price: number;
  value: number;
  neighborhood: string;
  monthlyIncome: number;
  image: string;
  owned?: boolean;
  marketTrend: "up" | "down" | "stable";
  mortgageRemaining?: number;
  marketValue?: number;
  yield?: number;
  lastRentIncrease?: number;
  baseRent?: number;
  lastTenantChange?: number;
  condition: "dilapidated" | "standard" | "premium";
  monthsSinceLastRenovation: number;
  internalSqft?: number;
  plotSqft?: number;
  subtype?: 'standard' | 'hmo' | 'flats' | 'multi-let';
  completedRenovationIds?: string[];
}

interface PropertyCardProps {
  property: Property;
  onBuy?: (property: Property, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => void;
  onSell?: (property: Property, isAuction?: boolean) => void;
  onSelectTenant?: (propertyId: string, tenant: Tenant) => void;
  onRemortgage?: (propertyId: string, newLoanAmount: number, providerId: string) => void;
  onRenovate?: (propertyId: string, renovation: RenovationType) => void;
  onUpgradeCondition?: (propertyId: string, target: "standard" | "premium") => void;
  activeRenovationIds?: string[];
  playerCash?: number;
  creditScore?: number;
  mortgageProviders?: any[];
  currentTenant?: Tenant;
  /** Tenant satisfaction (0-100) for the assigned tenant; renders bar + tooltip. */
  tenantSatisfaction?: number;
  tenantSatisfactionReasons?: Array<{ reason: string; delta: number }>;
  propertyListings?: any[];
  evictTenant?: (propertyId: string, ground: 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour') => void;
  cancelEviction?: (propertyId: string) => void;
  pendingEviction?: { ground: 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour'; effectiveMonth: number; servedMonth: number };
  rentArrearsCount?: number;
  mortgages?: Array<{
    propertyId: string;
    monthlyPayment: number;
    remainingBalance: number;
  }>;
  monthsPlayed?: number;
  isInConveyancing?: boolean;
  conveyancingStatus?: 'buying' | 'selling';
  conveyancingCompletion?: number;
  propertyLTV?: number;
  /** Number of active (unresolved) tenant concerns for this property. */
  activeConcernCount?: number;
  // Portfolio context for inline mortgage stress test
  ownedPropertyCount?: number;
  totalRentalIncome?: number; // pounds
  existingMonthlyMortgagePayments?: number; // pounds
  currentMarketRate?: number;
  baseMarketRate?: number;
  providerRates?: Record<string, number>;
}

const PropertyTypeIcon = {
  residential: Home,
  commercial: Building2,
  luxury: Crown,
};

const PropertyTypeColor = {
  residential: "property-residential",
  commercial: "property-commercial", 
  luxury: "property-luxury",
};

export const PropertyCard = memo(function PropertyCard({ 
  property, 
  onBuy, 
  onSell,
  onSelectTenant,
  onRenovate,
  onUpgradeCondition,
  activeRenovationIds = [],
  playerCash = 0, 
  creditScore = 600,
  mortgageProviders = [],
  currentTenant,
  tenantSatisfaction,
  tenantSatisfactionReasons = [],
  mortgages = [],
  monthsPlayed = 0,
  isInConveyancing = false,
  conveyancingStatus,
  conveyancingCompletion,
  propertyLTV = 0,
  activeConcernCount = 0,
  ownedPropertyCount = 0,
  totalRentalIncome = 0,
  existingMonthlyMortgagePayments = 0,
  currentMarketRate = 0.05,
  baseMarketRate = 0.05,
  providerRates = {},
}: PropertyCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showMortgageOptions, setShowMortgageOptions] = useState(false);
  const [showMonthlyCosts, setShowMonthlyCosts] = useState(false);
  const [mortgagePercentage, setMortgagePercentage] = useState([60]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [mortgageTermYears, setMortgageTermYears] = useState("25");
  const [mortgageType, setMortgageType] = useState<'repayment' | 'interest-only'>('repayment');
  
  const propertyType = property.type in PropertyTypeIcon ? property.type : "residential";
  const Icon = PropertyTypeIcon[propertyType];
  const mortgageAmount = (property.price * mortgagePercentage[0]) / 100;
  const cashRequired = property.price - mortgageAmount;
  const canAffordCash = playerCash >= property.price;
  const canAffordMortgage = playerCash >= cashRequired;
  
  // Calculate profit/loss based on true market value if available (for below-market purchases)
  const marketValueToUse = property.marketValue || property.value;
  const profitLoss = marketValueToUse - property.price;
  const profitPercent = ((profitLoss / property.price) * 100).toFixed(1);

  // Calculate monthly costs for owned properties
  const propertyMortgage = mortgages.find(m => m.propertyId === property.id);
  const monthlyMortgagePayment = propertyMortgage?.monthlyPayment || 0;
  const PROPERTY_TAX_RATE = 0.012; // 1.2% annual
  const MAINTENANCE_RATE = 0.008; // 0.8% annual
  const monthlyPropertyTax = (property.value * PROPERTY_TAX_RATE) / 12;
  const monthlyMaintenance = (property.value * MAINTENANCE_RATE) / 12;
  const totalMonthlyExpenses = monthlyMortgagePayment + monthlyPropertyTax + monthlyMaintenance;
  const netMonthlyIncome = property.monthlyIncome - totalMonthlyExpenses;

  const handleAction = async (action: () => void) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate transaction
    action();
    setIsLoading(false);
  };

  const handleBuyWithMortgage = () => {
    if (mortgageAmount > 0 && !selectedProviderId) {
      return; // Don't allow purchase without selecting provider
    }
    handleAction(() => {
      onBuy?.(property, mortgagePercentage[0], selectedProviderId, parseInt(mortgageTermYears), mortgageType);
      setShowMortgageOptions(false);
      setSelectedProviderId("");
      setMortgageTermYears("25");
      setMortgageType('repayment');
    });
  };

  const typeEmoji = {
    residential: "🏠",
    commercial: "🏢",
    luxury: "👑",
  };

  const typeBorderColor = {
    residential: "border-t-[hsl(var(--property-residential))]",
    commercial: "border-t-[hsl(var(--property-commercial))]",
    luxury: "border-t-[hsl(var(--property-luxury))]",
  };

  const typeGlow = {
    residential: "hover:shadow-[0_0_20px_hsl(var(--property-residential)/0.15)]",
    commercial: "hover:shadow-[0_0_20px_hsl(var(--property-commercial)/0.15)]",
    luxury: "hover:shadow-[0_0_20px_hsl(var(--property-luxury)/0.15)]",
  };

  return (
    <Card className={cn(
      "glass border-t-4 transition-all duration-300 hover:scale-[1.02] flex flex-col h-full",
      typeBorderColor[propertyType],
      typeGlow[propertyType],
      property.owned && "ring-2 ring-primary/50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{typeEmoji[propertyType]}</span>
            <CardTitle className="text-base">{property.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {isInConveyancing && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
                ⏳ {conveyancingStatus === 'buying' ? 'Buying' : 'Selling'} (Mo {conveyancingCompletion})
              </Badge>
            )}
            {property.owned && property.condition && (
              <Badge className={cn("text-[10px]",
                property.condition === 'premium' ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
                property.condition === 'dilapidated' ? "bg-red-500/20 text-red-400 border-red-500/30" :
                "bg-blue-500/20 text-blue-400 border-blue-500/30"
              )}>
                {property.condition === 'premium' ? '✨' : property.condition === 'dilapidated' ? '🏚️' : '🏠'} {property.condition}
              </Badge>
            )}
            {property.marketTrend === "up" ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : property.marketTrend === "down" ? (
              <TrendingDown className="h-4 w-4 text-danger" />
            ) : null}
            <Badge variant="outline" className="capitalize text-xs">
              {propertyType}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{property.neighborhood}</p>
        {/* Sqft + concern chips row */}
        {(property.internalSqft || activeConcernCount > 0 || property.subtype) && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {property.internalSqft && (
              <span className="text-[10px] text-muted-foreground">
                📐 {property.internalSqft.toLocaleString()} sqft
                {property.plotSqft ? ` · ${property.plotSqft.toLocaleString()} plot` : ''}
              </span>
            )}
            {property.subtype && property.subtype !== 'standard' && (
              <Badge variant="outline" className="text-[10px] uppercase border-primary/40 text-primary">
                {property.subtype}
              </Badge>
            )}
            {activeConcernCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-red-400/40 text-red-400">
                🛠️ {activeConcernCount} concern{activeConcernCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Price:</span>
            <span className="font-bold text-lg">
              £{property.price.toLocaleString()}
            </span>
          </div>
          
          {property.owned && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Market Value:</span>
                <span className="font-bold">
                  £{marketValueToUse.toLocaleString()}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Profit/Loss:</span>
                <span className={cn(
                  "font-bold",
                  profitLoss >= 0 ? "text-success" : "text-danger"
                )}>
                  {profitLoss >= 0 ? "+" : ""}£{profitLoss.toLocaleString()} ({profitPercent}%)
                </span>
              </div>
              
              {property.marketValue && property.marketValue > property.price && (
                <div className="text-xs text-muted-foreground italic">
                  * Purchased £{(property.marketValue - property.price).toLocaleString()} below market
                </div>
              )}
            </>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Monthly Income:</span>
            <Badge className="bg-success/20 text-success border-success/30 hover:bg-success/30">
              £{property.monthlyIncome.toLocaleString()}/mo
            </Badge>
          </div>

          {/* Per-property LTV */}
          {property.owned && propertyLTV > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">LTV:</span>
              <span className={cn(
                "font-semibold text-sm",
                propertyLTV > 80 ? "text-danger" :
                propertyLTV > 60 ? "text-yellow-400" :
                "text-success"
              )}>
                {propertyLTV.toFixed(1)}%
              </span>
            </div>
          )}

          {property.owned && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMonthlyCosts(!showMonthlyCosts)}
                className="w-full justify-between text-xs h-7"
              >
                <span className="flex items-center gap-1">
                  <Calculator className="h-3 w-3" />
                  Monthly Cost Breakdown
                </span>
                <span className={cn(
                  "font-semibold",
                  netMonthlyIncome >= 0 ? "text-success" : "text-danger"
                )}>
                  Net: £{netMonthlyIncome.toLocaleString()}/mo
                </span>
              </Button>

              {showMonthlyCosts && (
                <div className="space-y-1.5 pt-2 border-t text-xs">
                  <div className="flex justify-between items-center text-success">
                    <span>+ Rental Income:</span>
                    <span className="font-medium">£{property.monthlyIncome.toLocaleString()}</span>
                  </div>
                  
                  {monthlyMortgagePayment > 0 && (
                    <div className="flex justify-between items-center text-danger">
                      <span>- Mortgage Payment:</span>
                      <span className="font-medium">£{monthlyMortgagePayment.toLocaleString()}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>- Property Tax (1.2%):</span>
                    <span className="font-medium">£{monthlyPropertyTax.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>- Maintenance (0.8%):</span>
                    <span className="font-medium">£{monthlyMaintenance.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between items-center pt-1.5 border-t font-semibold">
                    <span>Net Monthly Income:</span>
                    <span className={cn(
                      netMonthlyIncome >= 0 ? "text-success" : "text-danger"
                    )}>
                      £{netMonthlyIncome.toLocaleString()}/mo
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {!property.owned && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Annual Yield:</span>
              <span className="font-semibold text-[hsl(var(--stat-credit))]">
                {((property.monthlyIncome * 12 / property.price) * 100).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {property.owned ? (
          <div className="space-y-3">
            {isInConveyancing ? (
              <div className="text-center py-3 text-sm text-muted-foreground italic">
                ⏳ In conveyancing — actions disabled
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 mt-auto">
                  {onSelectTenant && (
                    <TenantSelector
                      propertyId={property.id}
                      baseRent={property.baseRent || property.monthlyIncome}
                      onSelectTenant={onSelectTenant}
                      currentTenant={currentTenant}
                      currentMonthlyRent={property.monthlyIncome}
                      lastTenantChange={property.lastTenantChange}
                      monthsPlayed={monthsPlayed}
                      condition={property.condition}
                      propertyValue={property.value}
                      propertyYield={property.yield}
                      currentSatisfaction={tenantSatisfaction}
                      satisfactionReasons={tenantSatisfactionReasons}
                    />
                  )}
                  {/* Satisfaction bar — only when a tenant is assigned */}
                  {currentTenant && typeof tenantSatisfaction === 'number' && (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2 px-1 cursor-help">
                            <Heart className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              tenantSatisfaction >= 70 ? "text-emerald-400 fill-emerald-400/30" :
                              tenantSatisfaction >= 40 ? "text-amber-400 fill-amber-400/30" :
                              "text-red-400 fill-red-400/30"
                            )} />
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full transition-all",
                                  tenantSatisfaction >= 70 ? "bg-emerald-400" :
                                  tenantSatisfaction >= 40 ? "bg-amber-400" :
                                  "bg-red-400"
                                )}
                                style={{ width: `${tenantSatisfaction}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                              {Math.round(tenantSatisfaction)}%
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="text-xs font-semibold mb-1">Tenant Satisfaction</div>
                          {tenantSatisfactionReasons && tenantSatisfactionReasons.length > 0 ? (
                            <ul className="space-y-0.5">
                              {tenantSatisfactionReasons.slice(0, 3).map((r, i) => (
                                <li key={i} className="text-[11px] flex justify-between gap-2">
                                  <span>{r.reason}</span>
                                  <span className={r.delta >= 0 ? "text-emerald-400" : "text-red-400"}>
                                    {r.delta > 0 ? '+' : ''}{r.delta}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-[11px] text-muted-foreground">Stable — no recent changes.</div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {/* Rent pending hint when tenant just moved in */}
                  {currentTenant && property.monthlyIncome === 0 && (
                    <div className="text-[10px] text-amber-400 italic px-1">
                      ⏳ Rent pending — tenant just moved in
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {onRenovate && (
                    <RenovationDialog
                      propertyId={property.id}
                      propertyValue={property.value}
                      currentRent={property.monthlyIncome}
                      playerCash={playerCash}
                      onRenovate={onRenovate}
                      activeRenovations={activeRenovationIds}
                      completedRenovationIds={property.completedRenovationIds}
                      propertyType={propertyType}
                      internalSqft={property.internalSqft}
                      plotSqft={property.plotSqft}
                      currentSubtype={property.subtype}
                    />
                  )}
                  {onUpgradeCondition && property.condition !== 'premium' && (() => {
                    const target: 'standard' | 'premium' = property.condition === 'dilapidated' ? 'standard' : 'premium';
                    // Cost matches getConditionUpgradeCost (8% standard, 15% premium)
                    const costPct = target === 'standard' ? 0.08 : 0.15;
                    const cost = Math.floor(property.value * costPct);
                    const newMult = target === 'premium' ? 1.25 : 1.0;
                    const canAfford = playerCash >= cost;
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(() => onUpgradeCondition(property.id, target))}
                        disabled={isLoading || !canAfford}
                        className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                      >
                        ✨ Upgrade to {target} (£{cost.toLocaleString()} → {newMult}× rent)
                      </Button>
                    );
                  })()}
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleAction(() => onSell?.(property, false))}
                    disabled={isLoading}
                  >
                    List for Sale
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {!showMortgageOptions ? (
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  className="w-full bg-gradient-primary hover:opacity-90" 
                  onClick={() => handleAction(() => onBuy?.(property, 0))}
                  disabled={!canAffordCash || isLoading}
                >
                  {isLoading ? "Buying..." : !canAffordCash ? "Not Enough Cash" : "Buy Cash"}
                </Button>
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowMortgageOptions(true)}
                >
                  Mortgage
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Mortgage: {mortgagePercentage[0]}%</Label>
                  <Slider
                    value={mortgagePercentage}
                    onValueChange={setMortgagePercentage}
                    max={95}
                    min={50}
                    step={5}
                    className="w-full"
                  />
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Mortgage: £{mortgageAmount.toLocaleString()}</div>
                    <div>Cash needed: £{cashRequired.toLocaleString()}</div>
                  </div>
                </div>
                
                {mortgageAmount > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-sm font-medium">Term</Label>
                        <Select value={mortgageTermYears} onValueChange={setMortgageTermYears}>
                          <SelectTrigger className="h-8">
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
                      
                      <div>
                        <Label className="text-sm font-medium">Type</Label>
                        <RadioGroup 
                          value={mortgageType} 
                          onValueChange={(value: 'repayment' | 'interest-only') => setMortgageType(value)}
                          className="flex gap-4 mt-1"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="repayment" id="repayment" />
                            <Label htmlFor="repayment" className="text-xs">Repayment</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="interest-only" id="interest-only" />
                            <Label htmlFor="interest-only" className="text-xs">Interest Only</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Choose Mortgage Provider:</Label>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {mortgageProviders.map((provider: any) => {
                          const requiredLTV = mortgageAmount / property.price;
                          const eligible = requiredLTV <= provider.maxLTV && creditScore >= provider.minCreditScore;
                          
                          // Calculate estimated monthly payment
                          const interestRate = provider.baseRate + ((700 - creditScore) / 1000) * 0.02;
                          const monthlyInterest = interestRate / 12;
                          let estimatedMonthly: number;
                          
                          if (mortgageType === 'interest-only') {
                            estimatedMonthly = mortgageAmount * monthlyInterest;
                          } else {
                            const totalPayments = parseInt(mortgageTermYears) * 12;
                            estimatedMonthly = mortgageAmount * (monthlyInterest * Math.pow(1 + monthlyInterest, totalPayments)) / (Math.pow(1 + monthlyInterest, totalPayments) - 1);
                          }
                          
                          return (
                            <div 
                              key={provider.id}
                              className={`p-2 border rounded cursor-pointer transition-colors ${
                                selectedProviderId === provider.id ? 'border-primary bg-primary/10' : 'border-border'
                              } ${!eligible ? 'opacity-50' : ''}`}
                              onClick={() => eligible && setSelectedProviderId(provider.id)}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-sm">{provider.name}</span>
                                <span className="text-xs">{(provider.baseRate * 100).toFixed(1)}%</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {eligible ? `£${Math.round(estimatedMonthly).toLocaleString()}/mo (${mortgageType})` : `Requires ${provider.minCreditScore}+ credit, ${(provider.maxLTV * 100)}% max LTV`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inline mortgage summary + eligibility */}
                    {(() => {
                      if (!selectedProviderId) return null;
                      const provider = mortgageProviders.find((p: any) => p.id === selectedProviderId);
                      if (!provider) return null;

                      const providerBaseRate = (providerRates[provider.id] ?? provider.baseRate) + currentMarketRate - baseMarketRate;
                      const eligibility = calculateMortgageEligibility({
                        creditScore,
                        loanAmount: mortgageAmount,
                        propertyValue: property.price,
                        propertyMonthlyRent: property.monthlyIncome,
                        providerBaseRate,
                        providerMinCreditScore: provider.minCreditScore,
                        providerMaxLTV: provider.maxLTV,
                        providerId: provider.id,
                        termYears: parseInt(mortgageTermYears),
                        mortgageType,
                        existingMonthlyMortgagePayments,
                        totalRentalIncome,
                        ownedPropertyCount,
                      });

                      const monthly = eligibility.monthlyPayment;
                      const totalPayable = mortgageType === 'interest-only'
                        ? monthly * parseInt(mortgageTermYears) * 12 + mortgageAmount
                        : monthly * parseInt(mortgageTermYears) * 12;
                      const totalInterest = totalPayable - mortgageAmount;
                      const stressLabel = ownedPropertyCount >= 3 ? 'Portfolio Stress Test (125%)' : 'Property Stress Test (100%)';

                      return (
                        <div className="space-y-2">
                          <div className="rounded border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Monthly Payment:</span>
                              <span className="font-bold text-foreground">£{Math.round(monthly).toLocaleString()}/mo</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Payable:</span>
                              <span className="font-medium">£{Math.round(totalPayable).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Interest:</span>
                              <span className="font-medium">£{Math.round(totalInterest).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-border/50">
                              <span className="text-muted-foreground">{stressLabel}:</span>
                              <span className={cn("font-medium", eligibility.icrRatio && eligibility.icrRatio >= (ownedPropertyCount >= 3 ? 1.25 : 1) ? "text-success" : "text-danger")}>
                                {eligibility.icrRatio ? `${(eligibility.icrRatio * 100).toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          </div>
                          {!eligibility.eligible && (
                            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span>{eligibility.reason}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
                {(() => {
                  // Compute eligibility for the buy button disable
                  let inlineBlocked = false;
                  if (mortgageAmount > 0 && selectedProviderId) {
                    const provider = mortgageProviders.find((p: any) => p.id === selectedProviderId);
                    if (provider) {
                      const providerBaseRate = (providerRates[provider.id] ?? provider.baseRate) + currentMarketRate - baseMarketRate;
                      const elig = calculateMortgageEligibility({
                        creditScore, loanAmount: mortgageAmount, propertyValue: property.price,
                        propertyMonthlyRent: property.monthlyIncome, providerBaseRate,
                        providerMinCreditScore: provider.minCreditScore, providerMaxLTV: provider.maxLTV,
                        providerId: provider.id, termYears: parseInt(mortgageTermYears), mortgageType,
                        existingMonthlyMortgagePayments, totalRentalIncome, ownedPropertyCount,
                      });
                      inlineBlocked = !elig.eligible;
                    }
                  }
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        className="w-full bg-gradient-primary hover:opacity-90" 
                        onClick={handleBuyWithMortgage}
                        disabled={!canAffordMortgage || isLoading || (mortgageAmount > 0 && !selectedProviderId) || inlineBlocked}
                      >
                        {isLoading ? "Buying..." : !canAffordMortgage ? "Not Enough Cash" : inlineBlocked ? "Not Eligible" : "Buy"}
                      </Button>
                      <Button 
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setShowMortgageOptions(false);
                          setSelectedProviderId("");
                          setMortgageTermYears("25");
                          setMortgageType('repayment');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});