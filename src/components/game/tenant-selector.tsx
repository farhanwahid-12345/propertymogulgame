import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, DollarSign, Lock, CreditCard, FileSearch, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { calcTenantRent, getProfileRentMultiplier, getConditionRentMultiplierShared, getFurnishingRentMultiplier } from "@/lib/tenantRent";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies, toPennies } from "@/lib/formatCurrency";
import type { PropertyCondition } from "@/types/game";
import { TENANT_MIN_CONDITION } from "@/lib/engine/constants";

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
  /** Phase 1 — commercial tenants only: registered company name. */
  companyName?: string;
  /** Phase 1 — commercial tenants only: covenant strength 0–100 (financial standing). */
  covenantStrength?: number;
  /** Phase 1 — commercial tenants only: sector tag for flavour & risk weighting. */
  sector?: 'retail' | 'logistics' | 'professional_services' | 'hospitality' | 'healthcare'
    | 'tech' | 'media' | 'finance' | 'legal' | 'student_accom' | 'coworking' | 'corporate';
  /** Item 2 — commercial tenants only: true if drawn from the national/multinational pool. */
  isNational?: boolean;
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

// --- Commercial tenant generation (Phase 1, Item 2 — city-aware) ------------

const COMMERCIAL_SECTORS = [
  'retail', 'logistics', 'professional_services', 'hospitality', 'healthcare',
  'tech', 'media', 'finance', 'legal', 'student_accom', 'coworking', 'corporate',
] as const;
type CommercialSector = typeof COMMERCIAL_SECTORS[number];

type CityKey = 'middlesbrough' | 'leeds' | 'manchester' | 'london';

type LocalPoolEntry = { name: string; sector: CommercialSector; description: string };

const CITY_LOCAL_POOL: Record<CityKey, LocalPoolEntry[]> = {
  middlesbrough: [
    { name: "Bridge St Boutique Ltd", sector: 'retail', description: "Independent high-street shop with 6 years' trading history" },
    { name: "Northfield Convenience Ltd", sector: 'retail', description: "Local convenience store expanding into a second unit" },
    { name: "Acklam Takeaway Co Ltd", sector: 'hospitality', description: "Independent takeaway with a loyal local following" },
    { name: "Linthorpe Cycle Co Ltd", sector: 'retail', description: "Specialist independent retailer" },
    { name: "Tees Valley Freight Ltd", sector: 'logistics', description: "Light-industrial last-mile depot operator" },
    { name: "Ironworks Distribution Ltd", sector: 'logistics', description: "Regional haulier looking for warehouse space" },
    { name: "Cleveland Couriers Ltd", sector: 'logistics', description: "Local courier needing a small distribution hub" },
    { name: "Marton NHS Health Centre", sector: 'healthcare', description: "NHS-contracted primary care provider" },
    { name: "Bridge St Dental Practice Ltd", sector: 'healthcare', description: "Independent dental practice" },
    { name: "Northfield Pharmacy Ltd", sector: 'healthcare', description: "Community pharmacy under NHS contract" },
  ],
  leeds: [
    { name: "Park Row Legal Partners LLP", sector: 'legal', description: "Mid-tier law firm relocating from serviced offices" },
    { name: "Wellington Place Accountants Ltd", sector: 'finance', description: "Regional accountancy practice" },
    { name: "Yorkshire Wealth Advisors Ltd", sector: 'finance', description: "Independent financial advisory firm" },
    { name: "Briggate Retail Group Ltd", sector: 'retail', description: "Regional retail chain with 12 stores" },
    { name: "Headingley Student Living Ltd", sector: 'student_accom', description: "PBSA operator targeting Leeds Uni catchment" },
    { name: "Hyde Park Student Homes Ltd", sector: 'student_accom', description: "Established student accommodation operator" },
    { name: "Trinity Boutique Retail Ltd", sector: 'retail', description: "Premium fashion retailer" },
    { name: "Kirkstall Legal Advisory Ltd", sector: 'legal', description: "Boutique commercial law firm" },
  ],
  manchester: [
    { name: "NorthQuarter Tech Ltd", sector: 'tech', description: "Growing SaaS company with Series A funding" },
    { name: "MediaCityWorks Ltd", sector: 'media', description: "Independent media agency with blue-chip clients" },
    { name: "Ancoats Digital Studio Ltd", sector: 'tech', description: "Digital product studio scaling its team" },
    { name: "Spinningfields Coworking Ltd", sector: 'coworking', description: "Flexible workspace operator expanding footprint" },
    { name: "Northern Quarter Restaurants Ltd", sector: 'hospitality', description: "Restaurant group with three profitable sites" },
    { name: "Castlefield Hospitality Group Ltd", sector: 'hospitality', description: "Multi-site bar & restaurant operator" },
    { name: "Deansgate Creative Agency Ltd", sector: 'media', description: "Brand & creative agency with national clients" },
    { name: "Oxford Road Coworking Co Ltd", sector: 'coworking', description: "Independent flex-space operator" },
  ],
  london: [
    { name: "Canary Wharf Capital Partners LLP", sector: 'finance', description: "Boutique investment management firm" },
    { name: "City Square Asset Management Ltd", sector: 'finance', description: "FCA-regulated asset manager" },
    { name: "Mayfair Holdings PLC", sector: 'corporate', description: "Blue-chip holding company HQ requirement" },
    { name: "Shoreditch International Ltd", sector: 'corporate', description: "International corporate UK headquarters" },
    { name: "Bond Street Luxury Retail Ltd", sector: 'retail', description: "International luxury retailer flagship" },
    { name: "Knightsbridge Premium Goods Ltd", sector: 'retail', description: "High-end international retail brand" },
    { name: "Threadneedle Financial Group PLC", sector: 'finance', description: "Institutional financial services firm" },
    { name: "Soho Media House Ltd", sector: 'media', description: "Global media agency UK HQ" },
  ],
};

