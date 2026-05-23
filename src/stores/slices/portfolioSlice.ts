import { useGameStore } from '../gameStore';
import { useShallow } from 'zustand/react/shallow';

export const usePortfolio = () => useGameStore((s) => s.ownedProperties);
export const usePropertyListings = () => useGameStore((s) => s.propertyListings);
export const useRenovations = () => useGameStore((s) => s.renovations);
export const useConveyancing = () => useGameStore((s) => s.conveyancing);
export const usePendingDamages = () => useGameStore((s) => s.pendingDamages);
export const usePlanningApplications = () => useGameStore((s) => s.planningApplications);
export const usePropertyLocks = () => useGameStore((s) => s.propertyLocks);

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
