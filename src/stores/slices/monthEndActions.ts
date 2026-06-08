/**
 * Month-end action slice (Outstanding Improvements doc — Phase 1).
 *
 * Extracts `processMonthEnd` verbatim from `gameStore.ts` into a slice factory.
 * Pure code move — no logic, variable, or shape changes.
 */
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { playGavel, playLevelUp, playPaper, playConcernChime } from '@/lib/sound';
import {
  BASE_MARKET_RATE, COUNCIL_TAX_BAND_D, SOLICITOR_FEES, ESTATE_AGENT_RATE,
  AUCTION_SELLER_FEE, MORTGAGE_PROVIDERS, MONTH_DURATION_SECONDS, EICR_COST_PENNIES,
  conditionTierFromScore, scoreFromConditionTier,
  TENANT_WEAR_MULTIPLIER, BASE_CONDITION_DECAY, CONDITION_DECAY_FLOOR,
} from '@/lib/engine/constants';
import {
  calculateDTI, fluctuateProviderRates, getRequiredNetWorth, getFurnitureValuePennies,
} from '@/lib/engine/financials';
import {
  calculateIncomeTax, calculateCorporationTax, calculateCGT,
  getConditionRentMultiplier, projectAnnualTax,
} from '@/lib/engine/taxation';
import { canUpgradeToPremium } from '@/lib/engine/renovation';
import { gameRandom } from '@/lib/rng';
import {
  CHAIN_COLLAPSE_PROB, SUI_GENERIS_PROB, EVICTION_UPHELD_PROB,
  MARKET_DIP_PROB, TENANT_WALKOUT_RISK_PROB,
} from '@/lib/engine/probabilities';
import { showToast, debit, credit } from '../storeHelpers';
import { mergeConcernsById } from '../sanitizers';
import type {
  Property, Mortgage, Conveyancing, TenantEvent, VoidPeriod, DepositDispute,
  PendingEviction, PropertyLock, EvictionGround, MacroEconomicEvent,
} from '@/types/game';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createMonthEndActions(set: SetFn, get: GetFn) {
  return {
__BODY__
  };
}
