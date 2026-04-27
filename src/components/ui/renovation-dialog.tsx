import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Hammer, Paintbrush, Home, Plus, Wrench, Zap, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { scaleRenovationCost, scaleRenovationRent, scaleRenovationValue, applyCeilingDiminishingReturns } from "@/lib/engine/renovation";
import { getCeilingPrice } from "@/lib/engine/constants";

export interface RenovationType {
  id: string;
  name: string;
  cost: number;
  rentIncrease: number; // Monthly rent increase (typical/expected)
  valueIncrease: number; // Property value increase (typical/expected)
  duration: number; // Days to complete
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "maintenance" | "improvement" | "extension" | "conversion";
  /** Minimum internal sqft required to start this renovation. */
  minInternalSqft?: number;
  /** Minimum plot sqft required (e.g. extensions need garden). */
  minPlotSqft?: number;
  /** Allowed property types — defaults to all when omitted. */
  allowedTypes?: Array<"residential" | "commercial" | "luxury">;
  /** Minimum property value (pounds). */
  minPropertyValue?: number;
  /** Subtype set on completion (HMO, flats, etc.). */
  resultingSubtype?: 'standard' | 'hmo' | 'flats' | 'multi-let';
  /** Heavy works that disturb living conditions — blocked while a tenant is in residence. */
  requiresVacant?: boolean;
  /** Major works that need a Local Planning Authority decision before starting. */
  requiresPlanning?: boolean;
  /** In-game months between submission and decision (default 2). */
  planningWaitMonths?: number;
  /** Application fee (pounds). 0 = waived (e.g. Class MA prior approval). */
  planningFee?: number;
  /** Base approval probability before modifiers (0..1). */
  baseApprovalProb?: number;
}

interface RenovationDialogProps {
  propertyId: string;
  propertyValue: number;
  currentRent: number;
  playerCash: number;
  onRenovate: (propertyId: string, renovation: RenovationType) => void;
  activeRenovations?: string[]; // IDs of renovations in progress
  /** IDs of renovations already completed on this property — disables one-shot re-do. */
  completedRenovationIds?: string[];
  /** Required for conversion / extension gating. */
  propertyType?: "residential" | "commercial" | "luxury";
  internalSqft?: number;
  plotSqft?: number;
  currentSubtype?: 'standard' | 'hmo' | 'flats' | 'multi-let';
  /** True if a tenant is currently in residence — blocks `requiresVacant` renovations. */
  hasTenant?: boolean;
  /** Neighborhood — drives ceiling-price warnings on extensions/conversions. */
  neighborhood?: string;
  /** Pending/approved planning applications for this property. */
  planningApplications?: Array<{ id: string; renovationTypeId: string; status: 'pending' | 'approved' | 'refused'; decisionMonth: number; submittedMonth: number }>;
  /** Current in-game month — for displaying "decision in N mo" countdowns. */
  monthsPlayed?: number;
  /** True if this property is in a planning_cooldown lock (recent refusal). */
  inPlanningCooldown?: boolean;
}

