## Scope

Five connected fixes from the annotated screenshots: tidy the Market/Bank toolbar, make the Tour button actually launch the tour, warn before bankruptcy + add a court → auction → bankruptcy escalation, let users start the planning step for renovations even when a tenant is in residence or they can't yet afford the build, and allow paying down a portfolio mortgage from the Pay Mortgage dialog.

---

## 1. Market/Bank toolbar cleanup (screenshot items 1 & 2)

**Problem.** The Market tab's action row (`Estate Agent · Auction House · Tour · Reset`) and the Bank tab's action row (`Pay Mortgage · Manage Mortgages · Credit & Banking · Portfolio Mortgage`) both eat a full row below the tabs. The slim `Market rate / Debt / Month` strip also sits on its own row. The user wants this consolidated.

**Fix.**

- **Move the market-rate strip into `HeroHeader`.** Add a compact pill (e.g. `📈 3.60% · Debt £0 · M 0`) to the right cluster of `HeroHeader`, between `GameClock` and `SpeedSelector`. Hidden on `compact` scroll state to avoid crowding. Source the values from `useGameStore` directly so we don't need to thread props through `Index.tsx`.
- **Tighten the tabs row.** Keep `<TabsList>` on the left and the contextual action buttons on the right of the same row (already the layout); just shrink button paddings (`size="sm"`, `h-8`) so all four Bank actions and all four Market actions fit on one line at ≥1000px. On narrower widths they wrap naturally via the existing `flex-wrap`.
- **Promote Tour + Reset out of the Market actions row** into an overflow menu in the header (small `⋯` button on the right of the hero cluster) so they're always reachable and stop competing with the primary `Estate Agent / Auction House` buttons. The menu items: Replay tour, Reset game, Sound toggle (moved from header), Pause (moved from header). Header keeps only Clock, Speed, Rate pill, Notifications, and the `⋯` menu.

Net effect: one row for tabs+actions, one row for the hero strip, and the orphan rate strip disappears.

## 2. Tour button does nothing (screenshot 1b)

**Problem.** Clicking Tour calls `useGameStore.setState({ onboardingCompleted: false })`, but `OnboardingGate` also requires the `pm_onboarding_done` localStorage flag to be cleared — once that flag is set, the gate stays closed regardless of the zustand flip.

**Fix.**

- In the Tour button's onClick, also `window.localStorage.removeItem('pm_onboarding_done')` *and* set `onboardingCompleted: false`. Skip the entity step by leaving `entityChosen` as-is; the gate already uses `skipEntity` based on `entityChosen`.
- Export a `replayTour()` helper from `onboarding-flow.tsx` (or a tiny `src/lib/onboarding.ts`) that does both — single source of truth so the settings/replay link and the new header overflow menu both call the same thing.
- Verify the gate by re-reading `OnboardingGate` after the click: `open = !entityChosen || (!onboardingCompleted && !lsDone)`. With LS cleared and `onboardingCompleted=false`, gate opens at `tour-market`.

## 3. Bankruptcy warning + court/bailiff escalation (screenshot item 3)

**Problem.** When the player can't pay outgoings they currently slide straight into bankruptcy with no warning.

**Fix — three-stage escalation in `useGameEngine` monthly tick:**

1. **Warning stage** — when projected next-month cashflow (cash + overdraft headroom − monthly outgoings) goes negative and there is no live court order, raise a high-priority `Action Required` alert: "Outgoings exceed available funds — 2 months until court action". Stored as a new `arrears` record on the store (`arrearsMonth`, `monthsBehind`).
2. **Court action stage (after 2 missed months)** — auto-list the most-leveraged property at auction at a forced reserve (90% of value). Surface as a `CourtAction` notification with a countdown; player can still settle by clearing arrears before the auction resolves.
3. **Bankruptcy stage** — only if the forced auction completes and cash + proceeds still leave net worth < 0, trigger the existing post-bankruptcy `EntityOnboardingDialog` reset flow.

State changes:

```ts
// src/types/game.ts
interface ArrearsState { startMonth: number; monthsBehind: number; courtOrderMonth?: number; forcedAuctionPropertyId?: string; }
```

