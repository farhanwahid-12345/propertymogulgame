# Replace `any` with proper types in tenant/monthEnd slices

Both files are large (1,013 + 2,270 lines) and central to financial logic. A single-pass rewrite is high risk — past bugs (rent-review 100× error, arrears-eviction array-merge) came from this code, and removing `any` casts will almost certainly surface latent type errors that need careful fixing rather than papering over. I'll do this in five verifiable batches, running the TypeScript build and the existing vitest suites (`gameStoreStateMachine.test.ts`, `gameStore.test.ts`, `tenantRent.test.ts`, `financials.test.ts`, `phase*Verification.test.ts`) after each batch.

## Shared foundation (batch 0)

Tighten the slice signatures both files import so per-callback types flow through naturally:

```ts
import type { GameState } from '@/types/game';
type SetFn = (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void;
type GetFn = () => GameState;
```

Apply only to the two target files for now (the other slices keep their current `(partial: any) => void` signatures so this change stays scoped). Fix the immediate compile errors this creates inside those two files only.

## Batch plan

Each batch = type the listed actions, remove their `(p: any)` / `as any`, then `lovable-exec test` + tsc check.

1. **tenantActions.ts — tenant placement & lease signing**
   `selectTenant`, `placeTenantManually`, commercial lease fee/registry block. Types: `Property`, `PropertyTenant`, `Tenant`, `CommercialLease`, `VoidPeriod`, `PropertyLock`, `Renovation`.
2. **tenantActions.ts — rent reviews, renewals, S13**
   `acceptRentReview`, `rejectRentReview`, `acceptLeaseRenewal`, `declineLeaseRenewal`, `applyRentIncrease`. Types: `PendingRentReview`, `PropertyTenant`, commercial-lease guard already touched in Prompt 7. Likely surfaces: the `(tenantRec as any).rentPennies` and `(prev as any).pendingLeaseRenewals` casts — confirm `pendingLeaseRenewals` exists on `GameState` (add to the interface if missing rather than re-casting).
3. **tenantActions.ts — evictions, deposit disputes, concerns, debt recovery**
   `evictTenant`, `cancelEviction`, `acceptDepositOffer`, `defendDepositDispute`, `resolveConcern`, `markCleared`, `escalateToCourt`, `recordCourtOutcome`. Types: `PendingEviction`, `DepositDispute`, `TenantConcern`, `TenantEvent`, `DebtRecoveryCase`. Validate the array-merge fix from the earlier arrears bug is still expressed cleanly under proper types.
4. **monthEndActions.ts — rent collection & arrears**
   The rent-credit loop, arrears accumulation, void-period accrual. Types: `Property`, `PropertyTenant`, `TenantEvent`, `VoidPeriod`. This is where the rent-review 100× originated, so the pennies/pounds boundaries get explicit `number` annotations and any `as any` around `rentPennies` is removed.
5. **monthEndActions.ts — costs, tax, accounts, credit**
   Mortgage/maintenance/council-tax debits, annual accounts append, credit-score updates, macro event hooks. Types: `AnnualAccountRecord`, plus the macro/credit fields already on `GameState`.

## Out of scope

- Other slices' `SetFn/GetFn` — left as-is to keep this PR focused, per the user's "do not attempt full file in one pass" guidance.
- Logic changes. This is types-only; any behavioural fix surfaced by the compiler will be called out in the batch summary and only applied with the user's go-ahead.

## Verification per batch

- `bunx vitest run src/stores src/lib/engine/financials.test.ts src/lib/tenantRent.test.ts`
- Lovable build (auto-runs after edits).
- Spot-check the preview: open a property, sign a tenant, advance a month — confirm no runtime regressions before moving to the next batch.

Reply "go" to start batch 0+1, or tell me to reorder/skip batches.
