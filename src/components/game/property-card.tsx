import { useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TenantSelector, Tenant } from "@/components/game/tenant-selector";
import { RenovationDialog, RenovationType } from "@/components/game/renovation-dialog";
import { FurnishingDialog } from "@/components/game/furnishing-dialog";
import { EvictionDialog } from "@/components/game/eviction-dialog";
import { RentNegotiationDialog } from "@/components/game/rent-negotiation-dialog";
import { Building2, Home, Crown, TrendingUp, TrendingDown, Calculator, AlertTriangle, Heart, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { calculateMortgageEligibility } from "@/lib/mortgageEligibility";
import { getMarketRentPounds } from "@/lib/engine/market";
import { RepairBar } from "@/components/game/repair-bar";
import { MultiUnitSlots } from "@/components/game/multi-unit-slots";
import { useGameStore } from "@/stores/gameStore";
import { TENANT_MIN_CONDITION, CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT, MAX_TOPUP_POINTS_PER_MONTH } from "@/lib/engine/constants";
import { fromPennies } from "@/lib/formatCurrency";
import { getFurnitureValuePennies } from "@/lib/engine/financials";

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
  conditionScore?: number;
  monthsSinceLastRenovation: number;
  internalSqft?: number;
  plotSqft?: number;
  subtype?: 'standard' | 'hmo' | 'flats' | 'multi-let';
  completedRenovationIds?: string[];
  renovationCompletionMonths?: Record<string, number>;
  subtypeUnits?: number;
  totalRenovationSpendPennies?: number;
  epcRating?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  furnishingTier?: 'unfurnished' | 'part_furnished' | 'fully_furnished';
  furnishingMonthsRemaining?: number;
  /** Phase 4 #15a — commercial use class. */
  useClass?: 'E' | 'sui_generis';
  /** Phase 4 #13 — commercial FRI lease metadata. */
  commercialLease?: {
    fri: boolean;
    termMonths: number;
    startMonth: number;
    expiryMonth: number;
    renewalWarnedMonth?: number;
  };
  /** Phase 5 #16 — uninhabitable auction stock (no kitchen/bathroom). */
  needsRefurb?: boolean;
  /** Phase 4 #3 — city. */
  city?: 'middlesbrough' | 'leeds' | 'manchester' | 'london';
  /** Phase 4 #2 — leasehold flat title-split metadata. */
  titleSplitOf?: string;
  flatUnitId?: number;
  isLeasehold?: boolean;
  serviceChargePctAnnual?: number;
  groundRentPennies?: number;
}


