import { useGameStore } from '../gameStore';
import { useShallow } from 'zustand/react/shallow';
import type { PropertyLock } from '@/types/game';

export const usePortfolio = () => useGameStore((s) => s.ownedProperties);
export const usePropertyListings = () => useGameStore((s) => s.propertyListings);
export const useRenovations = () => useGameStore((s) => s.renovations);
export const useConveyancing = () => useGameStore((s) => s.conveyancing);
export const usePendingDamages = () => useGameStore((s) => s.pendingDamages);
export const usePlanningApplications = () => useGameStore((s) => s.planningApplications);
export const usePropertyLocks = () => useGameStore((s) => s.propertyLocks);

// Property lock helpers
export const usePropertyLocksByProperty = (propertyId: string) =>
  useGameStore((s) => (s.propertyLocks as PropertyLock[]).filter((l) => l.propertyId === propertyId));

export const useIsPropertyLocked = (propertyId: string, reason?: PropertyLock['reason']) =>
  useGameStore((s) => (s.propertyLocks as PropertyLock[]).some(
    (l) => l.propertyId === propertyId && (reason ? l.reason === reason : true)
  ));

// EPC selectors
export const usePropertyEpcBand = (propertyId: string) =>
  useGameStore((s) => s.ownedProperties.find((p: any) => p.id === propertyId)?.epcRating);

export const usePropertiesByEpcBand = (band: string) =>
  useGameStore((s) => s.ownedProperties.filter((p: any) => p.epcRating === band));

export const usePortfolioActions = () =>
  useGameStore(useShallow((s) => ({
    buyProperty: s.buyProperty,
    buyPropertyAtPrice: s.buyPropertyAtPrice,
    sellProperty: s.sellProperty,
    listPropertyForSale: s.listPropertyForSale,
    cancelPropertyListing: s.cancelPropertyListing,
    updatePropertyListingPrice: s.updatePropertyListingPrice,
    setAutoAcceptThreshold: s.setAutoAcceptThreshold,
    rejectPropertyOffer: s.rejectPropertyOffer,
    counterOffer: s.counterOffer,
    reducePriceOnListing: s.reducePriceOnListing,
    acceptBuyerCounter: s.acceptBuyerCounter,
    rejectBuyerCounter: s.rejectBuyerCounter,
    startRenovation: s.startRenovation,
    upgradeCondition: s.upgradeCondition,
    furnishProperty: s.furnishProperty,
    submitPlanningApplication: s.submitPlanningApplication,
    submitBatchPlanningApplications: s.submitBatchPlanningApplications,
  })));

