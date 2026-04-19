import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { calcTenantRent, getProfileRentMultiplier, getConditionRentMultiplierShared } from "@/lib/tenantRent";
import type { PropertyCondition } from "@/types/game";

// --- Trait system ---

export interface TenantTrait {
  name: string;
  emoji: string;
  color: string;
  damageRiskMod: number;
  defaultRiskMod: number;
  rentMod: number;
  description: string;
}

const TRAIT_POOL: TenantTrait[] = [
  { name: "Meticulous", emoji: "✨", color: "border-sky-400 bg-sky-400/10 text-sky-300", damageRiskMod: 0.5, defaultRiskMod: 1, rentMod: 1, description: "Keeps the place spotless" },
  { name: "Long-term", emoji: "🏡", color: "border-emerald-400 bg-emerald-400/10 text-emerald-300", damageRiskMod: 0.9, defaultRiskMod: 0.9, rentMod: 1, description: "Plans to stay for years" },
  { name: "Pet Owner", emoji: "🐕", color: "border-amber-400 bg-amber-400/10 text-amber-300", damageRiskMod: 1.15, defaultRiskMod: 1, rentMod: 1.05, description: "Has a furry friend" },
  { name: "Smoker", emoji: "🚬", color: "border-orange-400 bg-orange-400/10 text-orange-300", damageRiskMod: 1.2, defaultRiskMod: 1, rentMod: 1, description: "May need redecoration on exit" },
  { name: "Quiet Professional", emoji: "🤫", color: "border-indigo-400 bg-indigo-400/10 text-indigo-300", damageRiskMod: 0.8, defaultRiskMod: 0.85, rentMod: 1, description: "Barely know they're there" },
  { name: "DIY Enthusiast", emoji: "🔧", color: "border-teal-400 bg-teal-400/10 text-teal-300", damageRiskMod: 0.7, defaultRiskMod: 1, rentMod: 1, description: "Fixes small issues themselves" },
  { name: "Late Payer", emoji: "⏰", color: "border-red-400 bg-red-400/10 text-red-300", damageRiskMod: 1, defaultRiskMod: 1.1, rentMod: 1, description: "Pays eventually, just late" },
  { name: "Young Couple", emoji: "💑", color: "border-pink-400 bg-pink-400/10 text-pink-300", damageRiskMod: 1.05, defaultRiskMod: 0.95, rentMod: 1, description: "May outgrow the property" },
  { name: "Retiree", emoji: "👴", color: "border-violet-400 bg-violet-400/10 text-violet-300", damageRiskMod: 0.6, defaultRiskMod: 0.8, rentMod: 0.95, description: "Very settled, negotiates lower rent" },
  { name: "Student", emoji: "🎓", color: "border-cyan-400 bg-cyan-400/10 text-cyan-300", damageRiskMod: 1.25, defaultRiskMod: 0.9, rentMod: 1, description: "Guarantor pays on time" },
];

