import { useGameStore } from '../gameStore';
import { useShallow } from 'zustand/react/shallow';

export const useTenants = () => useGameStore((s) => s.tenants);
export const useTenantConcerns = () => useGameStore((s) => s.tenantConcerns);
export const useTenantEvents = () => useGameStore((s) => s.tenantEvents);
export const useTenantHistory = () => useGameStore((s) => s.tenantHistory);
export const usePendingEvictions = () => useGameStore((s) => s.pendingEvictions);
export const useDepositDisputes = () => useGameStore((s) => s.depositDisputes);
export const useVoidPeriods = () => useGameStore((s) => s.voidPeriods);

// Arrears helpers
export const useTenantsInArrears = () =>
  useGameStore((s) => s.tenants.filter((t: any) => (t.arrearsPennies ?? 0) > 0));

export const useTotalArrearsPennies = () =>
  useGameStore((s) => s.tenants.reduce((sum: number, t: any) => sum + (t.arrearsPennies ?? 0), 0));

export const useTenantArrears = (tenantId: string) =>
  useGameStore((s) => s.tenants.find((t: any) => t.id === tenantId)?.arrearsPennies ?? 0);

// Satisfaction selectors
export const useTenantSatisfaction = (tenantId: string) =>
  useGameStore((s) => s.tenants.find((t: any) => t.id === tenantId)?.satisfaction);

export const useAverageSatisfaction = () =>
  useGameStore((s) => {
    const ts = s.tenants;
    if (!ts.length) return null;
    return ts.reduce((sum: number, t: any) => sum + (t.satisfaction ?? 0), 0) / ts.length;
  });

export const useAtRiskTenants = (threshold = 25) =>
  useGameStore((s) => s.tenants.filter((t: any) => (t.satisfaction ?? 100) < threshold));

export const useTenantActions = () =>
  useGameStore(useShallow((s) => ({
    selectTenant: s.selectTenant,
    applyRentIncrease: s.applyRentIncrease,
    evictTenant: s.evictTenant,
    cancelEviction: s.cancelEviction,
    disputeDeposit: s.disputeDeposit,
    dismissDispute: s.dismissDispute,
  })));

