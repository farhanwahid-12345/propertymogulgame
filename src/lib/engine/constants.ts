import type { MortgageProvider, Property } from "@/types/game";
import { toPennies } from "@/lib/formatCurrency";

// All monetary constants are in PENNIES

export const INITIAL_CASH = toPennies(100_000);
export const EXPERIENCE_BASE = 1000;
export const MORTGAGE_INTEREST_RATE = 0.055;
export const BASE_MARKET_RATE = 0.035;
export const COUNCIL_TAX_BAND_D = toPennies(150);
export const CORPORATION_TAX_RATE = 0.19;
export const SOLICITOR_FEES = toPennies(600);
export const ESTATE_AGENT_RATE = 0.015;
export const AUCTION_SELLER_FEE = 0.05;
export const MONTH_DURATION_SECONDS = 180;
/** Legacy flat Early Repayment Charge (used as fallback for SVR/tracker mortgages
 *  with no fixed-term schedule). New fixed-term mortgages use computeErcRate(). */
export const ERC_PERCENT = 0.02;
/** ERC fallback window for legacy/SVR mortgages (in-game months). */
export const ERC_WINDOW_MONTHS = 60;

/** Sliding ERC schedule by fixed-term product. Year index 0 = first 12 months, etc. */
const ERC_SCHEDULES: Record<number, number[]> = {
  2:  [0.03, 0.02],
  5:  [0.05, 0.04, 0.03, 0.02, 0.01],
  10: [0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01],
};
/** Returns the ERC rate (decimal) for a mortgage given its fixed term and months elapsed.
 *  Returns 0 once outside the fixed term, or for SVR/tracker (fixedTermYears falsy). */
export function computeErcRate(fixedTermYears: number | undefined, monthsIntoTerm: number): number {
  if (!fixedTermYears) return 0;
  const schedule = ERC_SCHEDULES[fixedTermYears];
  if (!schedule) return 0;
  const yearIdx = Math.floor(Math.max(0, monthsIntoTerm) / 12);
  if (yearIdx >= schedule.length) return 0;
  return schedule[yearIdx];
}
/** Annual electrical safety / EICR check (per residential property). */
export const EICR_COST_PENNIES = toPennies(220);
/** Loan products — limits & rate spreads above current market rate. */
export const LOAN_PRODUCTS = {
  personal:  { hardCapPennies: toPennies(25_000),  minTermMonths: 12, maxTermMonths: 60, baseSpread: 0.04,  spreadMin: 0.025, spreadMax: 0.05,  minCreditScore: 600 },
  business:  { hardCapPennies: toPennies(150_000), minTermMonths: 12, maxTermMonths: 84, baseSpread: 0.025, spreadMin: 0.015, spreadMax: 0.035, minCreditScore: 580 },
  // Investor / friends & family — high rate, no credit check, gated by reputation.
  investor:  { hardCapPennies: toPennies(75_000),  minTermMonths: 12, maxTermMonths: 36, baseSpread: 0.10,  spreadMin: 0.08,  spreadMax: 0.13,  minCreditScore: 0,   minReputation: 40 },
} as const;

/** Default EPC rating derived from condition (legacy backfill). */
export function defaultEpcForCondition(c?: 'dilapidated' | 'standard' | 'premium'): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' {
  if (c === 'premium') return 'B';
  if (c === 'dilapidated') return 'F';
  return 'D';
}

/** Bump EPC by N grades up the alphabet (A is best). */
export function bumpEpcRating(current: string | undefined, grades: number): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' {
  const order: Array<'A'|'B'|'C'|'D'|'E'|'F'|'G'> = ['A','B','C','D','E','F','G'];
  const idx = Math.max(0, order.indexOf((current as any) ?? 'D'));
  const newIdx = Math.max(0, idx - Math.max(0, grades));
  return order[newIdx];
}