const RENOVATION_OPTIONS: RenovationType[] = [
  // Maintenance
  {
    id: "basic_repair",
    name: "Basic Repairs",
    cost: 2500,
    rentIncrease: 50,
    valueIncrease: 3000,
    duration: 14,
    description: "Fix leaks, cracks, and basic wear and tear",
    icon: Wrench,
    category: "maintenance"
  },
  {
    id: "full_redecoration",
    name: "Full Redecoration", 
    cost: 4500,
    rentIncrease: 125,
    valueIncrease: 6000,
    duration: 28,
    description: "Complete interior painting and minor cosmetic updates",
    icon: Paintbrush,
    category: "maintenance",
    requiresVacant: true,
  },
  
  // Improvements
  {
    id: "kitchen_upgrade",
    name: "Kitchen Upgrade",
    cost: 8500,
    rentIncrease: 200,
    valueIncrease: 12000,
    duration: 42,
    description: "Modern kitchen with new appliances and worktops",
    icon: Home,
    category: "improvement"
  },
  {
    id: "bathroom_renovation",
    name: "Bathroom Renovation",
    cost: 6500,
    rentIncrease: 150,
    valueIncrease: 9000,
    duration: 35,
    description: "Complete bathroom refit with modern fixtures",
    icon: Home,
    category: "improvement"
  },
  {
    id: "central_heating",
    name: "Central Heating System",
    cost: 7500,
    rentIncrease: 175,
    valueIncrease: 10000,
    duration: 21,
    description: "Install or upgrade central heating and insulation",
    icon: Zap,
    category: "improvement",
    requiresVacant: true,
  },
  {
    id: "double_glazing",
    name: "Double Glazing",
    cost: 5500,
    rentIncrease: 100,
    valueIncrease: 8000,
    duration: 21,
    description: "Replace all windows with energy-efficient double glazing",
    icon: Home,
    category: "improvement"
  },
  
  // Extensions
  {
    id: "loft_conversion",
    name: "Loft Conversion",
    cost: 15000,
    rentIncrease: 350,
    valueIncrease: 25000,
    duration: 90,
    description: "Convert loft space into additional bedroom",
    icon: Plus,
    category: "extension",
    minInternalSqft: 700,
    allowedTypes: ["residential", "luxury"],
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 250,
    baseApprovalProb: 0.80,
  },
  {
    id: "rear_extension",
    name: "Single-Story Extension",
    cost: 25000,
    rentIncrease: 450,
    valueIncrease: 35000,
    duration: 120,
    description: "Add extra room to rear of property",
    icon: Plus,
    category: "extension",
    minPlotSqft: 2200,
    allowedTypes: ["residential", "luxury"],
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 250,
    baseApprovalProb: 0.70,
  },
  {
    id: "conservatory",
    name: "Conservatory",
    cost: 12000,
    rentIncrease: 250,
    valueIncrease: 18000,
    duration: 60,
    description: "Glass conservatory extension",
    icon: Plus,
    category: "extension",
    minPlotSqft: 1800,
    allowedTypes: ["residential", "luxury"],
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 250,
    baseApprovalProb: 0.90,
  },
  {
    id: "convert_hmo_4",
    name: "Convert to HMO (4-bed)",
    cost: 18000,
    rentIncrease: 600,
    valueIncrease: 8000,
    duration: 120,
    description: "License & remodel into a 4-bed shared house. Higher rent, more management.",
    icon: Home,
    category: "conversion",
    allowedTypes: ["residential"],
    minPropertyValue: 80000,
    minInternalSqft: 850,
    resultingSubtype: "hmo",
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 500,
    baseApprovalProb: 0.65,
  },
  {
    id: "convert_hmo_6",
    name: "Convert to HMO (6-bed)",
    cost: 35000,
    rentIncrease: 1100,
    valueIncrease: 15000,
    duration: 180,
    description: "Larger HMO with 6 lettable rooms.",
    icon: Home,
    category: "conversion",
    allowedTypes: ["residential"],
    minPropertyValue: 120000,
    minInternalSqft: 1300,
    resultingSubtype: "hmo",
    requiresPlanning: true,
    planningWaitMonths: 3,
    planningFee: 500,
    baseApprovalProb: 0.50,
  },
  {
    id: "convert_flats",
    name: "Convert to Flats (2 units)",
    cost: 55000,
    rentIncrease: 900,
    valueIncrease: 40000,
    duration: 240,
    description: "Split into two self-contained flats with separate entrances.",
    icon: Plus,
    category: "conversion",
    allowedTypes: ["residential"],
    minInternalSqft: 1400,
    resultingSubtype: "flats",
    requiresPlanning: true,
    planningWaitMonths: 3,
    planningFee: 500,
    baseApprovalProb: 0.55,
  },
  {
    id: "convert_commercial_to_residential",
    name: "Commercial → Residential",
    cost: 40000,
    rentIncrease: 500,
    valueIncrease: 25000,
    duration: 180,
    description: "Change-of-use from retail/office into a residential let.",
    icon: Home,
    category: "conversion",
    allowedTypes: ["commercial"],
    resultingSubtype: "standard",
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 0,
    baseApprovalProb: 0.75,
  },
];

const CategoryColors = {
  maintenance: "text-secondary border-secondary/20 bg-secondary/5",
  improvement: "text-primary border-primary/20 bg-primary/5",
  extension: "text-luxury border-luxury/20 bg-luxury/5",
  conversion: "text-amber-300 border-amber-400/30 bg-amber-400/5",
};

