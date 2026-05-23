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
import { useGameStore } from "@/stores/gameStore";

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
  /** Item 15: sqft added to internalSqft when the renovation completes (extensions only). */
  sqftAdded?: number;
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
  /** True if this property is in a *property-wide* planning cooldown (legacy). */
  inPlanningCooldown?: boolean;
  /** Active property locks — used to compute per-renovation planning cooldown. */
  propertyLocks?: Array<{ propertyId: string; reason: string; untilMonth: number; renovationTypeId?: string }>;
  /** Item #1: current EPC band — gates target-band selector on EPC upgrade. */
  currentEpc?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
}



export const RENOVATION_OPTIONS: RenovationType[] = [
  // Maintenance
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
    description: "Convert loft space into additional bedroom (+200 sqft).",
    icon: Plus,
    category: "extension",
    minInternalSqft: 700,
    allowedTypes: ["residential", "luxury"],
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 250,
    baseApprovalProb: 0.88,
    sqftAdded: 200,
  },
  {
    id: "rear_extension",
    name: "Single-Story Extension",
    cost: 25000,
    rentIncrease: 550,
    valueIncrease: 46000,
    duration: 120,
    description: "Add an extra room to the rear of the property (+250 sqft).",
    icon: Plus,
    category: "extension",
    minPlotSqft: 2200,
    allowedTypes: ["residential", "luxury"],
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 250,
    baseApprovalProb: 0.82,
    sqftAdded: 250,
  },
  {
    id: "double_height_extension",
    name: "Double-Height Extension",
    cost: 45000,
    rentIncrease: 1045,
    valueIncrease: 87400,
    duration: 180,
    description: "Two-story rear extension — adds ground + first-floor rooms (+475 sqft).",
    icon: Plus,
    category: "extension",
    minPlotSqft: 2400,
    minInternalSqft: 850,
    allowedTypes: ["residential", "luxury"],
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 3,
    planningFee: 400,
    baseApprovalProb: 0.72,
    sqftAdded: 475,
  },
  {
    id: "conservatory",
    name: "Conservatory",
    cost: 12000,
    rentIncrease: 300,
    valueIncrease: 23000,
    duration: 60,
    description: "Glass conservatory extension (+120 sqft).",
    icon: Plus,
    category: "extension",
    minPlotSqft: 1800,
    allowedTypes: ["residential", "luxury"],
    requiresVacant: true,
    requiresPlanning: true,
    planningWaitMonths: 2,
    planningFee: 250,
    baseApprovalProb: 0.92,
    sqftAdded: 120,
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
    baseApprovalProb: 0.82,
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
  propertyLocks = [],
  hasTenant = false,
  currentEpc,
}: RenovationDialogProps) {
  const [selectedRenovation, setSelectedRenovation] = useState<RenovationType | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [conversionUnits, setConversionUnits] = useState<number>(4);
  const [batchMode, setBatchMode] = useState<boolean>(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());

  // Item #1: target EPC band for `epc_upgrade`. Defaults to next band up.
  const EPC_ORDER: Array<'G'|'F'|'E'|'D'|'C'|'B'|'A'> = ['G','F','E','D','C','B','A'];
  const nextBandUp = (g?: string): 'A'|'B'|'C'|'D'|'E'|'F'|'G' => {
    const i = EPC_ORDER.indexOf((g as any) ?? 'D');
    return EPC_ORDER[Math.min(EPC_ORDER.length - 1, i + 1)] ?? 'A';
  };
  const [epcTarget, setEpcTarget] = useState<'A'|'B'|'C'|'D'|'E'|'F'|'G'>(nextBandUp(currentEpc));
  const bandJumps = (target?: string): number => {
    if (!currentEpc || !target) return 1;
    const ci = EPC_ORDER.indexOf(currentEpc);
    const ti = EPC_ORDER.indexOf(target as any);
    return Math.max(1, ti - ci);
  };
  const epcMultiplierFor = (r: RenovationType): number => {
    if (r.id !== 'epc_upgrade') return 1;
    const target = selectedRenovation?.id === 'epc_upgrade' ? epcTarget : nextBandUp(currentEpc);
    // 1 jump = 1.0×, 2 = 1.5×, 3 = 2.0× …
    return 0.5 + 0.5 * bandJumps(target);
  };


  // Per-renovation planning cooldown check — legacy property-wide locks (no
  // renovationTypeId) still block, but new locks are scoped to the refused work.
  const isInCooldown = (renoId: string): boolean => {
    if (inPlanningCooldown) {
      // Honour the property-wide boolean for unscoped legacy locks.
      const anyLegacy = propertyLocks.some(
        l => l.propertyId === propertyId
          && l.reason === 'planning_cooldown'
          && l.untilMonth > monthsPlayed
          && !l.renovationTypeId,
      );
      if (anyLegacy) return true;
    }
    return propertyLocks.some(
      l => l.propertyId === propertyId
        && l.reason === 'planning_cooldown'
        && l.untilMonth > monthsPlayed
        && l.renovationTypeId === renoId,
    );
  };

  // Item 4a: effective internal sqft includes BOTH approved-but-not-built AND
  // currently in-progress extensions (their sqft will exist by the time any
  // batched/follow-up conversion completes). Only completed extensions are
  // already baked into `internalSqft` and so are excluded here.
  const approvedSqftPending = (planningApplications || [])
    .filter(a => a.status === 'approved')
    .reduce((sum, a) => {
      const r = RENOVATION_OPTIONS.find(o => o.id === a.renovationTypeId);
      if (!r || !r.sqftAdded) return sum;
      if (completedRenovationIds.includes(r.id)) return sum; // already in internalSqft
      return sum + (r.sqftAdded || 0);
    }, 0);
  // Also include any extension that's actively being built (no longer in
  // `planningApplications` once started, but still pending in `activeRenovations`).
  const activeExtensionSqft = activeRenovations.reduce((sum, id) => {
    const r = RENOVATION_OPTIONS.find(o => o.id === id);
    if (!r || !r.sqftAdded) return sum;
    if (completedRenovationIds.includes(r.id)) return sum;
    // Don't double-count: skip if already counted in approvedSqftPending.
    const stillApproved = (planningApplications || []).some(
      a => a.renovationTypeId === id && a.status === 'approved',
    );
    if (stillApproved) return sum;
    return sum + (r.sqftAdded || 0);
  }, 0);
  const effectiveInternalSqft = (internalSqft || 0) + approvedSqftPending + activeExtensionSqft;

  // Conversion units: bounds depend on internalSqft (use effective so approved extensions count)
  const isConversion = (r: RenovationType | null) => !!r && r.category === 'conversion';
  const isHmo = (r: RenovationType | null) => !!r && r.id === 'convert_hmo';
  const isFlats = (r: RenovationType | null) => !!r && r.id === 'convert_flats';
  const sqft = effectiveInternalSqft || 900;
  const maxHmoUnits = Math.max(3, Math.min(8, Math.floor(sqft / 180)));
  const maxFlatUnits = Math.max(2, Math.min(5, Math.floor(sqft / 550)));
  const minUnits = (r: RenovationType | null) => isFlats(r) ? 2 : 3;
  const maxUnits = (r: RenovationType | null) => isFlats(r) ? maxFlatUnits : isHmo(r) ? maxHmoUnits : 1;
  const defaultUnits = (r: RenovationType | null) => isFlats(r) ? 2 : isHmo(r) ? 4 : 1;


  // All headline costs/rent/value uplifts are scaled to this property's profile
  const scaleInputs = { internalSqft: effectiveInternalSqft || internalSqft, propertyValue };
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
  const scaledCost = (r: RenovationType) => Math.round(scaleRenovationCost(r.cost, scaleInputs) * conversionMult(r, previewUnits(r)) * epcMultiplierFor(r) / 50) * 50;
  const scaledRent = (r: RenovationType) => Math.round(scaleRenovationRent(r.rentIncrease, scaleInputs) * conversionMult(r, previewUnits(r)) * epcMultiplierFor(r) / 5) * 5;
  const scaledValue = (r: RenovationType) => Math.round(scaleRenovationValue(r.valueIncrease, scaleInputs) * conversionMult(r, previewUnits(r)) * epcMultiplierFor(r) / 100) * 100;


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
      // For conversions: pass through the BASE cost/rent/value untouched and let
      // the engine apply property-size + conversion-units scaling (single source
      // of truth in `scaleRenovationForProperty`). We only customise the name,
      // planning fee, approval probability, and persist the chosen unit count.
      const u = conversionUnits;
      const planningFee = (selectedRenovation.planningFee ?? 500) + (u - defaultUnits(selectedRenovation)) * 100;
      const noun = isFlats(selectedRenovation) ? 'flat' : 'bed';
      toSubmit = {
        ...selectedRenovation,
        name: `${selectedRenovation.name} (${u}-${noun})`,
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

  /**
   * Returns null if eligible, else a short reason string.
   * `phase` is 'planning' when we're only deciding whether the user may submit a
   * planning application (no physical works yet) and 'works' when we're about to
   * actually start construction. Tenant-presence + build-cost gates apply only
   * to 'works' — planning can be submitted while a tenant is in situ or before
   * the player can afford the build.
   */
  const ineligibilityReason = (r: RenovationType, phase: 'planning' | 'works' = 'works'): string | null => {
    // Conversions structurally rebuild the property — must be vacant when works begin.
    if (phase === 'works' && r.category === 'conversion' && hasTenant) {
      return `Vacate every unit (serve eviction notice) before converting`;
    }
    if (r.allowedTypes && propertyType && !r.allowedTypes.includes(propertyType)) {
      return `Only for ${r.allowedTypes.join('/')}`;
    }
    if (r.minPropertyValue && propertyValue < r.minPropertyValue) {
      return `Needs value ≥ £${r.minPropertyValue.toLocaleString()}`;
    }
    if (r.minInternalSqft && internalSqft !== undefined && effectiveInternalSqft < r.minInternalSqft) {
      return `Needs ${r.minInternalSqft}+ sqft int (have ${effectiveInternalSqft})`;
    }
    if (r.minPlotSqft && plotSqft !== undefined && plotSqft < r.minPlotSqft) {
      return `Needs ${r.minPlotSqft}+ sqft plot (have ${plotSqft})`;
    }

    // Already-converted: hide ANY further conversion option.
    if (r.category === 'conversion' && currentSubtype && currentSubtype !== 'standard') {
      return `Already converted to ${currentSubtype}`;
    }
    // One conversion only — block alternates if any conversion already completed.
    if (r.category === 'conversion' && completedRenovationIds.some(id => id === 'convert_hmo' || id === 'convert_flats' || id === 'convert_multi_let')) {
      return `Property has already been converted`;
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
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Property Renovations</DialogTitle>
            <Button
              variant={batchMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setBatchMode(!batchMode);
                setBatchSelected(new Set());
                setSelectedRenovation(null);
              }}
            >
              {batchMode ? `✓ Batch mode (${batchSelected.size})` : "Enable batch mode"}
            </Button>
          </div>
          {batchMode && (
            <p className="text-xs text-muted-foreground">
              Click cards to add/remove. Combined cost & ROI shown below. 5% discount on 3+ items.
            </p>
          )}
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

                  // Planning state for this renovation
                  const application = renovation.requiresPlanning ? findApplication(renovation.id) : undefined;
                  const planningPending = application?.status === 'pending';
                  const planningApproved = application?.status === 'approved';
                  const blockedByCooldown = renovation.requiresPlanning && isInCooldown(renovation.id) && !planningApproved;
                  // Planning-gated renovations only need the planning fee to begin the process,
                  // so we let the user select & submit even if they can't yet afford the build
                  // OR a tenant is still in residence (works gated post-approval).
                  const needsPlanningStep = renovation.requiresPlanning && !planningApproved && !planningPending;
                  const phase: 'planning' | 'works' = needsPlanningStep ? 'planning' : 'works';
                  const ineligible = ineligibilityReason(renovation, phase);
                  const planningFeeForCard = renovation.planningFee ?? 250;
                  const canSubmitPlanning = needsPlanningStep && playerCash >= planningFeeForCard;
                  // Soft warnings shown on planning-step cards (do not block selection).
                  const planningTenantWarning = needsPlanningStep && hasTenant && (renovation.category === 'conversion' || renovation.requiresVacant);
                  const planningCashWarning = needsPlanningStep && !affordable;
                  const blocked = !!ineligible || inProgress || completed || planningPending || blockedByCooldown;
                  const batchSelectable = batchMode && !blocked &&
                    (renovation.requiresPlanning ? (planningApproved ? affordable : true) : affordable);
                  const selectable = batchMode
                    ? batchSelectable
                    : !blocked && (canSubmitPlanning || (planningApproved && affordable) || (!renovation.requiresPlanning && affordable));

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
                  const valueLow = Math.round(cappedValueUp * (renovation.category === 'conversion' ? 0.5 : 0.45));
                  const valueHigh = Math.round(cappedValueUp * (renovation.category === 'conversion' ? 1.4 : 1.0));
                  const expectedValueUp = Math.round(cappedValueUp * expectedMult);

                  const inBatch = batchSelected.has(renovation.id);
                  const batchConversionConflict = batchMode && renovation.category === 'conversion'
                    && !inBatch
                    && Array.from(batchSelected).some(id => {
                      const o = RENOVATION_OPTIONS.find(x => x.id === id);
                      return o?.category === 'conversion';
                    });
                  // In batch mode we ALLOW planning-required renos so the player can submit
                  // multiple LPA applications in one go. We only block when there's already
                  // a pending application or the property is in cooldown.
                  const batchPlanningBlock = batchMode && renovation.requiresPlanning && (planningPending || blockedByCooldown);

                  return (
                    <Card
                      key={renovation.id}
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md",
                        isSelected && !batchMode && "ring-2 ring-primary",
                        inBatch && "ring-2 ring-success",
                        !selectable && !completed && "opacity-60",
                        blocked && "opacity-40 pointer-events-none",
                        (batchConversionConflict || batchPlanningBlock) && batchMode && "opacity-40 pointer-events-none",
                        CategoryColors[renovation.category]
                      )}
                      onClick={() => {
                        if (!selectable) return;
                        if (batchMode) {
                          if (batchPlanningBlock || batchConversionConflict) return;
                          const next = new Set(batchSelected);
                          if (next.has(renovation.id)) next.delete(renovation.id);
                          else next.add(renovation.id);
                          setBatchSelected(next);
                          return;
                        }
                        setSelectedRenovation(renovation);
                        if (renovation.category === 'conversion') {
                          setConversionUnits(defaultUnits(renovation));
                        }
                      }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {batchMode && (
                              <span className={cn(
                                "h-4 w-4 rounded border flex items-center justify-center text-[10px] shrink-0",
                                inBatch ? "bg-success border-success text-success-foreground" : "border-muted-foreground/40"
                              )}>{inBatch ? '✓' : ''}</span>
                            )}
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

                        {planningTenantWarning && !ineligible && !completed && (
                          <div className="text-xs text-amber-300 border border-amber-400/30 bg-amber-400/5 rounded px-2 py-1">
                            ⓘ Tenant in residence — eviction required before works start. Planning can be submitted now.
                          </div>
                        )}
                        {planningCashWarning && !ineligible && !completed && (
                          <div className="text-xs text-amber-300 border border-amber-400/30 bg-amber-400/5 rounded px-2 py-1">
                            ⓘ Submit planning now (£{planningFeeForCard.toLocaleString()}); you'll need £{scaledCost(renovation).toLocaleString()} cash once approved.
                          </div>
                        )}
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
              {selectedRenovation.sqftAdded ? (
                <div>
                  <span className="text-muted-foreground">Floor area:</span>
                  <br />
                  <span className="font-semibold text-success">
                    +{selectedRenovation.sqftAdded} sqft
                    {internalSqft ? ` → ${(internalSqft + selectedRenovation.sqftAdded).toLocaleString()} sqft` : ''}
                  </span>
                </div>
              ) : null}
              {isFlats(selectedRenovation) || isHmo(selectedRenovation) ? (
                <div>
                  <span className="text-muted-foreground">Units:</span>
                  <br />
                  <span className="font-semibold text-success">
                    {previewUnits(selectedRenovation)} {isFlats(selectedRenovation) ? 'flats' : 'rooms'}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {batchMode && batchSelected.size > 0 && (() => {
          const items = Array.from(batchSelected)
            .map(id => RENOVATION_OPTIONS.find(o => o.id === id))
            .filter(Boolean) as RenovationType[];

          // Split planning-required (and not-yet-approved) items from the rest
          const planningItems = items.filter(r => {
            const app = findApplication(r.id);
            return r.requiresPlanning && app?.status !== 'approved';
          });
          const worksItems = items.filter(r => !planningItems.includes(r));

          // Extension sqft in this batch — used to size any conversion against
          // the post-extension footprint.
          const batchExtensionSqft = items
            .filter(r => r.category === 'extension')
            .reduce((s, r) => s + (r.sqftAdded || 0), 0);
          const conversionsInBatch = items.filter(r => r.category === 'conversion');

          const rawCost = items.reduce((s, r) => s + scaledCost(r), 0);
          const worksDiscount = worksItems.length >= 3 ? 0.05 : 0;
          const combinedCost = Math.round(rawCost * (1 - worksDiscount) / 50) * 50;
          const combinedRent = items.reduce((s, r) => s + scaledRent(r), 0);
          const rawValue = items.reduce((s, r) => s + scaledValue(r), 0);
          const { uplift: combinedValue } = ceilingPrice > 0
            ? applyCeilingDiminishingReturns(rawValue, propertyValue, ceilingPrice)
            : { uplift: rawValue };
          const expectedValue = Math.round(combinedValue * RENOVATION_EXPECTED_MULTIPLIER);
          const maxDuration = Math.max(0, ...items.map(r => r.duration));
          const sqftAdded = items.reduce((s, r) => s + (r.sqftAdded || 0), 0);
          const annualRent = combinedRent * 12 * 0.85;
          const fiveYr = ((expectedValue + combinedRent * 60 * 0.85 - combinedCost) / Math.max(1, combinedCost)) * 100;

          // Combined planning fee + odds
          const approvalsCount = planningHistory.filter(a => a.status === 'approved').length;
          const refusalsCount = planningHistory.filter(a => a.status === 'refused').length;
          const planningRawFee = planningItems.reduce((s, r) => s + (r.planningFee ?? 250), 0);
          const planningBundleDiscount = planningItems.length >= 2 ? 0.10 : 0;
          const planningFeeTotal = Math.round(planningRawFee * (1 - planningBundleDiscount));
          const itemProbs = planningItems.map(r => ({
            r,
            prob: computePlanningApprovalProbability({
              baseProb: r.baseApprovalProb,
              propertyValuePounds: propertyValue,
              neighborhood: neighborhood ?? '',
              propertyType: propertyType ?? 'residential',
              renovationCategory: r.category,
              approvalsCount,
              refusalsCount,
            }).prob,
          }));
          const combinedProb = itemProbs.reduce((p, x) => p * x.prob, 1);

          return (
            <div className="bg-muted p-4 rounded-lg mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Batch summary · {items.length} renovation{items.length > 1 ? 's' : ''}</h4>
                <div className="flex gap-1">
                  {worksDiscount > 0 && (
                    <Badge className="bg-success/20 text-success border-success/30 text-xs">Works −5%</Badge>
                  )}
                  {planningBundleDiscount > 0 && (
                    <Badge className="bg-success/20 text-success border-success/30 text-xs">Planning −10%</Badge>
                  )}
                </div>
              </div>
              {conversionsInBatch.length > 0 && batchExtensionSqft > 0 && (
                <div className="text-[11px] text-amber-300 border border-amber-400/30 bg-amber-400/5 rounded px-2 py-1">
                  Conversion sized for {((effectiveInternalSqft || internalSqft || 0) + batchExtensionSqft).toLocaleString()} sqft (incl. {batchExtensionSqft} sqft extension).
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground text-xs">Combined cost</span><br/><span className={cn("font-semibold", playerCash >= combinedCost ? "text-foreground" : "text-danger")}>£{combinedCost.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground text-xs">Rent uplift / mo</span><br/><span className="font-semibold text-success">+£{combinedRent.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground text-xs">Value uplift (exp.)</span><br/><span className="font-semibold text-success">+£{expectedValue.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground text-xs">Longest duration</span><br/><span className="font-semibold">{maxDuration}d</span></div>
                <div><span className="text-muted-foreground text-xs">Annual rent (85% occ)</span><br/><span className="font-semibold">£{Math.round(annualRent).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground text-xs">5-yr total ROI</span><br/><span className={cn("font-semibold", fiveYr >= 20 ? "text-success" : fiveYr >= 0 ? "text-amber-300" : "text-danger")}>{fiveYr >= 0 ? '+' : ''}{fiveYr.toFixed(1)}%</span></div>
                {sqftAdded > 0 && (
                  <div><span className="text-muted-foreground text-xs">Floor area</span><br/><span className="font-semibold text-success">+{sqftAdded} sqft</span></div>
                )}
              </div>

              {planningItems.length > 0 && (
                <div className="space-y-1 border-t pt-2">
                  <div className="text-xs font-semibold flex items-center justify-between">
                    <span>Planning bundle · {planningItems.length} application{planningItems.length > 1 ? 's' : ''}</span>
                    <span className="text-muted-foreground">Fee £{planningFeeTotal.toLocaleString()}{planningBundleDiscount > 0 && ` (saved £${(planningRawFee - planningFeeTotal).toLocaleString()})`}</span>
                  </div>
                  <div className="space-y-0.5">
                    {itemProbs.map(({ r, prob }) => {
                      const pct = Math.round(prob * 100);
                      const c = pct >= 75 ? 'text-success' : pct >= 50 ? 'text-amber-300' : 'text-danger';
                      return (
                        <div key={r.id} className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground truncate">{r.name}</span>
                          <span className={cn("font-semibold", c)}>{pct}%</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between text-xs font-semibold pt-1 border-t border-border/40">
                      <span>Combined chance (all pass):</span>
                      <span className={cn(combinedProb >= 0.5 ? 'text-success' : combinedProb >= 0.25 ? 'text-amber-300' : 'text-danger')}>
                        {Math.round(combinedProb * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Available Cash: £{playerCash.toLocaleString()}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            {batchMode ? (() => {
              const items = Array.from(batchSelected)
                .map(id => RENOVATION_OPTIONS.find(o => o.id === id))
                .filter(Boolean) as RenovationType[];
              if (items.length === 0) return <Button disabled>Select renovations</Button>;
              const planningItems = items.filter(r => {
                const app = findApplication(r.id);
                return r.requiresPlanning && app?.status !== 'approved';
              });
              const worksItems = items.filter(r => !planningItems.includes(r));
              if (planningItems.length > 0) {
                const rawFee = planningItems.reduce((s, r) => s + (r.planningFee ?? 250), 0);
                const planningDiscount = planningItems.length >= 2 ? 0.10 : 0;
                const feeTotal = Math.round(rawFee * (1 - planningDiscount));
                const disabled = playerCash < feeTotal;
                return (
                  <Button
                    disabled={disabled}
                    onClick={() => {
                      const submitBatch = (useGameStore.getState() as any).submitBatchPlanningApplications;
                      submitBatch?.(propertyId, planningItems);
                      setBatchSelected(new Set());
                      setBatchMode(false);
                      setIsOpen(false);
                    }}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Submit {planningItems.length} planning application{planningItems.length > 1 ? 's' : ''} · £{feeTotal.toLocaleString()}
                  </Button>
                );
              }
              const rawCost = worksItems.reduce((s, r) => s + scaledCost(r), 0);
              const discount = worksItems.length >= 3 ? 0.05 : 0;
              const combinedCost = Math.round(rawCost * (1 - discount) / 50) * 50;
              const disabled = playerCash < combinedCost;
              return (
                <Button
                  disabled={disabled}
                  onClick={() => {
                    worksItems.forEach(r => {
                      const baseCost = scaledCost(r);
                      const discounted = Math.round(baseCost * (1 - discount) / 50) * 50;
                      onRenovate(propertyId, { ...r, cost: discounted });
                    });
                    setBatchSelected(new Set());
                    setBatchMode(false);
                    setIsOpen(false);
                  }}
                >
                  Start {worksItems.length} renovation{worksItems.length > 1 ? 's' : ''} · £{combinedCost.toLocaleString()}
                </Button>
              );
            })() : (() => {
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