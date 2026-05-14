# Refactor: Maintainability & Store Modularization

Two parallel improvements: (1) break up the 475-line `Index.tsx` and (2) split the 3,400-line `gameStore.ts` into domain slices. Behavior unchanged — pure structural refactor.

---

## 1. Improve Code Maintainability (`Index.tsx`)

### 1a. Extract sub-components

Create under `src/components/sections/`:

- **`PortfolioSummary.tsx`** — totals strip (Total Value / Monthly Income / Avg Yield) + LTV badge + "Your Empire" header.
- **`PropertyMarket.tsx`** — Market tab content (EstateAgentWindow, AuctionHouse, Reset button).
- **`BankingPanel.tsx`** — Bank tab content (MortgageSettlement, MortgageManagement, CreditOverdraft, PortfolioMortgage, LoansPanel, TaxBreakdown).
- **`PortfolioGrid.tsx`** — owned-properties grid + conveyancing-pending cards (the long `.map` blocks at the bottom).
- **`HeroHeader.tsx`** — top hero with GameClock.

`Index.tsx` becomes a thin layout file (~80 lines) that wires `useGameState()` into these sections.

### 1b. Extract logic to custom hooks

Under `src/hooks/`:

- **`usePortfolioMetrics(ownedProperties, totalDebt)`** — returns `{ totalPortfolioValue, totalPortfolioIncome, avgYield, portfolioLTV, sortedOwnedProperties }`.
- **`usePropertyDebt(mortgages)`** — returns memoized `getDebtForProperty(id)`.
- **`useConveyancingDisplay(conveyancing)`** — derives the `conveyancingBuyProperties` list.

All memoized with `useMemo`/`useCallback` to avoid re-computation on unrelated state ticks.

---

## 2. Simplify the Game Store (`gameStore.ts` → slices)

Current store: ~3,400 lines, ~50+ actions, all in one `create<>()`. Split into Zustand slices using the slice pattern (single store, multiple slice creators) — keeps cross-slice access simple while giving file-level separation.

### 2a. Slice files (under `src/stores/slices/`)

```text
slices/
  playerSlice.ts        cash, creditScore, level, XP, overdraft, entityType, setCash, etc.
  propertySlice.ts      ownedProperties, availableProperties, auctionProperties,
                        buyProperty, sellProperty, replenishMarket, removeAuctionProperty
  marketplaceSlice.ts   propertyListings, offers, counter logic, estate agent + auction sales
  tenantSlice.ts        tenants, tenantConcerns, tenantEvents, tenantHistory,
                        selectTenant, evict/cancelEviction, resolve/dismissConcern,
                        applyRentIncrease, deposit disputes
  mortgageSlice.ts      mortgages, mortgageProviders, currentLoanRates,
                        settle/remortgage/refinance/portfolioMortgage
  loanSlice.ts          loans, applyForLoan, settleLoan
  renovationSlice.ts    renovations, planningApplications, startRenovation,
                        upgradeCondition, submitPlanningApplication, acknowledge
  conveyancingSlice.ts  conveyancing list + withdrawFromConveyancing
  taxationSlice.ts      yearly accumulators, taxRecords, totalTaxPaidPennies
  timeSlice.ts          monthsPlayed, timeUntilNextMonth, gameSpeed, clockTick,
                        processMonthEnd, processMarketUpdate, processCounterResponses
  economySlice.ts       currentMarketRate, economicEvents, macro events
  metaSlice.ts          resetGame, migration entry, entity onboarding flag
```

### 2b. Composition

`gameStore.ts` becomes a thin composer:

```ts
export const useGameStore = create<GameState & GameActions>()(
  persist(
    (...a) => ({
      ...createPlayerSlice(...a),
      ...createPropertySlice(...a),
      ...createTenantSlice(...a),
      // etc.
    }),
    { name: 'game-store', version: 13, migrate: migrateState, ... }
  )
);
```

Each slice creator has signature `(set, get) => ({ ...state, ...actions })`. Cross-slice reads via `get()`.

### 2c. Selector hooks

Keep existing `usePlayerData`, `useTimeData`, etc. selectors as the public read API — they already prevent over-rendering. Add slice-scoped selectors where missing (e.g., `useTenantData`, `useMortgageData`) so components subscribe only to relevant slices.

### 2d. Migration & persistence

- Keep single `persist` wrapper at the composed level (one storage key, version 13 preserved).
- `migrateState` stays in `metaSlice.ts` or a dedicated `src/stores/migration.ts`.
- All sanitizers (`sanitizeProperty`, `sanitizeTenantRecord`, etc.) move to `src/stores/sanitizers.ts`.

---

## Scope & Safety

- **Pure refactor** — no behavior, no UI, no game-logic changes.
- Done in two phases so each can ship independently:
  - **Phase A**: Index.tsx split + custom hooks (low-risk, fast).
  - **Phase B**: Store slicing (higher-risk, do after Phase A is verified).
- After each phase: load existing save (version 13 persisted state) and confirm the game runs identically.

## Out of scope

- Splitting into multiple Zustand stores (rejected — would complicate cross-domain reads like net-worth calc; slice pattern gives file separation without that cost).
- Renaming public selector hooks.
- Any new features.

## Files

**New**: 5 section components, 3 hooks, ~11 slice files, `sanitizers.ts`, `migration.ts`.
**Modified**: `Index.tsx` (slim), `gameStore.ts` (composer only).