export function RenovationDialog({
  propertyId,
  propertyValue,
  currentRent,
  playerCash,
  onRenovate,
  activeRenovations = [],
  completedRenovationIds = [],
  propertyType,
  internalSqft,
  plotSqft,
  currentSubtype,
  neighborhood,
  planningApplications = [],
  monthsPlayed = 0,
  inPlanningCooldown = false,
}: RenovationDialogProps) {
  const [selectedRenovation, setSelectedRenovation] = useState<RenovationType | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // All headline costs/rent/value uplifts are scaled to this property's profile
  const scaleInputs = { internalSqft, propertyValue };
  const scaledCost = (r: RenovationType) => scaleRenovationCost(r.cost, scaleInputs);
  const scaledRent = (r: RenovationType) => scaleRenovationRent(r.rentIncrease, scaleInputs);
  const scaledValue = (r: RenovationType) => scaleRenovationValue(r.valueIncrease, scaleInputs);

  // Ceiling-price awareness — applies to extensions/conversions
  const ceilingPrice = neighborhood && propertyType
    ? getCeilingPrice({ neighborhood, type: propertyType })
    : 0;
  const ceilingRatio = ceilingPrice > 0 ? propertyValue / ceilingPrice : 0;
  const atCeiling = ceilingRatio >= 0.95;

  /** Lookup helpers for planning state per renovation */
  const findApplication = (renoId: string) =>
    planningApplications.find(a => a.renovationTypeId === renoId);

  const handleRenovate = () => {
    if (selectedRenovation) {
      onRenovate(propertyId, selectedRenovation);
      setIsOpen(false);
      setSelectedRenovation(null);
    }
  };

  const canAfford = (renovation: RenovationType) => playerCash >= scaledCost(renovation);
  const isInProgress = (renovation: RenovationType) => activeRenovations.includes(renovation.id);
  const isCompleted = (renovation: RenovationType) => completedRenovationIds.includes(renovation.id);

  /** Returns null if eligible, else a short reason string. */
  const ineligibilityReason = (r: RenovationType): string | null => {
    if (r.allowedTypes && propertyType && !r.allowedTypes.includes(propertyType)) {
      return `Only for ${r.allowedTypes.join('/')}`;
    }
    if (r.minPropertyValue && propertyValue < r.minPropertyValue) {
      return `Needs value ≥ £${r.minPropertyValue.toLocaleString()}`;
    }
    if (r.minInternalSqft && internalSqft !== undefined && internalSqft < r.minInternalSqft) {
      return `Needs ${r.minInternalSqft}+ sqft int (have ${internalSqft})`;
    }
    if (r.minPlotSqft && plotSqft !== undefined && plotSqft < r.minPlotSqft) {
      return `Needs ${r.minPlotSqft}+ sqft plot (have ${plotSqft})`;
    }
    if (r.category === 'conversion' && currentSubtype && currentSubtype !== 'standard') {
      return `Already converted to ${currentSubtype}`;
    }
    return null;
  };

  const groupedRenovations = RENOVATION_OPTIONS.reduce((acc, renovation) => {
    if (!acc[renovation.category]) acc[renovation.category] = [];
    acc[renovation.category].push(renovation);
    return acc;
  }, {} as Record<string, RenovationType[]>);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Hammer className="h-4 w-4 mr-2" />
          Renovate
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Property Renovations</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {Object.entries(groupedRenovations).map(([category, renovations]) => (
            <div key={category}>
              <h3 className="text-lg font-semibold mb-3 capitalize">{category}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {renovations.map((renovation) => {
                  const Icon = renovation.icon;
                  const isSelected = selectedRenovation?.id === renovation.id;
                  const affordable = canAfford(renovation);
                  const inProgress = isInProgress(renovation);
                  const completed = isCompleted(renovation);
                  const ineligible = ineligibilityReason(renovation);

                  // Planning state for this renovation
                  const application = renovation.requiresPlanning ? findApplication(renovation.id) : undefined;
                  const planningPending = application?.status === 'pending';
                  const planningApproved = application?.status === 'approved';
                  const blockedByCooldown = renovation.requiresPlanning && inPlanningCooldown && !planningApproved;
                  const blocked = !!ineligible || inProgress || completed || planningPending || blockedByCooldown;

                  // Scaled cost/uplifts for THIS property's size & value
                  const cost = scaledCost(renovation);
                  const rentUp = scaledRent(renovation);
                  const valueUp = scaledValue(renovation);

                  // Ceiling diminishing — preview the actual uplift the player will get
                  const { uplift: cappedValueUp, diminishingFactor } = ceilingPrice > 0
                    ? applyCeilingDiminishingReturns(valueUp, propertyValue, ceilingPrice)
                    : { uplift: valueUp, diminishingFactor: 1 };

                  // Expected ranges based on ROI variability roll (60% full, 25% × 0.7, 10% × 0.3, 5% × 0)
                  const valueLow = Math.round(cappedValueUp * 0.3);
                  const valueHigh = cappedValueUp;
                  const valueTypical = Math.round(cappedValueUp * 0.85);

                  return (
                    <Card
                      key={renovation.id}
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md",
                        isSelected && "ring-2 ring-primary",
                        !affordable && !completed && "opacity-60",
                        blocked && "opacity-40 pointer-events-none",
                        CategoryColors[renovation.category]
                      )}
                      onClick={() => affordable && !blocked && setSelectedRenovation(renovation)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className="h-5 w-5 shrink-0" />
                            <CardTitle className="text-base">{renovation.name}</CardTitle>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {completed ? (
                              <Badge className="bg-success/20 text-success border-success/30 text-xs">
                                ✅ Completed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                {renovation.duration}d
                              </Badge>
                            )}
                            {renovation.requiresPlanning && !completed && (
                              <Badge variant="outline" className="text-[10px] border-amber-400/30 text-amber-300 bg-amber-400/5">
                                <FileText className="h-3 w-3 mr-1" />
                                Planning required
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">{renovation.description}</p>

                        {completed && (
                          <div className="text-xs text-success border border-success/30 bg-success/5 rounded px-2 py-1">
                            ✅ Already completed on this property
                          </div>
                        )}

                        {ineligible && !completed && (
                          <div className="text-xs text-danger border border-danger/30 bg-danger/5 rounded px-2 py-1">
                            ⚠️ {ineligible}
                          </div>
                        )}

                        {/* Planning state banners */}
                        {planningPending && application && (
                          <div className="text-xs text-amber-300 border border-amber-400/30 bg-amber-400/5 rounded px-2 py-1">
                            📋 Planning application pending — decision in {Math.max(0, application.decisionMonth - monthsPlayed)} mo
                          </div>
                        )}
                        {planningApproved && (
                          <div className="text-xs text-success border border-success/30 bg-success/5 rounded px-2 py-1">
                            ✅ Planning approved — start work to consume approval
                          </div>
                        )}
                        {blockedByCooldown && (
                          <div className="text-xs text-danger border border-danger/30 bg-danger/5 rounded px-2 py-1">
                            ⛔ Recent refusal — 6-mo cooldown before resubmission
                          </div>
                        )}
                        {!completed && !planningPending && !planningApproved && !blockedByCooldown && renovation.requiresPlanning && (
                          <div className="text-[11px] text-muted-foreground border border-border/40 rounded px-2 py-1">
                            <FileText className="h-3 w-3 inline mr-1" />
                            Submitting will charge a £{(renovation.planningFee ?? 250).toLocaleString()} non-refundable fee. Decision in ~{renovation.planningWaitMonths ?? 2} mo. Base approval ~{Math.round((renovation.baseApprovalProb ?? 0.7) * 100)}%.
                          </div>
                        )}

                        {/* Ceiling-price warning */}
                        {ceilingPrice > 0 && diminishingFactor < 0.95 && !completed && (
                          <div className="text-xs text-amber-300 border border-amber-400/30 bg-amber-400/5 rounded px-2 py-1">
                            <AlertTriangle className="h-3 w-3 inline mr-1" />
                            {atCeiling
                              ? `At area ceiling (£${ceilingPrice.toLocaleString()}). Value uplift reduced ~${Math.round((1 - diminishingFactor) * 100)}%.`
                              : `Approaching area ceiling. Uplift trimmed ~${Math.round((1 - diminishingFactor) * 100)}%.`}
                          </div>
                        )}

                        {inProgress && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>In Progress</span>
                              <span>50%</span>
                            </div>
                            <Progress value={50} className="h-2" />
                          </div>
                        )}

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Cost:</span>
                            <span className={cn(
                              "font-semibold",
                              affordable ? "text-foreground" : "text-danger"
                            )}>
                              £{cost.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span>Rent +/mo (typical):</span>
                            <span className="text-success font-semibold">
                              +£{rentUp.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span>Value + (range):</span>
                            <span className="text-success font-semibold">
                              £{valueLow.toLocaleString()}–£{valueHigh.toLocaleString()}
                            </span>
                          </div>

                          <div className="text-[10px] text-muted-foreground italic">
                            Outcomes vary: typical ≈ £{valueTypical.toLocaleString()}, 5% chance of net loss.
                          </div>

                          <div className="pt-2 border-t">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>ROI (Annual, expected):</span>
                              <span>
                                {((rentUp * 12 * 0.85 / Math.max(1, cost)) * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        {selectedRenovation && (
          <div className="bg-muted p-4 rounded-lg mt-4">
            <h4 className="font-semibold mb-2">Renovation Summary</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">New Monthly Rent:</span>
                <br />
                <span className="font-semibold text-success">
                  £{(currentRent + scaledRent(selectedRenovation)).toLocaleString()}/mo
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">New Property Value:</span>
                <br />
                <span className="font-semibold text-success">
                  £{(propertyValue + scaledValue(selectedRenovation)).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Available Cash: £{playerCash.toLocaleString()}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRenovate}
              disabled={!selectedRenovation || !canAfford(selectedRenovation!)}
            >
              Start Renovation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}