/**
 * Phase 2 (v5) — per-property management toggles & HMO licensing.
 *
 * Letting Agent toggle, Rent Guarantee Insurance toggle, and HMO licence
 * application. All money in pennies. Slice exposes pure setters that mutate
 * the relevant `ownedProperties` entry; the engine reads these flags in
 * `monthEndActions.ts` to bill fees and trigger payouts.
 */
import type { Property } from '@/types/game';
import { showToast, debit } from '../storeHelpers';
import { fromPennies } from '@/lib/formatCurrency';

type SetFn = (partial: any) => void;
type GetFn = () => any;

const HMO_LICENCE_COST_PENNIES = 100_000; // £1,000

export function createPropertyManagementActions(set: SetFn, get: GetFn) {
  const mutateProperty = (propertyId: string, mutator: (p: Property) => Property) => {
    const state = get();
    set({
      ownedProperties: state.ownedProperties.map((p: Property) =>
        p.id === propertyId ? mutator(p) : p,
      ),
    });
  };

  return {
    /** Hire / dismiss a letting agent. Pass `tier` to hire, omit to dismiss. */
    toggleLettingAgent: (propertyId: string, tier?: 'standard' | 'premium') => {
      const state = get();
      const prop = state.ownedProperties.find((p: Property) => p.id === propertyId);
      if (!prop) return;
      if (prop.isManaged) {
        mutateProperty(propertyId, (p) => ({
          ...p,
          isManaged: false,
          agentTier: undefined,
          agentFeePct: undefined,
        }));
        showToast('Letting Agent Dismissed', `${prop.name} reverted to self-managed.`);
      } else {
        const t = tier ?? 'standard';
        const fee = t === 'premium' ? 0.15 : 0.10;
        mutateProperty(propertyId, (p) => ({
          ...p,
          isManaged: true,
          agentTier: t,
          agentFeePct: fee,
        }));
        showToast(
          'Letting Agent Hired',
          `${prop.name} now managed by a ${t} agent (${(fee * 100).toFixed(0)}% of rent).`,
        );
      }
    },

    /** Toggle Rent Guarantee Insurance. 30-day waiting period before claims. */
    toggleRentGuarantee: (propertyId: string) => {
      const state = get();
      const prop = state.ownedProperties.find((p: Property) => p.id === propertyId);
      if (!prop) return;
      if (prop.hasRentGuarantee) {
        mutateProperty(propertyId, (p) => ({
          ...p,
          hasRentGuarantee: false,
          rentGuaranteeStartMonth: undefined,
        }));
        showToast('Rent Guarantee Cancelled', `${prop.name} no longer insured.`);
      } else {
        mutateProperty(propertyId, (p) => ({
          ...p,
          hasRentGuarantee: true,
          rentGuaranteeStartMonth: state.monthsPlayed,
        }));
        showToast(
          'Rent Guarantee Active 🛡️',
          `${prop.name} insured at 3% of monthly rent. 1-month waiting period before claims.`,
        );
      }
    },

    /** Apply for an HMO licence. Pays fee upfront; status becomes 'applied' for 2 months then 'licensed'. */
    applyForHmoLicence: (propertyId: string) => {
      const state = get();
      const prop = state.ownedProperties.find((p: Property) => p.id === propertyId);
      if (!prop) return;
      if (prop.subtype !== 'hmo') {
        showToast('HMO Licence', 'Only HMO properties need a licence.', 'destructive');
        return;
      }
      if (prop.hmoLicenceStatus === 'applied') {
        showToast('HMO Licence', 'Application already in progress.', 'destructive');
        return;
      }
      // Improvements #8 item 8 — allow early renewal within 3 months of expiry.
      const isRenewal = prop.hmoLicenceStatus === 'licensed';
      if (isRenewal) {
        const monthsLeft = (prop.hmoLicenceExpiresMonth ?? Infinity) - state.monthsPlayed;
        if (monthsLeft > 3) {
          showToast('HMO Licence', `Renewal opens 3 months before expiry (${monthsLeft} months left).`, 'destructive');
          return;
        }
      }
      const debited = debit(state, HMO_LICENCE_COST_PENNIES);
      if (!debited) {
        showToast(
          'Insufficient Cash',
          `Need £${fromPennies(HMO_LICENCE_COST_PENNIES).toLocaleString()} for licence fee.`,
          'destructive',
        );
        return;
      }
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        ownedProperties: state.ownedProperties.map((p: Property) =>
          p.id === propertyId
            ? {
                ...p,
                hmoLicenceStatus: 'applied' as const,
                hmoLicenceAppliedMonth: state.monthsPlayed,
              }
            : p,
        ),
      });
      showToast(
        'HMO Licence Submitted 📄',
        `${prop.name} — application filed (£${fromPennies(HMO_LICENCE_COST_PENNIES).toLocaleString()}). Licence issued in ~2 months.`,
      );
    },
  };
}