const CITY_COVENANT_RANGE: Record<CityKey, [number, number]> = {
  middlesbrough: [30, 60],
  leeds: [45, 75],
  manchester: [50, 80],
  london: [65, 95],
};

const NATIONAL_TENANT_POOL: LocalPoolEntry[] = [
  { name: "Costa Coffee Ltd", sector: 'hospitality', description: "National coffee chain — strong covenant, multi-site operator" },
  { name: "Tesco Express Ltd", sector: 'retail', description: "National convenience retailer — institutional covenant" },
  { name: "Sainsbury's Local Ltd", sector: 'retail', description: "National grocery chain — convenience format" },
  { name: "Greggs PLC", sector: 'hospitality', description: "National food-to-go operator — listed PLC" },
  { name: "DPD Parcel Services Ltd", sector: 'logistics', description: "National parcel network — institutional logistics covenant" },
  { name: "DHL Supply Chain Ltd", sector: 'logistics', description: "Multinational logistics operator" },
  { name: "NHS Property Services Ltd", sector: 'healthcare', description: "Government-backed healthcare estate provider" },
  { name: "Boots UK Ltd", sector: 'healthcare', description: "National pharmacy & healthcare retailer" },
  { name: "Regus Workspace Ltd", sector: 'coworking', description: "Multinational flexible workspace operator" },
  { name: "WeWork UK Ltd", sector: 'coworking', description: "International coworking operator" },
  { name: "Pret A Manger Ltd", sector: 'hospitality', description: "National food-to-go chain" },
  { name: "Specsavers Optical Ltd", sector: 'healthcare', description: "National optical & healthcare retailer" },
  { name: "WHSmith High Street Ltd", sector: 'retail', description: "National high-street retailer" },
  { name: "Travelodge Hotels Ltd", sector: 'hospitality', description: "National budget hotel operator" },
];

