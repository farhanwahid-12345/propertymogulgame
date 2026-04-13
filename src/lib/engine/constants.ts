import type { MortgageProvider, Property } from "@/types/game";
import { toPennies } from "@/lib/formatCurrency";

// All monetary constants are in PENNIES

export const INITIAL_CASH = toPennies(250_000);
export const EXPERIENCE_BASE = 1000;
export const MORTGAGE_INTEREST_RATE = 0.055;
export const BASE_MARKET_RATE = 0.035;
export const COUNCIL_TAX_BAND_D = toPennies(150);
export const CORPORATION_TAX_RATE = 0.19;
export const SOLICITOR_FEES = toPennies(600);
export const ESTATE_AGENT_RATE = 0.015;
export const AUCTION_SELLER_FEE = 0.05;
export const MONTH_DURATION_SECONDS = 180;

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
  { id: "1", name: "45 Linthorpe Road", type: "residential", price: toPennies(75000), value: toPennies(75000), neighborhood: "Linthorpe", monthlyIncome: toPennies(600), image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop", marketTrend: "up", yield: 9.6, lastRentIncrease: 0 },
  { id: "2", name: "12 Park Road South", type: "residential", price: toPennies(68000), value: toPennies(68000), neighborhood: "Linthorpe", monthlyIncome: toPennies(550), image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop", marketTrend: "stable", yield: 9.7, lastRentIncrease: 0 },
  { id: "3", name: "78 Acklam Road", type: "residential", price: toPennies(95000), value: toPennies(95000), neighborhood: "Acklam", monthlyIncome: toPennies(725), image: "https://images.unsplash.com/photo-1449157291145-7efd050a4d0e?w=400&h=300&fit=crop", marketTrend: "up", yield: 9.2, lastRentIncrease: 0 },
  { id: "4", name: "156 Cargo Fleet Lane", type: "residential", price: toPennies(58000), value: toPennies(58000), neighborhood: "Port Clarence", monthlyIncome: toPennies(475), image: "https://images.unsplash.com/photo-1459767129954-1b1c1f9b9ace?w=400&h=300&fit=crop", marketTrend: "stable", yield: 9.8, lastRentIncrease: 0 },
  { id: "5", name: "89 Borough Road", type: "residential", price: toPennies(52000), value: toPennies(52000), neighborhood: "North Ormesby", monthlyIncome: toPennies(425), image: "https://images.unsplash.com/photo-1460574283810-2aab119d8511?w=400&h=300&fit=crop", marketTrend: "stable", yield: 9.8, lastRentIncrease: 0 },
  { id: "6", name: "67 Roman Road", type: "residential", price: toPennies(82000), value: toPennies(82000), neighborhood: "Pallister Park", monthlyIncome: toPennies(625), image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=400&h=300&fit=crop", marketTrend: "down", yield: 9.1, lastRentIncrease: 0 },
  { id: "7", name: "91 Trimdon Avenue", type: "residential", price: toPennies(72000), value: toPennies(72000), neighborhood: "Acklam", monthlyIncome: toPennies(575), image: "https://images.unsplash.com/photo-1496307653780-42ee777d4833?w=400&h=300&fit=crop", marketTrend: "stable", yield: 9.6, lastRentIncrease: 0 },
  { id: "8", name: "23 Newport Road", type: "residential", price: toPennies(64000), value: toPennies(64000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(520), image: "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=400&h=300&fit=crop", marketTrend: "up", yield: 9.8, lastRentIncrease: 0 },
  // Level 2
  { id: "9", name: "23 Marton Road", type: "residential", price: toPennies(120000), value: toPennies(120000), neighborhood: "Marton", monthlyIncome: toPennies(850), image: "https://images.unsplash.com/photo-1460574283810-2aab119d8511?w=400&h=300&fit=crop", marketTrend: "up", yield: 8.5, lastRentIncrease: 0 },
  { id: "10", name: "34 Southfield Road", type: "residential", price: toPennies(145000), value: toPennies(145000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(950), image: "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=400&h=300&fit=crop", marketTrend: "up", yield: 7.9, lastRentIncrease: 0 },
  { id: "11", name: "Unit 5 Albert Road", type: "commercial", price: toPennies(180000), value: toPennies(180000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(1200), image: "https://images.unsplash.com/photo-1497604401993-f2e922e5cb0a?w=400&h=300&fit=crop", marketTrend: "up", yield: 8.0, lastRentIncrease: 0 },
  { id: "12", name: "Shop A, Linthorpe Road", type: "commercial", price: toPennies(165000), value: toPennies(165000), neighborhood: "Linthorpe", monthlyIncome: toPennies(1100), image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop", marketTrend: "stable", yield: 8.0, lastRentIncrease: 0 },
  { id: "13", name: "45 Parliament Road", type: "residential", price: toPennies(135000), value: toPennies(135000), neighborhood: "Linthorpe", monthlyIncome: toPennies(900), image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop", marketTrend: "up", yield: 8.0, lastRentIncrease: 0 },
  // Level 3
  { id: "14", name: "Captain Cook Square Unit", type: "commercial", price: toPennies(250000), value: toPennies(250000), neighborhood: "Captain Cook Square", monthlyIncome: toPennies(1800), image: "https://images.unsplash.com/photo-1527576539890-dfa815648363?w=400&h=300&fit=crop", marketTrend: "down", yield: 8.6, lastRentIncrease: 0 },
  { id: "15", name: "Warehouse, Vulcan Street", type: "commercial", price: toPennies(320000), value: toPennies(320000), neighborhood: "South Bank", monthlyIncome: toPennies(2100), image: "https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?w=400&h=300&fit=crop", marketTrend: "stable", yield: 7.9, lastRentIncrease: 0 },
  { id: "16", name: "8 The Avenue, Nunthorpe", type: "luxury", price: toPennies(385000), value: toPennies(385000), neighborhood: "Nunthorpe", monthlyIncome: toPennies(2400), image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=300&fit=crop", marketTrend: "up", yield: 7.5, lastRentIncrease: 0 },
  { id: "17", name: "Modern Townhouse, Hemlington", type: "luxury", price: toPennies(295000), value: toPennies(295000), neighborhood: "Hemlington", monthlyIncome: toPennies(1950), image: "https://images.unsplash.com/photo-1492321936769-b49830bc1d1e?w=400&h=300&fit=crop", marketTrend: "up", yield: 7.9, lastRentIncrease: 0 },
  // Level 4
  { id: "18", name: "Executive Home, Nunthorpe", type: "luxury", price: toPennies(550000), value: toPennies(550000), neighborhood: "Nunthorpe", monthlyIncome: toPennies(3200), image: "https://images.unsplash.com/photo-1567496898869-502f2927b367?w=400&h=300&fit=crop", marketTrend: "stable", yield: 7.0, lastRentIncrease: 0 },
  { id: "19", name: "Luxury Penthouse", type: "luxury", price: toPennies(625000), value: toPennies(625000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(3500), image: "https://images.unsplash.com/photo-1514676487445-a8bde7ea2817?w=400&h=300&fit=crop", marketTrend: "up", yield: 6.7, lastRentIncrease: 0 },
  { id: "20", name: "Prime Commercial Unit", type: "commercial", price: toPennies(720000), value: toPennies(720000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(4200), image: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=400&h=300&fit=crop", marketTrend: "up", yield: 7.0, lastRentIncrease: 0 },
  // Level 5
  { id: "21", name: "Waterfront Development", type: "luxury", price: toPennies(1200000), value: toPennies(1200000), neighborhood: "Middlesbrough Centre", monthlyIncome: toPennies(7000), image: "https://images.unsplash.com/photo-1600607686527-6fb886090705?w=400&h=300&fit=crop", marketTrend: "stable", yield: 7.0, lastRentIncrease: 0 },
  { id: "22", name: "Historic Mansion", type: "luxury", price: toPennies(1500000), value: toPennies(1500000), neighborhood: "Nunthorpe", monthlyIncome: toPennies(8500), image: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=400&h=300&fit=crop", marketTrend: "up", yield: 6.8, lastRentIncrease: 0 },
];

export const NEIGHBORHOODS = ["Linthorpe", "Acklam", "Marton", "Nunthorpe", "Middlesbrough Centre", "Hemlington", "South Bank", "Pallister Park", "North Ormesby", "Port Clarence"];
