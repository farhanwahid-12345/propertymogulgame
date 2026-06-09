# Final Store Refactor — gameStore.ts < 300 lines

The doc identifies **24 inline actions (~660 lines)** still living in `gameStore.ts` that need to move into slice files. After this work, `gameStore.ts` is just state shape + persist config + slice composition.

Each step ends with a green test suite (194/194) and a manual smoke before the next begins. No logic changes — pure relocation. Persisted save shape unchanged.

---

## Step 1 — Extend `tenantActions.ts` (6 actions, ~262 lines)

Move verbatim into existing `createTenantActions` factory:

- `sendArrearsToCourt` (69) — court proceedings, CourtCase record, fee debit
- `issueLetterBeforeAction` (28) — pre-court letter, sets `letterSent` flag
- `escalateToHighCourt` (39) — upgrade county → high court, fee
- `resolveTenantConcern` (62) — resolve concern, satisfaction delta, repair cost
- `dismissTenantConcern` (6) — dismiss + small reputation hit
- `topUpCondition` (62) — spend cash to restore property condition

These already read tenant/property state via `get()`. No interface changes — already declared in `GameStore` type.

**Exit:** tests green, smoke: arrears → letter → court → high court; resolve and dismiss a concern; top up a dilapidated property.

---

## Step 2 — Extend `portfolioActions.ts` (2 actions, ~111 lines)

- `splitFlatUnit` (103) — title-split a multi-unit slot; service charge, ground rent, value update, remove original when all units split
- `removeAuctionProperty` (8) — drop a lot from auction stock

**Exit:** tests green, smoke: split a flat unit; trigger an auction removal path.

---

## Step 3 — Extend `financialActions.ts` (4 actions, ~60 lines)

- `setEntityType` (21) — sole trader vs LTD, incorporation fee
- `payDamageWithCash` (18) — settle pending damage from cash
- `payDamageWithLoan` (18) — create loan to cover damage, wire repayment
- `dismissDamage` (3) — drop a damage entry

**Exit:** tests green, smoke: pick entity, then pay one damage with cash and one with a loan.

---

## Step 4 — Create `gameControlActions.ts` (12 actions, ~125 lines)

New file following the existing factory pattern:

```ts
import type { SetFn, GetFn } from '../gameStore';
export function createGameControlActions(set: SetFn, get: GetFn) {
  return { /* ... */ };
}
```

Move:

- `clockTick` (1)
- `resetGame` (9) — clears persisted storage
- `setGameSpeed` (5) — 0.5×/1×/2×/4×
- `togglePause` (4)
- `setPaused` (4) — used by modal-queue auto-pause
- `approvePendingTransaction` (24) — fires side effects, unpause if queue empty
- `approveAllPendingTransactions` (37) — drain queue, unpause on complete
- `dismissChainCollapseEvent` (10)
- `dismissAllChainCollapseEvents` (10)
- `dismissPayoffEvent` (5)
- `dismissAllPayoffEvents` (8)
- `markEconomicEventsSeen` (8)

Wire into `gameStore.ts`:
```ts
import { createGameControlActions } from './slices/gameControlActions';
// inside create():
...createGameControlActions(set as any, get as any),
```

**Exit:** tests green, smoke: pause/resume, change speed, approve a pending tx, dismiss a chain collapse + payoff event, tick a month.

---

## Target end state for `gameStore.ts`

Contains only:

- `GameState` / `GameStore` interfaces
- `initialState` object
- `sanitizeAndMerge` helper + persist migration config
- ~8 slice imports
- ~8 slice spreads inside `create()`

**Target: < 300 lines.** No new persisted keys. No migration bump. 194/194 green at every step boundary.

---

## Technical notes

- Follow existing factory signature: `createXxxActions(set, get)`.
- Cross-slice reads via `get()` only — no slice-to-slice imports.
- Move bodies verbatim; convert any `this`/closure references to `get()`/`set()`.
- Stopping points after each step (1, 2, 3, 4) for review.

Awaiting your approval before starting Step 1.