// ─── Repair Bar (Continuous Condition Score) ──────────────────────
/** Map a 0–100 condition score onto the legacy 3-tier enum used downstream. */
export function conditionTierFromScore(score: number | undefined): 'dilapidated' | 'standard' | 'premium' {
  const s = typeof score === 'number' ? score : 60;
  if (s >= 80) return 'premium';
  if (s >= 45) return 'standard';
  return 'dilapidated';
}
/** Migrate legacy condition tier → starting score. */
export function scoreFromConditionTier(tier?: 'dilapidated' | 'standard' | 'premium'): number {
  if (tier === 'premium') return 85;
  if (tier === 'dilapidated') return 25;
  return 60;
}
/** Tenant-profile wear multiplier on monthly decay. */
export const TENANT_WEAR_MULTIPLIER: Record<'premium' | 'standard' | 'budget' | 'risky' | 'vacant', number> = {
  premium: 0.7, standard: 1.0, budget: 1.3, risky: 1.7, vacant: 0.4,
};
/** Base monthly decay (points) before tenant multiplier. ≈ 6–10 pts/yr typical. */
export const BASE_CONDITION_DECAY = 0.6;
/** Floor below which neglect alone won't push a property — only damage events can. */
export const CONDITION_DECAY_FLOOR = 5;
/** Cost in pennies per condition point per sqft (UI divides by 100 → £/pt-sqft).
 *  500 → 20pts × 900sqft × 500 / 100 = 90,000p = £900 per 20-pt top-up. */
export const CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT = 500;
/** Maximum condition points a player may buy in a single in-game month. */
export const MAX_TOPUP_POINTS_PER_MONTH = 20;
/** Minimum acceptable condition score by tenant profile (gates selection). */
export const TENANT_MIN_CONDITION: Record<'premium' | 'standard' | 'budget' | 'risky', number> = {
  premium: 75, standard: 55, budget: 35, risky: 15,
};
/** Lift in condition points for resolving a tenant concern, by category. */
export const CONCERN_RESOLVE_CONDITION_LIFT: Record<'maintenance' | 'noise' | 'mould' | 'appliance' | 'safety', number> = {
  maintenance: 4, noise: 1, mould: 6, appliance: 4, safety: 5,
};

export const MORTGAGE_PROVIDERS: MortgageProvider[] = [
  { id: "hsbc", name: "HSBC", baseRate: 0.035, maxLTV: 0.75, minCreditScore: 740, description: "Premier bank with the best rates but strictest criteria" },
  { id: "nationwide", name: "Nationwide", baseRate: 0.045, maxLTV: 0.80, minCreditScore: 680, description: "Building society with competitive rates" },
  { id: "halifax", name: "Halifax", baseRate: 0.058, maxLTV: 0.85, minCreditScore: 640, description: "Flexible lending with moderate rates" },
  { id: "quickcash", name: "QuickCash Mortgages", baseRate: 0.095, maxLTV: 0.90, minCreditScore: 550, description: "Fast approval with higher rates" },
  { id: "easyloan", name: "Easy Finance Ltd", baseRate: 0.15, maxLTV: 0.95, minCreditScore: 450, description: "Last resort lender - approves almost anyone" },
];

export const MIDDLESBROUGH_STREETS = [
  "Linthorpe Road", "Park Road South", "Acklam Road", "Borough Road", "Marton Road",
  "Roman Road", "Trimdon Avenue", "Southfield Road", "Albert Road", "Newport Road",
  "Cargo Fleet Lane", "Vulcan Street", "The Crescent", "The Avenue", "Stokesley Road",
  "Parliament Road", "Corporation Road", "Cambridge Road", "Oxford Road", "Ormesby Road",
  "Mandale Road", "Ayresome Street", "Waterloo Road", "Grange Road", "Cypress Road",
  "Stainton Way", "Ladgate Lane", "The Greenway", "Tollesby Road", "Marton Burn Road",
  "Grove Hill Road", "Longlands Road", "Valley Road", "The Grove", "Clairville Road",
  "Cargo Fleet Road", "Saltersgill Avenue", "Hemlington Village Road", "Stainsby Road",
  "Ormesby Road", "Trunk Road", "Marton Moor Road", "Nunthorpe Avenue", "Green Lane"
];

