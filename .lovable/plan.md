## Eight fixes from screenshots 43–44

---

### 1. Notification & chime audit (image-44 #1)

Many in-game events fire `showToast` but never play a sound. Only `playLevelUp`, `playGavel`, `playPaper`, `playConcernChime` are called today; `playWarning`, `playCoinChime` are dead.

- In `src/hooks/use-toast.ts` (the mirroring layer), trigger a default chime based on toast `variant` / `category` when no explicit sound was played:
  - `destructive` → `playWarning`
  - `success` / income / sales → `playCoinChime`
  - `tenant` concern → already `playConcernChime` (keep)
  - planning approved / level up → `playLevelUp`
- Verify `playConcernChime` actually fires when a new concern is generated in the monthly tick (`gameStore.ts` ~L930 — confirm path also runs when concern is added via damage at L1712).
- Add chimes to: rent collected (monthly), mortgage rejection, eviction served, chain collapse, planning refused, macro events.
- Make sound gating fail-safe: if `AudioContext` is still suspended (no prior user gesture), arm a one-shot resume on first click.

**Files**: `src/hooks/use-toast.ts`, `src/lib/notifications.ts`, `src/stores/gameStore.ts`, `src/lib/sound.ts`.

---

### 2. Allow Initial Fixed Term selection on buy + auction (image-44 #2)

`fixedTermYears` is currently only wired through `handleRefinance` and (via `MortgageProviderSelector`?) maybe single-buy. Confirm and propagate end-to-end.

- Add a "Initial Fixed Term" `Select` (SVR/tracker, 2y, 5y, 10y) to `mortgage-provider-selector.tsx` used in both Estate Agent and Auction buy flows.
- Thread `fixedTermYears` through `buyProperty` and `buyPropertyAtPrice` (store + `useGameState` adapter), persist on the mortgage record (`fixedTermYears`, `fixedRate`), and apply the same rate adjustment used in refinance (−0.4% / −0.2% / +0.1%).
- Add the same selector to `portfolio-mortgage.tsx` and pass through `handlePortfolioMortgage`.
- Existing reversion-to-SVR loop in `gameStore.ts` L602–632 already handles expiry — no further engine work.

**Files**: `src/components/ui/mortgage-provider-selector.tsx`, `src/components/ui/auction-dialog.tsx` (if it builds its own selector), `src/components/ui/portfolio-mortgage.tsx`, `src/stores/gameStore.ts` (`buyProperty`, `buyPropertyAtPrice`, `handlePortfolioMortgage` signatures), `src/hooks/useGameState.ts` (adapter signatures), `src/types/game.ts`.

---

### 3. EPC ratings (image-44 #3)

Add EPC as a first-class property attribute affecting compliance, cost, and renovations.

- `types/game.ts`: add `epcRating: 'A'|'B'|'C'|'D'|'E'|'F'|'G'` to `Property`.
- Generate EPC on property creation in `lib/engine/market.ts`: weighted distribution (mostly D/E/F for stock, A/B rare).
- Annual electrical-safety / EICR cost charged via `tenantConcerns` — one concern per property each year ("Electrical testing due — £150"). Add as a recurring template alongside existing concerns in `gameStore.ts`.
- From April-2028-style rule (game-flavoured): properties at F/G with a sitting tenant fire a tenant concern "EPC below E — upgrade required" that decays satisfaction until resolved by renovation.
- `renovation-dialog.tsx`: add a new "EPC Upgrade" category with a `Select` for target rating (current+1, current+2, A). Cost scales with rating jumps; uplift bumps `epcRating` on completion. New renovation type entries in `lib/engine/renovation.ts` / constants.
- `property-card.tsx`: show an EPC badge (A green → G red).

**Files**: `src/types/game.ts`, `src/lib/engine/market.ts`, `src/lib/engine/renovation.ts`, `src/lib/engine/constants.ts`, `src/stores/gameStore.ts`, `src/components/ui/renovation-dialog.tsx`, `src/components/ui/property-card.tsx`.

---

### 4. More realistic renovation expectations (image-44 #4)

Headline uplifts feel exaggerated relative to typical outcomes because `RENOVATION_EXPECTED_MULTIPLIER = 0.929` but the actual roll table favours lower buckets.

- Recalibrate the displayed "Expected uplift" in `renovation-dialog.tsx` to use the true probability-weighted expected value (recompute multiplier from the bucket table in `lib/engine/renovation.ts`).
- Tighten the variance band: clamp the lowest bucket so "underwhelming returns" can't go below ~50% of headline; reduce the chance of the very low rolls; show an explicit range chip "Likely £X–£Y" in the dialog instead of a single number.
- Keep some variance, just make the modal honest about the distribution.

