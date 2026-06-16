import type {
  Property, PropertyTenant, Renovation, PropertyOffer, PropertyListing,
} from '@/types/game';
import type { RenovationType } from '@/components/game/renovation-dialog';

const VALID_PROPERTY_TYPES = ['residential', 'commercial', 'luxury'] as const;
const VALID_MARKET_TRENDS = ['up', 'down', 'stable'] as const;
const VALID_TENANT_PROFILES = ['premium', 'standard', 'budget', 'risky'] as const;
const VALID_CONCERN_CATEGORIES = ['maintenance', 'noise', 'mould', 'appliance', 'safety'] as const;
const VALID_RENOVATION_CATEGORIES = ['maintenance', 'improvement', 'extension', 'conversion'] as const;

export function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function sanitizeProperty(property: any): Property {
  const type = VALID_PROPERTY_TYPES.includes(property?.type) ? property.type : 'residential';
  const marketTrend = VALID_MARKET_TRENDS.includes(property?.marketTrend) ? property.marketTrend : 'stable';
  const condition = property?.condition === 'premium' || property?.condition === 'dilapidated' || property?.condition === 'standard'
    ? property.condition
    : 'standard';
  // Condition score: prefer persisted value, otherwise derive from legacy tier.
  const conditionScore = typeof property?.conditionScore === 'number'
    ? Math.max(0, Math.min(100, property.conditionScore))
    : (condition === 'premium' ? 85 : condition === 'dilapidated' ? 25 : 60);

  return {
    ...property,
    id: asString(property?.id, `property_${Math.random().toString(36).slice(2, 8)}`),
    name: asString(property?.name, 'Unknown Property'),
    type,
    price: asNumber(property?.price),
    value: asNumber(property?.value),
    neighborhood: asString(property?.neighborhood),
    monthlyIncome: asNumber(property?.monthlyIncome),
    
    marketTrend,
    condition,
    conditionScore,
    monthsSinceLastRenovation: asNumber(property?.monthsSinceLastRenovation),
    mortgageRemaining: typeof property?.mortgageRemaining === 'number' ? property.mortgageRemaining : undefined,
    marketValue: typeof property?.marketValue === 'number' ? property.marketValue : undefined,
    yield: typeof property?.yield === 'number' ? property.yield : undefined,
    lastRentIncrease: typeof property?.lastRentIncrease === 'number' ? property.lastRentIncrease : undefined,
    baseRent: typeof property?.baseRent === 'number' ? property.baseRent : undefined,
    lastTenantChange: typeof property?.lastTenantChange === 'number' ? property.lastTenantChange : undefined,
    internalSqft: typeof property?.internalSqft === 'number' ? property.internalSqft : undefined,
    plotSqft: typeof property?.plotSqft === 'number' ? property.plotSqft : undefined,
    subtype: property?.subtype === 'hmo' || property?.subtype === 'flats' || property?.subtype === 'multi-let' || property?.subtype === 'standard'
      ? property.subtype
      : undefined,
    completedRenovationIds: Array.isArray(property?.completedRenovationIds) ? property.completedRenovationIds.filter((x: any) => typeof x === 'string') : [],
    city: ['middlesbrough', 'leeds', 'manchester', 'london'].includes(property?.city) ? property.city : 'middlesbrough',
    titleSplitOf: typeof property?.titleSplitOf === 'string' ? property.titleSplitOf : undefined,
    flatUnitId: typeof property?.flatUnitId === 'number' ? property.flatUnitId : undefined,
    isLeasehold: Boolean(property?.isLeasehold),
    serviceChargePctAnnual: typeof property?.serviceChargePctAnnual === 'number' ? property.serviceChargePctAnnual : undefined,
    groundRentPennies: typeof property?.groundRentPennies === 'number' ? property.groundRentPennies : undefined,
    // Item 9 — legacy saves may lack epcRating; default to 'D' so the badge always renders.
    epcRating: (['A','B','C','D','E','F','G'].includes(property?.epcRating) ? property.epcRating : 'D') as Property['epcRating'],
  };
}

export function sanitizeTenantRecord(record: any, monthsPlayed: number): PropertyTenant {
  const tenant = record?.tenant || {};
  const profile = VALID_TENANT_PROFILES.includes(tenant?.profile) ? tenant.profile : 'standard';

  return {
    ...record,
    propertyId: asString(record?.propertyId),
    slotIndex: typeof record?.slotIndex === 'number' ? record.slotIndex : 0,
    tenant: {
      ...tenant,
      id: asString(tenant?.id, `tenant_${Math.random().toString(36).slice(2, 8)}`),
      name: asString(tenant?.name, 'Tenant'),
      profile,
      description: asString(tenant?.description),
      color: asString(tenant?.color),
      emoji: asString(tenant?.emoji),
      rentMultiplier: asNumber(tenant?.rentMultiplier, 1),
      damageRisk: asNumber(tenant?.damageRisk, 8),
      defaultRisk: asNumber(tenant?.defaultRisk, 3),
      traits: Array.isArray(tenant?.traits) ? tenant.traits : [],
    },
    rentMultiplier: asNumber(record?.rentMultiplier, asNumber(tenant?.rentMultiplier, 1)),
    rentPennies: typeof record?.rentPennies === 'number' ? record.rentPennies : undefined,
    startDate: asNumber(record?.startDate, Date.now()),
    satisfaction: asNumber(record?.satisfaction, 80),
    lastSatisfactionUpdate: asNumber(record?.lastSatisfactionUpdate, monthsPlayed),
    satisfactionReasons: Array.isArray(record?.satisfactionReasons) ? record.satisfactionReasons : [],
    moveInMonth: typeof record?.moveInMonth === 'number' ? record.moveInMonth : 0,
    depositHeld: asNumber(record?.depositHeld, 0),
    evictionNoticeMonth: typeof record?.evictionNoticeMonth === 'number' ? record.evictionNoticeMonth : undefined,
    evictionGround: ['rent_arrears', 'landlord_sale', 'landlord_move_in', 'antisocial_behaviour'].includes(record?.evictionGround)
      ? record.evictionGround
      : undefined,
  };
}