const pickTraits = (): TenantTrait[] => {
  const count = Math.random() < 0.4 ? 2 : 1;
  const shuffled = [...TRAIT_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

// --- Description pools ---

const DESCRIPTIONS: Record<string, string[]> = {
  premium: [
    "Recently promoted surgeon, relocating from London",
    "Tech founder, prefers quiet neighbourhoods",
    "Senior barrister, impeccable references from 3 landlords",
    "Consultant engineer returning from overseas contract",
    "University professor with 15 years' renting history",
    "NHS Director, relocating for a new hospital role",
    "Architect couple, both earning well above average",
    "Senior partner at a law firm, downsizing from owned home",
  ],
  standard: [
    "Primary school teacher, been renting for 5 years",
    "Couple both working in the NHS, no children",
    "Civil servant with stable government employment",
    "Junior accountant, recently promoted",
    "Nurse practitioner, excellent references from current landlord",
    "Office manager, lived at previous address for 4 years",
    "Local council worker, steady income and no debts",
    "Retail manager with solid savings history",
  ],
  budget: [
    "Single parent working two part-time jobs",
    "Recent graduate starting first proper job",
    "Care worker on a zero-hours contract, never missed rent",
    "Warehouse operative, reliable but low income",
    "Cleaner with three regular clients, pays weekly",
    "Security guard doing night shifts, quiet during the day",
    "Shop assistant saving up, has a guarantor lined up",
    "Kitchen porter, been at the same restaurant 3 years",
  ],
  risky: [
    "Self-employed tradesman between contracts",
    "Recently divorced, rebuilding credit after joint mortgage",
    "Ex-forces veteran transitioning to civilian work",
    "Gig economy driver, income varies month to month",
    "Former business owner, company folded last year",
    "Benefits claimant actively job hunting, references from shelter",
    "Part-time carer with fluctuating hours",
    "Young person leaving care system, council support in place",
  ],
};

const EMPLOYMENTS: Record<string, string[]> = {
  premium: ["NHS Consultant", "Senior Engineer", "Solicitor", "University Professor", "Management Consultant", "Surgeon", "Architect", "Finance Director"],
  standard: ["Teacher", "Nurse", "Accountant", "Office Manager", "Civil Servant", "Police Officer", "Paramedic", "Social Worker"],
  budget: ["Shop Worker", "Warehouse Staff", "Care Worker", "Security Guard", "Cleaner", "Kitchen Porter", "Delivery Driver", "Receptionist"],
  risky: ["Unemployed", "Temporary Work", "Benefits", "Gig Work", "Part-time", "Self-Employed", "Zero-hours", "Casual Labour"],
};

const FIRST_NAMES = ["James", "Sarah", "Michael", "Emma", "David", "Lisa", "John", "Kate", "Tom", "Sophie", "Alex", "Rachel", "Ben", "Amy", "Chris", "Lucy", "Hassan", "Priya", "Liam", "Chloe", "Ollie", "Megan", "Ryan", "Zara"];
const LAST_NAMES = ["Smith", "Jones", "Brown", "Wilson", "Taylor", "Davies", "Evans", "Thomas", "Roberts", "Johnson", "Williams", "Miller", "Patel", "Khan", "O'Brien", "Garcia", "Singh", "Murphy", "Ali", "Chen"];

// --- Tenant interface ---

export interface Tenant {
  id: string;
  name: string;
  profile: "premium" | "standard" | "budget" | "risky";
  creditScore: number;
  monthlyIncome: number;
  employmentStatus: string;
  rentMultiplier: number;
  defaultRisk: number;
  damageRisk: number;
  description: string;
  traits: TenantTrait[];
}

// --- Generation ---

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const generateTenantProfiles = (): Tenant[] => {
  const getName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

  const makeTenant = (profile: Tenant["profile"], i: number): Tenant => {
    const traits = pickTraits();
    const traitDamageMod = traits.reduce((m, t) => m * t.damageRiskMod, 1);
    const traitDefaultMod = traits.reduce((m, t) => m * t.defaultRiskMod, 1);
    const traitRentMod = traits.reduce((m, t) => m * t.rentMod, 1);

    const configs = {
      premium: { credit: [680, 800], income: [5500, 9500], rent: [1.1, 1.25], defRisk: [1, 5], dmgRisk: [0.5, 2] },
      standard: { credit: [580, 720], income: [2800, 5500], rent: [0.9, 1.1], defRisk: [3, 15], dmgRisk: [1, 4] },
      budget:  { credit: [480, 650], income: [1800, 3200], rent: [0.75, 0.95], defRisk: [8, 25], dmgRisk: [2, 6] },
      risky:   { credit: [380, 580], income: [1200, 2800], rent: [1.0, 1.35], defRisk: [15, 45], dmgRisk: [3, 10] },
    };

    const c = configs[profile];
    const baseDefaultRisk = rand(c.defRisk[0], c.defRisk[1]);
    const baseDamageRisk = rand(c.dmgRisk[0], c.dmgRisk[1]);
    const baseRentMult = rand(c.rent[0], c.rent[1]);

    return {
      id: `${profile}_${i}_${Date.now()}`,
      name: getName(),
      profile,
      creditScore: randInt(c.credit[0], c.credit[1]),
      monthlyIncome: randInt(c.income[0], c.income[1]),
      employmentStatus: pick(EMPLOYMENTS[profile]),
      rentMultiplier: +(baseRentMult * traitRentMod).toFixed(3),
      defaultRisk: +Math.min(60, baseDefaultRisk * traitDefaultMod).toFixed(1),
      damageRisk: +Math.min(15, baseDamageRisk * traitDamageMod).toFixed(1),
      description: pick(DESCRIPTIONS[profile]),
      traits,
    };
  };

  return [
    ...Array.from({ length: randInt(2, 3) }, (_, i) => makeTenant("premium", i)),
    ...Array.from({ length: randInt(3, 4) }, (_, i) => makeTenant("standard", i)),
    ...Array.from({ length: randInt(2, 3) }, (_, i) => makeTenant("budget", i)),
    ...Array.from({ length: randInt(1, 2) }, (_, i) => makeTenant("risky", i)),
  ];
};

// --- Star rating helper ---

const StarRating = ({ value, max = 5, label }: { value: number; max?: number; label: string }) => {
  const stars = Math.round(value);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <div className="flex">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cn("text-xs", i < stars ? "text-amber-400" : "text-white/20")}>★</span>
        ))}
      </div>
    </div>
  );
};