**Files**: `src/lib/engine/renovation.ts`, `src/components/ui/renovation-dialog.tsx`.

---

### 5. Risky tenants → more antisocial & missed rent (image-44 #5)

`tenants` already carry traits/risk via `tenantHistory` and rent arrears flow. Strengthen the linkage.

- In `lib/tenantRent.ts` / monthly tick, scale missed-rent probability by tenant `riskScore` (or derived score from `creditScore`/profile): low-risk ~1%, medium ~5%, high ~15%, with variance.
- Add antisocial-behaviour events to the tenant concerns generator weighted by risk: noise complaints, neighbour disputes — these increase satisfaction-decay on neighbours' properties (none today) and unlock `antisocial_behaviour` eviction ground.
- Display tenant risk band on the tenant chip in `property-card.tsx` so the player sees the tradeoff before selecting.

**Files**: `src/lib/tenantRent.ts`, `src/stores/gameStore.ts`, `src/components/ui/tenant-selector.tsx`, `src/components/ui/property-card.tsx`.

---

### 6. Allow planning permission while tenant in occupation; block actual conversion (image-44 #6)

`gameStore.applyForPlanning` currently rejects conversions when a tenant is present (~L2750). Move the block.

- Remove the "must be vacant" gate from `applyForPlanning` for conversions — the LPA application can run in parallel with tenancy.
- Keep the vacancy gate in `startRenovation` (~L2625) so the physical works can't begin until the tenant has left.
- Add an informational note in `renovation-dialog.tsx` for conversion options: "Planning can be applied for now. Works begin once the property is vacant."

**Files**: `src/stores/gameStore.ts`, `src/components/ui/renovation-dialog.tsx`.

---

### 7. Warn user when a tenant is about to walk (image-43 #7)

The card already shows "Critical satisfaction — Vacates by month N" but there's no proactive notification or sound.

- In the monthly tick (`gameStore.ts` ~L737–848), after the satisfaction recompute pass, flag tenants where `satisfaction < 25` AND no warning has fired this month. Push a destructive `notify({ category: 'tenant', severity: 'destructive' })` and call `playWarning()`.
- Add `lastWalkoutWarningMonth` to the tenant record (`types/game.ts`) so we don't spam every tick.
- Render a pulsing "At risk of leaving" badge on `property-card.tsx` when `satisfaction < 25`.

**Files**: `src/types/game.ts`, `src/stores/gameStore.ts`, `src/lib/notifications.ts`, `src/components/ui/property-card.tsx`.

---

### 8. Fix net-worth calculation (image-43 #8)

Screenshot: mortgage-free property £152,642 + cash £51,531 ≈ £204,173 expected, but reported £152,156 (~cash missing).

- Audit `src/hooks/useGameState.ts` L121 + L409: `netWorth = cash + inflightBuy + WIP + Σvalue − overdraft − totalDebt`. The diff equals cash, so something is double-counting cash as debt OR subtracting cash a second time.
- Suspect: loans `remainingBalance` may be persisted in pounds while subtracted alongside mortgage debt in pennies (or vice versa) — only `mortgages` are included in `totalDebt` today (L145), but if loans/overdraft are also reflected via a different field, double-subtract is possible.
- Concretely:
  1. Log `cash`, `inflightBuyCapital`, `renovationWIP`, `Σvalue`, `overdraftUsed`, `totalDebt` for the user's state to confirm which term is wrong.
  2. Make `totalDebt` explicitly sum `mortgages` + open `loans.remainingBalance` (currently loans appear in `loanExpenses` only).
  3. Ensure `overdraftUsed` isn't applied twice (subtracted in net-worth AND included in `totalDebt`).
- Add a unit test in `src/lib/engine/financials.ts`-adjacent or a quick sanity check that `netWorth === cash + Σvalue` when no debt is outstanding.

**Files**: `src/hooks/useGameState.ts`, `src/stores/gameStore.ts` (mirror calc at L1127 for level-up), `src/types/game.ts` (clarify units on loans if needed).

---

### Cross-cutting notes

- All money still stored in pennies; converted at adapter boundary.
- No new persisted schema migrations required except: tenant `lastWalkoutWarningMonth` (default undefined), property `epcRating` (back-fill via sanitizer with a default 'D').
- Add back-fill in `src/stores/sanitizers.ts` for `epcRating` on legacy saves.
