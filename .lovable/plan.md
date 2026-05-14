## Three improvements

### 1. Repair bar ↔ tenant concerns realism

**Goal:** the repair bar and the concerns feed feel like the same system rather than two unrelated meters.

Changes in `src/stores/gameStore.ts`:
- **Low repair → more concerns.** In the monthly concern generator, scale `chance` by `conditionScore`:
  - `score < 30` → +0.04 chance + bias template pool toward `maintenance` / `mould` / `safety`
  - `score < 50` → +0.02 chance
  - `score ≥ 80` → −0.015 chance (already-tidy property)
- **High repair auto-clears stale soft concerns.** When `topUpCondition` raises a property past 80, mark any open non-damage `maintenance` or `mould` concern on that property as `resolvedMonth = monthsPlayed` (no extra cash spent — they were absorbed by the repair work).
- **Repair bar drains on ignored damage.** Each in-game month, every open `source: 'damage'` concern older than its grace window subtracts an extra 1 point from `conditionScore` (compounds with existing decay), so neglecting damage visibly tanks the bar.

Changes in `src/components/ui/tenant-concerns-feed.tsx`:
- Per-row hint badge: when the property's `conditionScore < 50`, append "Repair bar low — fix the bar to reduce future risk" under the cost line.
- When a damage concern is shown, surface "Resolving lifts repair bar +N" using `CONCERN_RESOLVE_CONDITION_LIFT[category]`.

### 2. Stop the top bar bouncing

**Cause:** the right-hand cluster in `HeroHeader.tsx` uses `flex-wrap`, so when the GameClock label width changes ("Mar 2026" → "April 2026") or `SpeedSelector` toggles `compact`, items reflow onto a new line and the sticky bar's height jumps.

Changes in `src/components/sections/HeroHeader.tsx`:
- Change the right cluster to `flex-nowrap` always, with `min-w-0` and `overflow-hidden` so children shrink instead of wrapping.
- Give the clock pill a stable width (`w-[220px]` desktop, `w-[180px]` compact) and add `tabular-nums` to the date/progress text inside `GameClock`.
- Outer wrapper switches to `items-center` always; remove `items-end` swap that triggers an extra reflow on scroll.
- Keep the `compact` height toggle (56px ↔ 160px) but transition only `height`, not `padding`+`align`, so the swap is a single transform.

### 3. Collapsible Loans / Tax / Operations panels

**Goal:** declutter the dashboard. Panels should be collapsed by default when "quiet" and show a one-line summary in the header.

Changes:
- Wrap each of these in the existing `CollapsibleSection` (used already for Operations on mobile), rendered in `src/pages/Index.tsx`:
  - **Loans panel** (`BankingPanel` / loans area) — default collapsed when `loans.length === 0`. Header summary: "No active loans" or "2 loans · £X/mo".
  - **Tax — current year** — default collapsed always. Header summary: "Tax due Apr · £X estimated · Y mo".
  - **Operations** — already collapsible on mobile; make it default-collapsed on desktop too when `totalActionable === 0`. Header summary already shows the count.
- Each `CollapsibleSection` keeps its open/closed state in `localStorage` keyed by section id so the user's preference persists.
- Inside `OperationsCenter.tsx` remove the extra "All quiet — no operations in progress" empty card (the collapsible header already conveys this).

### Technical notes

- Concern generation lives in the monthly tick (`gameStore.ts` ~lines 870-905) — modifier added before the `Math.random() >= chance` gate.
- `topUpCondition` (~line 3336) needs a post-update sweep over `prev.tenantConcerns` filtered by `propertyId` and category.
- `CollapsibleSection` already supports `defaultOpenMobile` and a render-prop summary; extend with `defaultOpenDesktop` if not present.
- No data-model migration needed — purely behavioural + UI.

### Files touched

- `src/stores/gameStore.ts` (concern chance modifier, topUp auto-resolve, damage decay)
- `src/components/ui/tenant-concerns-feed.tsx` (badges)
- `src/components/sections/HeroHeader.tsx` (no-wrap cluster, stable widths)
- `src/components/ui/game-clock.tsx` (tabular-nums)
- `src/components/ui/operations-center.tsx` (drop empty card)
- `src/pages/Index.tsx` (wrap Loans / Tax / Operations in collapsibles)
- `src/components/ui/collapsible-section.tsx` (add `defaultOpenDesktop` if missing)
