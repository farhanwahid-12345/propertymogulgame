/**
 * Cash debit/credit helpers.
 * All cash-spending sites use `debit` so the overdraft is auto-tapped when
 * available cash isn't enough. All income sites use `credit` so any drawn
 * overdraft is auto-repaid before fresh cash hits the wallet.
 */

export function debit(
  state: { cash: number; overdraftUsed: number; overdraftLimit: number },
  amount: number,
): { cash: number; overdraftUsed: number; usedOverdraft: number } | null {
  if (amount <= 0) return { cash: state.cash, overdraftUsed: state.overdraftUsed, usedOverdraft: 0 };
  const overdraftAvailable = Math.max(0, state.overdraftLimit - state.overdraftUsed);
  const totalAvailable = state.cash + overdraftAvailable;
  if (totalAvailable < amount) return null;
  if (state.cash >= amount) {
    return { cash: state.cash - amount, overdraftUsed: state.overdraftUsed, usedOverdraft: 0 };
  }
  const fromOverdraft = amount - state.cash;
  return { cash: 0, overdraftUsed: state.overdraftUsed + fromOverdraft, usedOverdraft: fromOverdraft };
}

export function credit(
  state: { cash: number; overdraftUsed: number },
  amount: number,
): { cash: number; overdraftUsed: number } {
  if (amount <= 0) return { cash: state.cash, overdraftUsed: state.overdraftUsed };
  if (state.overdraftUsed > 0) {
    const repay = Math.min(state.overdraftUsed, amount);
    return { cash: state.cash + (amount - repay), overdraftUsed: state.overdraftUsed - repay };
  }
  return { cash: state.cash + amount, overdraftUsed: state.overdraftUsed };
}

/** 5 weeks of monthly rent (Tenant Fees Act 2019 cap). Pass rent in pennies, get pennies. */
export function calcDeposit(monthlyRentPennies: number): number {
  return Math.floor((monthlyRentPennies * 12 * 5) / 52);
}

/** Side-effect free toast trigger — dynamic import keeps the store decoupled from React. */
export function showToast(title: string, description: string, variant?: 'destructive' | 'success') {
  import('@/hooks/use-toast')
    .then(({ toast }) => {
      try { toast({ title, description, variant: variant as any }); } catch (e) { /* noop */ }
    })
    .catch(() => { /* noop — never let toast import crash the app */ });
}
