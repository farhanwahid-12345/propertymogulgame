import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogTrigger as DialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Progress } from "@/components/ui/progress";
import { Hammer, Paintbrush, Home, Plus, Wrench, Zap, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { scaleRenovationCost, scaleRenovationRent, scaleRenovationValue, applyCeilingDiminishingReturns, RENOVATION_EXPECTED_MULTIPLIER, getConversionScaleMultiplier, CONVERSION_EXPECTED_MULTIPLIER } from "@/lib/engine/renovation";
import { computePlanningApprovalProbability } from "@/lib/engine/planning";
import { getCeilingPrice } from "@/lib/engine/constants";
import { Slider } from "@/components/ui/slider";

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
  /** Map renovation typeId → in-game month it completed. Drives basic-repair suppression. */
  renovationCompletionMonths?: Record<string, number>;
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
  /** Full planning application history across the player's portfolio — used to compute the live track-record adjustment. */
  planningHistory?: Array<{ status: 'pending' | 'approved' | 'refused' }>;
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
    rentIncrease: 60,
    valueIncrease: 4000,
    duration: 14,
    description: "Fix leaks, cracks, and basic wear and tear",
    icon: Wrench,
    category: "maintenance"
  },
  {
    id: "full_redecoration",
    name: "Full Redecoration",
    cost: 4500,
    rentIncrease: 150,
    valueIncrease: 7500,
    duration: 28,
    description: "Complete interior painting and minor cosmetic updates",
    icon: Paintbrush,
    category: "maintenance",
    requiresVacant: true,
  },
  {
    id: "epc_upgrade",
    name: "EPC Upgrade (insulation + boiler)",
    cost: 7000,
    rentIncrease: 75,
    valueIncrease: 9000,
    duration: 28,
    description: "Loft + cavity-wall insulation and modern boiler — lifts EPC by 1–2 grades.",
    icon: Zap,
    category: "improvement",
  },

  // Improvements
  {
    id: "kitchen_upgrade",
    name: "Kitchen Upgrade",
    cost: 8500,
    rentIncrease: 240,
    valueIncrease: 16000,
    duration: 42,
    description: "Modern kitchen with new appliances and worktops",
    icon: Home,
    category: "improvement"
  },
  {
    id: "bathroom_renovation",
    name: "Bathroom Renovation",
    cost: 6500,
    rentIncrease: 180,
    valueIncrease: 12000,
    duration: 35,
    description: "Complete bathroom refit with modern fixtures",
    icon: Home,
    category: "improvement"
  },
  {
    id: "central_heating",
    name: "Central Heating System",
    cost: 7500,
    rentIncrease: 200,
    valueIncrease: 13000,
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
    rentIncrease: 120,
    valueIncrease: 10500,
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
    rentIncrease: 425,
    valueIncrease: 33000,
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
    baseApprovalProb: 0.85,
  },
  {
    id: "rear_extension",
    name: "Single-Story Extension",
    cost: 25000,
    rentIncrease: 550,
    valueIncrease: 46000,
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
    baseApprovalProb: 0.80,
  },
  {
    id: "conservatory",
    name: "Conservatory",
    cost: 12000,
    rentIncrease: 300,
    valueIncrease: 23000,
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
    baseApprovalProb: 0.92,
  },
  {
    id: "convert_hmo",
    name: "Convert to HMO",
    cost: 18000,
    rentIncrease: 750,
    valueIncrease: 16000,
    duration: 120,
    description: "License & remodel into a shared house. Choose room count after selecting.",
    icon: Home,
    category: "conversion",
    allowedTypes: ["residential"],
    minPropertyValue: 80000,
    minInternalSqft: 850,
    resultingSubtype: "hmo",
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 500,
    baseApprovalProb: 0.78,
  },
  {
    id: "convert_flats",
    name: "Convert to Flats",
    cost: 55000,
    rentIncrease: 1100,
    valueIncrease: 78000,
    duration: 240,
    description: "Split into self-contained flats with separate entrances. Choose unit count after selecting.",
    icon: Plus,
    category: "conversion",
    allowedTypes: ["residential"],
    minInternalSqft: 1100,
    resultingSubtype: "flats",
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 3,
    planningFee: 500,
    baseApprovalProb: 0.65,
  },
  {
    id: "convert_commercial_to_residential",
    name: "Commercial → Residential",
    cost: 40000,
    rentIncrease: 625,
    valueIncrease: 33000,
    duration: 180,
    description: "Change-of-use from retail/office into a residential let.",
    icon: Home,
    category: "conversion",
    allowedTypes: ["commercial"],
    resultingSubtype: "standard",
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 0,
    baseApprovalProb: 0.82,
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
  renovationCompletionMonths = {},
  propertyType,
  internalSqft,
  plotSqft,
  currentSubtype,
  neighborhood,
  planningApplications = [],
  planningHistory = [],
  monthsPlayed = 0,
  inPlanningCooldown = false,
}: RenovationDialogProps) {
  const [selectedRenovation, setSelectedRenovation] = useState<RenovationType | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [conversionUnits, setConversionUnits] = useState<number>(4);

  // Conversion units: bounds depend on internalSqft
  const isConversion = (r: RenovationType | null) => !!r && r.category === 'conversion';
  const isHmo = (r: RenovationType | null) => !!r && r.id === 'convert_hmo';
  const isFlats = (r: RenovationType | null) => !!r && r.id === 'convert_flats';
  const sqft = internalSqft || 900;
  const maxHmoUnits = Math.max(3, Math.min(8, Math.floor(sqft / 180)));
  const maxFlatUnits = Math.max(2, Math.min(5, Math.floor(sqft / 550)));
  const minUnits = (r: RenovationType | null) => isFlats(r) ? 2 : 3;
  const maxUnits = (r: RenovationType | null) => isFlats(r) ? maxFlatUnits : isHmo(r) ? maxHmoUnits : 1;
  const defaultUnits = (r: RenovationType | null) => isFlats(r) ? 2 : isHmo(r) ? 4 : 1;

  // All headline costs/rent/value uplifts are scaled to this property's profile
  const scaleInputs = { internalSqft, propertyValue };
  // Conversion multiplier for given option + units. For non-conversion = 1.
  const conversionMult = (r: RenovationType | null, units: number): number => {
    if (!isConversion(r)) return 1;
    const subtype = r!.id === 'convert_hmo' ? 'hmo' : r!.id === 'convert_flats' ? 'flats' : 'standard';
    const baseDefault = getConversionScaleMultiplier({ propertyValue, subtype: subtype as any, units: defaultUnits(r) });
    const target = getConversionScaleMultiplier({ propertyValue, subtype: subtype as any, units });
    return baseDefault > 0 ? target / baseDefault : 1;
  };
  const previewUnits = (r: RenovationType | null) => {
    if (!isConversion(r)) return 1;
    return selectedRenovation && selectedRenovation.id === r!.id ? conversionUnits : defaultUnits(r);
  };
  const scaledCost = (r: RenovationType) => Math.round(scaleRenovationCost(r.cost, scaleInputs) * conversionMult(r, previewUnits(r)) / 50) * 50;
  const scaledRent = (r: RenovationType) => Math.round(scaleRenovationRent(r.rentIncrease, scaleInputs) * conversionMult(r, previewUnits(r)) / 5) * 5;
  const scaledValue = (r: RenovationType) => Math.round(scaleRenovationValue(r.valueIncrease, scaleInputs) * conversionMult(r, previewUnits(r)) / 100) * 100;

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
    if (!selectedRenovation) return;
    let toSubmit: RenovationType = selectedRenovation;
    if (isConversion(selectedRenovation)) {
      // Bake the chosen unit count into a one-shot type so the engine completes
      // with the correct cost/rent/value and persists subtypeUnits onto the property.
      const u = conversionUnits;
      const cost = Math.round(scaleRenovationCost(selectedRenovation.cost, scaleInputs) * conversionMult(selectedRenovation, u) / 50) * 50;
      const rent = Math.round(scaleRenovationRent(selectedRenovation.rentIncrease, scaleInputs) * conversionMult(selectedRenovation, u) / 5) * 5;
      const value = Math.round(scaleRenovationValue(selectedRenovation.valueIncrease, scaleInputs) * conversionMult(selectedRenovation, u) / 100) * 100;
      const planningFee = (selectedRenovation.planningFee ?? 500) + (u - defaultUnits(selectedRenovation)) * 100;
      const noun = isFlats(selectedRenovation) ? 'flat' : 'bed';
      toSubmit = {
        ...selectedRenovation,
        name: `${selectedRenovation.name} (${u}-${noun})`,
        cost,
        rentIncrease: rent,
        valueIncrease: value,
        planningFee: Math.max(250, planningFee),
        // Approval likelihood drops slightly per extra unit
        baseApprovalProb: Math.max(0.35, (selectedRenovation.baseApprovalProb ?? 0.7) - 0.05 * (u - defaultUnits(selectedRenovation))),
        // Carry units through to the engine via a custom field on the type
        ...( { subtypeUnits: u } as any ),
      } as RenovationType;
    }
    onRenovate(propertyId, toSubmit);
    setIsOpen(false);
    setSelectedRenovation(null);
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
    // Suppress redundant maintenance after recent redec / conversion
    const lastRedec = renovationCompletionMonths['full_redecoration'];
    const lastConv = renovationCompletionMonths['__lastConversion'];
    if (r.id === 'basic_repair') {
      if (typeof lastRedec === 'number' && (monthsPlayed - lastRedec) < 24) {
        return `Recently redecorated — repairs not needed (${24 - (monthsPlayed - lastRedec)}mo left)`;
      }
      if (typeof lastConv === 'number' && (monthsPlayed - lastConv) < 12) {
        return `Recently converted — repairs not needed (${12 - (monthsPlayed - lastConv)}mo left)`;
      }
    }
    if (r.id === 'full_redecoration' && typeof lastConv === 'number' && (monthsPlayed - lastConv) < 12) {
      return `Recently converted — redecoration not needed (${12 - (monthsPlayed - lastConv)}mo left)`;
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
                  // Planning-gated renovations only need the planning fee to begin the process,
                  // so we let the user select & submit even if they can't yet afford the build.
                  const needsPlanningStep = renovation.requiresPlanning && !planningApproved && !planningPending;
                  const planningFeeForCard = renovation.planningFee ?? 250;
                  const canSubmitPlanning = needsPlanningStep && playerCash >= planningFeeForCard;
                  const blocked = !!ineligible || inProgress || completed || planningPending || blockedByCooldown;
                  const selectable = !blocked && (canSubmitPlanning || (planningApproved && affordable) || (!renovation.requiresPlanning && affordable));

                  // Scaled cost/uplifts for THIS property's size & value
                  const cost = scaledCost(renovation);
                  const rentUp = scaledRent(renovation);
                  const valueUp = scaledValue(renovation);

                  // Ceiling diminishing — preview the actual uplift the player will get
                  const { uplift: cappedValueUp, diminishingFactor } = ceilingPrice > 0
                    ? applyCeilingDiminishingReturns(valueUp, propertyValue, ceilingPrice)
                    : { uplift: valueUp, diminishingFactor: 1 };

                  // Range reflects realistic outcome distribution
                  const expectedMult = renovation.category === 'conversion'
                    ? CONVERSION_EXPECTED_MULTIPLIER
                    : RENOVATION_EXPECTED_MULTIPLIER;
                  const valueLow = Math.round(cappedValueUp * (renovation.category === 'conversion' ? 0.5 : 0.3));
                  const valueHigh = Math.round(cappedValueUp * (renovation.category === 'conversion' ? 1.4 : 1.0));
                  const expectedValueUp = Math.round(cappedValueUp * expectedMult);

                  return (
                    <Card
                      key={renovation.id}
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md",
                        isSelected && "ring-2 ring-primary",
                        !selectable && !completed && "opacity-60",
                        blocked && "opacity-40 pointer-events-none",
                        CategoryColors[renovation.category]
                      )}
                      onClick={() => {
                        if (!selectable) return;
                        setSelectedRenovation(renovation);
                        if (renovation.category === 'conversion') {
                          setConversionUnits(defaultUnits(renovation));
                        }
                      }}
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
                        {!completed && !planningPending && !planningApproved && !blockedByCooldown && renovation.requiresPlanning && (() => {
                          // Live approval odds — matches the engine's roll exactly
                          const approvalsCount = planningHistory.filter(a => a.status === 'approved').length;
                          const refusalsCount = planningHistory.filter(a => a.status === 'refused').length;
                          const { prob, base, modifiers } = computePlanningApprovalProbability({
                            baseProb: renovation.baseApprovalProb,
                            propertyValuePounds: propertyValue,
                            neighborhood: neighborhood ?? '',
                            propertyType: propertyType ?? 'residential',
                            renovationCategory: renovation.category,
                            approvalsCount,
                            refusalsCount,
                          });
                          const pct = Math.round(prob * 100);
                          const probColour = pct >= 75 ? 'text-success' : pct >= 50 ? 'text-amber-300' : 'text-danger';
                          return (
                            <div className="text-[11px] text-muted-foreground border border-border/40 rounded px-2 py-1 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  Planning approval likelihood:
                                </span>
                                <span className={cn("font-semibold", probColour)}>{pct}%</span>
                              </div>
                              <div className="text-[10px] opacity-80 space-y-0.5">
                                <div className="flex justify-between">
                                  <span>Base ({renovation.category}):</span>
                                  <span>{Math.round(base * 100)}%</span>
                                </div>
                                {modifiers.map((m, i) => (
                                  <div key={i} className="flex justify-between">
                                    <span>{m.label}:</span>
                                    <span className={m.delta >= 0 ? 'text-success' : 'text-danger'}>
                                      {m.delta >= 0 ? '+' : ''}{Math.round(m.delta * 100)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="text-[10px] opacity-70">
                                Fee £{(renovation.planningFee ?? 250).toLocaleString()} · decision in ~{renovation.planningWaitMonths ?? 2} mo
                              </div>
                            </div>
                          );
                        })()}

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
                            Outcomes vary: expected ≈ £{expectedValueUp.toLocaleString()}, 5% chance of total write-off.
                          </div>

                          <div className="pt-2 border-t space-y-1">
                            {(() => {
                              // Mirror engine completion: rent uplift also tapers with ceiling
                              const rentFactor = 0.5 + 0.5 * diminishingFactor;
                              const expectedRent = rentUp * expectedMult * rentFactor;
                              const incomeAnnual = expectedRent * 12 * 0.85; // 85% occupancy
                              const incomeRoi = (incomeAnnual / Math.max(1, cost)) * 100;
                              // NET capital ROI — subtracts cost so loss-making renos go red/negative
                              const capitalRoiNet = ((expectedValueUp - cost) / Math.max(1, cost)) * 100;
                              // 5-year combined: capital + 60mo rent (net of voids) − cost
                              const combined5yr = ((expectedValueUp + expectedRent * 60 * 0.85 - cost) / Math.max(1, cost)) * 100;
                              const paybackMonths = expectedRent > 0
                                ? Math.max(1, Math.round(cost / (expectedRent * 0.85)))
                                : Infinity;
                              const capitalColour =
                                capitalRoiNet >= 0 ? "text-success" :
                                capitalRoiNet >= -10 ? "text-amber-300" :
                                "text-danger";
                              const combinedColour =
                                combined5yr >= 20 ? "text-success" :
                                combined5yr >= 0 ? "text-amber-300" :
                                "text-danger";
                              const reduced = ceilingPrice > 0 && diminishingFactor < 0.95;
                              const reductionPct = Math.round((1 - diminishingFactor) * 100);
                              return (
                                <>
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Income ROI / yr:</span>
                                    <span>{incomeRoi.toFixed(1)}%</span>
                                  </div>
                                  <div className={cn("flex justify-between text-xs font-semibold", capitalColour)}>
                                    <span>Capital ROI (net):</span>
                                    <span>
                                      {capitalRoiNet >= 0 ? "+" : ""}{capitalRoiNet.toFixed(1)}%
                                      {reduced && <span className="ml-1 opacity-80 font-normal">(−{reductionPct}% ceiling)</span>}
                                    </span>
                                  </div>
                                  <div className={cn("flex justify-between text-xs", combinedColour)}>
                                    <span>5-yr total ROI:</span>
                                    <span>{combined5yr >= 0 ? "+" : ""}{combined5yr.toFixed(1)}%</span>
                                  </div>
                                  <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>Payback (rent only):</span>
                                    <span>{Number.isFinite(paybackMonths) ? `~${paybackMonths} mo` : "—"}</span>
                                  </div>
                                </>
                              );
                            })()}
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
          <div className="bg-muted p-4 rounded-lg mt-4 space-y-3">
            <h4 className="font-semibold">Renovation Summary</h4>
            {isConversion(selectedRenovation) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {isFlats(selectedRenovation) ? 'Number of flats' : 'Number of rooms'}
                  </span>
                  <span className="font-semibold">{conversionUnits}</span>
                </div>
                <Slider
                  min={minUnits(selectedRenovation)}
                  max={maxUnits(selectedRenovation)}
                  step={1}
                  value={[conversionUnits]}
                  onValueChange={(v) => setConversionUnits(v[0])}
                />
                <div className="text-[11px] text-muted-foreground">
                  Building can support {minUnits(selectedRenovation)}–{maxUnits(selectedRenovation)} {isFlats(selectedRenovation) ? 'flats' : 'rooms'} (based on {sqft.toLocaleString()} sqft).
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Cost:</span>
                <br />
                <span className="font-semibold">£{scaledCost(selectedRenovation).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Rent +/mo (typical):</span>
                <br />
                <span className="font-semibold text-success">+£{scaledRent(selectedRenovation).toLocaleString()}</span>
              </div>
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
            {(() => {
              if (!selectedRenovation) {
                return <Button disabled>Start Renovation</Button>;
              }
              const app = selectedRenovation.requiresPlanning ? findApplication(selectedRenovation.id) : undefined;
              const needsApplication = selectedRenovation.requiresPlanning && app?.status !== 'approved';
              const fee = selectedRenovation.planningFee ?? 250;
              const disabled = needsApplication
                ? playerCash < fee || app?.status === 'pending' || (inPlanningCooldown && app?.status !== 'approved')
                : !canAfford(selectedRenovation);
              const label = needsApplication
                ? `Submit Planning (£${fee.toLocaleString()})`
                : 'Start Renovation';
              return (
                <Button onClick={handleRenovate} disabled={disabled}>
                  {needsApplication && <FileText className="h-4 w-4 mr-1" />}
                  {label}
                </Button>
              );
            })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}