Engine wiring lives in `src/lib/engine/financials.ts` (compute) and `src/hooks/useGameEngine.ts` (apply each tick). UI surface is a new red banner inside the existing `⚠️ Action Required` `CollapsibleSection`.

## 4. Renovation: allow planning step regardless of tenant / cash (screenshot item 4)

**Problem.** `renovation-dialog.tsx` blocks conversions/extensions entirely when (a) tenant is in residence or (b) player can't afford the build cost. The planning application is months-long and refundable in spirit — it should be startable now.

**Fix in `src/components/ui/renovation-dialog.tsx`:**

- For `requiresPlanning && !planningApproved && !planningPending` rows, gate the button on **planning fee** only (already mostly true via `needsPlanningStep` / `planningFeeForCard`), not on full build cost or tenant presence.
- Remove the `hasTenant` short-circuit in `ineligibilityReason` for conversions when we're at the planning step. Replace with a non-blocking inline warning on the card: "Tenant in residence — eviction required before works start. Planning can be submitted now." Show the same warning if cash < scaled build cost: "Submit planning now; you'll need £X to start the works once approved."
- Once planning is `approved`, restore the existing tenant + cash gates for the actual `Renovate` action (so works still can't physically begin until the property is vacant and funded).

No engine changes — `submitPlanningApplication` already exists and only debits the planning fee.

## 5. Pay portfolio mortgage (screenshot item 5)

**Problem.** `MortgageSettlement` filters by `mortgages.some(m => m.propertyId === property.id)`. Portfolio mortgages aren't keyed to a single `propertyId` in the way per-property mortgages are, so they never appear in the picker — even though the screenshot shows a £27k balance under "Loans".

**Fix.**

- Confirm the portfolio-mortgage record shape in `gameStore.ts` / the `Loans` panel (likely lives in `(state as any).loans` with `kind: 'business'` and `collateralPropertyIds: string[]`). Treat any loan/mortgage whose `kind === 'business'` *or* a mortgage flagged `isPortfolio: true` as eligible.
- In `MortgageSettlement` build a unified picker list: `[...mortgages, ...portfolioMortgages]` with a label that reads "Portfolio mortgage · N properties" for the bundled ones. Selecting a portfolio entry feeds the same `onSettleMortgage` flow; pass a synthetic id (e.g. `portfolio:<loanId>`) so the store handler can branch.
- Add a corresponding `settlePortfolioMortgage(loanId, amount)` action in `gameStore.ts` that debits cash and reduces the portfolio loan balance (and clears collateral on full payoff).
- Update the Pay Mortgage button's `disabled` check to also count portfolio mortgages so it stays clickable when only a portfolio mortgage exists.

---

## Technical details

**Files touched**

```text
src/components/sections/HeroHeader.tsx          # rate pill, overflow menu, move sound/pause/tour/reset
src/components/sections/PropertyMarket.tsx      # drop Tour + Reset buttons (moved to header)
src/components/sections/BankingPanel.tsx        # size="sm" on actions to fit one row
src/components/ui/onboarding-flow.tsx           # export replayTour() helper that clears LS too
src/lib/engine/financials.ts                    # arrears + court-action calc
src/hooks/useGameEngine.ts                      # apply arrears/court stages per tick
src/types/game.ts                               # ArrearsState
src/stores/gameStore.ts                         # arrears state slice + settlePortfolioMortgage
src/components/ui/mortgage-settlement.tsx       # include portfolio mortgages in picker
src/components/ui/renovation-dialog.tsx         # decouple planning step from tenant + build cost
src/pages/Index.tsx                             # arrears banner inside Action Required
```

**Edge cases**

- Replay tour while a tour is already mid-flight: gate re-opens at `tour-market`, existing local `stage` state in `OnboardingFlow` resets on remount because `open` toggled false→true.
- Header overflow menu on mobile: stays as the existing buttons in the `MobileBottomNav` overflow; only desktop chrome changes.
- Forced auction reserve below outstanding debt: shortfall flows into the bankruptcy stage as today.
- Portfolio mortgage partial payment that falls below the £X min portfolio loan threshold (if any) — clamp UI to refuse, or auto-close the loan and release collateral.

## Out of scope

- No changes to mortgage interest rate logic or ICR rules.
- No new property types or tenant traits.
- No redesign of the Action Required section beyond adding the arrears row.
