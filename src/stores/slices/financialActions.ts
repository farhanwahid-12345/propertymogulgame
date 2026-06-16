/**
 * Financial action bundle — mortgages, loans, overdraft, cash mutators.
 *
 * Phase 3b: extracted verbatim from `gameStore.ts` behind a factory so the
 * store literal stays a thin composer. Behaviour and persisted shape are
 * unchanged. Cross-slice reads via `get()` only.
 */
import type { Mortgage } from '@/types/game';
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import {
  SOLICITOR_FEES, ESTATE_AGENT_RATE, MORTGAGE_PROVIDERS,
  MONTH_DURATION_SECONDS, ERC_PERCENT, ERC_WINDOW_MONTHS, LOAN_PRODUCTS,
  computeErcRate,
} from '@/lib/engine/constants';
import { calculateMortgageEligibility } from '@/lib/mortgageEligibility';
import { getEffectiveProviderRate } from '@/lib/mortgageEligibility';
import { gameRandom } from '@/lib/rng';
import { showToast, debit, credit } from '../storeHelpers';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createFinancialActions(set: SetFn, get: GetFn) {
  return {
    settleMortgage: (
      mortgagePropertyId: string,
      useCash = false,
      settlementPropertyId?: string,
      partialAmount?: number,
    ) => {
      const prev = get();
      const mortgage = prev.mortgages.find((m: Mortgage) => m.propertyId === mortgagePropertyId);
      if (!mortgage) { showToast("Settlement Failed", "Mortgage not found!", "destructive"); return; }

      // Compute ERC: dynamic schedule for fixed-term products, legacy flat for SVR/tracker.
      const monthsIntoTerm = typeof mortgage.startMonth === 'number'
        ? Math.max(0, prev.monthsPlayed - mortgage.startMonth)
        : Math.floor((Date.now() - mortgage.startDate) / (MONTH_DURATION_SECONDS * 1000));
      const ercRate = mortgage.fixedTermYears && !mortgage.revertedToSVR
        ? computeErcRate(mortgage.fixedTermYears, monthsIntoTerm)
        : (monthsIntoTerm < ERC_WINDOW_MONTHS ? ERC_PERCENT : 0);
      const ercApplies = ercRate > 0;

      if (useCash) {
        if (partialAmount && partialAmount > 0) {
          const erc = ercApplies ? Math.round(partialAmount * ERC_PERCENT) : 0;
          const totalDue = partialAmount + erc;
          const debited = debit(prev, totalDue);
          if (!debited) { showToast("Insufficient Cash", `Need £${fromPennies(totalDue).toLocaleString()} (incl. ERC) — even with overdraft.`, "destructive"); return; }
          const newBal = mortgage.remainingBalance - partialAmount;
          const odNote = debited.usedOverdraft > 0 ? ` (£${fromPennies(debited.usedOverdraft).toLocaleString()} via overdraft)` : '';
          const ercNote = erc > 0 ? ` ERC: £${fromPennies(erc).toLocaleString()}.` : '';
          if (newBal <= 0) {
            showToast("Mortgage Paid Off!", `Fully paid with £${fromPennies(partialAmount).toLocaleString()}.${ercNote}${odNote}`);
            set({ cash: debited.cash, overdraftUsed: debited.overdraftUsed, mortgages: prev.mortgages.filter((m: Mortgage) => m.propertyId !== mortgagePropertyId), creditScore: Math.min(850, prev.creditScore + 5) });
          } else {
            showToast("Partial Payment", `Paid £${fromPennies(partialAmount).toLocaleString()}.${ercNote}${odNote} Remaining: £${fromPennies(newBal).toLocaleString()}`);
            set({ cash: debited.cash, overdraftUsed: debited.overdraftUsed, mortgages: prev.mortgages.map((m: Mortgage) => m.propertyId === mortgagePropertyId ? { ...m, remainingBalance: newBal } : m) });
          }
        } else {
          const erc = ercApplies ? Math.round(mortgage.remainingBalance * ERC_PERCENT) : 0;
          const totalDue = mortgage.remainingBalance + erc;
          const debited = debit(prev, totalDue);
          if (!debited) { showToast("Insufficient Cash", `Need £${fromPennies(totalDue).toLocaleString()} (incl. ERC) — even with overdraft.`, "destructive"); return; }
          const odNote = debited.usedOverdraft > 0 ? ` (£${fromPennies(debited.usedOverdraft).toLocaleString()} via overdraft)` : '';
          const ercNote = erc > 0 ? ` ERC: £${fromPennies(erc).toLocaleString()}.` : '';
          showToast("Mortgage Paid Off!", `Paid £${fromPennies(mortgage.remainingBalance).toLocaleString()}.${ercNote}${odNote}`);
          set({ cash: debited.cash, overdraftUsed: debited.overdraftUsed, mortgages: prev.mortgages.filter((m: Mortgage) => m.propertyId !== mortgagePropertyId), creditScore: Math.min(850, prev.creditScore + 5) });
        }
      } else {
        const settleProp = prev.ownedProperties.find((p: any) => p.id === settlementPropertyId);
        if (!settleProp) { showToast("Settlement Failed", "Property not found!", "destructive"); return; }
        if (settleProp.value < mortgage.remainingBalance) { showToast("Insufficient Value", "Property value too low!", "destructive"); return; }
        const erc = ercApplies ? Math.round(mortgage.remainingBalance * ERC_PERCENT) : 0;
        const cashFromSale = settleProp.value - mortgage.remainingBalance - SOLICITOR_FEES - Math.round(settleProp.value * ESTATE_AGENT_RATE) - erc;
        const credited = credit(prev, cashFromSale);
        const ercNote = erc > 0 ? ` (ERC £${fromPennies(erc).toLocaleString()} deducted)` : '';
        showToast("Mortgage Settled!", `${settleProp.name} sold. Net: £${fromPennies(cashFromSale).toLocaleString()}${ercNote}`);
        set({
          cash: credited.cash,
          overdraftUsed: credited.overdraftUsed,
          ownedProperties: prev.ownedProperties.filter((p: any) => p.id !== settlementPropertyId),
          mortgages: prev.mortgages.filter((m: Mortgage) => m.propertyId !== mortgagePropertyId),
          tenants: prev.tenants.filter((t: any) => t.propertyId !== settlementPropertyId),
          voidPeriods: prev.voidPeriods.filter((vp: any) => vp.propertyId !== settlementPropertyId),
        });
      }
    },

    remortgageProperty: (propertyId: string, newLoanAmount: number, providerId: string) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId);
      if (!property || !provider) { showToast("Remortgage Failed", "Not found!", "destructive"); return; }
      const maxLTV = Math.round(property.value * provider.maxLTV);
      if (newLoanAmount > maxLTV) { showToast("Loan Too Large", `Max: £${fromPennies(maxLTV).toLocaleString()}`, "destructive"); return; }
      const existing = prev.mortgages.find((m: Mortgage) => m.propertyId === propertyId);
      const existingBal = existing?.remainingBalance || 0;
      if (newLoanAmount < existingBal) { showToast("Remortgage Failed", "Must cover existing balance!", "destructive"); return; }
      const mortgageFee = Math.round(newLoanAmount * 0.01);
      const totalFees = SOLICITOR_FEES + mortgageFee;
      const cashRaised = newLoanAmount - existingBal - totalFees;
      const rate = getEffectiveProviderRate({
        liveProviderRate: prev.mortgageProviderRates[provider.id] || provider.baseRate,
        currentMarketRate: prev.currentMarketRate,
      }) + (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
      const monthlyRate = rate / 12;
      const numPayments = 300;
      const monthlyPayment = Math.round(newLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1));
      const newMortgage: Mortgage = {
        id: `${propertyId}_${Date.now()}`, propertyId, principal: newLoanAmount,
        monthlyPayment, remainingBalance: newLoanAmount,
        interestRate: rate, termYears: 25, mortgageType: 'repayment',
        providerId, startDate: Date.now(),
      };
      const credited = credit(prev, cashRaised);
      showToast("Remortgage Complete!", `Cash raised: £${fromPennies(cashRaised).toLocaleString()}${credited.overdraftUsed < prev.overdraftUsed ? ` (£${fromPennies(prev.overdraftUsed - credited.overdraftUsed).toLocaleString()} repaid overdraft)` : ''}`);
      set({
        cash: credited.cash,
        overdraftUsed: credited.overdraftUsed,
        mortgages: existing ? prev.mortgages.map((m: Mortgage) => m.propertyId === propertyId ? newMortgage : m) : [...prev.mortgages, newMortgage],
      });
    },

    handleRefinance: (
      propertyId: string,
      newLoanAmount: number,
      providerId: string,
      termYears: number,
      mortgageType: 'repayment' | 'interest-only',
      fixedTermYears = 0,
    ) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) return;
      if (prev.mortgages.some((m: Mortgage) => m.collateralPropertyIds?.includes(propertyId))) {
        showToast("Not Allowed", "Part of a portfolio mortgage.", "destructive"); return;
      }
      const existing = prev.mortgages.find((m: Mortgage) => m.propertyId === propertyId);
      const currentBal = existing?.remainingBalance || 0;
      const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
      if (newLoanAmount < currentBal) { showToast("Refinance Failed", "Must cover existing balance!", "destructive"); return; }

      const totalRentalIncome = prev.ownedProperties.reduce((t: number, p: any) => t + p.monthlyIncome, 0);
      const existingPayments = prev.mortgages.filter((m: Mortgage) => m.propertyId !== propertyId).reduce((s: number, m: Mortgage) => s + m.monthlyPayment, 0);
      const providerRate = prev.mortgageProviderRates[provider.id] || provider.baseRate;

      const eligibility = calculateMortgageEligibility({
        creditScore: prev.creditScore, loanAmount: fromPennies(newLoanAmount),
        propertyValue: fromPennies(property.value), propertyMonthlyRent: fromPennies(property.monthlyIncome),
        providerBaseRate: getEffectiveProviderRate({ liveProviderRate: providerRate, currentMarketRate: prev.currentMarketRate, fixedTermYears }),
        providerMinCreditScore: provider.minCreditScore, providerMaxLTV: provider.maxLTV,
        providerId: provider.id, termYears, mortgageType,
        existingMonthlyMortgagePayments: fromPennies(existingPayments),
        totalRentalIncome: fromPennies(totalRentalIncome - property.monthlyIncome),
        ownedPropertyCount: prev.ownedProperties.length,
        mortgagedPropertyCount: new Set(prev.mortgages.map((m: Mortgage) => m.propertyId)).size,
      });
      // Inline rejection is shown by the panel; do not pop a global toast.
      if (!eligibility.eligible) { return; }

      const newMortgage: Mortgage = {
        id: `${propertyId}_${Date.now()}`, propertyId, principal: newLoanAmount,
        monthlyPayment: toPennies(eligibility.monthlyPayment), remainingBalance: newLoanAmount,
        interestRate: eligibility.adjustedRate, termYears, mortgageType,
        providerId: provider.id, startDate: Date.now(),
        startMonth: prev.monthsPlayed,
        fixedTermYears: fixedTermYears > 0 ? fixedTermYears : undefined,
        fixedRate: fixedTermYears > 0 ? eligibility.adjustedRate : undefined,
      };
      const cashDelta = newLoanAmount - currentBal;
      // cashDelta can be positive (cash out) or negative (paying down). Route through credit/debit.
      let cashUpdate: { cash: number; overdraftUsed: number };
      if (cashDelta >= 0) {
        cashUpdate = credit(prev, cashDelta);
      } else {
        const dbg = debit(prev, -cashDelta);
        if (!dbg) { showToast("Insufficient Cash", `Need £${fromPennies(-cashDelta).toLocaleString()} (even with overdraft) for refi.`, "destructive"); return; }
        cashUpdate = { cash: dbg.cash, overdraftUsed: dbg.overdraftUsed };
      }
      showToast("Refinance Complete!", cashDelta > 0 ? `£${fromPennies(cashDelta).toLocaleString()} released.` : `Refinanced for £${fromPennies(newLoanAmount).toLocaleString()}`);
      set({
        cash: cashUpdate.cash,
        overdraftUsed: cashUpdate.overdraftUsed,
        mortgages: existing ? prev.mortgages.map((m: Mortgage) => m.propertyId === propertyId ? newMortgage : m) : [...prev.mortgages, newMortgage],
      });
    },

    handlePortfolioMortgage: (
      selectedPropertyIds: string[],
      loanAmount: number,
      providerId: string,
      termYears: number,
      mortgageType: 'repayment' | 'interest-only',
      fixedTermYears = 0,
    ): { ok: true } | { ok: false; reason: string } => {
      const prev = get();
      // Item 6: instead of rejecting properties already inside another
      // portfolio facility, settle that facility and roll them into the new
      // one. Collect any overlapping portfolio mortgages now so we can
      // add their balances to the settlement total and drop them from the
      // surviving mortgages list further down.
      const overlappingPortfolioMortgages = prev.mortgages.filter((m: Mortgage) =>
        m.collateralPropertyIds && m.collateralPropertyIds.some((id: string) => selectedPropertyIds.includes(id))
      );
      const overlappingPortfolioIds = new Set(overlappingPortfolioMortgages.map((m: Mortgage) => m.id));
      const selectedProps = prev.ownedProperties.filter((p: any) => selectedPropertyIds.includes(p.id));
      const totalValue = selectedProps.reduce((s: number, p: any) => s + p.value, 0);
      const totalRent = selectedProps.reduce((s: number, p: any) => s + p.monthlyIncome, 0);
      const singleMortgageBalances = prev.mortgages
        .filter((m: Mortgage) => selectedPropertyIds.includes(m.propertyId) && !overlappingPortfolioIds.has(m.id))
        .reduce((s: number, m: Mortgage) => s + m.remainingBalance, 0);
      const overlappingPortfolioBalance = overlappingPortfolioMortgages.reduce((s: number, m: Mortgage) => s + m.remainingBalance, 0);
      const totalCurrentMortgages = singleMortgageBalances + overlappingPortfolioBalance;

      const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
      const providerRate = (prev.mortgageProviderRates[provider.id] || provider.baseRate) + 0.005;
      const existingPayments = prev.mortgages
        .filter((m: Mortgage) => !selectedPropertyIds.includes(m.propertyId) && !overlappingPortfolioIds.has(m.id))
        .reduce((s: number, m: Mortgage) => s + m.monthlyPayment, 0);
      const otherIncome = prev.ownedProperties.filter((p: any) => !selectedPropertyIds.includes(p.id)).reduce((t: number, p: any) => t + p.monthlyIncome, 0);

      let adjustedMaxLTV = provider.maxLTV;
      if (prev.entityType === 'ltd') {
        adjustedMaxLTV = Math.min(adjustedMaxLTV, 0.75);
      }

      const eligibility = calculateMortgageEligibility({
        creditScore: prev.creditScore, loanAmount: fromPennies(loanAmount),
        propertyValue: fromPennies(totalValue), propertyMonthlyRent: fromPennies(totalRent),
        providerBaseRate: getEffectiveProviderRate({ liveProviderRate: providerRate, currentMarketRate: prev.currentMarketRate, fixedTermYears }),
        providerMinCreditScore: provider.minCreditScore, providerMaxLTV: adjustedMaxLTV,
        providerId: provider.id, termYears, mortgageType,
        existingMonthlyMortgagePayments: fromPennies(existingPayments),
        totalRentalIncome: fromPennies(otherIncome),
        ownedPropertyCount: prev.ownedProperties.length,
        mortgagedPropertyCount: new Set(prev.mortgages.map((m: Mortgage) => m.propertyId)).size,
      });
      if (!eligibility.eligible) {
        return { ok: false, reason: eligibility.reason || "Failed lender criteria." };
      }

      const portfolioMortgage: Mortgage = {
        id: `portfolio_${Date.now()}`, propertyId: `portfolio_${selectedPropertyIds[0] || 'group'}`,
        principal: loanAmount, monthlyPayment: toPennies(eligibility.monthlyPayment),
        remainingBalance: loanAmount, interestRate: eligibility.adjustedRate,
        termYears, mortgageType, providerId: provider.id,
        collateralPropertyIds: [...selectedPropertyIds], startDate: Date.now(),
        startMonth: prev.monthsPlayed,
        fixedTermYears: fixedTermYears > 0 ? fixedTermYears : undefined,
        fixedRate: fixedTermYears > 0 ? eligibility.adjustedRate : undefined,
      };
      const remainingMortgages = prev.mortgages.filter((m: Mortgage) =>
        !selectedPropertyIds.includes(m.propertyId) && !overlappingPortfolioIds.has(m.id)
      );
      const cashDelta = loanAmount - totalCurrentMortgages;
      let pmCashUpdate: { cash: number; overdraftUsed: number };
      if (cashDelta >= 0) {
        pmCashUpdate = credit(prev, cashDelta);
      } else {
        const dbg = debit(prev, -cashDelta);
        if (!dbg) {
          return { ok: false, reason: `Need £${fromPennies(-cashDelta).toLocaleString()} cash (including overdraft) to settle existing debt.` };
        }
        pmCashUpdate = { cash: dbg.cash, overdraftUsed: dbg.overdraftUsed };
      }
      set({ cash: pmCashUpdate.cash, overdraftUsed: pmCashUpdate.overdraftUsed, mortgages: [...remainingMortgages, portfolioMortgage] });
      const cashOut = Math.max(0, cashDelta);
      const rolloverNote = overlappingPortfolioMortgages.length > 0
        ? ` (rolled over ${overlappingPortfolioMortgages.length} existing portfolio facility)`
        : '';
      showToast("Portfolio mortgage secured 🏦", `Settled £${fromPennies(totalCurrentMortgages).toLocaleString()} of existing debt · £${fromPennies(cashOut).toLocaleString()} cash released${rolloverNote}.`);
      return { ok: true };
    },

    // ─── LOANS (personal / business / investor) ─────────────────
    applyForLoan: (kind: 'personal' | 'business' | 'investor', amount: number, termMonths: number) => {
      const prev = get();
      const product = (LOAN_PRODUCTS as any)[kind];
      if (!product) { showToast("Loan Failed", "Unknown product.", "destructive"); return; }
      if (kind !== 'investor' && prev.creditScore < product.minCreditScore) {
        showToast("Loan Rejected", `Credit score ${prev.creditScore} below minimum ${product.minCreditScore}.`, "destructive"); return;
      }
      if (kind === 'business') {
        if (prev.entityType !== 'ltd') { showToast("Loan Rejected", "Business loans require a Ltd company.", "destructive"); return; }
        if (prev.ownedProperties.length < 2) { showToast("Loan Rejected", "Need at least 2 owned properties.", "destructive"); return; }
      }
      if (kind === 'investor') {
        const minRep = (product as any).minReputation ?? 40;
        if ((prev.landlordReputation ?? 50) < minRep) {
          showToast("Investor Declined", `Need landlord reputation ≥ ${minRep}. Yours: ${prev.landlordReputation ?? 50}.`, "destructive"); return;
        }
      }
      // Dynamic cap: investor by reputation, others by rent roll, existing
      // debt service (mortgages + loans), and credit-tier multiplier.
      const monthlyRent = prev.ownedProperties.reduce((s: number, p: any) => s + p.monthlyIncome, 0);
      const monthlyMortgage = prev.mortgages.reduce((s: number, m: Mortgage) => s + m.monthlyPayment, 0);
      const existingLoanPayments = ((prev as any).loans || []).reduce((s: number, l: any) => s + (l.monthlyPayment || 0), 0);
      const monthlyNetRent = Math.max(0, monthlyRent - monthlyMortgage - existingLoanPayments);
      const creditFactor = Math.max(0.5, Math.min(1.4, prev.creditScore / 700));
      // Phase E: widen reputation swing on investor/business borrowing power
      const reputationFactor = Math.max(0.25, Math.min(2.5, ((prev.landlordReputation ?? 50)) / 60));
      // Track record: profitable years from annualAccounts history
      const profitableYears = ((prev as any).annualAccounts || [])
        .filter((a: any) => (a?.netProfitBeforeTax ?? 0) > 0).length;
      const trackRecordFactor = Math.min(1.4, 0.8 + profitableYears * 0.08);
      // Financial health: creditScore + DTI combined
      const dtiForHealth = monthlyRent > 0
        ? (monthlyMortgage + existingLoanPayments) / monthlyRent
        : 1;
      const healthFactor = (prev.creditScore >= 750 && dtiForHealth < 0.35) ? 1.3
        : (prev.creditScore >= 650 && dtiForHealth < 0.5) ? 1.0
        : 0.7;
      // Credit-tier hard-cap multiplier on top of creditFactor
      const creditTierMult =
        prev.creditScore < 500 ? 0.4 :
        prev.creditScore < 650 ? 0.7 :
        prev.creditScore < 750 ? 1.0 : 1.25;
      const investorTotalFactor = Math.max(0.15, Math.min(4.0, reputationFactor * trackRecordFactor * healthFactor));
      const businessTotalFactor = Math.max(0.15, Math.min(4.0, trackRecordFactor * healthFactor));
      const dynamicCap = kind === 'personal'
        ? Math.floor(Math.min(product.hardCapPennies * creditTierMult, monthlyNetRent * 6) * creditFactor)
        : kind === 'business'
          ? Math.floor(Math.min(product.hardCapPennies * creditTierMult, monthlyNetRent * 12 * 4) * creditFactor * businessTotalFactor)
          : Math.floor(product.hardCapPennies * investorTotalFactor);
      if (amount > dynamicCap) {
        showToast("Loan Too Large", `Max £${fromPennies(Math.max(0, dynamicCap)).toLocaleString()} for your profile.`, "destructive"); return;
      }
      if (termMonths < product.minTermMonths || termMonths > product.maxTermMonths) {
        showToast("Invalid Term", `Term must be ${product.minTermMonths}–${product.maxTermMonths} months.`, "destructive"); return;
      }
      // APR: investor uses fixed product spread + reputation-based rate adjustment
      // (Phase 3 #1a — better landlord reputation → cheaper investor loan).
      // Others credit-adjusted.
      const creditPenalty = kind === 'investor' ? 0
        : prev.creditScore >= 800 ? -0.005 : prev.creditScore >= 650 ? 0 : prev.creditScore >= 500 ? 0.01 : 0.02;
      const reputationRateAdj = kind === 'investor'
        ? Math.max(-0.08, Math.min(0.10, (60 - (prev.landlordReputation ?? 50)) * 0.002))
        : 0;
      // Phase E: track record / health also nudge APR for investor & business
      const factorRateAdj = (kind === 'investor' || kind === 'business')
        ? Math.max(-0.04, Math.min(0.05,
            ((1 - trackRecordFactor) * 0.1) + ((1 - healthFactor) * 0.1)
          ))
        : 0;
      // Phase 7 #18 — investor loyalty: every on-time repaid loan = −3% rate, capped at −15%.
      const onTimeLoans = ((prev as any).loanPayoffHistory || [])
        .filter((p: any) => p.repaidOnSchedule).length;
      const loyaltyRateAdj = kind === 'investor'
        ? -Math.min(0.15, onTimeLoans * 0.03)
        : 0;
      const spread = kind === 'investor' ? product.baseSpread
        : ((prev.currentLoanRates as any)[kind] ?? product.baseSpread);
      const rate = Math.max(0.02, prev.currentMarketRate + spread + creditPenalty + reputationRateAdj + factorRateAdj + loyaltyRateAdj);
      const monthlyRate = rate / 12;
      const monthlyPayment = Math.round((amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths)));

      // Combined-DTI gate (skipped for investor — relationship-based)
      if (kind !== 'investor' && monthlyRent > 0) {
        const combinedDTI = (monthlyMortgage + existingLoanPayments + monthlyPayment) / monthlyRent;
        const dtiCap = kind === 'business' ? 0.85 : 0.75;
        if (combinedDTI > dtiCap) {
          showToast(
            "Loan Rejected",
            `Combined debt-to-income ${(combinedDTI * 100).toFixed(0)}% exceeds ${(dtiCap * 100).toFixed(0)}%. Reduce existing debt first.`,
            "destructive",
          );
          return;
        }
      }
      const loan: import('@/types/game').Loan = {
        id: `loan_${kind}_${Date.now()}_${Math.floor(gameRandom() * 1e6)}`,
        kind, principal: amount, remainingBalance: amount,
        monthlyPayment, interestRate: rate, termMonths,
        startMonth: prev.monthsPlayed,
        onTimeStreak: 0,
        ...(kind === 'investor' ? { lenderName: 'Family & Friends Syndicate' } : {}),
      };
      const credited = credit(prev, amount);
      set({
        cash: credited.cash, overdraftUsed: credited.overdraftUsed,
        loans: [...((prev as any).loans || []), loan],
      } as any);
      showToast("Loan Approved! 💰", `£${fromPennies(amount).toLocaleString()} ${kind} loan @ ${(rate * 100).toFixed(2)}% — £${fromPennies(monthlyPayment).toLocaleString()}/mo.`);
    },

    // Phase 5 #16 — bridging finance for unmortgageable auction stock.
    // 12% APR, interest-only, max 12-month term. Cap at 70% of property value.
    takeBridgingLoan: (propertyId: string, amountPennies: number) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId)
        || prev.conveyancing.find((c: any) => c.propertyId === propertyId);
      if (!property) { showToast("Bridge Failed", "Property not found in your portfolio.", "destructive"); return; }
      const propValue = 'value' in property ? property.value : (property.purchasePrice || 0);
      const maxBridge = Math.floor(propValue * 0.70);
      if (amountPennies <= 0 || amountPennies > maxBridge) {
        showToast("Bridge Rejected", `Max bridging finance is 70% of value (£${fromPennies(maxBridge).toLocaleString()}).`, "destructive");
        return;
      }
      const rate = 0.12;
      const monthlyPayment = Math.max(1, Math.round((amountPennies * rate) / 12));
      const loan: import('@/types/game').Loan = {
        id: `bridge_${propertyId}_${Date.now()}`,
        kind: 'bridging',
        principal: amountPennies, remainingBalance: amountPennies,
        monthlyPayment, interestRate: rate, termMonths: 12,
        startMonth: prev.monthsPlayed,
        interestOnly: true,
        propertyId,
        onTimeStreak: 0,
      };
      const credited = credit(prev, amountPennies);
      set({
        cash: credited.cash, overdraftUsed: credited.overdraftUsed,
        loans: [...((prev as any).loans || []), loan],
      } as any);
      showToast(
        "Bridging Loan Issued 🌉",
        `£${fromPennies(amountPennies).toLocaleString()} @ 12% interest-only. Term: 12 months — renovate then remortgage before expiry.`,
      );
    },

    settleLoan: (loanId: string, partialAmount?: number) => {
      const prev = get();
      const loan = ((prev as any).loans || []).find((l: any) => l.id === loanId);
      if (!loan) { showToast("Settle Failed", "Loan not found.", "destructive"); return; }
      // Item 4: optional partial payment. Clamp to remainingBalance — if equal
      // or undefined, settle the whole loan.
      const requested = partialAmount && partialAmount > 0
        ? Math.min(partialAmount, loan.remainingBalance)
        : loan.remainingBalance;
      const debited = debit(prev, requested);
      if (!debited) { showToast("Insufficient Cash", `Need £${fromPennies(requested).toLocaleString()}.`, "destructive"); return; }
      const newBalance = loan.remainingBalance - requested;
      const fullSettle = newBalance <= 0;
      let updatedLoans;
      if (fullSettle) {
        updatedLoans = ((prev as any).loans || []).filter((l: any) => l.id !== loanId);
      } else {
        // Recompute monthly payment over remaining months, keeping rate & term.
        const monthsElapsed = Math.max(0, prev.monthsPlayed - (loan.startMonth || prev.monthsPlayed));
        const remainingMonths = Math.max(1, (loan.termMonths || 12) - monthsElapsed);
        const monthlyRate = (loan.interestRate || 0) / 12;
        const newMonthly = monthlyRate > 0
          ? Math.round((newBalance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -remainingMonths)))
          : Math.round(newBalance / remainingMonths);
        updatedLoans = ((prev as any).loans || []).map((l: any) =>
          l.id === loanId ? { ...l, remainingBalance: newBalance, monthlyPayment: newMonthly } : l
        );
      }
      set({
        cash: debited.cash, overdraftUsed: debited.overdraftUsed,
        loans: updatedLoans,
        creditScore: Math.min(850, prev.creditScore + (fullSettle ? 3 : 1)),
      } as any);
      showToast(
        fullSettle ? "Loan Settled ✓" : "Partial Payment ✓",
        fullSettle
          ? `Repaid £${fromPennies(requested).toLocaleString()} early.`
          : `Paid £${fromPennies(requested).toLocaleString()}; balance now £${fromPennies(newBalance).toLocaleString()}.`,
      );
    },

    handleApplyOverdraft: (requestedLimit: number) => set({ overdraftLimit: requestedLimit }),
    setCash: (newCash: number) => set({ cash: newCash }),
    setOverdraftUsed: (used: number) => set({ overdraftUsed: used }),

    // ─── Outstanding Improvements v4 Step 3: entity + damage actions ───
    setEntityType: (type: 'sole_trader' | 'ltd') => {
      const prev = get();
      if (prev.entityType === 'ltd') {
        showToast("Already Incorporated", "Cannot revert from LTD.", "destructive");
        return;
      }
      if (type === 'ltd') {
        const incorporationFee = toPennies(1000);
        const debited = debit(prev, incorporationFee);
        if (!debited) {
          showToast("Insufficient Funds", "Need £1,000 (even with overdraft) to incorporate.", "destructive");
          return;
        }
        set({ entityType: type, entityChosen: true, cash: debited.cash, overdraftUsed: debited.overdraftUsed });
        showToast("Incorporated! 🏢", `You are now trading as a Limited Company. Mortgage interest is fully tax-deductible.${debited.usedOverdraft > 0 ? ` (£${fromPennies(debited.usedOverdraft).toLocaleString()} via overdraft.)` : ''}`);
      } else {
        set({ entityType: type, entityChosen: true });
      }
    },

    payDamageWithCash: (damageId: string, actualCost?: number) => {
      const prev = get();
      const damage = prev.pendingDamages.find((d: any) => d.id === damageId);
      if (!damage) return;
      const cost = actualCost ?? damage.repairCost;
      const currentYear = Math.floor(prev.monthsPlayed / 12);
      const existing = prev.annualRepairCosts.find((a: any) => a.propertyId === damage.propertyId && a.year === currentYear);
      const updatedAnnual = existing
        ? prev.annualRepairCosts.map((a: any) => a.propertyId === damage.propertyId && a.year === currentYear ? { ...a, totalCost: a.totalCost + cost } : a)
        : [...prev.annualRepairCosts, { propertyId: damage.propertyId, year: currentYear, totalCost: cost }];
      const dmgHist = prev.damageHistory.find((dh: any) => dh.propertyId === damage.propertyId);
      const updatedHistory = dmgHist
        ? prev.damageHistory.map((dh: any) => dh.propertyId === damage.propertyId ? { ...dh, lastDamageMonth: prev.monthsPlayed } : dh)
        : [...prev.damageHistory, { propertyId: damage.propertyId, lastDamageMonth: prev.monthsPlayed }];
      showToast("Repairs Paid", `Paid £${fromPennies(cost).toLocaleString()} to repair ${damage.propertyName}`);
      set({ cash: prev.cash - cost, pendingDamages: prev.pendingDamages.filter((d: any) => d.id !== damageId), annualRepairCosts: updatedAnnual, damageHistory: updatedHistory });
    },

    payDamageWithLoan: (damageId: string, actualCost?: number) => {
      const prev = get();
      const damage = prev.pendingDamages.find((d: any) => d.id === damageId);
      if (!damage) return;
      const cost = actualCost ?? damage.repairCost;
      const currentYear = Math.floor(prev.monthsPlayed / 12);
      const existing = prev.annualRepairCosts.find((a: any) => a.propertyId === damage.propertyId && a.year === currentYear);
      const updatedAnnual = existing
        ? prev.annualRepairCosts.map((a: any) => a.propertyId === damage.propertyId && a.year === currentYear ? { ...a, totalCost: a.totalCost + cost } : a)
        : [...prev.annualRepairCosts, { propertyId: damage.propertyId, year: currentYear, totalCost: cost }];
      const dmgHist = prev.damageHistory.find((dh: any) => dh.propertyId === damage.propertyId);
      const updatedHistory = dmgHist
        ? prev.damageHistory.map((dh: any) => dh.propertyId === damage.propertyId ? { ...dh, lastDamageMonth: prev.monthsPlayed } : dh)
        : [...prev.damageHistory, { propertyId: damage.propertyId, lastDamageMonth: prev.monthsPlayed }];
      showToast("Bank Loan Taken", `Borrowed £${fromPennies(cost).toLocaleString()} for ${damage.propertyName}`, "destructive");
      set({ cash: prev.cash + cost, pendingDamages: prev.pendingDamages.filter((d: any) => d.id !== damageId), annualRepairCosts: updatedAnnual, creditScore: Math.max(300, prev.creditScore - 10), damageHistory: updatedHistory });
    },

    dismissDamage: (damageId: string) => set((s: any) => ({ pendingDamages: s.pendingDamages.filter((d: any) => d.id !== damageId) })),
  };
}
