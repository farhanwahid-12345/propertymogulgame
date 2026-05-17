## Scope

Three connected polish fixes from the annotated screenshot:

1. The Got it / Skip / X buttons on the floating tour coach card don't dismiss it.
2. The `Estate Agent / Auction House` (and the four Bank actions) wrap onto a second row below the Market/Bank tab toggle on ~768px wide viewports — they should sit on the same line as the tabs.
3. The slim `Market: 3.50% · Debt £0 · Month 0` strip currently sits orphaned under the stats grid — move it into the hero header next to the clock so it stops eating a row.

---

## 1. Tour dismiss doesn't work

**Root cause.** `OnboardingFlow.finish()` sets `pm_onboarding_done` in localStorage and calls `onFinish()`, which in `Index.tsx`'s `OnboardingGate` does `useGameStore.setState({ onboardingCompleted: true } as any)`. The gate's `open` formula is `!entityChosen || (!onboardingCompleted && !lsDone)`. The cast to `any` means `onboardingCompleted` isn't in the typed store shape — the persist middleware's sanitizers (`src/stores/sanitizers.ts`) likely strip it, so on rehydrate the zustand value goes back to `undefined`/falsy. The localStorage fallback would normally rescue it, but `lsDone` is computed once at render time from a non-reactive `window.localStorage.getItem` read, so when `finish()` writes the key after render starts the gate doesn't always re-evaluate before the next zustand-driven render — and a stuck save with `onboardingCompleted: false` keeps the gate open.

**Fix.**

- Add `onboardingCompleted: boolean` (and `entityChosen: boolean`) as first-class fields on the zustand store in `gameStore.ts` (default `false`), and whitelist them in the persist sanitizer so they survive reloads.
- Expose typed setters `setOnboardingCompleted(done)` and use them from `OnboardingGate.onFinish` instead of the `as any` setState.
- In `OnboardingFlow`, keep the localStorage write as a belt-and-braces fallback, and have `finish()` also flip the zustand flag directly (via the same `replayTour`-style helper, in reverse). That removes the dependency on the parent passing `onFinish` correctly.
- In `OnboardingGate`, drop the `lsDone` shortcut entirely now that the zustand flag is reliable — `open = !entityChosen || !onboardingCompleted`. Re-reading the value via `useGameStore` makes it reactive automatically.

Verification: after clicking Got it, Skip tour, or X, the coach card unmounts and reloading the page keeps it closed.

## 2. Inline the Market / Bank action buttons with the tab row

**Problem.** The current layout already wraps `<TabsList>` and the actions in a `flex items-center justify-between flex-wrap`, but at the user's 768px viewport the four Bank actions (and even the two Market ones once chrome/scrollbar is accounted for) overflow and wrap to a second row.

**Fix in `Index.tsx` + `PropertyMarketActions` + `BankingPanelActions`.**

- Shrink the action buttons further so all of them fit on one row at ≥720px:
  - `BankingPanelActions`: already uses `[&_button]:h-8 [&_button]:text-xs [&_button]:px-2.5`. Drop button labels to icon + 1-word (e.g. `Pay`, `Manage`, `Credit`, `Portfolio`) on `<md` breakpoint via `hidden md:inline`. Keep full labels on `md+`.
  - `PropertyMarketActions`: wrap its two buttons in the same `[&_button]:h-8 [&_button]:text-xs` shell so they match the Bank row's height/sizing exactly.
- In `Index.tsx`, change the wrapper from `flex-wrap` to `flex-nowrap min-w-0` and let the action cluster `flex-1 justify-end` with `overflow-x-auto` as a safety valve on very narrow screens (mobile gets its own bottom nav anyway).
- Tabs row stays as the single anchor row for both tabs — visually `[ Market | Bank ]  …………………  [ Estate Agent ] [ Auction House ]` (or the four Bank actions).

## 3. Move the market-rate strip into the hero header

**Problem.** `MarketSummaryBar` inside `game-stats.tsx` renders a full-width row below the 4-stat grid, even when collapsed — wasting vertical space, especially with the new arrears banner competing for screen real estate.

**Fix.**

- **Delete** the `<Collapsible>`/`MarketSummaryBar` block from `GameStats` (lines ~266–339 in `game-stats.tsx`) and keep its expanded contents (economic events history + recent tenant events) reachable via the existing `NotificationCentre` bell in the header (those events already surface there) so no information is lost.
- **Add a compact rate pill** to `HeroHeader.tsx` between `GameClock` and `SpeedSelector`:
  ```
  📈 3.60% · Debt £0 · M 0
  ```
  Single line, `glass rounded-full px-3 py-1 text-xs`, hidden when `compact` (scrolled) and on `<sm` to avoid crowding. Source values directly from `useGameStore` (`currentMarketRate`, `totalDebt`, `monthsPlayed`) so no new props thread through.
- Tooltip on hover shows the same trio with full labels; clicking it scrolls to `#section-tabs` so users still have a path to detail.

Net effect on the user's 768px viewport: removes one full row from the page; the tabs+actions sit on one row, no orphan rate strip.

---

## Technical details

**Files touched**

```text
src/stores/gameStore.ts             # add typed entityChosen / onboardingCompleted + setters
src/stores/sanitizers.ts            # whitelist new fields through persist
src/components/ui/onboarding-flow.tsx  # finish() uses typed setter, exported helper
src/lib/onboarding.ts               # mirror typed setter for replayTour
src/pages/Index.tsx                 # OnboardingGate uses typed values; tab row flex-nowrap
src/components/sections/HeroHeader.tsx     # rate pill
src/components/sections/PropertyMarket.tsx # button sizing wrapper
src/components/sections/BankingPanel.tsx   # responsive labels
src/components/ui/game-stats.tsx    # delete MarketSummaryBar + collapsible
```

**Edge cases**

- Legacy saves: existing players already have a `pm_onboarding_done` localStorage flag — on first load after this change, migrate it into the zustand `onboardingCompleted` field once, then it's authoritative.
- Mobile (<sm): rate pill hidden; existing `MobileBottomNav` still surfaces tabs.
- Very narrow desktop (<720px): action cluster falls back to `overflow-x-auto` rather than wrapping, so the visual one-row promise holds without clipping.

## Out of scope

- No changes to mortgage logic, tenant logic, or any game mechanics.
- No redesign of `NotificationCentre`, the stats grid, or the hero artwork.
- No new tour steps or copy changes inside the existing coach card.
