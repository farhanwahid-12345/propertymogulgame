import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Hammer, Paintbrush, Home, Plus, Wrench, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { scaleRenovationCost, scaleRenovationRent, scaleRenovationValue } from "@/lib/engine/renovation";

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
}

const RENOVATION_OPTIONS: RenovationType[] = [
  // Maintenance
  {
    id: "basic_repair",
    name: "Basic Repairs",
    cost: 2500,
    rentIncrease: 50,
    valueIncrease: 3000,
    duration: 7,
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
    duration: 14,
    description: "Complete interior painting and minor cosmetic updates",
    icon: Paintbrush,
    category: "maintenance"
  },
  
  // Improvements
  {
    id: "kitchen_upgrade",
    name: "Kitchen Upgrade",
    cost: 8500,
    rentIncrease: 200,
    valueIncrease: 12000,
    duration: 21,
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
    duration: 18,
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
    duration: 10,
    description: "Install or upgrade central heating and insulation",
    icon: Zap,
    category: "improvement"
  },
  {
    id: "double_glazing",
    name: "Double Glazing",
    cost: 5500,
    rentIncrease: 100,
    valueIncrease: 8000,
    duration: 12,
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
    duration: 45,
    description: "Convert loft space into additional bedroom",
    icon: Plus,
    category: "extension",
    minInternalSqft: 700,
    allowedTypes: ["residential", "luxury"],
  },
  {
    id: "rear_extension",
    name: "Single-Story Extension",
    cost: 25000,
    rentIncrease: 450,
    valueIncrease: 35000,
    duration: 60,
    description: "Add extra room to rear of property",
    icon: Plus,
    category: "extension",
    minPlotSqft: 2200,
    allowedTypes: ["residential", "luxury"],
  },
  {
    id: "conservatory",
    name: "Conservatory",
    cost: 12000,
    rentIncrease: 250,
    valueIncrease: 18000,
    duration: 30,
    description: "Glass conservatory extension",
    icon: Plus,
    category: "extension",
    minPlotSqft: 1800,
    allowedTypes: ["residential", "luxury"],
  },

  // Conversions — change the property's character/use
  {
    id: "convert_hmo_4",
    name: "Convert to HMO (4-bed)",
    cost: 18000,
    rentIncrease: 600,
    valueIncrease: 8000,
    duration: 60,
    description: "License & remodel into a 4-bed shared house. Higher rent, more management.",
    icon: Home,
    category: "conversion",
    allowedTypes: ["residential"],
    minPropertyValue: 80000,
    minInternalSqft: 850,
    resultingSubtype: "hmo",
  },
  {
    id: "convert_hmo_6",
    name: "Convert to HMO (6-bed)",
    cost: 35000,
    rentIncrease: 1100,
    valueIncrease: 15000,
    duration: 90,
    description: "Larger HMO with 6 lettable rooms.",
    icon: Home,
    category: "conversion",
    allowedTypes: ["residential"],
    minPropertyValue: 120000,
    minInternalSqft: 1300,
    resultingSubtype: "hmo",
  },
  {
    id: "convert_flats",
    name: "Convert to Flats (2 units)",
    cost: 55000,
    rentIncrease: 900,
    valueIncrease: 40000,
    duration: 120,
    description: "Split into two self-contained flats with separate entrances.",
    icon: Plus,
    category: "conversion",
    allowedTypes: ["residential"],
    minInternalSqft: 1400,
    resultingSubtype: "flats",
  },
  {
    id: "convert_commercial_to_residential",
    name: "Commercial → Residential",
    cost: 40000,
    rentIncrease: 500,
    valueIncrease: 25000,
    duration: 90,
    description: "Change-of-use from retail/office into a residential let.",
    icon: Home,
    category: "conversion",
    allowedTypes: ["commercial"],
    resultingSubtype: "standard",
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
}: RenovationDialogProps) {
  const [selectedRenovation, setSelectedRenovation] = useState<RenovationType | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // All headline costs/rent/value uplifts are scaled to this property's profile
  const scaleInputs = { internalSqft, propertyValue };
  const scaledCost = (r: RenovationType) => scaleRenovationCost(r.cost, scaleInputs);
  const scaledRent = (r: RenovationType) => scaleRenovationRent(r.rentIncrease, scaleInputs);
  const scaledValue = (r: RenovationType) => scaleRenovationValue(r.valueIncrease, scaleInputs);

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
                  const blocked = !!ineligible || inProgress || completed;

                  // Scaled cost/uplifts for THIS property's size & value
                  const cost = scaledCost(renovation);
                  const rentUp = scaledRent(renovation);
                  const valueUp = scaledValue(renovation);

                  // Expected ranges based on ROI variability roll (60% full, 25% × 0.7, 10% × 0.3, 5% × 0)
                  const valueLow = Math.round(valueUp * 0.3);
                  const valueHigh = valueUp;
                  const valueTypical = Math.round(valueUp * 0.85);

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
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5" />
                            <CardTitle className="text-base">{renovation.name}</CardTitle>
                          </div>
                          {completed ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                              ✅ Completed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {renovation.duration}d
                            </Badge>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">{renovation.description}</p>

                        {completed && (
                          <div className="text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/5 rounded px-2 py-1">
                            ✅ Already completed on this property
                          </div>
                        )}

                        {ineligible && !completed && (
                          <div className="text-xs text-danger border border-danger/30 bg-danger/5 rounded px-2 py-1">
                            ⚠️ {ineligible}
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