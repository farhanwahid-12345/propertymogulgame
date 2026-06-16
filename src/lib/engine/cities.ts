/**
 * Phase 4 #3 — Multi-city property market.
 *
 * Each city has its own:
 *  - value band (pounds, raw — not pennies)
 *  - yield range (%)
 *  - monthly appreciation drift (decimal — used by appreciation tick)
 *  - type mix weights (residential / commercial / luxury)
 *  - street-name bank
 *  - neighborhood list
 *  - level at which it becomes selectable in the estate agent / auction
 */

export type CityId = 'middlesbrough' | 'leeds' | 'manchester' | 'london';

export interface CityConfig {
  id: CityId;
  name: string;
  /** Player level required to see this city's tab. */
  unlockLevel: number;
  valueRange: { min: number; max: number }; // pounds
  yieldRange: { min: number; max: number }; // %
  /** Monthly appreciation drift used as a soft signal; appreciation engine still
   *  applies its own jitter — this just biases the centre. Decimal (e.g. 0.005 = 0.5%/mo). */
  monthlyAppreciation: number;
  /** Weighted picker over property types. Must sum to 1. */
  typeMix: { residential: number; commercial: number; luxury: number };
  streets: string[];
  neighborhoods: string[];
}

const MIDDLESBROUGH_STREETS = [
  "Linthorpe Road", "Park Road South", "Acklam Road", "Borough Road", "Marton Road",
  "Roman Road", "Trimdon Avenue", "Southfield Road", "Albert Road", "Newport Road",
  "Cargo Fleet Lane", "Vulcan Street", "The Crescent", "The Avenue", "Stokesley Road",
  "Parliament Road", "Corporation Road", "Cambridge Road", "Oxford Road", "Ormesby Road",
  "Mandale Road", "Ayresome Street", "Waterloo Road", "Grange Road", "Cypress Road",
  "Stainton Way", "Ladgate Lane", "The Greenway", "Tollesby Road", "Marton Burn Road",
];

const LEEDS_STREETS = [
  "Roundhay Road", "Kirkstall Lane", "Headingley Avenue", "Otley Road", "Burley Road",
  "Chapel Allerton Lane", "Meanwood Road", "Harehills Road", "Hyde Park Road", "Cardigan Lane",
  "Wellington Street", "The Headrow", "Briggate", "Boar Lane", "Park Lane",
  "Beeston Hill", "Holbeck Avenue", "Armley Road", "Bramley Lane", "Horsforth Way",
];

const MANCHESTER_STREETS = [
  "Deansgate", "Oxford Road", "Wilmslow Road", "Princess Street", "Portland Street",
  "Chorlton Road", "Didsbury Lane", "Stretford Road", "Burton Road", "Hulme Street",
  "Salford Crescent", "Beech Road", "Palatine Road", "Withington Lane", "Fallowfield Avenue",
  "Ancoats Square", "Castlefield Way", "Spinningfields Walk", "Northern Quarter Road", "Whitworth Street",
];

const LONDON_STREETS = [
  "Baker Street", "King's Road", "Fulham Road", "Holland Park Avenue", "Notting Hill Gate",
  "Marylebone High Street", "Camden High Street", "Upper Street", "Battersea Park Road", "Clapham Common",
  "Shoreditch High Street", "Brick Lane", "Bermondsey Street", "Borough High Street", "Bishopsgate",
  "Sloane Square", "Eaton Place", "Cadogan Gardens", "Belgrave Square", "Knightsbridge",
  "Hampstead Heath Road", "Primrose Hill", "Highgate Hill", "Greenwich Park Row", "Richmond Hill",
];

const MIDDLESBROUGH_NEIGHBORHOODS = [
  "Linthorpe", "Acklam", "Marton", "Nunthorpe", "Middlesbrough Centre",
  "Hemlington", "South Bank", "Pallister Park", "North Ormesby", "Port Clarence",
];

const LEEDS_NEIGHBORHOODS = [
  "Headingley", "Roundhay", "Chapel Allerton", "Hyde Park", "Kirkstall",
  "Meanwood", "Beeston", "Holbeck", "Horsforth", "Armley",
];

const MANCHESTER_NEIGHBORHOODS = [
  "Didsbury", "Chorlton", "Withington", "Fallowfield", "Hulme",
  "Ancoats", "Castlefield", "Salford Quays", "Northern Quarter", "Spinningfields",
];

const LONDON_NEIGHBORHOODS = [
  "Notting Hill", "Marylebone", "Camden", "Islington", "Battersea",
  "Shoreditch", "Bermondsey", "Belgravia", "Chelsea", "Knightsbridge",
  "Hampstead", "Highgate", "Greenwich", "Richmond", "Clapham",
];

export const CITIES: Record<CityId, CityConfig> = {
  middlesbrough: {
    id: 'middlesbrough',
    name: 'Middlesbrough',
    unlockLevel: 1,
    valueRange: { min: 60_000, max: 180_000 },
    yieldRange: { min: 6.5, max: 9.5 },
    monthlyAppreciation: 0.002, // ~2.4%/yr
    typeMix: { residential: 0.70, commercial: 0.18, luxury: 0.12 },
    streets: MIDDLESBROUGH_STREETS,
    neighborhoods: MIDDLESBROUGH_NEIGHBORHOODS,
  },
  leeds: {
    id: 'leeds',
    name: 'Leeds',
    unlockLevel: 1,
    valueRange: { min: 130_000, max: 400_000 },
    yieldRange: { min: 4.5, max: 7.0 },
    monthlyAppreciation: 0.003, // ~3.6%/yr
    typeMix: { residential: 0.65, commercial: 0.20, luxury: 0.15 },
    streets: LEEDS_STREETS,
    neighborhoods: LEEDS_NEIGHBORHOODS,
  },
  manchester: {
    id: 'manchester',
    name: 'Manchester',
    unlockLevel: 1,
    valueRange: { min: 160_000, max: 550_000 },
    yieldRange: { min: 4.0, max: 6.5 },
    monthlyAppreciation: 0.0035, // ~4.2%/yr
    typeMix: { residential: 0.60, commercial: 0.22, luxury: 0.18 },
    streets: MANCHESTER_STREETS,
    neighborhoods: MANCHESTER_NEIGHBORHOODS,
  },
  london: {
    id: 'london',
    name: 'London',
    unlockLevel: 1,
    valueRange: { min: 380_000, max: 1_500_000 },
    yieldRange: { min: 2.5, max: 4.5 },
    monthlyAppreciation: 0.004, // ~4.8%/yr
    typeMix: { residential: 0.55, commercial: 0.22, luxury: 0.23 },
    streets: LONDON_STREETS,
    neighborhoods: LONDON_NEIGHBORHOODS,
  },
};

export const CITY_IDS: CityId[] = ['middlesbrough', 'leeds', 'manchester', 'london'];

export function getCityConfig(id: string | undefined): CityConfig {
  if (id && id in CITIES) return CITIES[id as CityId];
  return CITIES.middlesbrough;
}

export function getUnlockedCities(level: number): CityConfig[] {
  return CITY_IDS.map(id => CITIES[id]).filter(c => level >= c.unlockLevel);
}

/** Pick a property type weighted by the city's type-mix. */
export function pickTypeForCity(city: CityConfig, rand: () => number): 'residential' | 'commercial' | 'luxury' {
  const r = rand();
  const { residential, commercial } = city.typeMix;
  if (r < residential) return 'residential';
  if (r < residential + commercial) return 'commercial';
  return 'luxury';
}