interface PropertyCardProps {
  property: Property;
  onBuy?: (property: Property, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => void;
  onSell?: (property: Property, isAuction?: boolean) => void;
  onSelectTenant?: (propertyId: string, tenant: Tenant, slotIndex?: number) => void;
  onRemortgage?: (propertyId: string, newLoanAmount: number, providerId: string) => void;
  onRenovate?: (propertyId: string, renovation: RenovationType) => void;
  activeRenovationIds?: string[];
  playerCash?: number;
  creditScore?: number;
  mortgageProviders?: any[];
  currentTenant?: Tenant;
  /** Tenant satisfaction (0-100) for the assigned tenant; renders bar + tooltip. */
  tenantSatisfaction?: number;
  tenantSatisfactionReasons?: Array<{ reason: string; delta: number }>;
  propertyListings?: any[];
  evictTenant?: (propertyId: string, ground: 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour', slotIndex?: number) => void;
  cancelEviction?: (propertyId: string, slotIndex?: number) => void;
  pendingEviction?: { ground: 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour'; effectiveMonth: number; servedMonth: number };
  rentArrearsCount?: number;
  /** Item 2: total £ in arrears across slots (pennies). Used for the arrears pill. */
  arrearsPenniesTotal?: number;
  /** Tenant satisfaction passed for negotiation acceptance probability. */
  applyRentIncrease?: (propertyId: string, newRentPounds: number, outcome: 'accepted' | 'counter_accepted' | 'tribunal_landlord' | 'tribunal_tenant', tribunalFeePounds: number, slotIndex?: number) => void;
  /** Per-slot tenant data for HMOs / converted flats. When set, single-tenant block is replaced with multi-unit panel. */
  multiUnitSlots?: import("@/components/game/multi-unit-slots").MultiUnitSlot[];
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
  /** Pending/approved planning applications scoped to THIS property. */
  planningApplications?: Array<{ id: string; renovationTypeId: string; status: 'pending' | 'approved' | 'refused'; decisionMonth: number; submittedMonth: number }>;
  /** Full planning history across portfolio — used to show live track-record adjustment. */
  planningHistory?: Array<{ status: 'pending' | 'approved' | 'refused' }>;
  /** True if this property has an active planning_cooldown lock (legacy property-wide). */
  inPlanningCooldown?: boolean;
  /** Active property locks (passed to RenovationDialog for per-renovation cooldown). */
  propertyLocks?: Array<{ propertyId: string; reason: string; untilMonth: number; renovationTypeId?: string }>;
  /** True when ANY slot of the property is occupied — used to gate conversions. */
  hasAnyTenant?: boolean;
  /** True if a debt-recovery case is already in court for this property's tenant. */
  hasActiveDebtRecovery?: boolean;
  /** File a county-court claim for back-rent (£325 fee). */
  onSendToCourt?: (propertyId: string, slotIndex?: number) => void;
  /** Phase 4 #2 — title-split a converted flat into its own leasehold property. */
  onSplitFlatUnit?: (propertyId: string, slotIndex: number, groundRentMode: 'peppercorn' | 'percent') => void;
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
  planningApplications = [],
  planningHistory = [],
  inPlanningCooldown = false,
  propertyLocks = [],
  hasAnyTenant = false,
  evictTenant,
  cancelEviction,
  pendingEviction,
  rentArrearsCount = 0,
  arrearsPenniesTotal = 0,
  applyRentIncrease,
  multiUnitSlots,
  hasActiveDebtRecovery = false,
  onSendToCourt,
  onSplitFlatUnit,
}: PropertyCardProps) {

  const [isLoading, setIsLoading] = useState(false);
  const [showMortgageOptions, setShowMortgageOptions] = useState(false);
  const [showMonthlyCosts, setShowMonthlyCosts] = useState(false);
  /** Collapsed financial detail by default for owned properties — keeps cards compact. */
  const [financialsExpanded, setFinancialsExpanded] = useState(false);
  const [mortgagePercentage, setMortgagePercentage] = useState([60]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [mortgageTermYears, setMortgageTermYears] = useState("25");
  const [mortgageType, setMortgageType] = useState<'repayment' | 'interest-only'>('repayment');
  const topUpCondition = useGameStore(s => s.topUpCondition);
  const conditionScore = typeof property.conditionScore === 'number'
    ? property.conditionScore
    : (property.condition === 'premium' ? 85 : property.condition === 'dilapidated' ? 25 : 60);
  const topUpSqft = Math.max(400, property.internalSqft ?? 900);
  const topUpCostPounds20 = Math.round(fromPennies(CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT * topUpSqft * 20 / 100));
  
  const propertyType = property.type in PropertyTypeIcon ? property.type : "residential";
  const Icon = PropertyTypeIcon[propertyType];
  const mortgageAmount = (property.price * mortgagePercentage[0]) / 100;
  // v4 #1 — itemised buying costs (pounds): solicitor + stamp duty + mortgage fee.
  const solicitorFeePounds = 600;
  const stampDutyPounds = property.price <= 250000
    ? property.price * 0.03
    : (250000 * 0.03) + ((property.price - 250000) * 0.08);
  const mortgageFeePounds = Math.round(mortgageAmount * 0.01);
  const buyingFeesTotalPounds = Math.round(solicitorFeePounds + stampDutyPounds + (mortgageAmount > 0 ? mortgageFeePounds : 0));
  const cashFeesOnly = Math.round(solicitorFeePounds + stampDutyPounds);
  const cashRequired = property.price - mortgageAmount + buyingFeesTotalPounds;
  const canAffordCash = playerCash >= (property.price + cashFeesOnly);
  const canAffordMortgage = playerCash >= cashRequired;

  // Cost basis: purchase price + cumulative renovation spend
  const renovationSpendPounds = Math.round((property.totalRenovationSpendPennies || 0) / 100);
  const totalInvested = property.price + renovationSpendPounds;
  const marketValueToUse = property.marketValue || property.value;
  const equityVsMarket = marketValueToUse - totalInvested;
  const equityPct = totalInvested > 0 ? ((equityVsMarket / totalInvested) * 100).toFixed(1) : "0.0";
  // Item #9: pure capital appreciation since purchase, separate from renovation spend.
  const marketValueGain = marketValueToUse - property.price;
  const marketValueGainPct = property.price > 0 ? ((marketValueGain / property.price) * 100).toFixed(1) : "0.0";


  // Calculate monthly costs for owned properties
  const propertyMortgage = mortgages.find(m => m.propertyId === property.id);
  const monthlyMortgagePayment = propertyMortgage?.monthlyPayment || 0;
  const INSURANCE_RATE = 0.004; // 0.4% annual landlord insurance
  const MAINTENANCE_RATE = 0.008; // 0.8% annual
  const COUNCIL_TAX_MONTHLY = 150; // Band D, vacant properties only
  const monthlyInsurance = (property.value * INSURANCE_RATE) / 12;
  const monthlyMaintenance = (property.value * MAINTENANCE_RATE) / 12;
  const propertyHasTenant = !!currentTenant;
  const monthlyCouncilTax = propertyHasTenant ? 0 : COUNCIL_TAX_MONTHLY;
  const totalMonthlyExpenses = monthlyMortgagePayment + monthlyInsurance + monthlyMaintenance + monthlyCouncilTax;
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
      "glass border-t-4 transition-all duration-300 hover:scale-[1.02] flex flex-col",
      typeBorderColor[propertyType],
      typeGlow[propertyType],
      property.owned && "ring-2 ring-primary/50"
    )}>
      <CardHeader className="pb-1 pt-2">

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
            {property.epcRating && (
              <Badge className={cn("text-[10px]",
                ['A','B','C'].includes(property.epcRating) ? "bg-green-500/20 text-green-400 border-green-500/30" :
                ['D','E'].includes(property.epcRating) ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                "bg-red-500/20 text-red-400 border-red-500/30"
              )}>
                EPC {property.epcRating}
              </Badge>
            )}
            {/* Repair Bar replaces 3-tier condition badge — surfaced in body */}
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
        {(property.internalSqft || activeConcernCount > 0 || property.subtype || currentTenant || rentArrearsCount > 0 || (property.furnishingTier && property.furnishingTier !== 'unfurnished')) && (
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
            {property.furnishingTier && property.furnishingTier !== 'unfurnished' && (() => {
              const furniturePounds = Math.round(getFurnitureValuePennies(property) / 100);
              const monthsLeft = property.furnishingMonthsRemaining ?? 0;
              const label = property.furnishingTier === 'fully_furnished' ? 'Fully furnished' : 'Part furnished';
              return (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-400/40 text-amber-300 bg-amber-500/10"
                  title={`${label} — ${monthsLeft} mo of useful life remaining`}
                >
                  🛋️ £{furniturePounds.toLocaleString()} · {monthsLeft}mo
                </Badge>
              );
            })()}
            {currentTenant && typeof currentTenant.defaultRisk === 'number' && (() => {
              const r = currentTenant.defaultRisk;
              const band = r <= 10 ? { label: 'Low Risk', cls: 'border-green-400/40 text-green-400' }
                : r <= 25 ? { label: 'Med Risk', cls: 'border-amber-400/40 text-amber-400' }
                : { label: 'High Risk', cls: 'border-red-400/40 text-red-400' };
              return (
                <Badge variant="outline" className={cn("text-[10px]", band.cls)} title={`Tenant default risk: ${r.toFixed(1)}%`}>
                  👤 {band.label}
                </Badge>
              );
            })()}
            {activeConcernCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-red-400/40 text-red-400">
                🛠️ {activeConcernCount} concern{activeConcernCount > 1 ? 's' : ''}
              </Badge>
            )}
            {rentArrearsCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] border-red-500/60 text-red-300 bg-red-500/10"
                title={rentArrearsCount >= 2 ? 'Section 8 eviction available' : 'Tenant has missed rent'}
              >
                💸 {rentArrearsCount}mo · £{Math.round(arrearsPenniesTotal / 100).toLocaleString()} owed
              </Badge>
            )}
            {hasActiveDebtRecovery && (
              <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-300 bg-amber-500/10" title="Debt-recovery case in court">
                ⚖️ In court
              </Badge>
            )}
            {rentArrearsCount >= 2 && !hasActiveDebtRecovery && onSendToCourt && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] border-amber-400/40 text-amber-300 hover:bg-amber-500/10"
                onClick={() => {
                  if (window.confirm(`File a county-court claim against the tenant?\n\n• Filing fee: £325\n• Resolution: 6–12 months\n• Agency keeps 25% of recovered amount\n\nThis clears arrears off the books while the case is in progress.`)) {
                    onSendToCourt(property.id, 0);
                  }
                }}
              >
                ⚖️ Send to court
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-1 pb-2">
        {property.owned ? (
          <>
            {/* Compact mini-grid — always visible. Tap "Details" to expand. */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-md bg-muted/30 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Value</div>
                <div className="text-sm font-bold leading-tight">£{(marketValueToUse / 1000).toFixed(0)}k</div>
              </div>
              <div className="rounded-md bg-muted/30 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Net /mo</div>
                <div className={cn(
                  "text-sm font-bold leading-tight",
                  netMonthlyIncome >= 0 ? "text-success" : "text-danger"
                )}>
                  £{netMonthlyIncome.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md bg-muted/30 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {propertyLTV > 0 ? 'LTV' : 'Market Value Gain'}
                </div>
                <div className={cn(
                  "text-sm font-bold leading-tight",
                  propertyLTV > 0
                    ? (propertyLTV > 80 ? "text-danger" : propertyLTV > 60 ? "text-yellow-400" : "text-success")
                    : (marketValueGain >= 0 ? "text-success" : "text-danger")
                )}>
                  {propertyLTV > 0 ? `${propertyLTV.toFixed(0)}%` : `${marketValueGain >= 0 ? '+' : ''}${marketValueGainPct}%`}
                </div>
              </div>

            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFinancialsExpanded(!financialsExpanded)}
              className="w-full justify-between text-[10px] h-6 px-2 text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1">
                {financialsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {financialsExpanded ? 'Hide details' : 'Details'}
              </span>
              <span>Rent £{property.monthlyIncome.toLocaleString()}/mo</span>
            </Button>

            {financialsExpanded && (
              <div className="space-y-1.5 pt-1 border-t border-border/40 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Purchase price</span>
                  <span className="font-medium">£{property.price.toLocaleString()}</span>
                </div>
                {renovationSpendPounds > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Renovation spend</span>
                      <span className="font-medium text-amber-300">£{renovationSpendPounds.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total invested</span>
                      <span className="font-medium">£{totalInvested.toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Market value</span>
                  <span className="font-medium">£{marketValueToUse.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {renovationSpendPounds > 0 ? 'Equity vs market' : 'Profit/Loss'}
                  </span>
                  <span className={cn("font-medium", equityVsMarket >= 0 ? "text-success" : "text-danger")}>
                    {equityVsMarket >= 0 ? "+" : ""}£{equityVsMarket.toLocaleString()} ({equityPct}%)
                  </span>
                </div>
                {property.marketValue && property.marketValue > property.price && (
                  <div className="text-[10px] text-muted-foreground italic">
                    * Purchased £{(property.marketValue - property.price).toLocaleString()} below market
                  </div>
                )}

                <div className="pt-1.5 border-t border-border/40 space-y-1">
                  <div className="flex justify-between items-center text-success">
                    <span>+ Rental income</span>
                    <span className="font-medium">£{property.monthlyIncome.toLocaleString()}</span>
                  </div>
                  {monthlyMortgagePayment > 0 && (
                    <div className="flex justify-between items-center text-danger">
                      <span>− Mortgage</span>
                      <span className="font-medium">£{monthlyMortgagePayment.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>− Insurance (0.4%)</span>
                    <span className="font-medium">£{Math.round(monthlyInsurance).toLocaleString()}</span>
                  </div>
                  {monthlyCouncilTax > 0 && (
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>− Council tax (vacant)</span>
                      <span className="font-medium">£{monthlyCouncilTax.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>− Maintenance (0.8%)</span>
                    <span className="font-medium">£{Math.round(monthlyMaintenance).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-border/40 font-semibold">
                    <span>Net monthly</span>
                    <span className={cn(netMonthlyIncome >= 0 ? "text-success" : "text-danger")}>
                      £{netMonthlyIncome.toLocaleString()}/mo
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Unowned (estate-agent / marketplace) cards keep the original layout. */
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Price:</span>
              <span className="font-bold text-lg">£{property.price.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium" title="Estimated Rental Value">ERV:</span>
              <Badge className="bg-success/20 text-success border-success/30 hover:bg-success/30">
                £{property.monthlyIncome.toLocaleString()}/mo
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Annual Yield:</span>
              <span className="font-semibold text-[hsl(var(--stat-credit))]">
                {((property.monthlyIncome * 12 / property.price) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        )}


        {property.owned ? (
          <div className="space-y-3">
            {isInConveyancing ? (
              <div className="text-center py-3 text-sm text-muted-foreground italic">
                ⏳ In conveyancing — actions disabled
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2">
                  {multiUnitSlots && multiUnitSlots.length > 0 && onSelectTenant ? (
                    <MultiUnitSlots
                      propertyId={property.id}
                      propertyName={property.name}
                      subtype={(property.subtype as 'hmo' | 'flats')}
                      baseRentPerUnitPounds={Math.round(
                        ((property.baseRent || property.monthlyIncome) || 0) / multiUnitSlots.length
                      )}
                      propertyValue={property.value}
                      propertyYield={property.yield}
                      condition={property.condition}
                      conditionScore={conditionScore}
                      monthsPlayed={monthsPlayed}
                      playerCash={playerCash}
                      slots={multiUnitSlots}
                      lastRentIncreaseMonth={property.lastRentIncrease}
                      onSelectTenant={onSelectTenant}
                      evictTenant={evictTenant}
                      cancelEviction={cancelEviction}
                      applyRentIncrease={applyRentIncrease}
                      furnishingTier={(property as any).furnishingTier}
                    />
                  ) : (
                    onSelectTenant && (
                      <TenantSelector
                        propertyId={property.id}
                        baseRent={property.baseRent || property.monthlyIncome}
                        onSelectTenant={onSelectTenant}
                        currentTenant={currentTenant}
                        currentMonthlyRent={property.monthlyIncome}
                        lastTenantChange={property.lastTenantChange}
                        monthsPlayed={monthsPlayed}
                        condition={property.condition}
                        conditionScore={conditionScore}
                        propertyValue={property.value}
                        propertyYield={property.yield}
                        currentSatisfaction={tenantSatisfaction}
                        satisfactionReasons={tenantSatisfactionReasons}
                        furnishingTier={(property as any).furnishingTier}
                      />
                    )
                  )}
                  {/* Repair Bar + quick top-up */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <RepairBar score={conditionScore} />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] px-2"
                      onClick={() => topUpCondition(property.id, 20)}
                      disabled={conditionScore >= 100}
                      title={`Top up +20 condition · approx £${topUpCostPounds20.toLocaleString()} (cap ${MAX_TOPUP_POINTS_PER_MONTH}/mo)`}
                    >
                      🛠 +20
                    </Button>
                  </div>
                  {!multiUnitSlots && <>
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
                  {/* Eviction notice banner OR serve-notice button */}
                  {currentTenant && pendingEviction && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 flex items-center justify-between gap-2">
                      <div className="text-[11px]">
                        <div className="font-semibold text-destructive">Eviction notice served</div>
                        <div className="text-muted-foreground">
                          Ground: {pendingEviction.ground.replace(/_/g, ' ')} · Vacates by month {pendingEviction.effectiveMonth}
                        </div>
                      </div>
                      {cancelEviction && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[10px] h-7"
                          onClick={() => cancelEviction(property.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                  {currentTenant && !pendingEviction && evictTenant && (
                    <div className="grid grid-cols-2 gap-2">
                      {applyRentIncrease && (
                        <RentNegotiationDialog
                          propertyId={property.id}
                          propertyName={property.name}
                          currentRent={property.monthlyIncome}
                          marketRent={
                            getMarketRentPounds({
                              value: property.value,
                              marketValue: property.marketValue,
                              yield: property.yield,
                              condition: property.condition as any,
                              subtype: property.subtype,
                              subtypeUnits: property.subtypeUnits,
                              completedRenovationIds: property.completedRenovationIds,
                              totalRenovationSpendPennies: property.totalRenovationSpendPennies,
                              furnishingTier: property.furnishingTier,
                              epcRating: property.epcRating,
                              currentRentPounds: property.monthlyIncome,
                              baselineRentPounds: property.baseRent || property.monthlyIncome,
                            }) || property.monthlyIncome
                          }

                          totalRenovationSpendPennies={property.totalRenovationSpendPennies}
                          furnishingTier={property.furnishingTier}
                          epcRating={property.epcRating}



                          monthsSinceLastIncrease={
                            property.lastRentIncrease !== undefined
                              ? Math.max(0, (monthsPlayed ?? 0) - property.lastRentIncrease)
                              : 999
                          }
                          tenant={currentTenant}
                          tenantSatisfaction={tenantSatisfaction ?? 80}
                          playerCash={playerCash ?? 0}
                          onApply={applyRentIncrease}
                        />
                      )}
                      <EvictionDialog
                        propertyId={property.id}
                        propertyName={property.name}
                        tenantName={currentTenant.name}
                        tenantProfile={currentTenant.profile}
                        rentArrearsCount={rentArrearsCount}
                        hasLongstandingASB={false}
                        onEvict={evictTenant}
                      />
                    </div>
                  )}
                  </>}
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
                      renovationCompletionMonths={property.renovationCompletionMonths}
                      propertyType={propertyType}
                      internalSqft={property.internalSqft}
                      plotSqft={property.plotSqft}
                      currentSubtype={property.subtype}
                      neighborhood={property.neighborhood}
                      planningApplications={planningApplications}
                      planningHistory={planningHistory}
                      monthsPlayed={monthsPlayed}
                      inPlanningCooldown={inPlanningCooldown}
                      propertyLocks={propertyLocks}
                      hasTenant={hasAnyTenant || !!currentTenant}
                      currentEpc={property.epcRating}

                    />
                  )}
                  <FurnishingDialog
                    propertyId={property.id}
                    propertyName={property.name}
                    internalSqft={property.internalSqft}
                    currentTier={(property as any).furnishingTier}
                    monthsRemaining={(property as any).furnishingMonthsRemaining}
                    hasTenant={!!currentTenant}
                    baseRent={(property as any).baseRent || property.monthlyIncome}
                    condition={property.condition as any}
                  />

                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* v4 #1 — itemised buying costs */}
            <div className="rounded-md bg-muted/20 px-2 py-1.5 text-[10px] space-y-0.5 border border-border/40">
              <div className="flex justify-between text-muted-foreground">
                <span>Solicitor</span><span className="font-medium">£{solicitorFeePounds.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Stamp duty</span><span className="font-medium">£{Math.round(stampDutyPounds).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Mortgage fee (1%)</span><span className="font-medium">£{mortgageAmount > 0 ? mortgageFeePounds.toLocaleString() : '—'}</span>
              </div>
              <div className="flex justify-between font-semibold pt-0.5 border-t border-border/40">
                <span>{showMortgageOptions ? 'Cash needed' : 'Cash buy fees'}</span>
                <span>£{(showMortgageOptions ? cashRequired : cashFeesOnly).toLocaleString()}</span>
              </div>
            </div>
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