export function sanitizeRenovation(record: any): Renovation {
  const type = record?.type || {};
  const sanitizedType = {
    id: asString(type?.id, 'unknown_renovation'),
    name: asString(type?.name, 'Renovation'),
    cost: asNumber(type?.cost),
    rentIncrease: asNumber(type?.rentIncrease),
    valueIncrease: asNumber(type?.valueIncrease),
    duration: asNumber(type?.duration),
    description: asString(type?.description),
    category: VALID_RENOVATION_CATEGORIES.includes(type?.category) ? type.category : 'improvement',
  } as RenovationType;

  if (typeof type?.icon === 'function') {
    (sanitizedType as any).icon = type.icon;
  }

  return {
    ...record,
    id: asString(record?.id, `renovation_${Math.random().toString(36).slice(2, 8)}`),
    propertyId: asString(record?.propertyId),
    type: sanitizedType,
    startDate: asNumber(record?.startDate, Date.now()),
    completionDate: asNumber(record?.completionDate, Date.now()),
    startMonth: typeof record?.startMonth === 'number' ? record.startMonth : undefined,
    completionMonth: typeof record?.completionMonth === 'number' ? record.completionMonth : undefined,
  };
}

export function sanitizeTenantConcern(record: any): import('@/types/game').TenantConcern {
  return {
    ...record,
    id: asString(record?.id, `concern_${Math.random().toString(36).slice(2, 8)}`),
    propertyId: asString(record?.propertyId),
    tenantProfile: VALID_TENANT_PROFILES.includes(record?.tenantProfile) ? record.tenantProfile : 'standard',
    category: VALID_CONCERN_CATEGORIES.includes(record?.category) ? record.category : 'maintenance',
    description: asString(record?.description, 'Tenant concern'),
    raisedMonth: asNumber(record?.raisedMonth),
    resolveCost: asNumber(record?.resolveCost),
    satisfactionPenaltyIfIgnored: asNumber(record?.satisfactionPenaltyIfIgnored),
    resolvedMonth: typeof record?.resolvedMonth === 'number' ? record.resolvedMonth : undefined,
    source: record?.source === 'damage' || record?.source === 'tenant' ? record.source : undefined,
  };
}

/**
 * Merge multiple concern lists by id. Resolution always wins —
 * a `resolvedMonth` set on any copy is preserved. Prevents tick races
 * (processMarketUpdate vs processMonthlyTick) from clobbering each other.
 */
export function mergeConcernsById(
  ...lists: Array<import('@/types/game').TenantConcern[] | undefined>
): import('@/types/game').TenantConcern[] {
  const map = new Map<string, import('@/types/game').TenantConcern>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      if (!c?.id) continue;
      const existing = map.get(c.id);
      if (!existing) {
        map.set(c.id, c);
        continue;
      }
      if (existing.resolvedMonth && !c.resolvedMonth) continue;
      map.set(c.id, c);
    }
  }
  return Array.from(map.values());
}

export function sanitizeOffer(offer: any): PropertyOffer {
  return {
    ...offer,
    id: asString(offer?.id, `offer_${Math.random().toString(36).slice(2, 8)}`),
    buyerName: asString(offer?.buyerName, 'Buyer'),
    amount: asNumber(offer?.amount),
    daysOnMarket: asNumber(offer?.daysOnMarket),
    isChainFree: Boolean(offer?.isChainFree),
    mortgageApproved: Boolean(offer?.mortgageApproved),
    timestamp: asNumber(offer?.timestamp, Date.now()),
    status: offer?.status === 'accepted' || offer?.status === 'rejected' || offer?.status === 'countered' || offer?.status === 'buyer-countered' || offer?.status === 'walkaway'
      ? offer.status
      : 'pending',
    counterAmount: typeof offer?.counterAmount === 'number' ? offer.counterAmount : undefined,
    buyerCounterAmount: typeof offer?.buyerCounterAmount === 'number' ? offer.buyerCounterAmount : undefined,
    negotiationRound: asNumber(offer?.negotiationRound),
    counterResponseDate: typeof offer?.counterResponseDate === 'number' ? offer.counterResponseDate : undefined,
  };
}

export function sanitizePropertyListing(listing: any): PropertyListing {
  return {
    ...listing,
    propertyId: asString(listing?.propertyId),
    listingDate: asNumber(listing?.listingDate, Date.now()),
    isAuction: Boolean(listing?.isAuction),
    daysUntilSale: asNumber(listing?.daysUntilSale),
    askingPrice: asNumber(listing?.askingPrice),
    offers: Array.isArray(listing?.offers) ? listing.offers.map(sanitizeOffer) : [],
    lastOfferCheck: typeof listing?.lastOfferCheck === 'number' ? listing.lastOfferCheck : undefined,
    autoAcceptThreshold: typeof listing?.autoAcceptThreshold === 'number' ? listing.autoAcceptThreshold : undefined,
  };
}
