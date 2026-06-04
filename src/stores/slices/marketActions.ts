/**
 * Market action bundle (Phase 3a — Outstanding Improvements doc, item #3).
 *
 * Extracts the market replenishment action verbatim from `gameStore.ts` so the
 * monolith continues to shrink without changing persisted shape or behaviour.
 * Mirrors the renovationActions factory pattern.
 *
 * `processMarketUpdate` is intentionally NOT moved here yet — it cross-cuts
 * tax, renovation completion, reputation, credit, and macro-event scheduling
 * and will be migrated in a follow-up once those domains are themselves
 * extracted.
 */
import { gameRandom } from '@/lib/rng';
import { toPennies } from '@/lib/formatCurrency';
import {
  SOLICITOR_FEES, MORTGAGE_PROVIDERS, AVAILABLE_PROPERTIES,
} from '@/lib/engine/constants';
import { getPropertyValueRangeForLevel } from '@/lib/engine/financials';
import { generateRandomProperty, generateMarketProperty } from '@/lib/engine/market';
import { getUnlockedCities } from '@/lib/engine/cities';
import type { Property } from '@/types/game';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createMarketActions(set: SetFn, get: GetFn) {
  return {
    replenishMarket: () => {
      const prev = get();
      const { min, max } = getPropertyValueRangeForLevel(prev.level);
      const TARGET_AUCTION = 5;

      // Build excluded ID set: owned + in-conveyancing + listed for sale
      const excludedIds = new Set<string>([
        ...prev.ownedProperties.map((p: Property) => p.id),
        ...prev.conveyancing.map((c: any) => c.propertyId),
        ...prev.propertyListings.map((l: any) => l.propertyId),
      ]);

      // Filter out excluded properties from current market lists immediately
      let auctions = prev.auctionProperties
        .filter((p: Property) => !excludedIds.has(p.id))
        .filter((p: Property) => p.price >= min && p.price <= max);
      let estate = prev.estateAgentProperties.filter((p: Property) => !excludedIds.has(p.id));

      const invalidAuction = prev.auctionProperties
        .filter((p: Property) => !excludedIds.has(p.id))
        .filter((p: Property) => p.price < min || p.price > max);
      invalidAuction.forEach((p: Property) => { if (!estate.find((e: Property) => e.id === p.id)) estate.push(p); });

      if (auctions.length < TARGET_AUCTION) {
        const needed = TARGET_AUCTION - auctions.length;
        for (let i = 0; i < needed; i++) {
          const candidate = estate.find((p: Property) => p.price >= min && p.price <= max && !auctions.find((a: Property) => a.id === p.id));
          if (candidate) {
            auctions.push(candidate);
            estate = estate.filter((e: Property) => e.id !== candidate.id);
          } else {
            auctions.push(generateRandomProperty(prev.level));
          }
        }
      }

      // v4 #14 — ~40% of auction stock is uninhabitable. Discount randomly
      // 30–60% off comparable stock to reflect missing kitchen/bathroom and
      // standard-lender refusal. Buyers may use cash OR bridging finance.
      auctions = auctions.map((p: Property) => {
        if (p.needsRefurb !== undefined) return p;
        if (gameRandom() < 0.4) {
          const discountPct = 0.30 + gameRandom() * 0.30; // 30–60%
          const discounted = Math.max(toPennies(40000), Math.round(p.price * (1 - discountPct)));
          return { ...p, needsRefurb: true, price: discounted, value: discounted };
        }
        return { ...p, needsRefurb: false };
      });

      const usedIds = new Set([...auctions.map((p: Property) => p.id), ...estate.map((p: Property) => p.id)]);
      const totalAvailable = auctions.length + estate.length;
      const needed = Math.max(0, 30 - totalAvailable);

      const eligibleProviders = MORTGAGE_PROVIDERS.filter(p => prev.creditScore >= p.minCreditScore);
      const maxLTV = eligibleProviders.length > 0 ? Math.max(...eligibleProviders.map(p => p.maxLTV)) : 0;
      const isAffordable = (p: Property) => {
        const maxMort = Math.round(p.price * maxLTV);
        const sd = p.price <= toPennies(250000) ? Math.round(p.price * 0.03) : Math.round(toPennies(250000) * 0.03 + (p.price - toPennies(250000)) * 0.08);
        const fees = SOLICITOR_FEES + Math.round(p.price * 0.01) + sd;
        return prev.cash >= (p.price - maxMort) + fees;
      };
      const isInRange = (p: Property) => p.price >= min && p.price <= max;
      const affordableCount = estate.filter((p: Property) => isInRange(p) && isAffordable(p)).length;

      if (affordableCount < 8) {
        const extra = 8 - affordableCount;
        for (let i = 0; i < extra; i++) {
          const priceFloor = Math.max(toPennies(40000), min);
          const targetPrice = priceFloor + gameRandom() * (priceFloor * 0.5);
          const adjusted = Math.max(priceFloor, Math.min(max, Math.floor(targetPrice / 100_000) * 100_000));
          // Phase 4 #3 — spread new stock across unlocked cities.
          const unlocked = getUnlockedCities(prev.level);
          const pickedCity = unlocked[Math.floor(gameRandom() * unlocked.length)]?.id;
          const prop = generateRandomProperty(prev.level, pickedCity);
          prop.price = adjusted;
          prop.value = adjusted;
          prop.monthlyIncome = Math.floor((adjusted * (6 + gameRandom() * 9) / 100) / 12);
          if (!usedIds.has(prop.id) && !excludedIds.has(prop.id)) {
            estate.push(prop);
            usedIds.add(prop.id);
          }
        }
      }

      for (let i = 0; i < needed; i++) {
        const candidates = AVAILABLE_PROPERTIES.filter(p =>
          !usedIds.has(p.id) && !excludedIds.has(p.id) && p.price >= min && p.price <= max
        );
        const pick = candidates.length > 0
          ? candidates[Math.floor(gameRandom() * candidates.length)]
          : generateMarketProperty(prev.level);
        if (!usedIds.has(pick.id) && !excludedIds.has(pick.id)) {
          estate.push({ ...pick });
          usedIds.add(pick.id);
        }
      }

      set({ auctionProperties: auctions, estateAgentProperties: estate });
    },
  };
}