const riskToStars = (risk: number, maxRisk: number): number => {
  const normalized = 1 - Math.min(risk / maxRisk, 1);
  return Math.max(1, Math.round(normalized * 5));
};

// --- Profile styling ---

const ProfileColors: Record<string, string> = {
  premium: "border-amber-400/30 bg-amber-400/5",
  standard: "border-sky-400/30 bg-sky-400/5",
  budget: "border-emerald-400/30 bg-emerald-400/5",
  risky: "border-red-400/30 bg-red-400/5",
};

const ProfileEmoji: Record<string, string> = {
  premium: "👑",
  standard: "🛡️",
  budget: "💼",
  risky: "⚡",
};

// --- Component ---

interface TenantSelectorProps {
  propertyId: string;
  baseRent: number; // pounds (already converted from pennies by useGameState)
  onSelectTenant: (propertyId: string, tenant: Tenant) => void;
  currentTenant?: Tenant;
  currentMonthlyRent?: number;
  lastTenantChange?: number;
  monthsPlayed?: number;
  condition?: PropertyCondition;
  propertyValue?: number; // pounds; used as fallback for £0 baseRent
  propertyYield?: number; // % annual yield; used with value as last-resort
  /** Current tenant's satisfaction (0-100) — shown in the dialog header. */
  currentSatisfaction?: number;
  satisfactionReasons?: Array<{ reason: string; delta: number }>;
}

