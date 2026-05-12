# Improvements 15–17

## 15. Inline mortgage/refinance rejections (no global toast)

**Problem**: Refinance attempt fires a destructive toast that floats over the screen. The user wants the rejection reason rendered inside the panel where the application was made.

**Changes**:
- `src/components/ui/mortgage-refinance.tsx`
  - Add local state `const [rejection, setRejection] = useState<string | null>(null)`.
  - Wrap the existing `onRefinance(...)` call: pre-run `calculateMortgageEligibility(...)` (already imported for the inline preview). If `!eligible`, `setRejection(reason)` and `return` — do NOT call the store action (which toasts).
  - Render an inline `<Alert variant="destructive">` directly above the action button when `rejection` is set, with title "Refinance Rejected" and the reason text. Auto-clear when the user changes provider, loan amount slider, term, or property.
- `src/components/ui/mortgage-management.tsx` and `src/components/ui/mortgage-settlement.tsx`
  - Same pattern for any application/settlement that surfaces a rejection toast — render inline error in the active sub-tab.
- `src/components/ui/portfolio-mortgage.tsx`, `src/components/ui/loans-panel.tsx`
  - Add a `lastRejection` local state and inline alert. Replace `showToast("...Denied"...)` callbacks with returned reasons, OR keep store toast but additionally pipe the result into local state via a return value. Simplest: each panel runs `calculateMortgageEligibility` itself before calling the store action and shows the alert inline; only call the store on success.
- `src/stores/gameStore.ts`
  - Suppress the destructive `showToast("Refinance Rejected"...)` and equivalent mortgage-rejected toasts. The store actions still guard internally (so a panel that forgets to pre-check can't break state) but they fail silently — the panel owns the UX.
  - Successful actions keep their existing success toasts.

**Acceptance**: Triggering a denied refinance from the Bank → Manage Mortgages tab shows the red alert inside that tab; nothing pops up over the empire view.

---

## 16. Cleaner mobile + web UI

Goal: reduce visual noise, less stacking, clearer hierarchy. Visual/layout only — no logic changes.

**Mobile (`src/pages/Index.tsx`, `src/components/ui/mobile-bottom-nav.tsx`, `src/components/ui/game-stats.tsx`, `src/components/ui/game-clock.tsx`)**:
- Hero: drop tagline ("Build your empire…") on `<sm` widths; shrink `h-[160px]` → `h-[120px]`; move the GameClock under the title instead of beside it (current side-by-side wraps awkwardly).
- Stats grid: collapse the 2×2 quick-stats tiles into a single horizontal scroll-snap row of slimmer pills (Net Worth · Cash Flow · Portfolio · Level). Drop the redundant "Cash: £…" subline that duplicates Net Worth.
- "Market: 3.44% | Debt: £0 | Month 0" strip: turn into a single muted ticker line without the chevron expander on mobile (move the expanded macro detail under the Bank tab).
- Tabs: `Market | Bank` row currently sits above the ribbon already; remove the duplicate `Property Market` heading row that appears between the tab and the segmented `Estate Agent / Auction House / Reset` pill. Heading is implied by the active tab.
- Bottom nav: keep 5 items but flatten to icons + tiny label only; drop the `+` and `1` neighbours (those are bottom OS chrome bleed in the screenshot — verify, no code change needed if so).
- Collapsible sections: default Operations + Alerts to *closed* on mobile; default Empire to *open*. Already partially set — audit `defaultOpenMobile` flags.

**Desktop (`src/pages/Index.tsx`)**:
- Tighten container max-width to `max-w-6xl` (currently full-bleed) and add consistent `gap-6` between major sections.
- Bank sub-tabs (`Pay Mortgage / Manage / Credit & Banking / Loans`) currently render full-width with a heavy gradient. Switch to a slim segmented control flush left, and put the inline rejection alert (item 15) in its own row above the content card so it doesn't overlap the tax breakdown.
- Tax — current year card: shrink from 4 metric tiles to a 2-row compact summary on `<lg`; stack rate-band table below.
- "All quiet — no operations in progress" empty state and "Your Empire 🏰 1" header should not both appear in the same horizontal band — add `mt-6` separator.

**Out of scope**: redesigning glass/gradient tokens, restructuring the tab system itself.

---

## 17. Withdraw from in-progress conveyancing

**Problem**: Once a sale enters conveyancing it shows in the tracker with no way to pull out. (See screenshot 11 — "89 Borough Road" / "156 Cargo Fleet Lane" mid-conveyancing, no actions.)

**Changes**:
- `src/types/game.ts`: no schema change needed — reuse existing `cancelPropertyListing` semantics.
- `src/stores/gameStore.ts`
  - Add new action `withdrawFromConveyancing(conveyancingId: string)`:
    - Find the `Conveyancing` row. Only `status === 'selling'` rows are user-cancellable (buyers pulling out of a purchase = different flow; out of scope).
    - Charge a fixed **£1,500 chain-collapse fee** (matches the existing chain-collapse cost path).
    - Remove the conveyancing row, restore the property to owned (it never left the portfolio in selling flow — verify in code; if it did, mark it back as owned and not listed).
    - Push an `activity-feed` entry: "Pulled out of sale — {property} (£1,500 fee)".
    - Show success toast `"Sale Withdrawn"`.
  - For `status === 'buying'` rows: leave a stub returning false and show inline disabled tooltip "Buyer can't withdraw — only the seller can pull out".
- `src/components/ui/conveyancing-tracker.tsx`
  - Add a small `Pull out` button (red `Ban` icon, ghost variant) on the right side of each selling row. Wrap in `AlertDialog` mirroring the listed-properties withdraw confirmation (warn about £1,500 fee).
  - Hide button on buying rows.
  - Accept new prop `onWithdraw?: (conveyancingId: string) => void`.
- `src/pages/Index.tsx`: pass `onWithdraw={gameState.withdrawFromConveyancing}` to the tracker.

**Acceptance**: A property in "Selling — completes in 1 month" shows a red `Pull out` button. Clicking it opens a confirmation dialog stating the £1,500 fee. Confirming removes the conveyancing row, debits cash, keeps the property owned, and logs the activity.

---

## Files

- **Modified**: `src/components/ui/mortgage-refinance.tsx`, `src/components/ui/mortgage-management.tsx`, `src/components/ui/mortgage-settlement.tsx`, `src/components/ui/portfolio-mortgage.tsx`, `src/components/ui/loans-panel.tsx`, `src/stores/gameStore.ts`, `src/components/ui/conveyancing-tracker.tsx`, `src/pages/Index.tsx`, `src/components/ui/mobile-bottom-nav.tsx`, `src/components/ui/game-stats.tsx`, `src/components/ui/game-clock.tsx`
- **New**: none

## Out of scope

- Allowing buyers to cancel in-flight purchases (different cost model).
- Redesigning the whole tab system / theming tokens.
- Re-pricing chain-collapse fee against macro state.