const covenantToProfile = (cov: number): Tenant['profile'] =>
  cov >= 80 ? 'premium' : cov >= 55 ? 'standard' : cov >= 30 ? 'budget' : 'risky';

const pickCovenantInRange = ([lo, hi]: [number, number]): number => {
  // Bias slightly toward the middle of the range.
  const a = randInt(lo, hi), b = randInt(lo, hi);
  return Math.round((a + b) / 2);
};

const generateCommercialTenantProfiles = (city: CityKey = 'middlesbrough'): Tenant[] => {
  const usedNames = new Set<string>();
  const localPool = CITY_LOCAL_POOL[city] ?? CITY_LOCAL_POOL.middlesbrough;
  const localRange = CITY_COVENANT_RANGE[city] ?? CITY_COVENANT_RANGE.middlesbrough;

  const makeFromEntry = (entry: LocalPoolEntry, isNational: boolean, i: number): Tenant => {
    const covenantStrength = isNational ? randInt(75, 95) : pickCovenantInRange(localRange);
    const profile = covenantToProfile(covenantStrength);
    const defaultRisk = +Math.max(1, 45 - covenantStrength * 0.45).toFixed(1);
    const damageRisk = +Math.max(0.5, 10 - covenantStrength * 0.08).toFixed(1);
    const rentMultiplier = +(0.85 + (covenantStrength / 100) * 0.4).toFixed(3);
    return {
      id: `commercial_${i}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      name: entry.name,
      companyName: entry.name,
      covenantStrength,
      sector: entry.sector,
      profile,
      creditScore: 400 + Math.round(covenantStrength * 4),
      monthlyIncome: 5000 + covenantStrength * 200,
      employmentStatus: entry.sector.replace('_', ' '),
      rentMultiplier,
      defaultRisk,
      damageRisk,
      description: entry.description,
      traits: [],
      isNational,
    } as Tenant;
  };

  const pickUnique = (pool: LocalPoolEntry[]): LocalPoolEntry | null => {
    const available = pool.filter(e => !usedNames.has(e.name));
    if (!available.length) return null;
    const entry = pick(available);
    usedNames.add(entry.name);
    return entry;
  };

  const results: Tenant[] = [];
  const localCount = randInt(3, 4);
  for (let i = 0; i < localCount; i++) {
    const entry = pickUnique(localPool);
    if (entry) results.push(makeFromEntry(entry, false, i));
  }
  const nationalCount = randInt(1, 2);
  for (let i = 0; i < nationalCount; i++) {
    const entry = pickUnique(NATIONAL_TENANT_POOL);
    if (entry) results.push(makeFromEntry(entry, true, localCount + i));
  }
  return results;
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
  conditionScore?: number;
  propertyValue?: number; // pounds; used as fallback for £0 baseRent
  propertyYield?: number; // % annual yield; used with value as last-resort
  /** Current tenant's satisfaction (0-100) — shown in the dialog header. */
  currentSatisfaction?: number;
  satisfactionReasons?: Array<{ reason: string; delta: number }>;
  /** Furnishing tier — feeds the rent preview so it matches what the tenant will pay. */
  furnishingTier?: 'unfurnished' | 'part_furnished' | 'fully_furnished';
  /** Phase 1 — when 'commercial', the applicant pool becomes company tenants with covenant strength. */
  propertyType?: 'residential' | 'commercial' | 'luxury';
  /** Phase 2 — when set, commercial applicants route to Heads of Terms instead of direct placement. */
  onCommercialApplicantSelected?: (propertyId: string, tenant: Tenant) => void;
  /** Item 2 — property city, drives the commercial applicant pool. */
  city?: 'middlesbrough' | 'leeds' | 'manchester' | 'london';
}


export function TenantSelector({
  propertyId,
  baseRent,
  onSelectTenant,
  currentTenant,
  lastTenantChange,
  monthsPlayed = 0,
  condition,
  conditionScore,
  propertyValue,
  propertyYield,
  currentSatisfaction,
  satisfactionReasons = [],
  furnishingTier,
  propertyType,
  onCommercialApplicantSelected,
  city,
}: TenantSelectorProps) {
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tenantProfiles, setTenantProfiles] = useState<Tenant[]>([]);
  type Screened = { credit?: boolean; ref?: boolean; rtr?: boolean };
  const [screened, setScreened] = useState<Record<string, Screened>>({});

  useEffect(() => {
    if (isOpen) {
      setTenantProfiles(
        propertyType === 'commercial'
          ? generateCommercialTenantProfiles(city ?? 'middlesbrough')
          : generateTenantProfiles(),
      );
      setSelectedTenant(null);
      setScreened({});
    }
  }, [isOpen, propertyType, city]);



  const handleOpenChange = useCallback((open: boolean) => setIsOpen(open), []);

  const runScreening = useCallback((tenantId: string, kind: keyof Screened, costPounds: number) => {
    const cashPennies = useGameStore.getState().cash;
    if (cashPennies < toPennies(costPounds)) return;
    useGameStore.getState().setCash(cashPennies - toPennies(costPounds));
    setScreened(prev => ({ ...prev, [tenantId]: { ...prev[tenantId], [kind]: true } }));
  }, []);

  const handleSelectTenant = useCallback(() => {
    if (!selectedTenant) return;
    // Phase 2 — commercial flow: hand off to HoT negotiation instead of placing immediately.
    if (propertyType === 'commercial' && onCommercialApplicantSelected) {
      onCommercialApplicantSelected(propertyId, selectedTenant);
    } else {
      onSelectTenant(propertyId, selectedTenant);
    }
    setIsOpen(false);
    setSelectedTenant(null);
  }, [selectedTenant, onSelectTenant, onCommercialApplicantSelected, propertyId, propertyType]);


  // Robust base rent fallback: baseRent → derive from value × yield/12
  let displayBaseRent = baseRent > 0 ? baseRent : 0;
  if (displayBaseRent <= 0 && propertyValue && propertyValue > 0) {
    const yieldPct = propertyYield ?? 7; // default 7%
    displayBaseRent = Math.floor((propertyValue * (yieldPct / 100)) / 12);
  }

  const hasSittingTenant = !!currentTenant;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {hasSittingTenant ? `Tenant: ${currentTenant!.name}` : "Select Tenant"}
          </div>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hasSittingTenant ? 'Tenant Currently in Place' : 'Choose Tenant for Property'}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {hasSittingTenant
              ? "Under the Renters' Rights Act, you can't replace a sitting tenant. Use \"Propose Rent Increase\" on the property card to negotiate rent (Section 13), or serve a valid eviction notice and wait the notice period before re-letting."
              : 'Different tenants offer different rent and risk profiles. The market refreshes each time you look!'}
            {!hasSittingTenant && displayBaseRent > 0 && (
              <span className="block mt-1 text-foreground">
                Base rent: £{Math.round(displayBaseRent * getFurnishingRentMultiplier(furnishingTier) * getConditionRentMultiplierShared(condition)).toLocaleString()}/mo
                {furnishingTier && furnishingTier !== 'unfurnished' && (
                  <span className="ml-1 text-[10px] text-emerald-300 capitalize">
                    (incl. {furnishingTier.replace('_', ' ')} +{Math.round((getFurnishingRentMultiplier(furnishingTier) - 1) * 100)}%)
                  </span>
                )}
              </span>
            )}
            {hasSittingTenant && typeof currentSatisfaction === 'number' && (
              <span className="block mt-2 p-2 rounded-md bg-muted/50 border border-border text-foreground">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-xs">
                    Current: {currentTenant!.name} —
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
            {!hasSittingTenant && lastTenantChange !== undefined && monthsPlayed - lastTenantChange < 3 && (
              <span className="text-amber-400 block mt-1">
                ⚠️ Higher-rent tenants unavailable for {3 - (monthsPlayed - lastTenantChange)} more month(s)
              </span>
            )}
          </p>
        </DialogHeader>

        {hasSittingTenant ? (
          <div className="p-4 rounded-lg bg-muted/30 border border-border text-sm space-y-3">
            <p className="text-foreground font-medium">To change tenant or rent:</p>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Raise rent</strong> — close this dialog and click <em>"Propose Rent Increase"</em> on the property card.</li>
              <li><strong className="text-foreground">Remove tenant</strong> — close this dialog and click <em>"Serve eviction notice"</em>; pick a valid ground and wait the notice period.</li>
            </ul>
            <div className="flex justify-end pt-1">
              <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tenantProfiles.map((tenant) => {
            // Use shared formula so preview matches what the tenant actually pays
            const potentialRent = calcTenantRent(displayBaseRent, tenant, condition, furnishingTier);
            const profileMult = getProfileRentMultiplier(tenant.profile);
            const conditionMult = getConditionRentMultiplierShared(condition);
            const isSelected = selectedTenant?.id === tenant.id;
            const reliabilityStars = riskToStars(tenant.defaultRisk, 50);
            const careStars = riskToStars(tenant.damageRisk, 12);
            const minCond = TENANT_MIN_CONDITION[tenant.profile as keyof typeof TENANT_MIN_CONDITION] ?? 0;
            const conditionLocked = typeof conditionScore === 'number' && conditionScore < minCond;

            return (
              <Card
                key={tenant.id}
                className={cn(
                  "transition-all border",
                  conditionLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:shadow-md",
                  isSelected && !conditionLocked && "ring-2 ring-primary",
                  ProfileColors[tenant.profile]
                )}
                onClick={() => { if (!conditionLocked) setSelectedTenant(tenant); }}
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
                  {conditionLocked && (
                    <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-300 flex items-center gap-1.5">
                      <Lock className="h-3 w-3" /> Won't accept — needs condition ≥ {minCond} (currently {Math.round(conditionScore!)})
                    </div>
                  )}
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
                      {screened[tenant.id]?.credit ? (
                        <div className={cn(
                          "font-semibold",
                          tenant.creditScore >= 700 ? "text-emerald-400" :
                          tenant.creditScore >= 600 ? "text-amber-400" : "text-red-400"
                        )}>
                          {tenant.creditScore}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); runScreening(tenant.id, 'credit', 35); }}
                          className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                        >
                          <CreditCard className="h-3 w-3" /> Run check (£35)
                        </button>
                      )}
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

                  {/* Star ratings — gated behind reference check */}
                  {screened[tenant.id]?.ref ? (
                    <div className="flex gap-4 pt-1">
                      <StarRating value={reliabilityStars} label="Reliability" />
                      <StarRating value={careStars} label="Property Care" />
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        Default risk: {tenant.defaultRisk.toFixed(1)}%
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); runScreening(tenant.id, 'ref', 50); }}
                      className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200 pt-1"
                    >
                      <FileSearch className="h-3 w-3" /> Reference check (£50) — reveal reliability + risk
                    </button>
                  )}

                  {/* Right-to-rent — required check */}
                  {screened[tenant.id]?.rtr ? (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <ShieldCheck className="h-3 w-3" /> Right to rent verified
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); runScreening(tenant.id, 'rtr', 25); }}
                      className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200"
                    >
                      <Lock className="h-3 w-3" /> Right-to-rent check (£25) — legally required
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSelectTenant}
            disabled={!selectedTenant || (typeof conditionScore === 'number' && conditionScore < (TENANT_MIN_CONDITION[selectedTenant?.profile as keyof typeof TENANT_MIN_CONDITION] ?? 0))}
          >
            {propertyType === 'commercial' ? 'Open Heads of Terms' : 'Select Tenant'}

          </Button>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