export function TenantSelector({
  propertyId,
  baseRent,
  onSelectTenant,
  currentTenant,
  lastTenantChange,
  monthsPlayed = 0,
  condition,
  propertyValue,
  propertyYield,
  currentSatisfaction,
  satisfactionReasons = [],
}: TenantSelectorProps) {
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tenantProfiles, setTenantProfiles] = useState<Tenant[]>([]);

  useEffect(() => {
    if (isOpen) {
      setTenantProfiles(generateTenantProfiles());
      setSelectedTenant(null);
    }
  }, [isOpen]);

  const handleOpenChange = useCallback((open: boolean) => setIsOpen(open), []);

  const handleSelectTenant = useCallback(() => {
    if (selectedTenant) {
      onSelectTenant(propertyId, selectedTenant);
      setIsOpen(false);
      setSelectedTenant(null);
    }
  }, [selectedTenant, onSelectTenant, propertyId]);

  // Robust base rent fallback: baseRent → derive from value × yield/12
  let displayBaseRent = baseRent > 0 ? baseRent : 0;
  if (displayBaseRent <= 0 && propertyValue && propertyValue > 0) {
    const yieldPct = propertyYield ?? 7; // default 7%
    displayBaseRent = Math.floor((propertyValue * (yieldPct / 100)) / 12);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {currentTenant ? currentTenant.name : "Select Tenant"}
          </div>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose Tenant for Property</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Different tenants offer different rent and risk profiles. The market refreshes each time you look!
            {displayBaseRent > 0 && (
              <span className="block mt-1 text-foreground">
                Base rent: £{Math.round(displayBaseRent).toLocaleString()}/mo
              </span>
            )}
            {currentTenant && typeof currentSatisfaction === 'number' && (
              <span className="block mt-2 p-2 rounded-md bg-muted/50 border border-border text-foreground">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-xs">
                    Current: {currentTenant.name} —
                    <span className={cn(
                      "ml-1",
                      currentSatisfaction >= 70 ? "text-emerald-400" :
                      currentSatisfaction >= 40 ? "text-amber-400" :
                      "text-red-400"
                    )}>
                      ❤️ {Math.round(currentSatisfaction)}% satisfied
                    </span>
                  </span>
                </span>
                {satisfactionReasons.length > 0 && (
                  <span className="block mt-1 text-[10px] text-muted-foreground">
                    {satisfactionReasons.slice(0, 2).map(r => `${r.reason} (${r.delta > 0 ? '+' : ''}${r.delta})`).join(' • ')}
                  </span>
                )}
              </span>
            )}
            {lastTenantChange !== undefined && monthsPlayed - lastTenantChange < 3 && (
              <span className="text-amber-400 block mt-1">
                ⚠️ Higher-rent tenants unavailable for {3 - (monthsPlayed - lastTenantChange)} more month(s)
              </span>
            )}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tenantProfiles.map((tenant) => {
            // Use shared formula so preview matches what the tenant actually pays
            const potentialRent = calcTenantRent(displayBaseRent, tenant, condition);
            const profileMult = getProfileRentMultiplier(tenant.profile);
            const conditionMult = getConditionRentMultiplierShared(condition);
            const isSelected = selectedTenant?.id === tenant.id;
            const reliabilityStars = riskToStars(tenant.defaultRisk, 50);
            const careStars = riskToStars(tenant.damageRisk, 12);

            return (
              <Card
                key={tenant.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md border",
                  isSelected && "ring-2 ring-primary",
                  ProfileColors[tenant.profile]
                )}
                onClick={() => setSelectedTenant(tenant)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ProfileEmoji[tenant.profile]}</span>
                      <CardTitle className="text-base">{tenant.name}</CardTitle>
                    </div>
                    <Badge variant="outline" className="capitalize text-xs">
                      {tenant.profile}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2.5">
                  <p className="text-sm text-muted-foreground italic">{tenant.description}</p>

                  {/* Trait badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {tenant.traits.map((trait) => (
                      <span
                        key={trait.name}
                        className={cn("text-xs px-2 py-0.5 rounded-full border", trait.color)}
                        title={trait.description}
                      >
                        {trait.emoji} {trait.name}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Credit Score</span>
                      <div className={cn(
                        "font-semibold",
                        tenant.creditScore >= 700 ? "text-emerald-400" :
                        tenant.creditScore >= 600 ? "text-amber-400" : "text-red-400"
                      )}>
                        {tenant.creditScore}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Income</span>
                      <div className="font-semibold">£{tenant.monthlyIncome.toLocaleString()}/mo</div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Employment</span>
                      <div className="text-sm">{tenant.employmentStatus}</div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Potential Rent</span>
                      <div className="font-semibold text-emerald-400 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        £{potentialRent.toLocaleString()}/mo
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        £{Math.round(displayBaseRent).toLocaleString()} × {profileMult.toFixed(2)}
                        {conditionMult !== 1 && ` × ${conditionMult.toFixed(2)} ${condition}`}
                      </div>
                    </div>
                  </div>

                  {/* Star ratings */}
                  <div className="flex gap-4 pt-1">
                    <StarRating value={reliabilityStars} label="Reliability" />
                    <StarRating value={careStars} label="Property Care" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSelectTenant} disabled={!selectedTenant}>
            Select Tenant
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