// All property prices/incomes in PENNIES
export const AVAILABLE_PROPERTIES: Property[] = [
  // Level 1
  // v4 #18 — Level 1 starter pool yields jittered across 11–16% to avoid uniform 14%.
  { id: "1", name: "45 Linthorpe Road", type: "residential", price: toPennies(75000), value: toPennies(75000), neighborhood: "Linthorpe", monthlyIncome: toPennies(968), marketTrend: "up", yield: 15.5, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "2", name: "12 Park Road South", type: "residential", price: toPennies(68000), value: toPennies(68000), neighborhood: "Linthorpe", monthlyIncome: toPennies(680), marketTrend: "stable", yield: 12.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'E' as const },
  { id: "3", name: "78 Acklam Road", type: "residential", price: toPennies(95000), value: toPennies(95000), neighborhood: "Acklam", monthlyIncome: toPennies(1029), marketTrend: "up", yield: 13.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "4", name: "156 Cargo Fleet Lane", type: "residential", price: toPennies(58000), value: toPennies(58000), neighborhood: "Port Clarence", monthlyIncome: toPennies(773), marketTrend: "stable", yield: 16.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'E' as const },
  { id: "5", name: "89 Borough Road", type: "residential", price: toPennies(52000), value: toPennies(52000), neighborhood: "North Ormesby", monthlyIncome: toPennies(628), marketTrend: "stable", yield: 14.5, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'E' as const },
  { id: "6", name: "67 Roman Road", type: "residential", price: toPennies(82000), value: toPennies(82000), neighborhood: "Pallister Park", monthlyIncome: toPennies(786), marketTrend: "down", yield: 11.5, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "7", name: "91 Trimdon Avenue", type: "residential", price: toPennies(72000), value: toPennies(72000), neighborhood: "Acklam", monthlyIncome: toPennies(810), marketTrend: "stable", yield: 13.5, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "8", name: "23 Newport Road", type: "residential", price: toPennies(64000), value: toPennies(64000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(587), marketTrend: "up", yield: 11.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'E' as const },
  // Level 2
  { id: "9", name: "23 Marton Road", type: "residential", price: toPennies(120000), value: toPennies(120000), neighborhood: "Marton", monthlyIncome: toPennies(1200), marketTrend: "up", yield: 12.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "10", name: "34 Southfield Road", type: "residential", price: toPennies(145000), value: toPennies(145000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(1450), marketTrend: "up", yield: 12.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "11", name: "Unit 5 Albert Road", type: "commercial", price: toPennies(180000), value: toPennies(180000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(1500), marketTrend: "up", yield: 10.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "12", name: "Shop A, Linthorpe Road", type: "commercial", price: toPennies(165000), value: toPennies(165000), neighborhood: "Linthorpe", monthlyIncome: toPennies(1375), marketTrend: "stable", yield: 10.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "13", name: "45 Parliament Road", type: "residential", price: toPennies(135000), value: toPennies(135000), neighborhood: "Linthorpe", monthlyIncome: toPennies(1350), marketTrend: "up", yield: 12.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  // Level 3
  { id: "14", name: "Captain Cook Square Unit", type: "commercial", price: toPennies(250000), value: toPennies(250000), neighborhood: "Captain Cook Square", monthlyIncome: toPennies(1800), marketTrend: "down", yield: 8.6, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "15", name: "Warehouse, Vulcan Street", type: "commercial", price: toPennies(320000), value: toPennies(320000), neighborhood: "South Bank", monthlyIncome: toPennies(2100), marketTrend: "stable", yield: 7.9, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'D' as const },
  { id: "16", name: "8 The Avenue, Nunthorpe", type: "luxury", price: toPennies(385000), value: toPennies(385000), neighborhood: "Nunthorpe", monthlyIncome: toPennies(2400), marketTrend: "up", yield: 7.5, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'C' as const },
  { id: "17", name: "Modern Townhouse, Hemlington", type: "luxury", price: toPennies(295000), value: toPennies(295000), neighborhood: "Hemlington", monthlyIncome: toPennies(1950), marketTrend: "up", yield: 7.9, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'C' as const },
  // Level 4
  { id: "18", name: "Executive Home, Nunthorpe", type: "luxury", price: toPennies(550000), value: toPennies(550000), neighborhood: "Nunthorpe", monthlyIncome: toPennies(3200), marketTrend: "stable", yield: 7.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'C' as const },
  { id: "19", name: "Luxury Penthouse", type: "luxury", price: toPennies(625000), value: toPennies(625000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(3500), marketTrend: "up", yield: 6.7, lastRentIncrease: 0, condition: "premium" as const, monthsSinceLastRenovation: 0, epcRating: 'C' as const },
  { id: "20", name: "Prime Commercial Unit", type: "commercial", price: toPennies(720000), value: toPennies(720000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(4200), marketTrend: "up", yield: 7.0, lastRentIncrease: 0, condition: "standard" as const, monthsSinceLastRenovation: 0, epcRating: 'C' as const },
  // Level 5
  { id: "21", name: "Waterfront Development", type: "luxury", price: toPennies(1200000), value: toPennies(1200000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(7000), marketTrend: "stable", yield: 7.0, lastRentIncrease: 0, condition: "premium" as const, monthsSinceLastRenovation: 0, epcRating: 'C' as const },
  { id: "22", name: "Historic Mansion", type: "luxury", price: toPennies(1500000), value: toPennies(1500000), neighborhood: "Nunthorpe", monthlyIncome: toPennies(8500), marketTrend: "up", yield: 6.8, lastRentIncrease: 0, condition: "premium" as const, monthsSinceLastRenovation: 0, epcRating: 'C' as const },
];

export const NEIGHBORHOODS = ["Linthorpe", "Acklam", "Marton", "Nunthorpe", "Middlesbrough Centre", "Hemlington", "South Bank", "Pallister Park", "North Ormesby", "Port Clarence"];

/**
 * Realistic per-postcode price ceilings (pounds, by property type).
 * Buyers in TS3 won't pay TS7 prices regardless of finish — over-developing
 * a £60k terrace stops yielding 1:1 value uplift past these thresholds.
 */
export const NEIGHBORHOOD_CEILINGS: Record<string, { residential: number; luxury: number; commercial: number }> = {
  'Linthorpe':            { residential: 260_000, luxury: 400_000, commercial: 280_000 },
  'Acklam':               { residential: 280_000, luxury: 460_000, commercial: 260_000 },
  'Marton':               { residential: 340_000, luxury: 540_000, commercial: 300_000 },
  'Nunthorpe':            { residential: 450_000, luxury: 850_000, commercial: 350_000 },
  'Middlesbrough Centre': { residential: 230_000, luxury: 720_000, commercial: 800_000 },
  'Hemlington':           { residential: 240_000, luxury: 420_000, commercial: 220_000 },
  'North Ormesby':        { residential: 140_000, luxury: 200_000, commercial: 180_000 },
  'Pallister Park':       { residential: 165_000, luxury: 250_000, commercial: 200_000 },
  'Port Clarence':        { residential: 120_000, luxury: 175_000, commercial: 220_000 },
  'South Bank':           { residential: 140_000, luxury: 200_000, commercial: 380_000 },
  'Captain Cook Square':  { residential: 280_000, luxury: 480_000, commercial: 600_000 },
};

const DEFAULT_CEILING = { residential: 230_000, luxury: 430_000, commercial: 300_000 };

export function getCeilingPrice(p: { neighborhood: string; type: 'residential' | 'commercial' | 'luxury' }): number {
  const entry = NEIGHBORHOOD_CEILINGS[p.neighborhood] ?? DEFAULT_CEILING;
  return entry[p.type] ?? DEFAULT_CEILING[p.type];
}
