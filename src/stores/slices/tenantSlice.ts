import { useGameStore } from '../gameStore';
import { useShallow } from 'zustand/react/shallow';

export const useTenants = () => useGameStore((s) => s.tenants);
export const useTenantConcerns = () => useGameStore((s) => s.tenantConcerns);
export const useTenantEvents = () => useGameStore((s) => s.tenantEvents);
export const useTenantHistory = () => useGameStore((s) => s.tenantHistory);
export const usePendingEvictions = () => useGameStore((s) => s.pendingEvictions);
export const useDepositDisputes = () => useGameStore((s) => s.depositDisputes);
export const useVoidPeriods = () => useGameStore((s) => s.voidPeriods);

export const useTenantActions = () =>
  useGameStore(useShallow((s) => ({
    selectTenant: s.selectTenant,
    applyRentIncrease: s.applyRentIncrease,
    evictTenant: s.evictTenant,
    cancelEviction: s.cancelEviction,
    disputeDeposit: s.disputeDeposit,
    dismissDispute: s.dismissDispute,
  })));
