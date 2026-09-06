/**
 * Quick wins — regression tests for auto-management settings, the migration
 * that seeds them, and notification triage bucketing.
 */
import { describe, it, expect } from 'vitest';
import { CURRENT_VERSION, runMigrations } from '@/lib/migrations';
import { DEFAULT_GAME_SETTINGS } from '@/types/game';
import { deriveTriageItems } from '@/components/game/notification-triage';

describe('Quick wins — settings migration', () => {
  it('seeds settings with every toggle off for older saves', async () => {
    const { migrationSteps } = await import('@/stores/gameStore') as any;
    const persisted: any = { _version: 25 };
    runMigrations(persisted, migrationSteps, CURRENT_VERSION);
    expect(persisted.settings).toEqual(DEFAULT_GAME_SETTINGS);
    expect(persisted._version).toBe(CURRENT_VERSION);
  });

  it('preserves settings the player already chose', async () => {
    const { migrationSteps } = await import('@/stores/gameStore') as any;
    const persisted: any = { _version: 25, settings: { autoPayDamagesUnder500: true } };
    runMigrations(persisted, migrationSteps, CURRENT_VERSION);
    expect(persisted.settings.autoPayDamagesUnder500).toBe(true);
  });
});

describe('Quick wins — notification triage', () => {
  const base = {
    monthsPlayed: 20,
    ownedProperties: [{ id: 'p1', name: 'Acacia Road', type: 'residential' }],
  };

  it('files 2+ months of arrears as urgent', () => {
    const items = deriveTriageItems({
      ...base,
      tenants: [{ propertyId: 'p1', name: 'Sam', arrearsMonths: 2 }],
    });
    const arrears = items.find(i => i.id.startsWith('arrears-'));
    expect(arrears?.bucket).toBe('urgent');
    expect(arrears?.target).toBe('evictions');
  });

  it('files ex-tenant debt as financial and lease renewals as opportunities', () => {
    const items = deriveTriageItems({
      ...base,
      tenants: [{ propertyId: 'p1', name: 'Sam' }],
      exTenantDebts: [{ id: 'd1', tenantName: 'Old Sam', propertyName: 'Acacia Road', remainingDebtPennies: 50_000, status: 'chasing' }],
      pendingLeaseRenewals: [{ propertyId: 'p1', expiryMonth: 26, currentRentPennies: 100_000 }],
    });
    expect(items.find(i => i.id === 'debt-d1')?.bucket).toBe('financial');
    expect(items.find(i => i.id === 'renewal-p1')?.bucket).toBe('opportunities');
  });

  it('flags empty units as opportunities only when no tenant is present', () => {
    const withTenant = deriveTriageItems({ ...base, tenants: [{ propertyId: 'p1', name: 'Sam' }] });
    expect(withTenant.some(i => i.id === 'vacant-p1')).toBe(false);
    const empty = deriveTriageItems({ ...base, tenants: [] });
    expect(empty.find(i => i.id === 'vacant-p1')?.bucket).toBe('opportunities');
  });
});
