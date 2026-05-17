## Five targeted fixes from the screenshot annotations

---

### 1. Onboarding — broader scope + opt-out

Today `OnboardingFlow` only gates entity selection (sole trader vs LTD); there's no real walkthrough and no skip.

- Extend `src/components/ui/onboarding-flow.tsx` into a short 3–4 step tour run after entity pick:
  1. Entity choice (existing).
  2. "Buy your first property" — point at the Market tab / Estate Agent button.
  3. "Manage the money" — point at the Bank tab (mortgages, loans, tax).
  4. "Keep tenants happy" — point at Operations / Action Required.
- Each step: title, 1–2 sentence body, "Next" + persistent "Skip tour" button.
- Add `onboardingSkipped: boolean` and `onboardingCompleted: boolean` flags in `gameStore.ts` (already partially present). Both states stop the flow from re-opening.
- Add a "Replay tour" entry under Reset / a small menu near the hero so users can re-trigger it. Keeps the opt-out promise but lets curious players come back.
- Persist via existing zustand persist middleware — no migration needed (new boolean defaults to false).

---

### 2. Merge "Market / Bank" section tabs into the action row

Currently `Index.tsx` renders a full-width `TabsList` (Market | Bank) above the per-tab action row (Estate Agent / Auction / Reset for market; Pay Mortgage / Manage / Credit / Portfolio for bank). That double row leaves a big dead band.

- Lift the tab toggle into the same row as the actions. Layout per tab content:
  - Left: a compact segmented control `[🏪 Market] [🏦 Bank]` (pill style, glass, ~auto width).
  - Right: the existing action buttons (`EstateAgentWindow`, `AuctionHouse`, `Reset` for market; mortgage/credit/portfolio buttons for bank).
- Implementation: replace the current `<TabsList grid w-full grid-cols-2>` with a compact `TabsList` rendered inside each `TabsContent` header row, or move the segmented control into a new `<SectionToolbar>` that wraps both panels. Simpler path: keep `Tabs` controlling state, but restyle `TabsList` to `inline-flex w-auto`, then absolutely position the action buttons next to it via a flex header.
- Drop the now-redundant `mt-4` spacing on `PropertyMarket.tsx` and `BankingPanel.tsx`.
- Mobile: keep the existing `MobileBottomNav` as the primary switcher and hide the segmented control below `md`.

---

### 3. Surface conveyancing chain collapses to the user

`gameStore.ts` line 479 already fires `showToast("⛓️ Chain Collapsed!", …)` but the toast can be missed and there's no persistent record.

- Replace the bare `showToast` with `notify({ category: 'conveyancing', severity: 'destructive', title, description })` so it lands in the notification centre too.
- Push an `Activity Feed` entry on collapse (existing aggregation already covers `Conveyancing` — extend with a `cancelled` status if not already shown).
- In `Operations` panel's conveyancing tracker, render cancelled rows for 1 in-game month with a red "Chain collapsed" badge so users see the cause before it disappears.
- No new state shape needed; reuse existing `cancelledConveyancing` array from the tick.

---

### 4. Stabilize the hero header on scroll

`HeroHeader.tsx` toggles `compact` at `scrollY > 80`, causing height to jump between `120/160px` and `56px`. Near the threshold, rubber-banding scroll flips it rapidly.

- Add hysteresis: enter compact at `>96px`, leave compact at `<48px`.
- Use `requestAnimationFrame` throttling instead of raw scroll handler.
- Add `will-change: height` (already present) and keep the existing `transition-all duration-300`.
- Optional: also clamp via `prefers-reduced-motion` (skip transition entirely if user prefers).

---

### 5. Portfolio mortgage rejections must show in the dialog, not as a toast

`gameStore.handlePortfolioMortgage` line 3140 fires `showToast("Portfolio mortgage rejected", …)`. The user wants this inline inside the Portfolio Mortgage dialog instead.

- Change `handlePortfolioMortgage` to return an eligibility result (`{ ok: true } | { ok: false, reason: string }`) instead of toasting. Keep success-side `notify` for the centre.
- In `portfolio-mortgage.tsx`:
  - Track `rejectionReason: string | null` in local state.
  - On submit, await the store action and set `rejectionReason` if it returns failure; do not close the dialog.
  - Render the reason as a destructive `Alert` inline above the "Secure Portfolio Mortgage" button.
  - Clear the reason whenever the user changes selection, provider, loan amount, term, or type.
- Also do a pre-submit eligibility recheck in the dialog (mirror what `MortgageProviderSelector` does for single buys) so obvious failures are flagged without round-tripping through the store.
- Apply the same inline-reason pattern to single-property mortgage rejections that today fall through to a toast inside `buyProperty` / `buyPropertyAtPrice` (lines 1838 / 1926). Surface in `MortgageProviderSelector`; suppress the toast.

---

### Files touched

- `src/components/ui/onboarding-flow.tsx` — #1 tour steps + skip
- `src/stores/gameStore.ts` — #1 onboarding flags + replay action, #3 notify + cancelled rendering, #5 return eligibility instead of toasting
- `src/pages/Index.tsx` — #2 segmented control wiring, #1 "Replay tour" entry
- `src/components/sections/PropertyMarket.tsx`, `src/components/sections/BankingPanel.tsx` — #2 layout (action row + inline tab control)
- `src/components/sections/HeroHeader.tsx` — #4 hysteresis + rAF throttle
- `src/components/ui/operations-center.tsx` (or conveyancing-tracker) — #3 cancelled row
- `src/components/ui/portfolio-mortgage.tsx` — #5 inline rejection alert
- `src/components/ui/mortgage-provider-selector.tsx` — #5 inline rejection for single buys
- `src/lib/notifications.ts` — already in place; reuse

### Notes

- No schema/state migration: new flags default safely; persisted locks and conveyancing untouched.
- Money math stays in pennies in the store.
- Mobile keeps `MobileBottomNav` as the primary tab switcher; the new segmented control is desktop-only.
